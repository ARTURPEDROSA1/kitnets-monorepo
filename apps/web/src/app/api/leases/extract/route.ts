import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { downloadStagedUpload, mimeTypeOfStagedPath, ownStagedPath } from "@/lib/lease-uploads-server";
import type { AdminSupabase } from "@/lib/api-auth";
import { HOUR } from "@/lib/rate-limit";
import { validateUpload } from "@/lib/session";
import { AI_MODELS, reportAiFallback } from "@/lib/ai-models";
import { scannedPdfPageImages } from "@/lib/pdf-page-images";
import {
    LEASE_EXTRACTION_PROMPT,
    isEmptyExtraction,
    matchAgency,
    matchProperty,
    matchTenant,
    normalizeLeaseExtraction,
    type AgencyCandidate,
    type PropertyCandidate,
    type TenantCandidate,
} from "@/lib/lease-extract";

export const runtime = "nodejs";
// A long lease on the OpenAI fallback has taken close to two minutes, and it may only start after Gemini timed out.
export const maxDuration = 300;
// Gemini overloaded tends to hang before answering 503: leave the fallback time to run
const GEMINI_TIMEOUT_MS = 90_000;

const TAG = "Lease Extract";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Leases run long and the clauses that matter (reajuste, garantia) sit near the end.
const MAX_TEXT_CHARS = 60000;

function parseJsonResponse(text: string): unknown {
    let clean = text.trim();
    if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd >= jsonStart) clean = clean.substring(jsonStart, jsonEnd + 1);
    return JSON.parse(clean);
}

/**
 * Gemini on the text (or on the file when it is a scan), OpenAI as the fallback. A scanned PDF reaches
 * OpenAI as its page images: handed the PDF itself, gpt-4o got the names right and made up the address
 * and the dates (checked against a real signed lease, 2026-09-18).
 */
async function runExtraction(textContent: string, buffer: Buffer, mimeType: string): Promise<unknown | null> {
    const base64 = buffer.toString("base64");
    const hasText = textContent.trim().length >= 100;

    if (process.env.GEMINI_API_KEY) {
        try {
            const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel(
                { model: AI_MODELS.gemini, generationConfig: { temperature: 0, responseMimeType: "application/json" } },
                { timeout: GEMINI_TIMEOUT_MS }
            );
            const result = await model.generateContent(
                hasText
                    ? [{ text: `${LEASE_EXTRACTION_PROMPT}\n\nConteúdo do contrato:\n\n${textContent.substring(0, MAX_TEXT_CHARS)}` }]
                    : [{ text: LEASE_EXTRACTION_PROMPT }, { inlineData: { mimeType, data: base64 } }]
            );
            return parseJsonResponse(result.response.text());
        } catch (err) {
            console.warn(`[${TAG}] Gemini failed:`, err);
            reportAiFallback(TAG, err);
        }
    }

    if (!process.env.OPENAI_API_KEY) return null;
    // Chat completions read images, not scans inside a PDF: send the pages as pictures
    let images = [`data:${mimeType};base64,${base64}`];
    if (!hasText && mimeType === "application/pdf") {
        images = await scannedPdfPageImages(new Uint8Array(buffer));
        if (images.length === 0) return null;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
        model: hasText ? AI_MODELS.openaiMini : AI_MODELS.openai,
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 4000,
        messages: hasText
            ? [
                  { role: "system", content: LEASE_EXTRACTION_PROMPT },
                  { role: "user", content: textContent.substring(0, MAX_TEXT_CHARS) },
              ]
            : [
                  {
                      role: "user",
                      content: [
                          { type: "text", text: LEASE_EXTRACTION_PROMPT },
                          ...images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
                      ],
                  },
              ],
    });
    const content = completion.choices[0]?.message?.content;
    return content ? parseJsonResponse(content) : null;
}

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

/** The account's rentable properties, tenants and agencies, with what the matcher compares. */
async function loadCandidates(supabase: AdminSupabase, profileId: string) {
    const [propertiesRes, tenantsRes, membershipsRes, profileRes] = await Promise.all([
        supabase.from("properties").select("id, name, address, city, zip, electronic_id").eq("owner_id", profileId),
        supabase.from("tenants").select("id, full_name, cpf").eq("user_id", profileId).is("deleted_at", null),
        supabase.from("agency_members").select("agency_id").eq("user_id", profileId),
        supabase.from("profiles").select("property_details, property_address, additional_properties").eq("id", profileId).maybeSingle(),
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

    return { properties, tenants: (tenantsRes.data as TenantCandidate[] | null) || [], agencies };
}

/**
 * POST /api/leases/extract
 * JSON `{ storage_path }` — the agreement the browser uploaded through POST /api/leases/upload-url, which
 * is how files past Vercel's 4.5 MB body limit get here — or multipart/form-data with `file`.
 *
 * Reads the contract with AI and matches what it found against the account's
 * properties, agencies and tenants. Read-only: nothing is created here. The
 * Contratos import flow asks the user before creating whatever did not match.
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
        if (mimeType === "application/pdf") {
            try {
                const pdf = await getDocumentProxy(new Uint8Array(buffer));
                textContent = (await extractText(pdf, { mergePages: true })).text || "";
            } catch (pdfError) {
                console.warn(`[${TAG}] PDF text extraction failed:`, pdfError);
            }
        }

        if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "Serviço de IA indisponível." }, { status: 503 });
        }

        let raw: unknown | null = null;
        try {
            raw = await runExtraction(textContent, buffer, mimeType);
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
        return NextResponse.json({
            success: true,
            data,
            matches: {
                property: matchProperty(data.property, candidates.properties),
                agency: matchAgency(data.agency, candidates.agencies),
                tenants: data.tenants.map((t) => matchTenant(t, candidates.tenants)),
            },
        });
    }
);
