import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { leaseInputSchema } from "@/lib/schemas/lease";
import {
    LEASE_DOCUMENTS_BUCKET,
    LEASE_SELECT_WITH_NAMES,
    activeLeaseWarning,
    assertLeaseRelations,
    flattenLease,
    loadOwnedLease,
    writeLeaseChildren,
} from "@/lib/leases-server";
import { signStorageUrl } from "@/lib/storage";

type Params = { id: string };

/**
 * GET /api/leases/[id]
 * The lease with names, additional tenants, charges and documents (signed URLs).
 */
export const GET = withAuth<undefined, Params>({ tag: "Lease GET" }, async ({ params, profileId, supabase }) => {
    const lease = await loadOwnedLease(supabase, params.id, profileId, LEASE_SELECT_WITH_NAMES);

    const [tenantsRes, chargesRes, docsRes] = await Promise.all([
        supabase.from("lease_tenants").select("*, tenant:tenants!tenant_id(full_name)").eq("lease_id", params.id),
        supabase.from("lease_charges").select("*").eq("lease_id", params.id),
        supabase.from("lease_documents").select("*").eq("lease_id", params.id).order("uploaded_at", { ascending: false }),
    ]);

    return NextResponse.json({
        lease: {
            ...flattenLease(lease),
            additional_tenants: (tenantsRes.data || []).map((t: Record<string, unknown>) => ({
                ...t,
                tenant_name: (t.tenant as Record<string, unknown> | null)?.full_name || null,
                tenant: undefined,
            })),
            charges: chargesRes.data || [],
            // Private bucket: stored paths (or legacy URLs) become short-lived signed URLs.
            documents: await Promise.all(
                (docsRes.data || []).map(async (doc: { file_url: string | null }) => ({
                    ...doc,
                    file_url: (await signStorageUrl(supabase, LEASE_DOCUMENTS_BUCKET, doc.file_url)) ?? doc.file_url,
                }))
            ),
        },
    });
});

/**
 * PUT /api/leases/[id]
 * Updates a lease and replaces its additional tenants and charges.
 */
export const PUT = withAuth<typeof leaseInputSchema, Params>(
    { body: leaseInputSchema, tag: "Lease PUT" },
    async ({ body, params, profileId, supabase }) => {
        await loadOwnedLease(supabase, params.id, profileId);
        await assertLeaseRelations(supabase, profileId, body.lease);
        const warning = await activeLeaseWarning(supabase, profileId, body.lease, params.id);

        const { data: lease, error } = await supabase
            .from("leases")
            .update(body.lease)
            .eq("id", params.id)
            .select()
            .single();

        if (error) {
            console.error("[Lease PUT] Update error:", error);
            return NextResponse.json({ error: "Erro ao atualizar contrato." }, { status: 500 });
        }

        await writeLeaseChildren(supabase, profileId, params.id, body, { replace: true, tag: "Lease PUT" });

        return NextResponse.json({ lease, warning });
    }
);

/**
 * DELETE /api/leases/[id]
 * Soft-deletes a lease the account owns.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Lease DELETE" }, async ({ params, profileId, supabase }) => {
    await loadOwnedLease(supabase, params.id, profileId);

    const { error } = await supabase
        .from("leases")
        .update({ deleted_at: new Date().toISOString(), deleted_by: profileId })
        .eq("id", params.id);

    if (error) {
        console.error("[Lease DELETE] Error:", error);
        return NextResponse.json({ error: "Erro ao excluir contrato." }, { status: 500 });
    }

    return NextResponse.json({ message: "Contrato excluído com sucesso." });
});
