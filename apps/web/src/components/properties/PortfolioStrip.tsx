"use client";

/**
 * The dashboard on top of /imoveis: what the portfolio brings in every month (from the income
 * ledgers, real figures) and what the investment engine says about it (invested, payback, yield,
 * market value), rolled up over the properties on screen.
 */
import React from "react";
import { BadgeDollarSign, CalendarClock, DollarSign, Gauge, Percent, PiggyBank, Wallet } from "lucide-react";
import { formatMonthKey } from "@/lib/property-income";

export interface PortfolioTotalsData {
    count: number;
    invested: number;
    netIncomeToDate: number;
    noi12m: number;
    paybackPct: number;
    blendedYield: number | null;
    marketValue: number | null;
    valuedCount: number;
    lastForecastMonth: string | null;
}

/** Σ of the cards' monthly figures — the ledger's latest month where there is one, the estimate otherwise. */
export interface PortfolioIncomeData {
    count: number;
    /** How many of `count` come from the income ledger (the rest are the cards' estimates). */
    realCount: number;
    revenue: number;
    noi: number;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Item({ icon, label, value, hint, tone, valueTone }: { icon: React.ReactNode; label: string; value: string; hint: string; tone: string; valueTone?: string }) {
    return (
        <div className="rounded-xl border border-border/80 bg-card px-4 py-3 space-y-0.5 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span className={tone}>{icon}</span>{label}
            </span>
            <span className={`text-xl font-bold block tabular-nums truncate ${valueTone ?? "text-foreground"}`}>{value}</span>
            <span className="text-xs text-muted-foreground block truncate">{hint}</span>
        </div>
    );
}

export default function PortfolioStrip({ totals, income }: { totals: PortfolioTotalsData | null; income: PortfolioIncomeData }) {
    const paid = totals !== null && totals.paybackPct >= 100;
    const margin = income.revenue > 0 ? (income.noi / income.revenue) * 100 : null;
    const sourceHint =
        income.realCount === income.count
            ? `${income.count} ${income.count === 1 ? "imóvel · razão de receitas" : "imóveis · razão de receitas"}`
            : income.realCount === 0
              ? `${income.count} ${income.count === 1 ? "imóvel · estimativa" : "imóveis · estimativas"}`
              : `${income.realCount} de ${income.count} com receitas reais`;
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Item icon={<DollarSign className="w-3.5 h-3.5" />} tone="text-emerald-600" label="Receita mensal" value={brl(income.revenue)} hint={sourceHint} />
            <Item icon={<Percent className="w-3.5 h-3.5" />} tone="text-blue-600" label="Resultado líquido (NOI)" value={brl(income.noi)} valueTone="text-emerald-600"
                hint={margin !== null ? `margem ${pct(margin)}` : "—"} />
            <Item icon={<PiggyBank className="w-3.5 h-3.5" />} tone="text-emerald-600" label="Investido" value={totals ? brl(totals.invested) : "—"}
                hint={totals ? `${totals.count} ${totals.count === 1 ? "imóvel com registro" : "imóveis com registro"}` : "carregando…"} />
            <Item icon={<Gauge className="w-3.5 h-3.5" />} tone={paid ? "text-emerald-600" : "text-amber-600"} label="Payback do portfólio" value={totals ? pct(totals.paybackPct) : "—"}
                hint={!totals ? "renda líquida ÷ investido" : paid ? "investimento recuperado" : totals.lastForecastMonth ? `último imóvel previsto para ${formatMonthKey(totals.lastForecastMonth)}` : "renda líquida ÷ investido"} />
            <Item icon={<Wallet className="w-3.5 h-3.5" />} tone="text-violet-600" label="Yield líquido (12 m)" value={totals ? pct(totals.blendedYield) : "—"}
                hint={totals ? `renda líquida 12 m ${brl(totals.noi12m)} ÷ investido` : "renda líquida dos últimos 12 meses ÷ investido"} />
            <Item icon={totals?.marketValue != null ? <BadgeDollarSign className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />} tone="text-emerald-600" label="Valor de mercado"
                value={totals?.marketValue != null ? brl(totals.marketValue) : "—"}
                hint={totals?.marketValue != null ? `${totals.valuedCount} de ${totals.count} avaliados · estimado` : "cadastre avaliações na análise de cada imóvel"} />
        </div>
    );
}
