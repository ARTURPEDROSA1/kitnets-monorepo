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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Tile from "@/components/properties/Tile";
import InvestmentPaymentsTable, { type PaymentDraft } from "./InvestmentPaymentsTable";
import InvestmentCashFlowSimulator from "./InvestmentCashFlowSimulator";
import InvestmentDocuments, { type DocumentWithUrl } from "./InvestmentDocuments";
import InvestmentPlanModal from "./InvestmentPlanModal";
import InvestmentDetailsModal from "./InvestmentDetailsModal";
import { formatDateBR } from "@/lib/dates";
import {
    INDEX_LABELS,
    INVESTMENT_KIND_LABELS,
    formatBRL,
    investmentTitle,
    type InvestmentPayment,
    type InvestmentSchedule,
    type NewInvestment,
} from "@/lib/new-investments";
import type { InvestmentMetrics } from "@/lib/new-investment-metrics";

interface Bundle {
    investment: NewInvestment;
    schedules: InvestmentSchedule[];
    payments: InvestmentPayment[];
    documents: DocumentWithUrl[];
    metrics: InvestmentMetrics;
}

interface Props {
    investmentId: string;
    lang: string;
    onBack: () => void;
    onChanged: () => void;
}

export default function InvestmentDashboard({ investmentId, lang, onBack, onChanged }: Props) {
    const [bundle, setBundle] = useState<Bundle | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [promoteOpen, setPromoteOpen] = useState(false);
    const [promoteName, setPromoteName] = useState("");
    const [promoteDate, setPromoteDate] = useState(new Date().toISOString().slice(0, 10));
    const [promoting, setPromoting] = useState(false);
    const [planOpen, setPlanOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const load = useCallback(async () => {
        const [main, docs] = await Promise.all([
            fetch(`/api/investments/${investmentId}`),
            fetch(`/api/investments/${investmentId}/documents`),
        ]);
        const data = await main.json().catch(() => ({}));
        if (!main.ok) throw new Error(data.error || "Erro ao carregar o investimento");
        const docJson = docs.ok ? await docs.json().catch(() => ({ documents: [] })) : { documents: [] };
        setBundle({ ...data, documents: docJson.documents ?? [] });
    }, [investmentId]);

    useEffect(() => {
        let alive = true;
        load().catch(err => { if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar"); });
        return () => { alive = false; };
    }, [load]);

    const receiptUrls = useMemo(() => {
        const map: Record<string, string | null> = {};
        for (const doc of bundle?.documents ?? []) map[doc.storage_path] = doc.url;
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
            body: JSON.stringify(draft),
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
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando investimento…
            </div>
        );
    }

    const { investment, metrics, schedules, payments, documents } = bundle;
    const title = investmentTitle(investment);
    const promoted = Boolean(investment.promoted_property_id);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Novos Investimentos
                    </Button>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
                        <button
                            type="button"
                            onClick={() => setDetailsOpen(true)}
                            title="Editar nome, unidade, tipo e endereço"
                            aria-label="Editar dados do investimento"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {[INVESTMENT_KIND_LABELS[investment.kind], investment.developer, investment.address, investment.city].filter(Boolean).join(" · ")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setPlanOpen(true)} title="Plano de pagamento do contrato">
                        <Settings className="w-4 h-4 sm:mr-1" />
                        <span className="hidden sm:inline">Plano de pagamento</span>
                    </Button>
                {promoted ? (
                    <Link
                        href={lang === "pt" ? "/imoveis" : `/${lang}/imoveis`}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"
                    >
                        <CheckCircle2 className="w-4 h-4" /> Já está em Imóveis
                    </Link>
                ) : (
                    <Button onClick={() => { setPromoteName(investment.unit_label || investment.name); setPromoteOpen(true); }}>
                        <ArrowRightLeft className="w-4 h-4 mr-1" /> Mover para Imóveis
                    </Button>
                )}
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <Tile
                    label="Pago até agora"
                    tone="emerald"
                    icon={<Wallet className="w-4 h-4" />}
                    value={formatBRL(metrics.paidToDate, 0)}
                    hint={`${metrics.paidCount} lançamento${metrics.paidCount === 1 ? "" : "s"} · ${metrics.paidPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`}
                    info={{
                        what: "Tudo que já saiu do bolso por esta unidade: sinal, entrada, parcelas, correções, taxas.",
                        formula: "Σ (valor + correção) dos lançamentos pagos",
                        example: `${metrics.paidCount} lançamentos = ${formatBRL(metrics.paidToDate)}`,
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
                            "Nada em aberto no contrato"
                        )
                    }
                    info={{
                        what: "As parcelas do quadro resumo que ainda não foram pagas, sem projeção de correção monetária. A quebra por tipo mostra quanto cada bloco do contrato ainda custa — é por ela que se decide o que vale antecipar.",
                        formula: "Σ parcelas previstas − parcelas já quitadas",
                        example: metrics.remainingByKind.length > 0
                            ? metrics.remainingByKind.map(k => `${k.label}: ${k.count} × em aberto = ${formatBRL(k.total)}`).join(" · ")
                            : undefined,
                        note: "A correção do INCC/IGP-M entra quando o pagamento é lançado, não aqui.",
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
                        note: "Difere do preço do contrato pela correção monetária já paga.",
                    }}
                />
                <Tile
                    label="Próxima parcela"
                    tone={metrics.overdueCount > 0 ? "rose" : "violet"}
                    icon={<Receipt className="w-4 h-4" />}
                    value={metrics.nextDueOn ? formatBRL(metrics.nextDueAmount, 0) : "—"}
                    hint={
                        <span className="block space-y-0.5">
                            <span className="block">
                                {metrics.overdueCount > 0
                                    ? `${metrics.overdueCount} em atraso (${formatBRL(metrics.overdueAmount, 0)})`
                                    : metrics.nextDueOn
                                      ? `Vence em ${formatDateBR(metrics.nextDueOn)}`
                                      : "Sem parcelas em aberto"}
                            </span>
                            {metrics.lastDueOn && (
                                <span className="block">
                                    Última: {formatBRL(metrics.lastDueAmount, 0)} em {formatDateBR(metrics.lastDueOn)}
                                </span>
                            )}
                        </span>
                    }
                    info={{
                        what: "A próxima parcela do quadro resumo que ainda não tem pagamento lançado, e a última do plano — quando o pagamento termina.",
                        formula: <>Próxima = primeira parcela prevista com vencimento ≥ hoje<br />Última = a parcela prevista mais distante</>,
                        example: metrics.lastDueOn
                            ? `Última parcela em ${formatDateBR(metrics.lastDueOn)}, de ${formatBRL(metrics.lastDueAmount)}`
                            : undefined,
                    }}
                />
                <Tile
                    label="Chaves"
                    tone="slate"
                    icon={<KeyRound className="w-4 h-4" />}
                    value={metrics.keysOn ? formatDateBR(metrics.keysOn) : "—"}
                    hint={
                        metrics.keysDelivered
                            ? "Chaves entregues"
                            : metrics.monthsToKeys === null
                              ? "Informe a previsão de entrega"
                              : metrics.monthsToKeys >= 0
                                ? `Faltam ${metrics.monthsToKeys} ${metrics.monthsToKeys === 1 ? "mês" : "meses"}`
                                : `Atrasada em ${-metrics.monthsToKeys} meses`
                    }
                    info={{
                        what: "A data em que a construtora entrega a unidade. É quando o aluguel pode começar, e a linha vertical do gráfico.",
                        formula: "data de entrega do contrato (ou a data real, quando informada)",
                        note: `Correção até as chaves: ${INDEX_LABELS[investment.index_before_keys]} · após: ${INDEX_LABELS[investment.index_after_keys]}`,
                    }}
                />
                <Tile
                    label="Rentabilidade estimada"
                    tone="emerald"
                    icon={<TrendingUp className="w-4 h-4" />}
                    value={metrics.netYieldPct !== null ? `${metrics.netYieldPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a.a.` : "—"}
                    hint={
                        metrics.netMonthlyRent !== null
                            ? `Aluguel líquido ${formatBRL(metrics.netMonthlyRent, 0)}/mês${metrics.paybackMonths ? ` · payback ${Math.round(metrics.paybackMonths / 12)} anos` : ""}`
                            : "Informe o aluguel estimado no simulador"
                    }
                    info={{
                        what: "Quanto a unidade rende por ano sobre o que ela custou, com o aluguel líquido de vacância e custos.",
                        formula: "12 × aluguel líquido ÷ custo total",
                        example:
                            metrics.netMonthlyRent !== null
                                ? `12 × ${formatBRL(metrics.netMonthlyRent)} ÷ ${formatBRL(metrics.committed)} = ${metrics.netYieldPct}%`
                                : undefined,
                    }}
                />
            </div>

            {metrics.correctionsPaid > 0 && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <PiggyBank className="w-3.5 h-3.5" />
                    {formatBRL(metrics.correctionsPaid)} do que já foi pago é correção monetária
                    ({INDEX_LABELS[investment.index_before_keys]}), {((metrics.correctionsPaid / Math.max(1, metrics.paidToDate)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do desembolso.
                </p>
            )}

            <InvestmentPaymentsTable
                payments={payments}
                schedules={schedules}
                receiptUrls={receiptUrls}
                onCreate={createPayment}
                onPatch={patchPayment}
                onDelete={deletePayment}
                onEditPlan={() => setPlanOpen(true)}
                busy={busy}
            />

            <InvestmentCashFlowSimulator
                investment={investment}
                schedules={schedules}
                payments={payments}
                onSave={patchInvestment}
            />

            <InvestmentDocuments investmentId={investmentId} documents={documents} onChanged={refresh} />

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <InvestmentDetailsModal
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                investment={investment}
                onSave={patchInvestment}
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
                            <Input id="promote-date" type="date" value={promoteDate} onChange={e => setPromoteDate(e.target.value)} />
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
