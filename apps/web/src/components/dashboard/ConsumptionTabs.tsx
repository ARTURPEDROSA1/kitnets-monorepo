"use client";

import { useState, useMemo } from "react";
import { ConsumptionChart } from "./ConsumptionChart";

export interface DailyTotal {
    date: string;  // "2026-02-14"
    total: number; // liters
}

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const TABS = [
    { key: "daily" as const, label: "Diário" },
    { key: "monthly" as const, label: "Mensal" },
    { key: "yearly" as const, label: "Anual" },
];

export type TabKey = (typeof TABS)[number]["key"];

export function ConsumptionTabs({
    dailyData,
    loading = false,
    initialTab,
}: {
    dailyData: DailyTotal[];
    loading?: boolean;
    initialTab?: TabKey;
}) {
    const [activeTab, setActiveTab] = useState<TabKey>(initialTab || "daily");

    const { chartData, unit, color } = useMemo(() => {
        switch (activeTab) {
            case "daily": {
                const sorted = [...dailyData].sort((a, b) => a.date.localeCompare(b.date));
                return {
                    chartData: sorted.map((d) => ({
                        date_label: `${d.date.substring(8, 10)}/${d.date.substring(5, 7)}`,
                        consumption: Math.round(d.total),
                    })),
                    unit: "L",
                    color: "#3b82f6",
                };
            }

            case "monthly": {
                const map: Record<string, number> = {};
                for (const d of dailyData) {
                    const key = d.date.substring(0, 7); // "2026-02"
                    map[key] = (map[key] || 0) + d.total;
                }
                return {
                    chartData: Object.entries(map)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([month, total]) => ({
                            date_label: `${MONTH_NAMES[parseInt(month.substring(5, 7)) - 1]}/${month.substring(2, 4)}`,
                            consumption: Math.round((total / 1000) * 100) / 100,
                        })),
                    unit: "m³",
                    color: "#6366f1",
                };
            }

            case "yearly": {
                const map: Record<string, number> = {};
                for (const d of dailyData) {
                    const key = d.date.substring(0, 7);
                    map[key] = (map[key] || 0) + d.total;
                }
                return {
                    chartData: Object.entries(map)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([month, total]) => ({
                            date_label: MONTH_NAMES[parseInt(month.substring(5, 7)) - 1],
                            consumption: Math.round((total / 1000) * 100) / 100,
                        })),
                    unit: "m³",
                    color: "#8b5cf6",
                };
            }
        }
    }, [dailyData, activeTab]);

    return (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            {/* Header + Tab switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <h3 className="text-lg font-semibold text-foreground">
                    Consumo Consolidado
                </h3>
                <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === tab.key
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Active unit badge */}
            <div className="mb-4">
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                    Unidade: {unit}
                </span>
            </div>

            {/* Chart */}
            <ConsumptionChart
                data={chartData}
                unit={unit}
                color={color}
                loading={loading}
                height={350}
            />

            {/* Tab-specific footer hints */}
            {activeTab === "monthly" && chartData.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                    Valores mensais agregados. 1 m³ = 1.000 litros.
                </p>
            )}
            {activeTab === "yearly" && chartData.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                    Visão anual por mês. Selecione &quot;Este Ano&quot; ou &quot;Período&quot; para ver o ano completo.
                </p>
            )}
        </div>
    );
}
