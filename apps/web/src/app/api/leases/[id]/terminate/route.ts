import { NextResponse } from "next/server";
import { HttpError, withAuth } from "@/lib/api-route";
import { leaseTerminationSchema } from "@/lib/schemas/lease";
import { loadOwnedLease } from "@/lib/leases-server";

type Params = { id: string };

/**
 * POST /api/leases/[id]/terminate
 * Ends a lease: sets status, date and reason without deleting it.
 */
export const POST = withAuth<typeof leaseTerminationSchema, Params>(
    { body: leaseTerminationSchema, tag: "Lease Terminate" },
    async ({ body, params, profileId, supabase }) => {
        const lease = await loadOwnedLease(supabase, params.id, profileId, "id, status, notes");

        if (lease.status === "TERMINATED") throw new HttpError(400, { error: "Contrato já foi rescindido." });
        if (lease.status === "CANCELLED") throw new HttpError(400, { error: "Contrato cancelado não pode ser rescindido." });

        const { data: updated, error } = await supabase
            .from("leases")
            .update({
                status: "TERMINATED",
                termination_date: body.termination_date,
                termination_reason: body.termination_reason,
                // Keep the existing notes when the request brings none.
                notes: body.notes ?? (lease.notes as string | null) ?? null,
            })
            .eq("id", params.id)
            .select()
            .single();

        if (error) {
            console.error("[Lease Terminate] Update error:", error);
            return NextResponse.json({ error: "Erro ao rescindir contrato." }, { status: 500 });
        }

        return NextResponse.json({ lease: updated, message: "Contrato rescindido com sucesso." });
    }
);
