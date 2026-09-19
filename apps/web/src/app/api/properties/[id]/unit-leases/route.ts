import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { LEASE_DOCUMENTS_BUCKET, syncLeaseUnitNames } from "@/lib/leases-server";
import { signStorageUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Leases that are in force come first; among equals, the one that started last. */
const IN_FORCE = new Set(["ACTIVE", "EXPIRING_SOON"]);

/**
 * GET /api/properties/[id]/unit-leases
 * → { units: { [unitId]: { lease_id, reference_name, status, contract: { file_name, file_url, mime_type } | null } } }
 *
 * The lease of each unit of a multi-unit property, for the unit cards on the Imóveis page: the one in force
 * (ACTIVE / EXPIRING_SOON), else the most recent, with its agreement file (the CONTRACT document, else the
 * latest file) behind a signed URL. Units without a lease are absent; whole-property leases are not listed.
 */
export async function GET(_request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!(await getOwnedProperty(supabase, profileId, id))) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    const { data, error } = await supabase
        .from("leases")
        .select("id, property_id, unit_id, unit_name, reference_name, status, start_date")
        .eq("user_id", profileId)
        .eq("property_id", id)
        .not("unit_id", "is", null)
        .is("deleted_at", null)
        .order("start_date", { ascending: false });
    if (error) {
        console.error("[Property unit leases GET]", error.message);
        return NextResponse.json({ error: "Erro ao carregar os contratos das unidades." }, { status: 500 });
    }

    const chosen = new Map<string, { id: string; reference_name: string | null; status: string }>();
    for (const lease of await syncLeaseUnitNames(supabase, profileId, data ?? [])) {
        const unitId = lease.unit_id as string;
        const current = chosen.get(unitId);
        if (!current || (!IN_FORCE.has(current.status) && IN_FORCE.has(lease.status))) {
            chosen.set(unitId, { id: lease.id, reference_name: lease.reference_name, status: lease.status });
        }
    }
    if (chosen.size === 0) return NextResponse.json({ units: {} });

    const { data: docs } = await supabase
        .from("lease_documents")
        .select("lease_id, document_type, file_name, file_url, mime_type, uploaded_at")
        .in("lease_id", [...chosen.values()].map(l => l.id))
        .order("uploaded_at", { ascending: false });

    const units: Record<string, unknown> = {};
    for (const [unitId, lease] of chosen) {
        const files = (docs ?? []).filter(d => d.lease_id === lease.id);
        const file = files.find(d => d.document_type === "CONTRACT") ?? files[0];
        units[unitId] = {
            lease_id: lease.id,
            reference_name: lease.reference_name,
            status: lease.status,
            contract: file
                ? {
                      file_name: file.file_name,
                      mime_type: file.mime_type,
                      file_url: (await signStorageUrl(supabase, LEASE_DOCUMENTS_BUCKET, file.file_url)) ?? file.file_url,
                  }
                : null,
        };
    }

    return NextResponse.json({ units });
}
