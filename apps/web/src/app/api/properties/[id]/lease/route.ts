import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { LEASE_DOCUMENTS_BUCKET, LEASE_SELECT_WITH_NAMES, flattenLease } from "@/lib/leases-server";
import { signStorageUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Leases that are in force come first; among equals, the one that started last. */
const IN_FORCE = new Set(["ACTIVE", "EXPIRING_SOON"]);

/**
 * GET /api/properties/[id]/lease
 * → { lease, others }
 *
 * The lease the property page shows in "Contrato de Aluguel": the one in force (ACTIVE / EXPIRING_SOON),
 * else the most recent one, with the tenant, agency and agent names and its documents (signed URLs).
 * `others` is how many more leases the property has. `lease` is null when it has none.
 */
export async function GET(_request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!(await getOwnedProperty(supabase, profileId, id))) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    const { data, error } = await supabase
        .from("leases")
        .select(LEASE_SELECT_WITH_NAMES)
        .eq("user_id", profileId)
        .eq("property_id", id)
        .is("deleted_at", null)
        .order("start_date", { ascending: false });
    if (error) {
        console.error("[Property lease GET]", error.message);
        return NextResponse.json({ error: "Erro ao carregar o contrato." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    if (rows.length === 0) return NextResponse.json({ lease: null, others: 0 });
    const chosen = rows.find(l => IN_FORCE.has(String(l.status))) ?? rows[0];

    const { data: docs } = await supabase
        .from("lease_documents")
        .select("id, document_type, file_name, file_url, uploaded_at")
        .eq("lease_id", String(chosen.id))
        .order("uploaded_at", { ascending: false });
    const documents = await Promise.all(
        (docs ?? []).map(async doc => ({ ...doc, file_url: (await signStorageUrl(supabase, LEASE_DOCUMENTS_BUCKET, doc.file_url)) ?? doc.file_url }))
    );

    return NextResponse.json({ lease: { ...flattenLease(chosen), documents }, others: rows.length - 1 });
}
