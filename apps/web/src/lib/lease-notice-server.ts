/**
 * The tenant's notice of leaving (aviso de desocupação) on the server: a lease in force whose
 * termination_date — the planned move-out day — is behind today is over. It is closed as TERMINATED
 * by the daily cron for every account and, so the screens never wait for it, when an account's
 * contracts are read. Idempotent: a lease already closed is left alone.
 */
import type { AdminSupabase } from "@/lib/api-auth";

/** Closes the leases whose move-out day is behind `today` (all accounts, or one); → how many. Never throws. */
export async function closeEndedNotices(supabase: AdminSupabase, opts: { today: string; profileId?: string }): Promise<number> {
    try {
        let query = supabase
            .from("leases")
            .update({ status: "TERMINATED" })
            .in("status", ["ACTIVE", "EXPIRING_SOON"])
            .not("termination_date", "is", null)
            .lt("termination_date", opts.today)
            .is("deleted_at", null);
        if (opts.profileId) query = query.eq("user_id", opts.profileId);
        const { data, error } = await query.select("id");
        if (error) throw new Error(error.message);
        return (data ?? []).length;
    } catch (err) {
        console.error("[Lease notice] closing ended notices failed:", (err as Error).message);
        return 0;
    }
}
