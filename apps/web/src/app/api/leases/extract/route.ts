import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { extractLogoFromPdf, type PDFDocument } from "@/lib/agency-logo";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { downloadStagedUpload, mimeTypeOfStagedPath, ownStagedPath } from "@/lib/lease-uploads-server";
import type { AdminSupabase } from "@/lib/api-auth";
import { HOUR } from "@/lib/rate-limit";
import { validateUpload } from "@/lib/session";
import { aiAvailable, extractJsonFromDocument } from "@/lib/document-ai-server";
import {
    LEASE_EXTRACTION_PROMPT,
    isEmptyExtraction,
    matchAgency,
    matchAgent,
    matchProperty,
    matchTenant,
    normalizeLeaseExtraction,
    type AgencyCandidate,
    type AgentCandidate,
    type PropertyCandidate,
    type TenantCandidate,
} from "@/lib/lease-extract";

export const runtime = "nodejs";
// A long lease on the OpenAI fallback has taken close to two minutes, and it may only start after Gemini timed out.
export const maxDuration = 300;

const TAG = "Lease Extract";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

/** The account's rentable properties, tenants, agencies and corretores, with what the matcher compares. */
async function loadCandidates(supabase: AdminSupabase, profileId: string) {
    const [propertiesRes, tenantsRes, membershipsRes, profileRes, agentsRes] = await Promise.all([
        supabase.from("properties").select("id, name, address, city, zip, electronic_id").eq("owner_id", profileId),
        supabase.from("tenants").select("id, full_name, cpf").eq("user_id", profileId).is("deleted_at", null),
        supabase.from("agency_members").select("agency_id").eq("user_id", profileId),
        supabase.from("profiles").select("property_details, property_address, additional_properties").eq("id", profileId).maybeSingle(),
        supabase.from("agents").select("id, full_name, cpf, creci_number, creci_state").eq("user_id", profileId).is("deleted_at", null),
    ]);

    // The structured address lives in the profile JSON (Imóveis page); the row only has the one-line version.
    const profileAddresses: { id?: string; name: string; street?: string; number?: string }[] = [];
    const profile = profileRes.data as Record<string, unknown> | null;
    const pushProfileProperty = (id: unknown, details: unknown, address: unknown) => {
        const d = (details ?? {}) as Record<string, unknown>;
        const a = (address ?? {}) as Record<string, unknown>;
        profileAddresses.push({
            id: typeof id === "string" ? id : undefined,
            name: typeof d.propertyName === "string" ? d.propertyName.trim().toLowerCase() : "",
            street: typeof a.street === "string" ? a.street : undefined,
            number: typeof a.number === "string" ? a.number : undefined,
        });
    };
    if (profile) {
        pushProfileProperty(undefined, profile.property_details, profile.property_address);
        for (const ap of Array.isArray(profile.additional_properties) ? profile.additional_properties : []) {
            const entry = (ap ?? {}) as Record<string, unknown>;
            pushProfileProperty(entry.id, entry.details, entry.address);
        }
    }

    const properties: PropertyCandidate[] = (propertiesRes.data || [])
        .filter((p) => !isStandaloneUc(p.electronic_id))
        .map((p) => {
            const name = (p.name as string) || "";
            const fromProfile = profileAddresses.find((x) => x.id === p.id) ?? profileAddresses.find((x) => x.name && x.name === name.trim().toLowerCase());
            return {
                id: p.id as string,
                name,
                address: p.address as string | null,
                street: fromProfile?.street ?? null,
                street_number: fromProfile?.number ?? null,
                city: p.city as string | null,
                zip: p.zip as string | null,
            };
        });

    let agencies: AgencyCandidate[] = [];
    const agencyIds = (membershipsRes.data || []).map((m) => m.agency_id as string);
    if (agencyIds.length > 0) {
        const { data } = await supabase.from("agencies").select("id, name, trade_name, cnpj").in("id", agencyIds).is("deleted_at", null);
        agencies = (data as AgencyCandidate[] | null) || [];
    }

    return {
        properties,
        tenants: (tenantsRes.data as TenantCandidate[] | null) || [],
        agencies,
        agents: (agentsRes.data as AgentCandidate[] | null) || [],
    };
}

/**
 * POST /api/leases/extract
 * JSON `{ storage_path }` — the agreement the browser uploaded through POST /api/leases/upload-url, which
 * is how files past Vercel's 4.5 MB body limit get here — or multipart/form-data with `file`.
 *
 * Reads the contract with AI and matches what it found against the account's
 * properties, agencies, corretores and tenants. Read-only: nothing is created here.
 * The Contratos import flow asks the user before creating whatever did not match.
 */
export const POST = withAuth(
    { tag: TAG, limit: { scope: "ai:extract-lease", limit: 30, windowMs: HOUR } },
    async ({ req, profileId, supabase }) => {
        let buffer: Buffer;
        let mimeType: string;
        if ((req.headers.get("content-type") || "").includes("application/json")) {
            const path = ownStagedPath(profileId, (await readJsonBody(req)).storage_path);
            const staged = path ? await downloadStagedUpload(supabase, path) : null;
            if (!path || !staged) {
                return NextResponse.json({ error: "Arquivo não encontrado. Envie o contrato novamente." }, { status: 400 });
            }
            buffer = staged;
            mimeType = mimeTypeOfStagedPath(path);
        } else {
            const formData = await req.formData();
            const file = formData.get("file");
            if (!(file instanceof File)) {
                return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
            }
            const uploadError = validateUpload(file, MAX_FILE_SIZE, [
                "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp",
            ]);
            if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

            buffer = Buffer.from(await file.arrayBuffer());
            mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type;
        }

        let textContent = "";
        let pdf: PDFDocument | null = null;
        if (mimeType === "application/pdf") {
            try {
                pdf = await getDocumentProxy(new Uint8Array(buffer));
                textContent = (await extractText(pdf, { mergePages: true })).text || "";
            } catch (pdfError) {
                console.warn(`[${TAG}] PDF text extraction failed:`, pdfError);
            }
        }

        if (!aiAvailable()) {
            return NextResponse.json({ error: "Serviço de IA indisponível." }, { status: 503 });
        }

        let raw: unknown | null = null;
        try {
            raw = await extractJsonFromDocument({ prompt: LEASE_EXTRACTION_PROMPT, contentLabel: "Conteúdo do contrato", textContent, buffer, mimeType, tag: TAG });
        } catch (err) {
            console.error(`[${TAG}] AI extraction failed:`, err);
        }
        if (!raw) {
            return NextResponse.json({ error: "Não foi possível ler o contrato. Tente outro arquivo ou preencha manualmente." }, { status: 422 });
        }

        const data = normalizeLeaseExtraction(raw);
        if (isEmptyExtraction(data)) {
            return NextResponse.json({ error: "Este arquivo não parece ser um contrato de locação." }, { status: 422 });
        }

        const candidates = await loadCandidates(supabase, profileId);
        const agencyMatch = matchAgency(data.agency, candidates.agencies);
        // The agency's logo sits in the header of a digital PDF: when the agency is new to the account, it goes along for the record created from this contract
        let agencyLogo: string | null = null;
        if (data.agency && !agencyMatch && pdf) {
            try {
                agencyLogo = await extractLogoFromPdf(pdf, null);
            } catch (logoErr) {
                console.warn(`[${TAG}] logo extraction failed:`, logoErr);
            }
        }
        return NextResponse.json({
            success: true,
            data,
            agency_logo: agencyLogo,
            matches: {
                property: matchProperty(data.property, candidates.properties),
                agency: agencyMatch,
                agents: data.agents.map((g) => matchAgent(g, candidates.agents)),
                tenants: data.tenants.map((t) => matchTenant(t, candidates.tenants)),
            },
        });
    }
);
