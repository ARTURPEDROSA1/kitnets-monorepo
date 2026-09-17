/**
 * Index sync — database side shared by the cron routes (service-role client).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// The cron routes use an untyped service-role client, like the older index jobs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface StoredValue { month: string; value: number; acc12m: number | null }

export async function indexIdByCode(db: Db, code: string): Promise<string> {
    const { data, error } = await db.from("economic_indexes").select("id").eq("code", code).single();
    if (error || !data) throw new Error(`Índice ${code} não encontrado: ${error?.message ?? "sem linha"}`);
    return data.id as string;
}

/** Stored months of an index from `fromMonth` (`YYYY-MM`) on. */
export async function storedValues(db: Db, indexId: string, fromMonth: string): Promise<Map<string, StoredValue>> {
    const { data, error } = await db.from("economic_index_values").select("year, month, value_percent, accumulated_12m").eq("index_id", indexId).gte("reference_date", `${fromMonth}-01`);
    if (error) throw new Error(`Erro ao ler economic_index_values: ${error.message}`);
    const out = new Map<string, StoredValue>();
    for (const r of data ?? []) {
        const month = `${r.year}-${String(r.month).padStart(2, "0")}`;
        out.set(month, { month, value: Number(r.value_percent), acc12m: r.accumulated_12m === null ? null : Number(r.accumulated_12m) });
    }
    return out;
}

/**
 * Upserts month values on the table's unique key (index, year, month). `withAcc12m` decides whether the
 * accumulated column is part of the payload: every row of one call carries the same columns, so a job that
 * does not know the 12-month figure never blanks the one already stored.
 */
export async function upsertValues(db: Db, indexId: string, rows: Array<{ month: string; value: number; acc12m?: number | null }>, sourceUrl: string, withAcc12m: boolean): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date().toISOString();
    const payload = rows.map(r => {
        const [y, m] = r.month.split("-").map(Number);
        const base = { index_id: indexId, year: y, month: m, reference_date: `${r.month}-01`, value_percent: r.value, is_projection: false, source_url: sourceUrl, updated_at: now };
        return withAcc12m ? { ...base, accumulated_12m: r.acc12m ?? null } : base;
    });
    const { error } = await db.from("economic_index_values").upsert(payload, { onConflict: "index_id,year,month" });
    if (error) throw new Error(`Erro ao gravar economic_index_values: ${error.message}`);
}

/** One row per job in `index_sync_state`: when it last ran and how it went. Never throws. */
export async function saveSyncState(db: Db, job: string, status: "ok" | "unchanged" | "error", message: string, latestReference: string | null): Promise<void> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { job, last_checked_at: now, last_status: status, last_message: message.slice(0, 1000) };
    if (status === "ok") patch.last_changed_at = now;
    if (latestReference) patch.latest_reference = latestReference;
    const { error } = await db.from("index_sync_state").upsert(patch, { onConflict: "job" });
    if (error) console.error(`[${job}] could not save the sync state:`, error.message);
}
