import { NextResponse } from "next/server";
import { HttpError, badRequest, withAuth } from "@/lib/api-route";
import { leaseTerminationSchema } from "@/lib/schemas/lease";
import { loadOwnedLease } from "@/lib/leases-server";
import { IN_FORCE, todayBRT } from "@/lib/lease-dashboard";
import { dropAdjustmentsFrom } from "@/lib/lease-adjustments-server";
import type { LeaseStatus } from "@/types/lease";

type Params = { id: string };

const fmt = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/**
 * POST /api/leases/[id]/terminate
 * Ends a lease without deleting it.
 *
 * - A day ahead is the tenant's **notice of leaving** (aviso de desocupação): the lease stays in force
 *   until then — the planned move-out day is its termination_date, `notice_date` (required) when the
 *   tenant gave notice — and is closed as TERMINATED the day after (lib/lease-notice-server.ts). No
 *   adjustment from the notice date on: the calculated ones recorded since go, the amounts go back.
 *   Sent again, it changes the notice.
 * - Today or a day behind ends it now: `status` TERMINATED (rescinded, the default) or EXPIRED (a contract
 *   that ran its term and ended that day: an old contract imported with its closing date).
 */
export const POST = withAuth<typeof leaseTerminationSchema, Params>(
    { body: leaseTerminationSchema, tag: "Lease Terminate" },
    async ({ body, params, profileId, supabase }) => {
        const lease = await loadOwnedLease(supabase, params.id, profileId, "id, status, notes, start_date");
        const status = lease.status as LeaseStatus;
        const today = todayBRT();

        if (status === "TERMINATED") throw new HttpError(400, { error: "Contrato já foi rescindido." });
        if (status === "CANCELLED") throw new HttpError(400, { error: "Contrato cancelado não pode ser rescindido." });
        if (body.termination_date <= String(lease.start_date).slice(0, 10)) {
            throw badRequest({ termination_date: "A data deve ser posterior ao início do contrato." });
        }

        // a move-out day ahead: the notice, the lease in force until then
        if (body.termination_date > today) {
            if (!IN_FORCE.has(status)) throw new HttpError(400, { error: "Só um contrato vigente recebe aviso de desocupação." });
            if (!body.notice_date) throw badRequest({ notice_date: "Informe a data do aviso." });
            const noticeDate = body.notice_date;
            if (noticeDate > body.termination_date) throw badRequest({ notice_date: "O aviso vem antes da desocupação." });
            if (noticeDate <= String(lease.start_date).slice(0, 10)) throw badRequest({ notice_date: "O aviso vem depois do início do contrato." });
            const { data: updated, error } = await supabase
                .from("leases")
                .update({
                    termination_date: body.termination_date,
                    notice_date: noticeDate,
                    termination_reason: body.termination_reason ?? "Aviso de desocupação",
                    notes: body.notes ?? (lease.notes as string | null) ?? null,
                })
                .eq("id", params.id)
                .select()
                .single();
            if (error) {
                console.error("[Lease Terminate] Notice error:", error);
                return NextResponse.json({ error: "Erro ao registrar o aviso de desocupação." }, { status: 500 });
            }
            // no adjustment from the notice on (one recorded since, when the notice is dated back, is undone)
            await dropAdjustmentsFrom(supabase, params.id, noticeDate);
            return NextResponse.json({ lease: updated, message: `Aviso de desocupação registrado: o contrato segue vigente até ${fmt(body.termination_date)}.` });
        }

        const { data: updated, error } = await supabase
            .from("leases")
            .update({
                status: body.status,
                termination_date: body.termination_date,
                termination_reason: body.termination_reason,
                // a notice given earlier keeps its date; one sent now is recorded
                ...(body.notice_date ? { notice_date: body.notice_date } : {}),
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

        return NextResponse.json({ lease: updated, message: body.status === "EXPIRED" ? "Encerramento registrado." : "Contrato rescindido com sucesso." });
    }
);

/**
 * DELETE /api/leases/[id]/terminate
 * Withdraws the tenant's notice of leaving: the lease in force runs on as before (no move-out day).
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Lease Notice DELETE" }, async ({ params, profileId, supabase }) => {
    const lease = await loadOwnedLease(supabase, params.id, profileId, "id, status, termination_date");
    if (!IN_FORCE.has(lease.status as LeaseStatus) || !lease.termination_date) {
        throw new HttpError(409, { error: "Este contrato não tem aviso de desocupação." });
    }
    const { error } = await supabase
        .from("leases")
        .update({ termination_date: null, notice_date: null, termination_reason: null })
        .eq("id", params.id);
    if (error) {
        console.error("[Lease Notice DELETE] Update error:", error);
        return NextResponse.json({ error: "Erro ao cancelar o aviso de desocupação." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
});
