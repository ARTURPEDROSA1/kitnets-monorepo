"use client";

import { useMemo } from "react";
import { MinimumWageData } from "@/lib/minimum-wage";
import { MinimumWageTable } from "./MinimumWageTable";
import { MinimumWageHeatmap } from "./MinimumWageHeatmap";
import { MinimumWageChart } from "./MinimumWageChart";
import { IndexDateFilter } from "../IndexDateFilter";

interface Props {
    data: MinimumWageData[];
    latest: MinimumWageData | null;
    startDate: string;
    endDate: string;
    nextAdjustment?: MinimumWageData | null;
}

export function MinimumWageDashboardWrapper({ data, latest, startDate, endDate, nextAdjustment }: Props) {
    // 1. Calculate Accumulated in Period
    // Formula: (LastValue / FirstValue - 1) * 100
    // Data is sorted DESC (newest first).
    // So FirstValue is data[data.length-1].amount_brl
    // LastValue is data[0].amount_brl
    const accumulatedPeriod = useMemo(() => {
        if (!data || data.length < 2) return null;
        const startVal = data[data.length - 1].amount_brl;
        const endVal = data[0].amount_brl;
        return ((endVal / startVal) - 1) * 100;
    }, [data]);

    // 2. Next Projection
    // Check if we have any projection in data or if latest is projection.
    // The seed has 2026 projection. If it's in the db, it might be in `latest` or `data` array if within range.
    // I'll assume `latest` might be the confirmed one or the projection?
    // The seed has `is_projection=true` for 2026.
    // If `latest` is the 2026 one, then Current Wage should probably be the last CONFIRMED one.
    // I will handle this logic:
    // Confirmed Latest = first item where !is_projection
    // Projection = first item where is_projection

    // Actually, `latest` prop passed from server should probably be the "Current Active Wage".
    // I'll let the server decide what "latest" is (e.g. max date <= today, or just max date non-projection).
    // Re-reading seed: 2025 is confirmed. 2026 is projection.
    // So `latest` should probably be 2025.

    // I will assume `latest` is the currently active one (Jan 2025).

    return (
        <div className="grid gap-3 md:grid-cols-3 md:gap-6">
            {/* KPI Cards */}
            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {/* Card 1: Salário Mínimo Vigente */}
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                        <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">Salário mínimo vigente</h3>
                    </div>
                    <div className="p-3 md:p-6 pt-0">
                        <div className="text-2xl md:text-3xl font-bold text-primary">
                            {latest ? `R$ ${latest.amount_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {latest ? `Vigente desde ${new Date(latest.reference_date).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })}` : '--'}
                        </p>
                        {latest?.legislation && (
                            <p className="text-[10px] text-muted-foreground mt-1 border-t pt-1 truncate" title={latest.legislation}>
                                {latest.legislation}
                            </p>
                        )}
                    </div>
                </div>

                {/* Card 2: Último Reajuste */}
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                        <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">Último reajuste</h3>
                    </div>
                    <div className="p-3 md:p-6 pt-0">
                        <div className="text-2xl md:text-3xl font-bold text-primary">
                            {latest && latest.variation_percent ? `+${latest.variation_percent.toLocaleString('pt-BR')}%` : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Em relação ao valor anterior
                        </p>
                    </div>
                </div>

                {/* Card 3: Acumulado no Período */}
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                        <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">Acumulado no período</h3>
                    </div>
                    <div className="p-3 md:p-6 pt-0">
                        <div className="text-2xl md:text-3xl font-bold text-primary">
                            {accumulatedPeriod !== null ? `+${accumulatedPeriod.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate" title={`${startDate} a ${endDate}`}>
                            De {new Date(startDate).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })} até {new Date(endDate).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
                        </p>
                    </div>
                </div>

                {/* Card 4: Próximo reajuste previsto */}
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                        <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">Próximo reajuste</h3>
                    </div>
                    <div className="p-3 md:p-6 pt-0">
                        <div className="text-2xl md:text-3xl font-bold text-primary">
                            {nextAdjustment
                                ? `R$ ${nextAdjustment.amount_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                : 'A definir'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">
                            {nextAdjustment
                                ? new Date(nextAdjustment.reference_date).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
                                : `Janeiro de ${latest ? latest.year + 1 : new Date().getFullYear() + 1}`}
                        </p>
                        {nextAdjustment ? (
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${!nextAdjustment.is_projection
                                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    }`}>
                                    {!nextAdjustment.is_projection ? 'Confirmado' : 'Projeção'}
                                </span>
                                {nextAdjustment.legislation && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={nextAdjustment.legislation}>
                                        {nextAdjustment.legislation}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                                    Aguardando
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter */}
            <div className="md:col-span-3 min-w-0">
                <IndexDateFilter
                    defaultStartDate={startDate}
                    defaultEndDate={endDate}
                />
            </div>

            {/* Chart */}
            <div className="md:col-span-3 min-w-0">
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                        <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Histórico de Reajuste</h3>
                        <p className="text-xs md:text-sm text-muted-foreground">Evolução do valor nominal e percentual de reajuste.</p>
                    </div>
                    <div className="p-3 md:p-6 pt-0">
                        <MinimumWageChart data={data} />
                    </div>
                </div>
            </div>

            {/* Heatmap */}
            <div className="md:col-span-3 min-w-0">
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                        <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Mapa de Calor (Reajustes)</h3>
                        <p className="text-xs md:text-sm text-muted-foreground">Anos com reajustes mais fortes em verde escuro.</p>
                    </div>
                    <div className="p-3 md:p-6 pt-0">
                        <MinimumWageHeatmap data={data} />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="md:col-span-3 min-w-0">
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                        <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Série Histórica Detalhada</h3>
                        <p className="text-xs md:text-sm text-muted-foreground">Valores oficiais, legislação e percentuais.</p>
                    </div>
                    <div className="p-3 md:p-6 pt-0">
                        <MinimumWageTable data={data} />
                    </div>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="md:col-span-3 min-w-0 mt-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 md:p-6">
                    <div className="flex gap-3">
                        <div className="flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-amber-600 dark:text-amber-500">
                                <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-semibold text-amber-900 dark:text-amber-200">Uso prático no mercado</h4>
                            <p className="text-sm text-amber-800 dark:text-amber-300/90 leading-relaxed">
                                O salário mínimo <strong>não é um indexador oficialmente recomendado pela legislação</strong> para reajuste de aluguéis urbanos.
                                Entretanto, em cidades pequenas e regiões do interior do Brasil, ele é amplamente utilizado por tradição, simplicidade e aceitação social, especialmente em contratos informais ou antigos.
                                O Kitnets.com disponibiliza este índice para consulta, simulação e comparação, cabendo às partes avaliar sua adequação jurídica.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}
