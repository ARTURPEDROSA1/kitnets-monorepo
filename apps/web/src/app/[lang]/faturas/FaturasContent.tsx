"use client";

/**
 * Faturas — the hub (invoices, "Cobranças recorrentes", billing conditions) and one invoice's panel
 * (`?id=`). The list and the invoice are preloaded by the page on the server; refreshes and every
 * action go through the API (/api/faturas…).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FaturasHub, { sectionFromParam, type FaturasSection } from "@/components/faturas/FaturasHub";
import InvoiceDetail from "@/components/faturas/InvoiceDetail";
import { InvoiceCancelModal, InvoicePayModal } from "@/components/faturas/InvoiceActionModals";
import { todayBRT } from "@/lib/lease-dashboard";
import { DEFAULT_INVOICE_VIEW, invoiceRows, invoiceViewFromParam, recurringRows, type InvoiceViewKey } from "@/lib/invoice-hub";
import type { Collector } from "@/lib/invoice-collection";
import { monthLabel } from "@/lib/invoice-schedule";
import type { BillingSettingsView, GenerateResult, InvoiceDetailView, InvoiceListView, InvoiceView, RecurringLease } from "@/lib/invoice-views";
import { NO_CONNECTIONS, type ConnectionsView } from "@/lib/billing/connections";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SETTINGS: BillingSettingsView = { days_in_advance: null, fine_pct: null, interest_pct_month: null, days_payable_after_due: null, sender_name: null, reply_to_email: null, automation_enabled: false, automation_from_month: null };

interface Props {
    lang: string;
    initial?: InvoiceListView | null;
    initialDetail?: InvoiceDetailView | null;
}

type ActionTarget = Pick<InvoiceView, "id" | "number" | "amount" | "due_date">;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/** "3 faturas geradas para outubro de 2026. 1 contrato já tinha fatura no mês." */
function generateNotice(result: GenerateResult): string {
    const lines: string[] = [];
    if (result.created > 0) lines.push(`${plural(result.created, "fatura gerada", "faturas geradas")} para ${monthLabel(result.month)}.`);
    if (result.existing > 0) lines.push(`${plural(result.existing, "contrato já tinha", "contratos já tinham")} fatura no mês.`);
    if (result.created === 0 && result.existing === 0 && result.skipped.length === 0) lines.push(`Nenhum contrato com cobrança do proprietário em ${monthLabel(result.month)}.`);
    for (const s of result.skipped) lines.push(`${s.title}: sem fatura — ${s.reason}.`);
    return lines.join("\n");
}

export default function FaturasContent({ lang, initial = null, initialDetail = null }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawId = searchParams.get("id");
    const selectedId = rawId && UUID.test(rawId) ? rawId : null;
    const view = invoiceViewFromParam(searchParams.get("view"));
    const section = sectionFromParam(searchParams.get("aba"));
    const today = useMemo(() => todayBRT(), []);
    const base = lang === "pt" ? "/faturas" : `/${lang}/faturas`;
    const contratosBase = lang === "pt" ? "/contratos" : `/${lang}/contratos`;

    // ── List ──────────────────────────────────────────────────────
    const [invoices, setInvoices] = useState<InvoiceView[] | null>(initial?.invoices ?? null);
    const [recurring, setRecurring] = useState<RecurringLease[]>(initial?.recurring ?? []);
    const [settings, setSettings] = useState<BillingSettingsView>(initial?.settings ?? NO_SETTINGS);
    const [connections, setConnections] = useState<ConnectionsView>(initial?.connections ?? NO_CONNECTIONS);
    const [emailAvailable, setEmailAvailable] = useState<boolean>(initial?.emailAvailable ?? false);
    const [seeded] = useState(initial !== null);
    const [listError, setListError] = useState<string | null>(null);

    const apply = useCallback((list: InvoiceListView) => {
        setInvoices(list.invoices);
        setRecurring(list.recurring);
        setSettings(list.settings);
        setConnections(list.connections ?? NO_CONNECTIONS);
        setEmailAvailable(list.emailAvailable === true);
    }, []);

    const load = useCallback(async () => {
        const res = await fetch("/api/faturas");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Erro ao carregar as faturas");
        apply(json as InvoiceListView);
    }, [apply]);

    useEffect(() => {
        if (seeded) return;
        let alive = true;
        load().catch(err => { if (alive) { setListError(err instanceof Error ? err.message : "Erro ao carregar"); setInvoices([]); } });
        return () => { alive = false; };
    }, [load, seeded]);

    const rows = useMemo(() => invoiceRows(invoices ?? [], today), [invoices, today]);
    const recurringList = useMemo(() => recurringRows(recurring, invoices ?? [], today), [recurring, invoices, today]);

    // ── Navigation ────────────────────────────────────────────────
    const hrefFor = useCallback((next: { id?: string | null; view?: InvoiceViewKey; section?: FaturasSection }) => {
        const v = next.view ?? view;
        const s = next.section ?? section;
        const query = [next.id ? `id=${next.id}` : "", s === "faturas" ? "" : `aba=${s}`, v === DEFAULT_INVOICE_VIEW ? "" : `view=${v}`].filter(Boolean).join("&");
        return query ? `${base}?${query}` : base;
    }, [base, view, section]);
    const select = useCallback((id: string | null) => router.push(hrefFor({ id }), { scroll: true }), [router, hrefFor]);
    const setView = (next: InvoiceViewKey) => router.replace(hrefFor({ view: next, section: "faturas" }), { scroll: false });
    const setSection = (next: FaturasSection) => router.replace(hrefFor({ section: next }), { scroll: false });

    // ── Invoice panel and actions ─────────────────────────────────
    const [detail, setDetail] = useState<InvoiceDetailView | null>(initialDetail);
    const [notice, setNotice] = useState<string | null>(null);
    const [detailNotice, setDetailNotice] = useState<string | null>(null);
    const [payTarget, setPayTarget] = useState<ActionTarget | null>(null);
    const [cancelTarget, setCancelTarget] = useState<ActionTarget | null>(null);

    const afterAction = async (fresh: InvoiceDetailView, message: string | null) => {
        setPayTarget(null);
        setCancelTarget(null);
        setDetail(fresh);
        setDetailNotice(message);
        if (message) setNotice(message);
        await load().catch(() => {});
    };

    // ── Generate ──────────────────────────────────────────────────
    const [generating, setGenerating] = useState<string | null>(null);
    const generate = async (month: string) => {
        setGenerating(month);
        setListError(null);
        try {
            const res = await fetch("/api/faturas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.errors?.month || json.error || "Erro ao gerar as faturas");
            apply(json as InvoiceListView);
            setNotice(generateNotice(json.result as GenerateResult));
            if (section !== "faturas") setSection("faturas");
        } catch (err) {
            setListError(err instanceof Error ? err.message : "Erro ao gerar as faturas");
        } finally {
            setGenerating(null);
        }
    };

    // ── Who collects ──────────────────────────────────────────────
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const putCollection = async (key: string, body: Record<string, unknown>) => {
        setSavingKey(key);
        setListError(null);
        try {
            const res = await fetch("/api/faturas/cobrancas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || Object.values(json.errors ?? {})[0] as string || "Erro ao salvar");
            setRecurring(json.recurring as RecurringLease[]);
        } catch (err) {
            setListError(err instanceof Error ? err.message : "Erro ao salvar");
            await load().catch(() => {});
        } finally {
            setSavingKey(null);
        }
    };
    const onCollector = (leaseId: string, componentKey: string, collector: Collector | null) =>
        void putCollection(`${leaseId}:${componentKey}`, { lease_id: leaseId, component: componentKey, collected_by: collector });
    const onPause = (leaseId: string, paused: boolean) => void putCollection(`${leaseId}:pause`, { lease_id: leaseId, paused });

    const modals = (
        <>
            {payTarget && <InvoicePayModal invoice={payTarget} today={today} onClose={() => setPayTarget(null)} onDone={fresh => { void afterAction(fresh, `Pagamento da fatura nº ${fresh.invoice.number} registrado.`); }} />}
            {cancelTarget && <InvoiceCancelModal invoice={cancelTarget} today={today} onClose={() => setCancelTarget(null)} onDone={fresh => { void afterAction(fresh, `Fatura nº ${fresh.invoice.number} cancelada.`); }} />}
        </>
    );

    if (selectedId) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
                <InvoiceDetail
                    key={selectedId}
                    invoiceId={selectedId}
                    lang={lang}
                    today={today}
                    initial={detail}
                    notice={detail?.invoice.id === selectedId ? detailNotice : null}
                    onBack={() => { setDetailNotice(null); select(null); }}
                    bankUsable={Boolean(connections.inter?.usable)}
                    termsDecided={settings.fine_pct !== null && settings.interest_pct_month !== null && settings.days_payable_after_due !== null}
                    sandbox={connections.inter?.environment === "SANDBOX" && connections.sandboxAllowed}
                    emailAvailable={emailAvailable}
                    onPay={d => setPayTarget(d.invoice)}
                    onCancel={d => setCancelTarget(d.invoice)}
                    onChanged={(fresh, message) => { void afterAction(fresh, message); }}
                />
                {modals}
            </div>
        );
    }

    return (
        <>
            <FaturasHub
                rows={rows}
                recurring={recurringList}
                settings={settings}
                connections={connections}
                emailAvailable={emailAvailable}
                today={today}
                loading={invoices === null}
                error={listError}
                notice={notice}
                onDismissNotice={() => setNotice(null)}
                section={section}
                onSectionChange={setSection}
                view={view}
                onViewChange={setView}
                actions={{
                    onOpen: row => { setDetailNotice(null); select(row.invoice.id); },
                    onPay: row => setPayTarget(row.invoice),
                    onCancel: row => setCancelTarget(row.invoice),
                }}
                generating={generating}
                onGenerate={month => { void generate(month); }}
                savingKey={savingKey}
                onCollector={onCollector}
                onPause={onPause}
                onOpenLease={id => router.push(`${contratosBase}?id=${id}`)}
                onSettingsSaved={setSettings}
                onConnectionsChange={setConnections}
            />
            {modals}
        </>
    );
}
