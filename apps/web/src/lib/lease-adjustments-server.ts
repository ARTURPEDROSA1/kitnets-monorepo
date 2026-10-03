/**
 * The history of a lease's adjustments on the server: reading it, recording the calculated ones that
 * fell due (the dashboard does it when it is opened, the daily cron for every lease), and saving or
 * removing an addendum. The maths is lib/lease-adjustments.ts; the writes go through the database
 * functions of migrations/20261003700000_lease_adjustments.sql, which move the lease's current rent
 * and condominium together with the history.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError, badRequest, notFound } from "@/lib/api-route";
import { loadOwnedLease } from "@/lib/leases-server";
import { IN_FORCE } from "@/lib/lease-dashboard";
import { leaseIndexSeriesCode, type IndexPoint } from "@/lib/lease-summary";
import { adjustableCondo, dueAdjustments, initialValues, withAddendum, type AdjustableLease, type AdjustmentRow, type DueAdjustments, type StoredAdjustment } from "@/lib/lease-adjustments";
import type { LeaseAddendumInput } from "@/lib/schemas/lease-adjustment";
import type { LeaseStatus } from "@/types/lease";

const TAG = "Lease adjustments";
const COLUMNS = "id, lease_id, effective_date, source, index_code, index_pct, index_factor, previous_rent, new_rent, previous_condo, new_condo, condo_factor, document_id, notes, created_at";

export type SeriesByCode = Record<string, IndexPoint[] | null | undefined>;
export type AdjustmentLease = AdjustableLease & { id: string; status: LeaseStatus };

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function normalize(r: Record<string, unknown>): StoredAdjustment {
    return {
        id: String(r.id),
        lease_id: String(r.lease_id),
        effective_date: String(r.effective_date).slice(0, 10),
        source: r.source === "ADDENDUM" ? "ADDENDUM" : "CALCULATED",
        index_code: (r.index_code as string | null) ?? null,
        index_pct: num(r.index_pct),
        index_factor: num(r.index_factor),
        previous_rent: Number(r.previous_rent) || 0,
        new_rent: Number(r.new_rent) || 0,
        previous_condo: num(r.previous_condo),
        new_condo: num(r.new_condo),
        condo_factor: num(r.condo_factor),
        document_id: (r.document_id as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        created_at: r.created_at ? String(r.created_at) : undefined,
    };
}

/** What the database functions take for one row. */
const toDb = (r: AdjustmentRow) => ({
    effective_date: r.effective_date.slice(0, 10),
    source: r.source,
    index_code: r.index_code,
    index_pct: r.index_pct,
    index_factor: r.index_factor,
    previous_rent: r.previous_rent,
    new_rent: r.new_rent,
    previous_condo: r.previous_condo,
    new_condo: r.new_condo,
    condo_factor: r.condo_factor,
    document_id: r.document_id ?? null,
    notes: r.notes,
});

/** The condominium the lease ends up with, when any row moved it; null leaves the charge alone. */
const condoToWrite = (rows: readonly AdjustmentRow[], condo: number | null) => (rows.some(r => r.new_condo !== null) ? condo : null);

/**
 * The lease's adjustments, oldest first. `available: false` while the table is not there (a deploy
 * ahead of its migration) or cannot be read: the screens then show the contract without a history.
 */
export async function loadAdjustments(supabase: AdminSupabase, leaseId: string): Promise<{ rows: StoredAdjustment[]; available: boolean }> {
    const { data, error } = await supabase.from("lease_adjustments").select(COLUMNS).eq("lease_id", leaseId).order("effective_date", { ascending: true });
    if (error) {
        console.error(`[${TAG}] read failed:`, error.message);
        return { rows: [], available: false };
    }
    return { rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(normalize), available: true };
}

export interface AdjustmentSync {
    rows: StoredAdjustment[];
    available: boolean;
    /** calculated adjustments recorded by this call */
    recorded: number;
    /** the lease's rent or condominium may have moved (here, or by someone who got there first): read them again */
    changed: boolean;
    waiting: DueAdjustments["waiting"];
    /** adjustments calculated but not written, because the write failed: shown as such, never silently dropped */
    pending: AdjustmentRow[];
    /** why the write failed */
    error: string | null;
}

/**
 * Records the calculated adjustments a lease in force owes (lib/lease-adjustments.ts) and answers its
 * history. Never throws: on a failure the lease is left as it was and the history is what could be read.
 */
export async function syncLeaseAdjustments(supabase: AdminSupabase, lease: AdjustmentLease, seriesByCode: SeriesByCode, today: string): Promise<AdjustmentSync> {
    const stored = await loadAdjustments(supabase, lease.id);
    const idle: AdjustmentSync = { ...stored, recorded: 0, changed: false, waiting: null, pending: [], error: null };
    if (!stored.available || !IN_FORCE.has(lease.status)) return idle;

    let due: DueAdjustments;
    try {
        due = dueAdjustments(lease, stored.rows, seriesByCode, today);
    } catch (err) {
        console.error(`[${TAG}] calculation of lease ${lease.id} failed:`, (err as Error).message);
        return { ...idle, error: `cálculo: ${(err as Error).message}` };
    }
    if (due.rows.length === 0) return { ...idle, waiting: due.waiting };

    try {
        const { data, error } = await supabase.rpc("lease_adjustments_record", {
            p_lease_id: lease.id,
            p_rows: due.rows.map(toDb),
            p_rent: due.rent,
            p_condo: condoToWrite(due.rows, due.condo),
            p_replace: false,
        });
        if (error) throw new Error(error.message);
        // STALE: another reader recorded the same dates a moment ago — its rows are the ones to show
        if (data !== "OK" && data !== "STALE") throw new Error(`lease_adjustments_record: ${String(data)}`);
        const after = await loadAdjustments(supabase, lease.id);
        return { ...after, recorded: data === "OK" ? due.rows.length : 0, changed: true, waiting: due.waiting, pending: [], error: null };
    } catch (err) {
        console.error(`[${TAG}] sync of lease ${lease.id} failed:`, (err as Error).message);
        return { ...idle, waiting: due.waiting, pending: due.rows, error: (err as Error).message };
    }
}

const LEASE_COLUMNS = "id, start_date, monthly_rent, adjustment_index, adjustment_frequency, next_adjustment_date, status";

async function loadCharges(supabase: AdminSupabase, leaseId: string): Promise<NonNullable<AdjustableLease["charges"]>> {
    // `*`: adjusts_with_rent arrives with its own migration
    const { data } = await supabase.from("lease_charges").select("*").eq("lease_id", leaseId);
    return (data ?? []) as unknown as NonNullable<AdjustableLease["charges"]>;
}

/** The account's lease with its charges, as the adjustment maths takes it. Throws the 404 of `loadOwnedLease`. */
export async function loadAdjustmentLease(supabase: AdminSupabase, leaseId: string, profileId: string): Promise<AdjustmentLease> {
    const row = await loadOwnedLease(supabase, leaseId, profileId, LEASE_COLUMNS);
    return { ...(row as unknown as AdjustmentLease), monthly_rent: Number(row.monthly_rent) || 0, charges: await loadCharges(supabase, leaseId) };
}

/** The calculator codes a lease's adjustment reads: the rent's index and, when it has one of its own, the condominium's. */
export function seriesCodesOf(lease: AdjustableLease): string[] {
    const condo = adjustableCondo(lease);
    return [leaseIndexSeriesCode(lease.adjustment_index), condo && !condo.withRent ? leaseIndexSeriesCode(condo.index) : null].filter((c): c is string => Boolean(c));
}

/**
 * Saves an addendum — the truth of its date, whatever the index says — and chains the calculated rows
 * after it again. The lease's rent and condominium become what the history ends with.
 */
export async function saveAddendum(supabase: AdminSupabase, leaseId: string, profileId: string, input: LeaseAddendumInput, today: string): Promise<void> {
    const lease = await loadAdjustmentLease(supabase, leaseId, profileId);
    if (input.effective_date <= lease.start_date.slice(0, 10)) throw badRequest({ effective_date: "A data deve ser posterior ao início do contrato." });
    if (input.effective_date > today) throw badRequest({ effective_date: "Registre o aditivo quando o novo valor já estiver valendo: a data não pode ser futura." });

    if (input.document_id) {
        const { data: doc } = await supabase.from("lease_documents").select("id").eq("id", input.document_id).eq("lease_id", leaseId).maybeSingle();
        if (!doc) throw badRequest({ document_id: "O arquivo do aditivo não foi encontrado neste contrato." });
    }

    const stored = await loadAdjustments(supabase, leaseId);
    if (!stored.available) throw new HttpError(503, { error: "O histórico de reajustes ainda não está disponível. Tente novamente em instantes." });

    const initial = initialValues(lease, stored.rows);
    // a lease without a condominium charge has none to change
    const chained = withAddendum(stored.rows, { ...input, new_condo: initial.condo === null ? null : input.new_condo }, initial);
    const { data, error } = await supabase.rpc("lease_adjustments_record", {
        p_lease_id: leaseId,
        p_rows: chained.rows.map(toDb),
        p_rent: chained.rent,
        p_condo: condoToWrite(chained.rows, chained.condo),
        p_replace: true,
    });
    if (error) throw new Error(`lease_adjustments_record: ${error.message}`);
    if (data !== "OK") throw notFound("Contrato não encontrado.");
}

/** Removes the lease's latest adjustment when it is an addendum; the amounts go back to what they were before it. */
export async function removeAddendum(supabase: AdminSupabase, leaseId: string, profileId: string, adjustmentId: string): Promise<void> {
    await loadOwnedLease(supabase, leaseId, profileId);
    const { data, error } = await supabase.rpc("lease_adjustment_remove", { p_lease_id: leaseId, p_adjustment_id: adjustmentId });
    if (error) throw new Error(`lease_adjustment_remove: ${error.message}`);
    if (data === "NOT_ADDENDUM") throw new HttpError(409, { error: "Só um aditivo pode ser removido: o reajuste calculado é o que vale quando não há aditivo." });
    if (data === "NOT_LATEST") throw new HttpError(409, { error: "Só o último reajuste pode ser removido. Para corrigir um anterior, registre o aditivo dele." });
    if (data !== "OK") throw notFound("Reajuste não encontrado.");
}

export interface AdjustmentRunReport {
    today: string;
    /** leases in force with an index */
    leases: number;
    /** adjustments recorded */
    recorded: number;
    /** leases with a date behind today still waiting for its index */
    waiting: number;
    errors: string[];
    /** leases not reached before the deadline */
    unreached: number;
}

/**
 * The daily pass: every lease in force, of every account, gets the calculated adjustments it owes.
 * `loadSeries` reads the index series by calculator code (lib/lease-views-server.ts).
 */
export async function runAdjustmentSync(
    supabase: AdminSupabase,
    opts: { today: string; deadline: number; loadSeries: (codes: string[]) => Promise<Record<string, IndexPoint[] | null>>; now?: () => number }
): Promise<AdjustmentRunReport> {
    const now = opts.now ?? Date.now;
    const report: AdjustmentRunReport = { today: opts.today, leases: 0, recorded: 0, waiting: 0, errors: [], unreached: 0 };

    const { data: leaseRows, error } = await supabase
        .from("leases")
        .select(LEASE_COLUMNS)
        .is("deleted_at", null)
        .in("status", [...IN_FORCE])
        .neq("adjustment_index", "NONE")
        .order("id", { ascending: true });
    if (error) throw new Error(`leases: ${error.message}`);
    const leases = (leaseRows ?? []) as unknown as AdjustmentLease[];
    report.leases = leases.length;
    if (leases.length === 0) return report;

    const charges = new Map<string, NonNullable<AdjustableLease["charges"]>[number][]>();
    const { data: chargeRows } = await supabase.from("lease_charges").select("*").in("lease_id", leases.map(l => l.id)).eq("charge_type", "CONDOMINIUM");
    for (const c of (chargeRows ?? []) as unknown as Array<NonNullable<AdjustableLease["charges"]>[number] & { lease_id: string }>) {
        charges.set(c.lease_id, [...(charges.get(c.lease_id) ?? []), c]);
    }
    const full = leases.map(l => ({ ...l, monthly_rent: Number(l.monthly_rent) || 0, charges: charges.get(l.id) ?? [] }));
    const series = await opts.loadSeries([...new Set(full.flatMap(seriesCodesOf))]);

    for (let i = 0; i < full.length; i++) {
        if (now() > opts.deadline) {
            report.unreached = full.length - i;
            break;
        }
        const result = await syncLeaseAdjustments(supabase, full[i], series, opts.today);
        if (!result.available) {
            report.errors.push(`lease ${full[i].id}: history unavailable`);
            continue;
        }
        if (result.error) report.errors.push(`lease ${full[i].id}: ${result.error}`);
        report.recorded += result.recorded;
        if (result.waiting) report.waiting++;
    }
    return report;
}

export const summarizeAdjustmentRun = (r: AdjustmentRunReport): string =>
    `${r.leases} contratos · ${r.recorded} reajustes registrados · ${r.waiting} aguardando índice${r.errors.length ? ` · ${r.errors.length} erros` : ""}${r.unreached ? ` · ${r.unreached} não alcançados` : ""}`;
