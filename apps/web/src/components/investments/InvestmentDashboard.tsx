"use client";

/**
 * The dashboard of one Novo Investimento: KPIs on top, the payment ledger below, the cash-flow
 * simulator under it and the files at the bottom.
 *
 * When the cycle ends — keys in hand, unit paid off or already rented — "Mover para Imóveis"
 * turns it into a property, and from there the normal income ledger and investment analysis take
 * over. The investment stays here as the record of what the unit cost to buy.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    ArrowRightLeft,
    Banknote,
    CalendarClock,
    CheckCircle2,
    Handshake,
    KeyRound,
    Loader2,
    Pencil,
    PiggyBank,
    Receipt,
    Settings,
    TrendingUp,
    Wallet,
} from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/DateInput";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Tile from "@/components/properties/Tile";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import InvestmentPaymentsTable, { type PaymentDraft } from "./InvestmentPaymentsTable";
import InvestmentCashFlowSimulator from "./InvestmentCashFlowSimulator";
import InvestmentDocuments, { type DocumentWithUrl } from "./InvestmentDocuments";
import type { ProjectDashboardView } from "@/lib/new-investment-views";
import InvestmentPlanModal from "./InvestmentPlanModal";
import InvestmentDetailsModal from "./InvestmentDetailsModal";
import InvestmentSellModal from "./InvestmentSellModal";
import { formatDateBR } from "@/lib/dates";
import {
    COMPLETION_LABELS,
    EXIT_PLAN_LABELS,
    INDEX_LABELS,
    INVESTMENT_KIND_LABELS,
    STRATEGY_LABELS,
    formatBRL,
    investmentTitle,
    type InvestmentPayment,
    type InvestmentSchedule,
    type NewInvestment,
} from "@/lib/new-investments";
import type { InvestmentBenchmarks, InvestmentMetrics } from "@/lib/new-investment-metrics";

type Bundle = ProjectDashboardView;

const NO_BENCHMARKS: InvestmentBenchmarks = { cdi12mPct: null, cdiAsOf: null, fipezapSale12mPct: null, fipezapAsOf: null };
const pct1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });


interface Props {
    investmentId: string;
    lang: string;
    onBack: () => void;
    onChanged: () => void;
    /** The dashboard the page preloaded on the server, so the first paint has it; refreshes go through the API. */
    initialBundle?: ProjectDashboardView | null;
}

export default function InvestmentDashboard({ investmentId, lang, onBack, onChanged, initialBundle = null }: Props) {
    const preloaded = initialBundle && initialBundle.investment.id === investmentId ? initialBundle : null;
    const [bundle, setBundle] = useState<Bundle | null>(preloaded);
    /** Seeded from the server: no first fetch. Read once — a later prop change must not reset what the user did. */
    const [seeded] = useState(preloaded !== null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [promoteOpen, setPromoteOpen] = useState(false);
    const [promoteName, setPromoteName] = useState("");
    const [promoteDate, setPromoteDate] = useState(new Date().toISOString().slice(0, 10));
    const [promoting, setPromoting] = useState(false);
    const [planOpen, setPlanOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [sellOpen, setSellOpen] = useState(false);
    /** The contract, a floor plan or a receipt, opened inside the app like every other document. */
    const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null);

    // One request: the dashboard route carries the documents with their signed URLs.
    const load = useCallback(async () => {
        const res = await fetch(`/api/investments/${investmentId}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erro ao carregar o projeto");
        setBundle({ ...data, documents: data.documents ?? [] });
    }, [investmentId]);

    useEffect(() => {
        if (seeded) return;
        let alive = true;
        load().catch(err => { if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar"); });
        return () => { alive = false; };
    }, [load, seeded]);

    /** Each payment's receipts, newest first — a split has one per pocket. */
    const receiptsByPayment = useMemo(() => {
        const map: Record<string, DocumentWithUrl[]> = {};
        for (const doc of bundle?.documents ?? []) {
            if (!doc.payment_id) continue;
            (map[doc.payment_id] ??= []).push(doc);
        }
        return map;
    }, [bundle?.documents]);

    const refresh = useCallback(async () => {
        await load();
        onChanged();
    }, [load, onChanged]);

    const createPayment = async (draft: PaymentDraft): Promise<boolean> => {
        setBusy(true);
        const res = await fetch(`/api/investments/${investmentId}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // the first receipt's name labels the row; the rest keep their own on the documents
            body: JSON.stringify({ ...draft, receipt_name: draft.receipt_names[0] ?? null }),
        });
        setBusy(false);
        if (!res.ok) return false;
        await refresh();
        return true;
    };

    const patchPayment = async (id: string, patch: Record<string, unknown>): Promise<boolean> => {
        const res = await fetch(`/api/investments/${investmentId}/payments/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        if (!res.ok) return false;
        await refresh();
        return true;
    };

    const deletePayment = async (id: string): Promise<boolean> => {
        const res = await fetch(`/api/investments/${investmentId}/payments/${id}`, { method: "DELETE" });
        if (!res.ok) return false;
        await refresh();
        return true;
    };

    const patchInvestment = async (patch: Record<string, unknown>): Promise<boolean> => {
        const res = await fetch(`/api/investments/${investmentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        if (!res.ok) return false;
        await refresh();
        return true;
    };

    /** "Registrar venda": the row is marked SOLD with the sale on it; a problem comes back as the message to show. */
    const sell = async (input: { sold_on: string; sale_price: string; sale_costs_pct: string }): Promise<string | null> => {
        const res = await fetch(`/api/investments/${investmentId}/sell`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const first = Object.values(json.errors ?? {})[0];
            return typeof json.error === "string" ? json.error : typeof first === "string" ? first : "Não foi possível registrar a venda.";
        }
        await refresh();
        return null;
    };
    const undoSale = () => patchInvestment({ status: "ACTIVE", sold_on: null, sale_price: null, sale_costs_pct: 0 });

    const promote = async () => {
        setPromoting(true);
        const res = await fetch(`/api/investments/${investmentId}/promote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: promoteName || undefined, keys_delivered_on: promoteDate || null }),
        });
        setPromoting(false);
        if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            setError(typeof json.error === "string" ? json.error : json.errors?.name ?? "Não foi possível mover para Imóveis.");
            return;
        }
        setPromoteOpen(false);
        await refresh();
    };

    if (error && !bundle) {
        return (
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
                <p className="text-sm text-rose-600">{error}</p>
            </div>
        );
    }

    if (!bundle) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando projeto…
            </div>
        );
    }

    const { investment, metrics, schedules, payments, documents } = bundle;
    const benchmarks = bundle.benchmarks ?? NO_BENCHMARKS;
    const title = investmentTitle(investment);
    const promoted = Boolean(investment.promoted_property_id);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Projetos
                    </Button>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
                        <button
                            type="button"
                            onClick={() => setDetailsOpen(true)}
                            title="Editar nome, unidade, tipo e endereço"
                            aria-label="Editar dados do projeto"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {[
                            INVESTMENT_KIND_LABELS[investment.kind],
                            STRATEGY_LABELS[investment.strategy],
                            `para ${(EXIT_PLAN_LABELS[investment.exit_plan] ?? "alugar").toLowerCase()}`,
                            investment.developer,
                            investment.address,
                            investment.city,
                        ].filter(Boolean).join(" · ")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setPlanOpen(true)} title="Plano de pagamento do contrato">
                        <Settings className="w-4 h-4 sm:mr-1" />
                        <span className="hidden sm:inline">Plano de pagamento</span>
                    </Button>
                {metrics.sold ? (
                    <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        <Handshake className="w-4 h-4" /> Vendido em {formatDateBR(investment.sold_on)}
                    </span>
                ) : promoted ? (
                    <Link
                        href={lang === "pt" ? "/imoveis" : `/${lang}/imoveis`}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"
                    >
                        <CheckCircle2 className="w-4 h-4" /> Já está em Imóveis
                    </Link>
                ) : investment.exit_plan === "VENDER" ? (
                    // The finish the project was planned for is the primary button; the other stays one click away.
                    <>
                        <Button variant="outline" onClick={() => { setPromoteName(investment.unit_label || investment.name); setPromoteOpen(true); }} title="Ficar com a unidade e alugar, em vez de vender">
                            <ArrowRightLeft className="w-4 h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Mover para Imóveis</span>
                        </Button>
                        <Button onClick={() => setSellOpen(true)}>
                            <Handshake className="w-4 h-4 mr-1" /> Registrar venda
                        </Button>
                    </>
                ) : (
                    <>
                        <Button variant="outline" onClick={() => setSellOpen(true)} title="Vender a unidade, antes ou depois das chaves">
                            <Handshake className="w-4 h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Registrar venda</span>
                        </Button>
                        <Button onClick={() => { setPromoteName(investment.unit_label || investment.name); setPromoteOpen(true); }}>
                            <ArrowRightLeft className="w-4 h-4 mr-1" /> Mover para Imóveis
                        </Button>
                    </>
                )}
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <Tile
                    label="Pago até agora"
                    tone="emerald"
                    icon={<Wallet className="w-4 h-4" />}
                    value={formatBRL(metrics.paidToDate, 0)}
                    hint={
                        <span className="block space-y-0.5 pt-0.5">
                            <span className="flex items-baseline justify-between gap-2">
                                <span>PF</span>
                                <span className="tabular-nums whitespace-nowrap">{formatBRL(metrics.paidByPayer.pf, 0)}</span>
                            </span>
                            <span className="flex items-baseline justify-between gap-2">
                                <span>PJ</span>
                                <span className="tabular-nums whitespace-nowrap">{formatBRL(metrics.paidByPayer.pj, 0)}</span>
                            </span>
                            {metrics.paidByPayer.unassigned > 0 && (
                                <span className="flex items-baseline justify-between gap-2" title="Lançamentos sem pagador informado">
                                    <span>Sem pagador</span>
                                    <span className="tabular-nums whitespace-nowrap">{formatBRL(metrics.paidByPayer.unassigned, 0)}</span>
                                </span>
                            )}
                            <span className="block pt-0.5">
                                {metrics.paidCount} lançamento{metrics.paidCount === 1 ? "" : "s"} · {metrics.paidPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total
                            </span>
                        </span>
                    }
                    info={{
                        what: "Tudo que já saiu do bolso por esta unidade: sinal, entrada, parcelas, correções, taxas — e de qual bolso saiu, pela coluna Pagador de cada lançamento.",
                        formula: <>Σ (valor + correção) dos lançamentos pagos<br />PF = Σ parte PF · PJ = Σ parte PJ · sem pagador = lançamentos sem essa informação</>,
                        example: `PF ${formatBRL(metrics.paidByPayer.pf)} + PJ ${formatBRL(metrics.paidByPayer.pj)}${metrics.paidByPayer.unassigned > 0 ? ` + sem pagador ${formatBRL(metrics.paidByPayer.unassigned)}` : ""} = ${formatBRL(metrics.paidToDate)}`,
                    }}
                />
                <Tile
                    label="Falta pagar"
                    tone="amber"
                    icon={<CalendarClock className="w-4 h-4" />}
                    value={formatBRL(metrics.remaining, 0)}
                    hint={
                        metrics.remainingByKind.length > 0 ? (
                            <span className="block space-y-0.5 pt-0.5">
                                {metrics.remainingByKind.map(k => (
                                    <span key={k.kind} className="flex items-baseline justify-between gap-2">
                                        <span className="truncate" title={`${k.count} ${k.count === 1 ? "parcela" : "parcelas"} de ${k.label}`}>{k.short}</span>
                                        <span className="tabular-nums whitespace-nowrap">{k.count} · {formatBRL(k.total, 0)}</span>
                                    </span>
                                ))}
                            </span>
                        ) : (
                            metrics.sold ? "Vendido: as parcelas em aberto passaram ao comprador" : "Nada em aberto no contrato"
                        )
                    }
                    info={{
                        what: "As parcelas do quadro resumo que ainda não foram pagas, cada uma projetada pelo último valor pago do seu tipo. A quebra por tipo mostra quanto cada bloco do contrato ainda custa — é por ela que se decide o que vale antecipar.",
                        formula: <>Parcela em aberto = maior valor já pago do tipo (nunca menos que o contrato)<br />Falta pagar = Σ parcelas em aberto</>,
                        example: metrics.remainingByKind.length > 0
                            ? metrics.remainingByKind.map(k => `${k.label}: ${k.count} em aberto = ${formatBRL(k.total)}`).join(" · ")
                            : undefined,
                        note: "É assim que a construtora cobra: a parcela carrega a correção acumulada e não cai, mesmo num mês de índice negativo. Por isso este número muda a cada pagamento lançado.",
                    }}
                />
                <Tile
                    label="Custo total"
                    tone="blue"
                    icon={<Banknote className="w-4 h-4" />}
                    value={formatBRL(metrics.committed, 0)}
                    hint={metrics.contractPrice > 0 ? `Contrato: ${formatBRL(metrics.contractPrice, 0)}` : "Informe o preço do contrato"}
                    info={{
                        what: "O que a unidade terá custado: o já pago mais o que ainda falta. É a base de todos os percentuais desta página.",
                        formula: "pago + a pagar",
                        example: `${formatBRL(metrics.paidToDate)} + ${formatBRL(metrics.remaining)} = ${formatBRL(metrics.committed)}`,
                        note: "Difere do preço do contrato pela correção: a já paga, e a projetada nas parcelas em aberto a partir do último pagamento de cada tipo.",
                    }}
                />
                <Tile
                    label="Próxima parcela"
                    tone={metrics.overdueCount > 0 ? "rose" : "violet"}
                    icon={<Receipt className="w-4 h-4" />}
                    value={metrics.nextDueOn ? formatBRL(metrics.nextDueAmount, 0) : "—"}
                    hint={
                        metrics.overdueCount > 0
                            ? `${metrics.overdueCount} em atraso (${formatBRL(metrics.overdueAmount, 0)})`
                            : metrics.nextDueOn
                              ? `Vence em ${formatDateBR(metrics.nextDueOn)}`
                              : metrics.sold ? "Vendido — nada mais a pagar" : "Sem parcelas em aberto"
                    }
                    info={{
                        what: "A próxima parcela do quadro resumo que ainda não tem pagamento lançado, pelo valor que ela deve chegar: o último valor pago do seu tipo.",
                        formula: <>Próxima = primeira parcela prevista com vencimento ≥ hoje<br />Valor = maior valor já pago do tipo (nunca menos que o contrato)</>,
                        note: "A parcela nunca cai — num mês de índice negativo ela repete o valor da anterior. Lance o pagamento e este valor acompanha.",
                    }}
                />
                <Tile
                    label={COMPLETION_LABELS[investment.strategy] ?? "Chaves"}
                    tone="slate"
                    icon={<KeyRound className="w-4 h-4" />}
                    value={metrics.keysOn ? formatDateBR(metrics.keysOn) : "—"}
                    hint={
                        <span className="block space-y-0.5 pt-0.5">
                            <span className="block">
                                {metrics.sold
                                    ? `Vendido em ${formatDateBR(investment.sold_on)}${metrics.keysDelivered ? "" : ", antes da entrega"}`
                                    : metrics.keysDelivered
                                    ? "Chaves entregues"
                                    : metrics.monthsToKeys === null
                                      ? "Informe a previsão de entrega"
                                      : metrics.monthsToKeys >= 0
                                        ? `Faltam ${metrics.monthsToKeys} ${metrics.monthsToKeys === 1 ? "mês" : "meses"}`
                                        : `Atrasada em ${-metrics.monthsToKeys} meses`}
                                {!metrics.sold && !metrics.keysDelivered && metrics.constructionPct !== null && ` · obra ${pct1(metrics.constructionPct)}%`}
                            </span>
                            {!metrics.sold && !metrics.keysDelivered && metrics.constructionPct !== null && (
                                <span className="block h-1.5 w-full rounded-full bg-muted overflow-hidden" title={`Obra ${pct1(metrics.constructionPct)}%${metrics.constructionUpdatedOn ? ` em ${formatDateBR(metrics.constructionUpdatedOn)}` : ""}`}>
                                    <span className="block h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, Math.max(0, metrics.constructionPct))}%` }} />
                                </span>
                            )}
                            {!metrics.sold && metrics.keysToleranceOn && (
                                <span className="block">com tolerância: até {formatDateBR(metrics.keysToleranceOn)}</span>
                            )}
                        </span>
                    }
                    info={{
                        what: "A data em que a construtora entrega a unidade. É quando o aluguel pode começar, e a linha vertical do gráfico. O andamento da obra é o que a construtora informou por último (lápis ao lado do nome).",
                        formula: "data de entrega do contrato (ou a data real, quando informada) · tolerância = entrega + 180 dias",
                        note: `A lei permite à construtora atrasar até 180 dias sem multa (Lei 13.786/2018). Correção até as chaves: ${INDEX_LABELS[investment.index_before_keys]} · após: ${INDEX_LABELS[investment.index_after_keys]}`,
                    }}
                />
                <Tile
                    label="Yield do aluguel"
                    tone="emerald"
                    icon={<TrendingUp className="w-4 h-4" />}
                    value={metrics.netYieldPct !== null ? `${metrics.netYieldPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a.a.` : "—"}
                    hint={
                        metrics.sold
                            ? "Vendido — a unidade não vai render aluguel"
                            : metrics.netMonthlyRent !== null
                              ? `Aluguel líquido ${formatBRL(metrics.netMonthlyRent, 0)}/mês${metrics.paybackMonths ? ` · payback ${Math.round(metrics.paybackMonths / 12)} anos` : ""}`
                              : "Informe o aluguel estimado no simulador"
                    }
                    info={{
                        what: "O yield do aluguel: quanto a unidade pronta rende por ano sobre o que ela custou, com o aluguel líquido de vacância e custos. É a medida rápida de mercado; a TIR do simulador é outra coisa — junta as parcelas, o prazo até as chaves e o horizonte numa taxa só, e por isso fica menor.",
                        formula: "12 × aluguel líquido ÷ custo total",
                        example:
                            metrics.netMonthlyRent !== null
                                ? `12 × ${formatBRL(metrics.netMonthlyRent)} ÷ ${formatBRL(metrics.committed)} = ${metrics.netYieldPct}%`
                                : undefined,
                    }}
                />
            </div>

            {metrics.sold && metrics.saleNet !== null && metrics.realizedGain !== null && (
                <div
                    role="note"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200"
                >
                    <Handshake className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                        Vendido em <strong>{formatDateBR(investment.sold_on)}</strong> por <strong className="tabular-nums">{formatBRL(investment.sale_price ?? 0)}</strong>
                        {investment.sale_costs_pct > 0 ? ` (líquido ${formatBRL(metrics.saleNet)} após ${pct1(investment.sale_costs_pct)}% de custos)` : ""} — ganho de{" "}
                        <strong className={`text-base font-bold tabular-nums ${metrics.realizedGain >= 0 ? "" : "text-rose-700 dark:text-rose-300"}`}>
                            {metrics.realizedGain > 0 ? "+" : ""}{formatBRL(metrics.realizedGain)}
                        </strong>
                        {metrics.realizedGainPct !== null ? ` (${metrics.realizedGainPct > 0 ? "+" : ""}${pct1(metrics.realizedGainPct)}%)` : ""} sobre {formatBRL(metrics.paidToDate)} pagos
                        {metrics.realizedIrrAnnualPct !== null ? ` · TIR ${pct1(metrics.realizedIrrAnnualPct)}% a.a.` : "."}
                    </span>
                    <button type="button" onClick={() => void undoSale()} className="text-xs underline underline-offset-2 text-emerald-800/80 dark:text-emerald-300/80 hover:text-emerald-900">
                        desfazer
                    </button>
                </div>
            )}

            {metrics.correctionsPaid > 0 && (
                <div
                    role="note"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
                    title="Correção monetária paga sobre as parcelas até agora — a diferença entre o que a construtora cobrou e o valor de contrato"
                >
                    <PiggyBank className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                        <strong className="text-base font-bold tabular-nums">{formatBRL(metrics.correctionsPaid)}</strong> do que já foi pago é
                        correção monetária <span className="font-semibold">({INDEX_LABELS[investment.index_before_keys]})</span> —{" "}
                        <strong className="tabular-nums">{((metrics.correctionsPaid / Math.max(1, metrics.paidToDate)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong> do desembolso.
                    </span>
                    <span className="text-xs text-amber-800/80 dark:text-amber-300/80">
                        Antecipar parcelas é o que evita que esse número cresça.
                    </span>
                </div>
            )}

            <InvestmentPaymentsTable
                payments={payments}
                schedules={schedules}
                investmentId={investmentId}
                receiptsByPayment={receiptsByPayment}
                onRefresh={refresh}
                onCreate={createPayment}
                onPatch={patchPayment}
                onDelete={deletePayment}
                onEditPlan={() => setPlanOpen(true)}
                onView={(url, name) => setViewing({ url, name })}
                busy={busy}
                sold={metrics.sold}
            />

            <InvestmentCashFlowSimulator
                // the simulator seeds its inputs once; remount when the dates behind the defaults change
                key={`${investment.id}:${investment.keys_expected_on ?? ""}:${investment.keys_delivered_on ?? ""}`}
                investment={investment}
                schedules={schedules}
                payments={payments}
                metrics={metrics}
                benchmarks={benchmarks}
                onSave={patchInvestment}
            />

            <InvestmentDocuments
                investmentId={investmentId}
                documents={documents}
                onChanged={refresh}
                onView={(url, name) => setViewing({ url, name })}
                coverPath={investment.cover_path}
                onSetCover={path => patchInvestment({ cover_path: path })}
            />

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <PdfViewerModal
                isOpen={viewing !== null}
                onClose={() => setViewing(null)}
                url={viewing?.url ?? null}
                title={viewing?.name ?? "Documento"}
                fileName={viewing?.name ?? "documento.pdf"}
            />

            <InvestmentDetailsModal
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                investment={investment}
                onSave={patchInvestment}
            />

            <InvestmentSellModal
                open={sellOpen}
                onClose={() => setSellOpen(false)}
                investment={investment}
                paidToDate={metrics.paidToDate}
                onSell={sell}
            />

            <InvestmentPlanModal
                open={planOpen}
                onClose={() => setPlanOpen(false)}
                investment={investment}
                schedules={schedules}
                paymentCount={payments.length}
                onSave={patchInvestment}
            />

            <Dialog open={promoteOpen} onOpenChange={o => { if (!promoting) setPromoteOpen(o); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Mover para Imóveis</DialogTitle>
                        <DialogDescription>
                            A unidade passa a ser um imóvel da carteira, com ficha, contrato de locação e razão de receitas.
                            O histórico de pagamentos continua aqui, marcado como concluído.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="promote-name">Nome do imóvel</Label>
                            <Input id="promote-name" value={promoteName} onChange={e => setPromoteName(e.target.value)} placeholder={investment.name} />
                            <p className="text-xs text-muted-foreground">Precisa ser diferente dos imóveis já cadastrados.</p>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="promote-date">Data de entrega das chaves</Label>
                            <DateInput id="promote-date" value={promoteDate} onChange={setPromoteDate} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPromoteOpen(false)} disabled={promoting}>Cancelar</Button>
                        <Button onClick={promote} disabled={promoting}>
                            {promoting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Mover para Imóveis
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
