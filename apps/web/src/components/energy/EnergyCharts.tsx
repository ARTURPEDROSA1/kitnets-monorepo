"use client";

import React from "react";
import {
    ResponsiveContainer,
    ComposedChart,
    BarChart,
    Bar,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";

export interface EnergyChartPoint {
    reference_month: string;
    date_label: string;
    grid_consumption_kwh: number;
    solar_injected_kwh: number;
    solar_compensated_kwh: number;
    generation_balance_kwh: number;
    daily_avg_kwh: number;
    total_amount: number;
    availability_cost_amount: number;
    estimated_savings: number;
    unit_price: number;
    is_historical_only: boolean;
}

const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatNumber = (val: number, decimals = 1) =>
    val.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// ── Chart 1: Balanço Energético (Consumo vs Energia Injetada) ─────────────────
export function EnergyBalanceChart({ data, height = 340 }: { data: EnergyChartPoint[]; height?: number }) {
    if (!data || data.length === 0) {
        return (
            <div className="w-full flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm" style={{ height }}>
                Sem dados de consumo ou injeção solar para o período
            </div>
        );
    }

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 20, right: 25, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date_label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} unit=" kWh" />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const cons = Number(payload.find((p) => p.dataKey === "grid_consumption_kwh")?.value || 0);
                            const inj = Number(payload.find((p) => p.dataKey === "solar_injected_kwh")?.value || 0);
                            const diff = inj - cons;

                            return (
                                <div className="bg-card border border-border p-3.5 rounded-xl shadow-lg text-xs space-y-1.5">
                                    <p className="font-semibold text-foreground text-sm border-b border-border pb-1">{label}</p>
                                    <div className="flex items-center justify-between gap-4 text-blue-600 dark:text-blue-400">
                                        <span>Consumo da Rede:</span>
                                        <span className="font-bold">{formatNumber(cons)} kWh</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 text-amber-600 dark:text-amber-400">
                                        <span>Energia Injetada (Solar):</span>
                                        <span className="font-bold">{formatNumber(inj)} kWh</span>
                                    </div>
                                    {inj > 0 && (
                                        <div className={`flex items-center justify-between gap-4 pt-1 border-t border-border font-medium ${diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                            <span>Balanço Líquido:</span>
                                            <span>{diff >= 0 ? `+${formatNumber(diff)} kWh (Superávit)` : `${formatNumber(diff)} kWh (Déficit)`}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Bar dataKey="grid_consumption_kwh" name="Consumo da Rede (kWh)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={38} />
                    <Bar dataKey="solar_injected_kwh" name="Energia Injetada (kWh)" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={38} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

// ── Chart 2: Evolução do Saldo de Créditos de Geração (kWh) ───────────────────
export function GenerationBalanceChart({ data, height = 300 }: { data: EnergyChartPoint[]; height?: number }) {
    // Filter points that have generation balance recorded
    const balanceData = data.filter((d) => !d.is_historical_only && d.generation_balance_kwh > 0);

    if (balanceData.length === 0) {
        return (
            <div className="w-full flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm" style={{ height }}>
                Nenhum saldo de geração registrado nas faturas analisadas
            </div>
        );
    }

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
                <AreaChart data={balanceData} margin={{ top: 15, right: 25, left: 10, bottom: 5 }}>
                    <defs>
                        <linearGradient id="solarCreditGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date_label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} unit=" kWh" />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const balance = Number(payload[0].value);
                            return (
                                <div className="bg-card border border-border p-3 rounded-xl shadow-lg text-xs space-y-1">
                                    <p className="font-semibold text-foreground text-sm">{label}</p>
                                    <p className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                                        {formatNumber(balance)} kWh
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        Saldo de créditos acumulados junto à concessionária
                                    </p>
                                </div>
                            );
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="generation_balance_kwh"
                        name="Saldo Atual de Geração (kWh)"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#solarCreditGrad)"
                        dot={{ r: 4, fill: "#10b981", strokeWidth: 1 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ── Chart 3: Análise Financeira & Economia Solar (R$) ──────────────────────────
export function FinancialAnalysisChart({ data, height = 300 }: { data: EnergyChartPoint[]; height?: number }) {
    // Show only bills with financial records
    const financialData = data.filter((d) => d.total_amount > 0 || d.estimated_savings > 0);

    if (financialData.length === 0) {
        return (
            <div className="w-full flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm" style={{ height }}>
                Envie a fatura completa para visualizar comparativo financeiro e economia
            </div>
        );
    }

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
                <BarChart data={financialData} margin={{ top: 20, right: 25, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date_label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const total = Number(payload.find((p) => p.dataKey === "total_amount")?.value || 0);
                            const savings = Number(payload.find((p) => p.dataKey === "estimated_savings")?.value || 0);
                            const availability = Number(payload.find((p) => p.dataKey === "availability_cost_amount")?.value || 0);

                            return (
                                <div className="bg-card border border-border p-3.5 rounded-xl shadow-lg text-xs space-y-1.5">
                                    <p className="font-semibold text-foreground text-sm border-b border-border pb-1">{label}</p>
                                    <div className="flex items-center justify-between gap-4 text-foreground">
                                        <span>Valor Pago:</span>
                                        <span className="font-bold">{formatCurrency(total)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                                        <span>Economia Estimada:</span>
                                        <span className="font-bold">{formatCurrency(savings)}</span>
                                    </div>
                                    {availability > 0 && (
                                        <div className="flex items-center justify-between gap-4 text-amber-600 dark:text-amber-400 pt-1 border-t border-border">
                                            <span>Custo de Disponibilidade:</span>
                                            <span className="font-medium">{formatCurrency(availability)}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Bar dataKey="total_amount" name="Valor Pago (R$)" fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="estimated_savings" name="Economia Solar Estimada (R$)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ── Chart 4: Média Diária de Consumo (kWh/Dia) ─────────────────────────────────
export function DailyAvgTrendChart({ data, height = 280 }: { data: EnergyChartPoint[]; height?: number }) {
    const validData = data.filter((d) => d.daily_avg_kwh > 0);

    if (validData.length === 0) {
        return (
            <div className="w-full flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm" style={{ height }}>
                Sem dados de média diária para o período
            </div>
        );
    }

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
                <AreaChart data={validData} margin={{ top: 15, right: 25, left: 10, bottom: 5 }}>
                    <defs>
                        <linearGradient id="dailyAvgGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date_label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} unit=" kWh" />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const daily = Number(payload[0].value);
                            return (
                                <div className="bg-card border border-border p-3 rounded-xl shadow-lg text-xs space-y-1">
                                    <p className="font-semibold text-foreground text-sm">{label}</p>
                                    <p className="text-violet-600 dark:text-violet-400 font-bold text-sm">
                                        {formatNumber(daily, 2)} kWh/Dia
                                    </p>
                                </div>
                            );
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="daily_avg_kwh"
                        name="Média Diária (kWh/Dia)"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#dailyAvgGrad)"
                        dot={{ r: 3.5, fill: "#8b5cf6" }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
