"use client";

/** Totals strip on /imoveis: the investment engine rolled up over every property with a ledger. */
import React from "react";
import { BadgeDollarSign, CalendarClock, Gauge, Percent, PiggyBank, Wallet } from "lucide-react";
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

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Item({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint: string; tone: string }) {
    return (
        <div className="p-3 rounded-xl border border-border/80 bg-card space-y-0.5 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span className={tone}>{icon}</span>{label}
            </span>
            <span className="text-base font-bold text-foreground block tabular-nums truncate">{value}</span>
            <span className="text-[11px] text-muted-foreground block truncate">{hint}</span>
        </div>
    );
}

export default function PortfolioStrip({ totals }: { totals: PortfolioTotalsData }) {
    const paid = totals.paybackPct >= 100;
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                <Item icon={<PiggyBank className="w-3.5 h-3.5" />} tone="text-emerald-600" label="Investido" value={brl(totals.invested)}
                    hint={`${totals.count} ${totals.count === 1 ? "imóvel com registro" : "imóveis com registro"}`} />
                <Item icon={<Wallet className="w-3.5 h-3.5" />} tone="text-blue-600" label="Renda líquida acumulada" value={brl(totals.netIncomeToDate)}
                    hint={`Últimos 12 meses ${brl(totals.noi12m)}`} />
                <Item icon={<Gauge className="w-3.5 h-3.5" />} tone={paid ? "text-emerald-600" : "text-amber-600"} label="Payback do portfólio" value={pct(totals.paybackPct)}
                    hint={paid ? "Investimento recuperado" : totals.lastForecastMonth ? `Último imóvel previsto para ${formatMonthKey(totals.lastForecastMonth)}` : "Renda líquida ÷ investido"} />
                <Item icon={<Percent className="w-3.5 h-3.5" />} tone="text-violet-600" label="Yield líquido (12 m)" value={pct(totals.blendedYield)}
                    hint="Renda líquida dos últimos 12 meses ÷ investido" />
                <Item icon={totals.marketValue !== null ? <BadgeDollarSign className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />} tone="text-emerald-600" label="Valor de mercado"
                    value={totals.marketValue !== null ? brl(totals.marketValue) : "—"}
                    hint={totals.marketValue !== null ? `${totals.valuedCount} de ${totals.count} avaliados · estimado` : "Cadastre avaliações na análise de cada imóvel"} />
            </div>
        </div>
    );
}
