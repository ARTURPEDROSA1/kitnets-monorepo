"use client";

/**
 * The Fatura hub: what the owner charges tenants directly — rent, condominium and the charges that do
 * not go through an agency — at a glance (what falls due this month, what came in, what is late, what
 * is charged every month), then what deserves a look, then three sections: the invoices as a
 * spreadsheet, who collects what on each lease ("Cobranças recorrentes") and the billing conditions.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Clock, FilePlus2, Info, Loader2, Receipt, Repeat, Search, Settings2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Money } from "@/components/privacy";
import { normalizeText } from "@/lib/lease-extract";
import { INVOICE_VIEWS, brl, inInvoiceView, invoiceAttention, invoiceHubTotals, type InvoiceAttentionItem, type InvoiceRow, type InvoiceViewKey, type RecurringRow } from "@/lib/invoice-hub";
import type { Collector } from "@/lib/invoice-collection";
import { monthLabel, shiftMonth } from "@/lib/invoice-schedule";
import type { BillingSettingsView } from "@/lib/invoice-views";
import InvoiceTable, { type InvoiceTableActions } from "./InvoiceTable";
import RecurringChargesTable from "./RecurringChargesTable";
import BillingSettingsPanel from "./BillingSettingsPanel";

export type FaturasSection = "faturas" | "cobrancas" | "config";
export const FATURAS_SECTIONS: Array<{ key: FaturasSection; label: string; icon: React.ReactNode }> = [
    { key: "faturas", label: "Faturas", icon: <Receipt className="h-3.5 w-3.5" /> },
    { key: "cobrancas", label: "Cobranças recorrentes", icon: <Repeat className="h-3.5 w-3.5" /> },
    { key: "config", label: "Configuração", icon: <Settings2 className="h-3.5 w-3.5" /> },
];
export const sectionFromParam = (v: string | null): FaturasSection => (FATURAS_SECTIONS.some(s => s.key === v) ? (v as FaturasSection) : "faturas");

interface Props {
    rows: InvoiceRow[];
    recurring: RecurringRow[];
    settings: BillingSettingsView;
    today: string;
    loading: boolean;
    error: string | null;
    notice: string | null;
    onDismissNotice: () => void;
    section: FaturasSection;
    onSectionChange: (section: FaturasSection) => void;
    view: InvoiceViewKey;
    onViewChange: (view: InvoiceViewKey) => void;
    actions: InvoiceTableActions;
    /** `YYYY-MM` being generated, or null */
    generating: string | null;
    onGenerate: (month: string) => void;
    savingKey: string | null;
    onCollector: (leaseId: string, componentKey: string, collector: Collector | null) => void;
    onPause: (leaseId: string, paused: boolean) => void;
    onOpenLease: (leaseId: string) => void;
    onSettingsSaved: (settings: BillingSettingsView) => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

function Item({ icon, label, value, hint, tone, valueTone, onClick, title, money }: { icon: React.ReactNode; label: string; value: string; hint: React.ReactNode; tone: string; valueTone?: string; onClick?: () => void; title?: string; /** the figure is an amount in R$: value and hint get the class the dollar toggle blurs (components/privacy) */ money?: boolean }) {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            title={title}
            className={cn("flex min-w-0 flex-col gap-0.5 rounded-xl border border-border/80 bg-card px-4 py-3 text-left", onClick && "cursor-pointer transition-colors hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500")}
        >
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={tone}>{icon}</span>{label}
            </span>
            <span className={cn("block break-words text-xl font-bold leading-tight", valueTone ?? "text-foreground", money && "privacy-money")}>{value}</span>
            <span className={cn("block break-words text-xs leading-snug text-muted-foreground", money && "privacy-money")}>{hint}</span>
        </Tag>
    );
}

const DOT: Record<string, string> = { rose: "bg-rose-500", amber: "bg-amber-500", slate: "bg-slate-400" };

export default function FaturasHub(props: Props) {
    const { rows, recurring, settings, today, loading, error, notice, onDismissNotice, section, onSectionChange, view, onViewChange, actions, generating, onGenerate } = props;
    const [search, setSearch] = useState("");
    const [allAttention, setAllAttention] = useState(false);
    const thisMonth = today.slice(0, 7);
    const [month, setMonth] = useState(thisMonth);

    const totals = useMemo(() => invoiceHubTotals(rows, recurring, today), [rows, recurring, today]);
    const attention = useMemo(() => invoiceAttention(rows, recurring, settings, today), [rows, recurring, settings, today]);
    const counts = useMemo(() => Object.fromEntries(INVOICE_VIEWS.map(v => [v.key, rows.filter(r => inInvoiceView(r, v.key)).length])) as Record<InvoiceViewKey, number>, [rows]);
    const visible = useMemo(() => {
        const q = normalizeText(search);
        return rows.filter(r => inInvoiceView(r, view) && (!q || r.haystack.includes(q)));
    }, [rows, view, search]);

    const shownAttention = allAttention ? attention : attention.slice(0, 4);
    const viewMeta = INVOICE_VIEWS.find(v => v.key === view)!;
    const months = [-1, 0, 1, 2].map(by => shiftMonth(thisMonth, by));
    const nothingRecurring = totals.recurring.leases === 0;

    const openAttention = (item: InvoiceAttentionItem) => {
        if (item.target.type === "invoice") {
            const row = rows.find(r => r.invoice.id === (item.target as { id: string }).id);
            if (row) actions.onOpen(row);
        } else onSectionChange(item.target.type === "recurring" ? "cobrancas" : "config");
    };

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Receipt className="h-6 w-6 text-emerald-600" /> Faturas
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        O que você cobra direto do inquilino: aluguel, condomínio e encargos que não passam pela imobiliária.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select className="flex h-10 rounded-md border bg-background px-3 text-sm" value={month} onChange={e => setMonth(e.target.value)} aria-label="Mês das faturas a gerar">
                        {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </select>
                    <Button onClick={() => onGenerate(month)} disabled={generating !== null || nothingRecurring} title={nothingRecurring ? "Nenhum contrato tem cobrança do proprietário: defina quem cobra em Cobranças recorrentes" : "Cria a fatura do mês de cada contrato com cobrança do proprietário; quem já tem fatura no mês fica como está"}>
                        {generating !== null ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-1 h-4 w-4" />} Gerar faturas
                    </Button>
                </div>
            </div>

            {notice && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <span className="flex-1 whitespace-pre-line">{notice}</span>
                    <button type="button" onClick={onDismissNotice} className="rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40" aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Item
                    icon={<CalendarClock className="h-3.5 w-3.5" />} tone="text-emerald-600" label="A receber no mês"
                    value={totals.dueThisMonth.count > 0 ? brl(totals.dueThisMonth.amount) : "—"}
                    hint={totals.dueThisMonth.count > 0 ? plural(totals.dueThisMonth.count, "fatura em aberto", "faturas em aberto") : `nenhuma fatura em aberto em ${monthLabel(thisMonth)}`}
                    title="Faturas em aberto com vencimento neste mês"
                    onClick={() => { onSectionChange("faturas"); onViewChange("abertas"); }}
                    money
                />
                <Item
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Recebido no mês"
                    value={totals.receivedThisMonth.count > 0 ? brl(totals.receivedThisMonth.amount) : "—"}
                    hint={totals.receivedThisMonth.count > 0 ? plural(totals.receivedThisMonth.count, "fatura paga", "faturas pagas") : "nenhum pagamento neste mês"}
                    title="Pagamentos com data neste mês"
                    onClick={() => { onSectionChange("faturas"); onViewChange("pagas"); }}
                    money
                />
                <Item
                    icon={<Clock className="h-3.5 w-3.5" />} tone={totals.overdue.count > 0 ? "text-rose-600" : "text-emerald-600"} label="Em atraso"
                    value={totals.overdue.count > 0 ? brl(totals.overdue.amount) : "—"}
                    hint={totals.overdue.count > 0 ? plural(totals.overdue.count, "fatura vencida", "faturas vencidas") : "nenhuma fatura vencida"}
                    valueTone={totals.overdue.count > 0 ? "text-rose-600" : undefined}
                    onClick={() => { onSectionChange("faturas"); onViewChange("atraso"); }}
                    money
                />
                <Item
                    icon={<Repeat className="h-3.5 w-3.5" />} tone="text-violet-600" label="Cobrança recorrente"
                    value={totals.recurring.leases > 0 ? `${brl(totals.recurring.monthly)}/mês` : "—"}
                    hint={totals.recurring.leases > 0 ? plural(totals.recurring.leases, "contrato com cobrança sua", "contratos com cobrança sua") : "nenhum contrato com cobrança do proprietário"}
                    title="O que os contratos em vigor cobram todo mês pelo proprietário (aluguel e encargos marcados como seus)"
                    onClick={() => onSectionChange("cobrancas")}
                    money
                />
                <Item
                    icon={<FilePlus2 className="h-3.5 w-3.5" />} tone={totals.toGenerate > 0 ? "text-amber-600" : "text-blue-600"} label="A gerar neste mês"
                    value={String(totals.toGenerate)}
                    hint={totals.toGenerate > 0 ? `${totals.toGenerate === 1 ? "contrato" : "contratos"} sem fatura em ${monthLabel(thisMonth)}` : totals.recurring.leases > 0 ? "todos os contratos já têm a fatura do mês" : "sem cobranças recorrentes"}
                    valueTone={totals.toGenerate > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
                />
                <Item
                    icon={<AlertCircle className="h-3.5 w-3.5" />} tone={totals.blocked > 0 ? "text-amber-600" : "text-blue-600"} label="Dados pendentes"
                    value={String(totals.blocked)}
                    hint={totals.blocked > 0 ? `${plural(totals.blocked, "fatura", "faturas")} com dado do pagador faltando para emitir` : "nenhuma fatura com dado faltando"}
                    valueTone={totals.blocked > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
                    title="Faturas em aberto sem e-mail, CPF válido ou endereço do pagador"
                />
            </div>

            {attention.length > 0 && (
                <section className="rounded-xl border border-border/80 bg-card">
                    <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <AlertCircle className="h-4 w-4 text-amber-600" /> Atenção
                            <span className="text-xs font-normal text-muted-foreground">({attention.length})</span>
                        </h2>
                        {attention.length > 4 && (
                            <button type="button" onClick={() => setAllAttention(v => !v)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                {allAttention ? <>menos <ChevronUp className="h-3.5 w-3.5" /></> : <>ver todos <ChevronDown className="h-3.5 w-3.5" /></>}
                            </button>
                        )}
                    </header>
                    <ul className="divide-y divide-border/50">
                        {shownAttention.map((item, i) => (
                            <li key={`${item.kind}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                                <span className="min-w-0 flex-1">
                                    <button type="button" onClick={() => openAttention(item)} className="text-left font-semibold text-foreground underline-offset-2 hover:underline">{item.subject}</button>
                                    <span className="text-muted-foreground"> — {item.money ? <Money>{item.text}</Money> : item.text}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {error && (
                <p className="flex items-start gap-2 text-sm text-rose-600">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-1 border-b border-border/70" role="tablist" aria-label="Seções de Faturas">
                {FATURAS_SECTIONS.map(s => (
                    <button
                        key={s.key}
                        type="button"
                        role="tab"
                        aria-selected={section === s.key}
                        onClick={() => onSectionChange(s.key)}
                        className={cn(
                            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                            section === s.key ? "border-emerald-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {s.icon} {s.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            ) : section === "cobrancas" ? (
                <RecurringChargesTable rows={recurring} savingKey={props.savingKey} onCollector={props.onCollector} onPause={props.onPause} onOpenLease={props.onOpenLease} />
            ) : section === "config" ? (
                <BillingSettingsPanel settings={settings} onSaved={props.onSettingsSaved} />
            ) : rows.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <Receipt className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhuma fatura ainda</h2>
                    <p className="mx-auto max-w-lg text-sm text-muted-foreground">
                        {nothingRecurring
                            ? "Nenhum contrato em vigor tem cobrança do proprietário. Em Cobranças recorrentes — ou no contrato, em Encargos adicionais — diga o que você cobra direto do inquilino: o aluguel de uma gestão própria, o condomínio que a imobiliária não recolhe."
                            : `${plural(totals.recurring.leases, "contrato tem", "contratos têm")} cobrança sua. Gere as faturas do mês para começar.`}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {nothingRecurring
                            ? <Button variant="outline" onClick={() => onSectionChange("cobrancas")}><Repeat className="mr-1 h-4 w-4" /> Definir quem cobra</Button>
                            : <Button onClick={() => onGenerate(month)} disabled={generating !== null}><FilePlus2 className="mr-1 h-4 w-4" /> Gerar faturas de {monthLabel(month)}</Button>}
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais faturas mostrar">
                            {INVOICE_VIEWS.map(v => (
                                <button
                                    key={v.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={view === v.key}
                                    onClick={() => onViewChange(v.key)}
                                    className={cn(
                                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                        view === v.key
                                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                            : "border-border bg-background text-muted-foreground hover:border-emerald-300 hover:text-foreground"
                                    )}
                                >
                                    {v.label} ({counts[v.key]})
                                </button>
                            ))}
                        </div>
                        <div className="relative sm:w-80">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input className="h-9 pl-9" placeholder="Buscar por número, imóvel, inquilino…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>
                    {visible.length === 0 ? (
                        <div className="space-y-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                            <p className="text-sm text-muted-foreground">{search ? "Nenhuma fatura com essa busca." : viewMeta.empty}</p>
                            {view !== "todas" && (
                                <button type="button" onClick={() => onViewChange("todas")} className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                                    Ver todas as {counts.todas} faturas
                                </button>
                            )}
                        </div>
                    ) : (
                        <InvoiceTable rows={visible} actions={actions} />
                    )}
                </div>
            )}

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                Nesta etapa as faturas são geradas e baixadas aqui. A emissão do boleto e do PIX pelo Banco Inter, o link de cartão e o envio automático por e-mail ao inquilino entram nas próximas etapas do módulo. O pagamento registrado aqui ainda não é lançado nas Receitas do imóvel: continue lançando lá por enquanto.
            </p>
        </div>
    );
}
