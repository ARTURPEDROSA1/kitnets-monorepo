"use client";

import { useState, useMemo } from "react";
import { Download, Printer, ArrowUpDown } from "lucide-react";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Area,
    AreaChart
} from "recharts";

interface Dictionary {
    compoundInterestCalculator: {
        meta: {
            title: string;
            description: string;
        };
        title: string;
        subtitle: string;
        inputs: {
            initialCapital: string;
            recurringContribution: string;
            interestRate: string;
            period: string;
            frequency: {
                monthly: string;
                annual: string;
            };
            rateType: {
                monthly: string;
                annual: string;
            };
            periodUnit: {
                months: string;
                years: string;
            };
        };
        results: {
            totalInvested: string;
            totalInterest: string;
            finalAmount: string;
            equivalentRate: string;
        };
        chart: {
            totalAmount: string;
            invested: string;
            interest: string;
        };
        table: {
            period: string;
            interest: string;
            accumulatedInterest: string;
            invested: string;
            total: string;
        };
        actions: {
            exportCsv: string;
            exportPdf: string;
        };
    };
}

interface CompoundInterestCalculatorProps {
    dict: Dictionary;
    lang: string;
}

export function CompoundInterestCalculator({ dict, lang }: CompoundInterestCalculatorProps) {
    const t = dict.compoundInterestCalculator;

    // --- State ---
    const [initialCapital, setInitialCapital] = useState<number | string>(1000);
    const [recurringContribution, setRecurringContribution] = useState<number | string>(350);
    const [contributionFrequency, setContributionFrequency] = useState<"monthly" | "annual">("monthly");
    const [interestRate, setInterestRate] = useState<number | string>(1.00);
    const [rateType, setRateType] = useState<"monthly" | "annual">("monthly");
    const [period, setPeriod] = useState<number | string>(30);
    const [periodUnit, setPeriodUnit] = useState<"months" | "years">("years");
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

    // --- Calculations ---
    const results = useMemo(() => {
        const valInitialCapital = Number(initialCapital) || 0;
        const valRecurringContribution = Number(recurringContribution) || 0;
        const valInterestRate = Number(interestRate) || 0;
        const valPeriod = Number(period) || 0;

        const months = periodUnit === "years" ? valPeriod * 12 : valPeriod;
        const rateMonthly = rateType === "annual"
            ? Math.pow(1 + valInterestRate / 100, 1 / 12) - 1
            : valInterestRate / 100;

        let balance = valInitialCapital;
        let totalInvested = valInitialCapital;
        let totalInterest = 0;

        const data = [];

        // Initial data point
        data.push({
            month: 0,
            invested: valInitialCapital,
            interest: 0,
            total: valInitialCapital,
            interestEarnedMonth: 0
        });

        for (let i = 1; i <= months; i++) {
            const interestEarned = balance * rateMonthly;
            balance += interestEarned;
            totalInterest += interestEarned;

            // Add contribution
            let contribution = 0;
            if (contributionFrequency === "monthly") {
                contribution = valRecurringContribution;
            } else if (contributionFrequency === "annual" && i % 12 === 0) {
                contribution = valRecurringContribution;
            }

            balance += contribution;
            totalInvested += contribution;

            data.push({
                month: i,
                invested: totalInvested,
                interest: totalInterest, // Cumulative interest
                total: balance,
                interestEarnedMonth: interestEarned
            });
        }

        return {
            data,
            summary: {
                totalInvested,
                totalInterest,
                finalAmount: balance,
                equivalentRate: rateType === "annual"
                    ? (rateMonthly * 100).toFixed(4) + "%"
                    : (Math.pow(1 + rateMonthly, 12) - 1) * 100
            }
        };
    }, [initialCapital, recurringContribution, contributionFrequency, interestRate, rateType, period, periodUnit]);

    // --- Sorting ---
    const sortedData = useMemo(() => {
        if (!sortConfig) return results.data;

        return [...results.data].sort((a, b) => {
            // @ts-ignore - dynamic sorting
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === "asc" ? -1 : 1;
            }
            // @ts-ignore - dynamic sorting
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === "asc" ? 1 : -1;
            }
            return 0;
        });
    }, [results.data, sortConfig]);

    const handleSort = (key: string) => {
        let direction: "asc" | "desc" = "asc";
        if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
            direction = "desc";
        }
        setSortConfig({ key, direction });
    };

    // Format currency
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", {
            style: "currency",
            currency: "BRL",
        }).format(value);
    };

    // Input handlers
    const formatCurrencyInput = (value: number | string) => {
        if (value === "") return "";
        return new Intl.NumberFormat("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Number(value));
    };

    const handleCurrencyChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        setter: (value: number | string) => void
    ) => {
        const rawValue = e.target.value.replace(/\D/g, "");
        if (rawValue === "") {
            setter("");
            return;
        }
        const numberValue = Number(rawValue) / 100;
        setter(numberValue);
    };

    const downloadCSV = () => {
        const headers = [t.table.period, t.table.invested, t.table.interest, t.table.total];
        const csvContent = [
            headers.join(","),
            ...results.data.map(row =>
                [row.month, row.invested.toFixed(2), row.interest.toFixed(2), row.total.toFixed(2)].join(",")
            )
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "kitnets_simulacao.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-8">
            {/* Print Header */}
            <div className="hidden print:block mb-8 border-b pb-4">
                <div className="flex items-center gap-3 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/kitnets-logo.png" alt="Kitnets Logo" className="h-8 w-auto" />
                    <span className="text-xl font-bold text-zinc-900">Kitnets.com</span>
                </div>
                <p className="text-sm text-zinc-500">Source: kitnets.com - {t.meta.title}</p>
            </div>

            {/* Inputs Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 bg-card p-6 rounded-2xl border border-border shadow-sm">

                {/* Initial Capital */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                        {t.inputs.initialCapital}
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={formatCurrencyInput(initialCapital)}
                            onChange={(e) => handleCurrencyChange(e, setInitialCapital)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Recurring Contribution */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                        {t.inputs.recurringContribution}
                    </label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={formatCurrencyInput(recurringContribution)}
                                onChange={(e) => handleCurrencyChange(e, setRecurringContribution)}
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                            />
                        </div>
                        <select
                            value={contributionFrequency}
                            onChange={(e) => setContributionFrequency(e.target.value as "monthly" | "annual")}
                            className="w-28 px-2 py-2 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring outline-none text-sm"
                        >
                            <option value="monthly">{t.inputs.frequency.monthly}</option>
                            <option value="annual">{t.inputs.frequency.annual}</option>
                        </select>
                    </div>
                </div>

                {/* Interest Rate */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                        {t.inputs.interestRate}
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={interestRate}
                            onChange={(e) => setInterestRate(e.target.value === "" ? "" : Number(e.target.value))}
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                        />
                        <select
                            value={rateType}
                            onChange={(e) => setRateType(e.target.value as "monthly" | "annual")}
                            className="w-32 px-2 py-2 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring outline-none text-sm"
                        >
                            <option value="monthly">{t.inputs.rateType.monthly}</option>
                            <option value="annual">{t.inputs.rateType.annual}</option>
                        </select>
                    </div>
                    {/* Equivalent Rate Display */}
                    <p className="text-xs text-muted-foreground pt-1">
                        {t.results.equivalentRate.replace("{frequency}", rateType === "monthly" ? t.inputs.frequency.annual : t.inputs.frequency.monthly)}:
                        <span className="font-semibold text-foreground ml-1">
                            {typeof results.summary.equivalentRate === 'string' ? results.summary.equivalentRate : (Number(results.summary.equivalentRate)).toFixed(4) + "%"}
                        </span>
                    </p>
                </div>

                {/* Period */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                        {t.inputs.period}
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            min="1"
                            value={period}
                            onChange={(e) => setPeriod(e.target.value === "" ? "" : Number(e.target.value))}
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                        />
                        <select
                            value={periodUnit}
                            onChange={(e) => setPeriodUnit(e.target.value as "months" | "years")}
                            className="w-28 px-2 py-2 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring outline-none text-sm"
                        >
                            <option value="months">{t.inputs.periodUnit.months}</option>
                            <option value="years">{t.inputs.periodUnit.years}</option>
                        </select>
                    </div>
                </div>

            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <p className="text-sm text-muted-foreground mb-2">{t.results.totalInvested}</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(results.summary.totalInvested)}</p>
                </div>
                <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <p className="text-sm text-muted-foreground mb-2">{t.results.totalInterest}</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">+{formatCurrency(results.summary.totalInterest)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-2xl border border-green-100 dark:border-green-800 shadow-sm relative overflow-hidden">
                    <div className="relative z-10">
                        <p className="text-sm text-green-700 dark:text-green-300 mb-2">{t.results.finalAmount}</p>
                        <p className="text-3xl font-bold text-green-800 dark:text-green-200">{formatCurrency(results.summary.finalAmount)}</p>
                    </div>
                </div>
            </div>

            {/* Chart Section */}
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                <div className="h-[400px] w-full">
                    <p className="text-lg font-semibold mb-6 text-foreground">{t.chart.totalAmount}</p>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={results.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-zinc-800" />
                            <XAxis
                                dataKey="month"
                                stroke="#9CA3AF"
                                tickFormatter={(value) => {
                                    if (periodUnit === 'years') {
                                        return (value / 12).toString();
                                    }
                                    return value;
                                }}
                                ticks={
                                    periodUnit === 'years'
                                        ? Array.from({ length: Number(period) + 1 }, (_, i) => i * 12)
                                        : undefined
                                }
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#9CA3AF"
                                tickFormatter={(value) => new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { notation: "compact" }).format(value)}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number | undefined) => formatCurrency(value || 0)}
                                labelFormatter={(label) => `${t.table.period} ${label}`}
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="total"
                                name={t.chart.totalAmount}
                                stroke="#22c55e"
                                fillOpacity={1}
                                fill="url(#colorTotal)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="invested"
                                name={t.chart.invested}
                                stroke="#f97316"
                                fillOpacity={1}
                                fill="url(#colorInvested)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-foreground">{t.meta.title} - {t.table.total}</h3>
                    <div className="flex gap-2">
                        <button
                            onClick={downloadCSV}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30 dark:text-orange-400 rounded-lg transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            {t.actions.exportCsv}
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 rounded-lg transition-colors"
                        >
                            <Printer className="w-4 h-4" />
                            {t.actions.exportPdf}
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-muted-foreground uppercase font-medium sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="px-6 py-4 cursor-pointer hover:text-foreground" onClick={() => handleSort('month')}>
                                    <div className="flex items-center gap-2">
                                        {t.table.period}
                                        <ArrowUpDown className="w-4 h-4" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:text-foreground" onClick={() => handleSort('invested')}>
                                    <div className="flex items-center gap-2">
                                        {t.table.invested}
                                        <ArrowUpDown className="w-4 h-4" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:text-foreground" onClick={() => handleSort('interest')}>
                                    <div className="flex items-center gap-2">
                                        {t.table.interest}
                                        <ArrowUpDown className="w-4 h-4" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:text-foreground" onClick={() => handleSort('total')}>
                                    <div className="flex items-center gap-2">
                                        {t.table.total}
                                        <ArrowUpDown className="w-4 h-4" />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sortedData.map((row) => (
                                <tr key={row.month} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4 text-foreground">{row.month}</td>
                                    <td className="px-6 py-4 text-muted-foreground">{formatCurrency(row.invested)}</td>
                                    <td className="px-6 py-4 text-green-600 dark:text-green-400">+{formatCurrency(row.interestEarnedMonth || 0)}</td>
                                    <td className="px-6 py-4 font-medium text-foreground">{formatCurrency(row.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
