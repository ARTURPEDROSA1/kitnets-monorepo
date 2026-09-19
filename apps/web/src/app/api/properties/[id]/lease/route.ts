import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { LEASE_DOCUMENTS_BUCKET, LEASE_SELECT_WITH_NAMES, flattenLease } from "@/lib/leases-server";
import { signStorageUrl } from "@/lib/storage";
import { loadPropertyUnits } from "@/lib/property-units-server";
import { pickPropertyLeases, type LeasePick } from "@/lib/property-leases";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/properties/[id]/lease
 * → { leases, others }
 *
 * The leases the property page shows in "Contrato(s) de Aluguel" (selection: lib/property-leases.ts): one for a
 * property rented as a whole, one per unit for a multi-unit property rented unit by unit. Each comes with the
 * tenant, agency and agent names, its documents (signed URLs) and `unit_label`, the unit's current name.
 * `others` is how many more leases the property has. `leases` is empty when it has none.
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

    const rows = (data ?? []) as unknown as Array<Record<string, unknown> & LeasePick>;
    if (rows.length === 0) return NextResponse.json({ leases: [], others: 0 });

    // Units in the order of the Imóveis page, with their current names (only needed when a lease names a unit)
    const units = rows.some(l => l.unit_id) ? (await loadPropertyUnits(supabase, profileId)).get(id) ?? [] : [];
    const { shown, others } = pickPropertyLeases(rows, units.map(u => u.id));

    const { data: docs } = await supabase
        .from("lease_documents")
        .select("id, lease_id, document_type, file_name, file_url, uploaded_at")
        .in("lease_id", shown.map(l => String(l.id)))
        .order("uploaded_at", { ascending: false });
    const documents = await Promise.all(
        (docs ?? []).map(async doc => ({ ...doc, file_url: (await signStorageUrl(supabase, LEASE_DOCUMENTS_BUCKET, doc.file_url)) ?? doc.file_url }))
    );

    return NextResponse.json({
        leases: shown.map(l => ({
            ...flattenLease(l),
            unit_label: l.unit_id ? units.find(u => u.id === l.unit_id)?.name ?? (l.unit_name as string | null) ?? "Unidade" : null,
            documents: documents.filter(d => d.lease_id === l.id),
        })),
        others,
    });
}
