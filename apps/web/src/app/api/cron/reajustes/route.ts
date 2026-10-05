import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { saveSyncState } from "@/lib/index-sync-server";
import { todayBRT } from "@/lib/lease-dashboard";
import { runAdjustmentSync, summarizeAdjustmentRun } from "@/lib/lease-adjustments-server";
import { closeEndedNotices } from "@/lib/lease-notice-server";
import { loadLeaseIndexSeries } from "@/lib/lease-views-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Work stops being started past this; the function's own limit is 300 s. */
const TIME_BUDGET_MS = 240_000;

/**
 * Daily run of the lease adjustments, after the index syncs (vercel.json): every lease in force gets
 * the calculated adjustments it owes — the anniversaries behind today whose cycle is fully published —
 * which move its rent and condominium, so the next invoices follow (lib/lease-adjustments-server.ts).
 * An anniversary with an addendum is left to the addendum. Before that, the leases whose tenant gave
 * notice and whose move-out day passed are closed (lib/lease-notice-server.ts). The outcome is kept in
 * `index_sync_state` under the job LEASE_ADJUSTMENTS.
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
    const db = createAdminClient();
    const started = Date.now();
    const today = todayBRT();
    try {
        const closed = await closeEndedNotices(db, { today });
        const report = await runAdjustmentSync(db, { today, deadline: started + TIME_BUDGET_MS, loadSeries: loadLeaseIndexSeries });
        const message = `${summarizeAdjustmentRun(report)}${closed > 0 ? ` · ${closed} contratos encerrados pelo aviso de desocupação` : ""}`;
        const failed = report.errors.length > 0 || report.unreached > 0;
        await saveSyncState(db, "LEASE_ADJUSTMENTS", failed ? "error" : report.recorded === 0 ? "unchanged" : "ok", failed ? `${message} — ${report.errors.slice(0, 5).join(" | ")}` : message, today);
        if (report.errors.length > 0) console.error("[LEASE_ADJUSTMENTS]", report.errors.join("\n"));
        return NextResponse.json({ ok: true, ms: Date.now() - started, closedByNotice: closed, ...report });
    } catch (err) {
        const message = (err as Error).message;
        console.error("[LEASE_ADJUSTMENTS]", message);
        await saveSyncState(db, "LEASE_ADJUSTMENTS", "error", message, null);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
