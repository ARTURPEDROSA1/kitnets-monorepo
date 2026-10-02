import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { saveSyncState } from "@/lib/index-sync-server";
import { todayBRT } from "@/lib/lease-dashboard";
import { runBillingAutomation, summarize } from "@/lib/billing/automation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Work stops being started past this; the function's own limit is 300 s. */
const TIME_BUDGET_MS = 240_000;

/**
 * Daily run of Fatura, 08:00 in Brasília (vercel.json): for every owner with the automation on,
 * reconciles the boletos at the bank, generates the invoices falling due within the owner's advance,
 * issues them and e-mails the tenants (lib/billing/automation-server.ts). The outcome is kept in
 * `index_sync_state` under the job BILLING, like the index syncs.
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
    const db = createAdminClient();
    const started = Date.now();
    const today = todayBRT();
    try {
        const report = await runBillingAutomation(db, { today, deadline: started + TIME_BUDGET_MS });
        const errors = report.owners.flatMap(o => o.errors.map(e => `${o.owner_id.slice(0, 8)}: ${e}`));
        const message = summarize(report);
        await saveSyncState(db, "BILLING", errors.length > 0 ? "error" : report.owners.length === 0 ? "unchanged" : "ok", errors.length > 0 ? `${message} — ${errors.slice(0, 5).join(" | ")}` : message, today);
        if (errors.length > 0) console.error("[BILLING]", errors.join("\n"));
        return NextResponse.json({ ok: true, ms: Date.now() - started, ...report });
    } catch (err) {
        const message = (err as Error).message;
        console.error("[BILLING]", message);
        await saveSyncState(db, "BILLING", "error", message, null);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
