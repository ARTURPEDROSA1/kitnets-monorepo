/**
 * The daily run of Fatura (app/api/cron/faturas): for every owner who switched the automation on, it
 *
 *   1. reconciles — reads every boleto still waiting at the bank (a paid one settles its invoice, an
 *      expired one is recorded, a boleto that just got ready e-mails the tenant);
 *   2. generates — creates the invoices that fall due within the owner's `days_in_advance`, from the
 *      month the owner chose on;
 *   3. issues — sends every invoice that has no boleto yet, no blocker and a due date still ahead to the
 *      bank (the boleto's readiness then triggers the e-mail);
 *   4. reminds — queues the reminder a few days before the due date and the overdue notice a few
 *      days after it, each once per invoice, on the days the owner decided (none while undecided);
 *   5. sends — tries again the e-mails that did not go out.
 *
 * Every step is idempotent (the database refuses a second invoice for the same month, a second live
 * boleto, a second e-mail of the same kind), every item is its own try/catch, and the run stops at its
 * time budget: what is left is picked up tomorrow. The automation only runs on decisions the owner has
 * made — the table's CHECK sees to that, this module does not fill any in.
 *
 * A boleto that expired or whose issue failed is never retried here: that is the owner's call
 * ("Emitir de novo"), and it shows in Atenção.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError } from "@/lib/api-route";
import { generateInvoices } from "@/lib/invoices-server";
import { BILLING_SETTINGS_COLUMNS, toBillingSettingsView } from "@/lib/invoice-views-server";
import { shiftMonth } from "@/lib/invoice-schedule";
import { loadConnections } from "./connections-server";
import { InterError, type InterErrorCode } from "./inter-client";
import { issueInvoice, loadLatestCharges, loadLiveCharges, refreshCharge } from "./charges-server";
import { REMINDER_BEFORE, REMINDER_OVERDUE, loadDeliveriesByInvoice, loadDeliveriesToSend, queueDelivery, sendDelivery } from "./deliveries-server";
import { reminderDue } from "./reminder-schedule";
import { usableStripeAccount } from "./stripe-connection-server";
import { cardFeeDecided } from "@/lib/card-gross-up";

export interface OwnerRunReport {
    owner_id: string;
    /** why nothing was done for the owner */
    skipped?: string;
    reconciled: number;
    generated: number;
    issued: number;
    /** reminders and overdue notices queued today */
    reminded: number;
    sent: number;
    /** per-item failures, each one sentence */
    errors: string[];
    /** the time budget ran out before the owner's work was done */
    cut_short?: boolean;
}

export interface RunReport {
    today: string;
    owners: OwnerRunReport[];
    /** owners the run never reached (time budget) */
    unreached: number;
}

export interface RunOptions {
    /** `YYYY-MM-DD` in Brasília */
    today: string;
    /** epoch ms: stop starting new work past this */
    deadline: number;
    now?: () => number;
}

/** A bank that is down or refusing us stops the owner's issuing, not the run. */
const STOP_ISSUING: ReadonlySet<InterErrorCode> = new Set<InterErrorCode>(["TLS", "UNAUTHORIZED", "SCOPE", "RATE_LIMIT", "UNAVAILABLE", "TIMEOUT", "NETWORK"]);

const reason = (err: unknown): string => err instanceof HttpError ? String((err.body as { error?: unknown }).error ?? (err.body as { errors?: Record<string, string> }).errors?._form ?? err.message) : err instanceof Error ? err.message : String(err);

/** "2026-10-15" + 10 → "2026-10-25" */
export function plusDays(iso: string, days: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** The months whose invoices may fall due within `[from, to]`. */
export function monthsBetween(from: string, to: string): string[] {
    const out: string[] = [];
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = shiftMonth(m, 1)) out.push(m);
    return out;
}

export async function runOwner(supabase: AdminSupabase, profileId: string, settings: ReturnType<typeof toBillingSettingsView>, opts: RunOptions): Promise<OwnerRunReport> {
    const now = opts.now ?? Date.now;
    const report: OwnerRunReport = { owner_id: profileId, reconciled: 0, generated: 0, issued: 0, reminded: 0, sent: 0, errors: [] };
    const outOfTime = () => { if (now() > opts.deadline) { report.cut_short = true; return true; } return false; };
    if (!settings.automation_enabled) return { ...report, skipped: "automação desligada" };
    if (settings.days_in_advance === null || settings.automation_from_month === null) return { ...report, skipped: "decisões pendentes" };

    // 1. reconcile
    for (const charge of await loadLiveCharges(supabase, profileId)) {
        if (outOfTime()) return report;
        try {
            await refreshCharge(supabase, profileId, charge, { actor: "SYSTEM" });
            report.reconciled += 1;
        } catch (err) {
            report.errors.push(`conciliar boleto ${charge.seu_numero ?? charge.id}: ${reason(err)}`);
            if (err instanceof InterError && STOP_ISSUING.has(err.code)) break;
        }
    }
    if (outOfTime()) return report;

    // 2. generate: what falls due from today to `days_in_advance` ahead, never before the chosen month
    const dueFrom = opts.today;
    const dueTo = plusDays(opts.today, settings.days_in_advance);
    for (const month of monthsBetween(dueFrom, dueTo)) {
        if (month < settings.automation_from_month) continue;
        try {
            const result = await generateInvoices(supabase, profileId, month, { origin: "AUTO", dueFrom, dueTo });
            report.generated += result.created;
        } catch (err) {
            report.errors.push(`gerar faturas de ${month}: ${reason(err)}`);
        }
    }
    if (outOfTime()) return report;

    // 3. issue: open invoices without any boleto yet, nothing missing, due date still ahead
    const connections = await loadConnections(supabase, profileId).catch(err => { report.errors.push(`conexão com o banco: ${reason(err)}`); return null; });
    if (connections?.inter?.usable) {
        const { data, error } = await supabase.from("invoices").select("id, number, blockers, due_date")
            .eq("owner_id", profileId).in("status", ["DRAFT", "ISSUED"]).gte("due_date", opts.today).order("due_date", { ascending: true }).limit(200);
        if (error) report.errors.push(`ler faturas a emitir: ${error.message}`);
        const charges = await loadLatestCharges(supabase, profileId);
        for (const row of (data ?? []) as Array<{ id: string; number: number; blockers: string[] | null; due_date: string }>) {
            if (outOfTime()) return report;
            if ((row.blockers ?? []).length > 0 || charges.has(row.id)) continue;
            try {
                await issueInvoice(supabase, profileId, row.id, opts.today);
                report.issued += 1;
            } catch (err) {
                report.errors.push(`emitir fatura nº ${row.number}: ${reason(err)}`);
                if (err instanceof InterError && STOP_ISSUING.has(err.code)) break;
                if (err instanceof HttpError && err.status === 502) break;
            }
        }
    } else if (connections) {
        report.errors.push(connections.inter ? "a conexão com o Banco Inter não está utilizável: nada emitido" : "sem conexão com o Banco Inter: nada emitido");
    }
    if (outOfTime()) return report;

    // 4. reminders: on the days the owner decided, once per invoice, only when there is a way to pay
    if (settings.reminder_days_before != null || settings.overdue_notice_days != null) {
        try {
            const cardAvailable = cardFeeDecided(settings.card_fee_pct, settings.card_fee_fixed) && (await usableStripeAccount(supabase, profileId)) !== null;
            const [{ data: openInvoices, error: openError }, charges, deliveries] = await Promise.all([
                supabase.from("invoices").select("id, number, status, due_date, days_payable_after_due").eq("owner_id", profileId).in("status", ["DRAFT", "ISSUED"]).limit(500),
                loadLatestCharges(supabase, profileId),
                loadDeliveriesByInvoice(supabase, profileId),
            ]);
            if (openError) throw new Error(`invoices: ${openError.message}`);
            for (const row of (openInvoices ?? []) as Array<{ id: string; number: number; status: string; due_date: string; days_payable_after_due: number | null }>) {
                if (outOfTime()) return report;
                const boleto = charges.get(row.id);
                const kind = reminderDue({
                    status: row.status, due_date: String(row.due_date).slice(0, 10), days_payable_after_due: row.days_payable_after_due == null ? null : Number(row.days_payable_after_due),
                    payable: boleto?.status === "OPEN" || cardAvailable,
                    remindersSent: (deliveries.get(row.id) ?? []).filter(d => d.kind === "REMINDER").map(d => d.sequence),
                }, { reminder_days_before: settings.reminder_days_before ?? null, overdue_notice_days: settings.overdue_notice_days ?? null }, opts.today);
                if (!kind) continue;
                try {
                    await queueDelivery(supabase, profileId, row.id, "REMINDER", { sequence: kind === "BEFORE" ? REMINDER_BEFORE : REMINDER_OVERDUE });
                    report.reminded += 1;
                } catch (err) {
                    report.errors.push(`lembrete da fatura nº ${row.number}: ${reason(err)}`);
                }
            }
        } catch (err) {
            report.errors.push(`lembretes: ${reason(err)}`);
        }
    }
    if (outOfTime()) return report;

    // 5. send what did not go out (the reminders just queued included)
    for (const delivery of await loadDeliveriesToSend(supabase, profileId, now())) {
        if (outOfTime()) return report;
        try {
            const sent = await sendDelivery(supabase, profileId, delivery.id);
            if (sent?.status === "SENT") report.sent += 1;
            else if (sent) report.errors.push(`e-mail da fatura ${delivery.invoice_id.slice(0, 8)}: ${sent.last_error ?? "não enviado"}`);
        } catch (err) {
            report.errors.push(`e-mail da fatura ${delivery.invoice_id.slice(0, 8)}: ${reason(err)}`);
        }
    }
    return report;
}

/** Every owner with the automation on, one after the other, until the time budget is spent. */
export async function runBillingAutomation(supabase: AdminSupabase, opts: RunOptions): Promise<RunReport> {
    const now = opts.now ?? Date.now;
    const { data, error } = await supabase.from("billing_settings").select(`owner_id, ${BILLING_SETTINGS_COLUMNS}`).eq("automation_enabled", true).order("owner_id", { ascending: true });
    if (error) throw new Error(`billing_settings: ${error.message}`);
    const rows = (data ?? []) as Array<Record<string, unknown> & { owner_id: string }>;
    const report: RunReport = { today: opts.today, owners: [], unreached: 0 };
    for (const row of rows) {
        if (now() > opts.deadline) { report.unreached += 1; continue; }
        try {
            report.owners.push(await runOwner(supabase, row.owner_id, toBillingSettingsView(row), opts));
        } catch (err) {
            report.owners.push({ owner_id: row.owner_id, reconciled: 0, generated: 0, issued: 0, reminded: 0, sent: 0, errors: [`a execução parou: ${reason(err)}`] });
        }
    }
    return report;
}

/** One line for the sync state: "2 proprietário(s): 3 conciliados, 1 gerada, 1 emitida, 1 enviado; 0 erro(s)". */
export function summarize(report: RunReport): string {
    const sum = (k: "reconciled" | "generated" | "issued" | "reminded" | "sent") => report.owners.reduce((a, o) => a + o[k], 0);
    const errors = report.owners.reduce((a, o) => a + o.errors.length, 0);
    const parts = [`${report.owners.length} proprietário(s)`, `${sum("reconciled")} boleto(s) conciliado(s)`, `${sum("generated")} fatura(s) gerada(s)`, `${sum("issued")} emitida(s)`, `${sum("reminded")} lembrete(s)`, `${sum("sent")} e-mail(s) enviado(s)`, `${errors} erro(s)`];
    if (report.unreached > 0 || report.owners.some(o => o.cut_short)) parts.push("tempo esgotado: o resto fica para amanhã");
    return parts.join("; ");
}
