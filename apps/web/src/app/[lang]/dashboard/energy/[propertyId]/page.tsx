"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@kitnets/ui";
import {
    ArrowLeft,
    Sun,
    Zap,
    BatteryCharging,
    DollarSign,
    TrendingUp,
    Calendar,
    Plus,
    Trash2,
    CheckCircle2,
    HelpCircle,
    Building2,
    Sparkles,
    FileText,
} from "lucide-react";
import {
    EnergyBalanceChart,
    GenerationBalanceChart,
    FinancialAnalysisChart,
    DailyAvgTrendChart,
    EnergyChartPoint,
} from "@/components/energy/EnergyCharts";
import { EnergyBillUploadModal } from "@/components/energy/EnergyBillUploadModal";

export interface EnergyBillRecord {
    id: string;
    property_id: string;
    utility_company: string;
    consumer_unit: string;
    installation_class: string | null;
    tariff_modality: string | null;
    reference_month: string;
    reference_month_label: string | null;
    reading_date_current: string | null;
    reading_date_previous: string | null;
    billing_days: number;
    due_date: string | null;
    meter_number: string | null;
    grid_consumption_kwh: number;
    daily_avg_kwh: number | null;
    monthly_avg_kwh: number | null;
    solar_injected_kwh: number;
    solar_compensated_kwh: number;
    generation_balance_kwh: number;
    unit_price: number | null;
    availability_cost_kwh: number | null;
    availability_cost_amount: number;
    energy_scee_exempt_amount: number;
    energy_compensated_amount: number;
    flag_type: string | null;
    flag_amount: number;
    taxes_icms: number;
    taxes_pis_cofins: number;
    total_amount: number;
    estimated_savings_amount: number;
    solar_coverage_ratio: number | null;
    is_historical_only: boolean;
    created_at: string;
}

const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatNumber = (val: number, decimals = 1) =>
    val.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatMonthLabel(isoMonth: string): string {
    if (!isoMonth) return "-";
    const parts = isoMonth.split("-");
    if (parts.length < 2) return isoMonth;
    const m = parseInt(parts[1], 10);
    return `${MONTH_NAMES[m - 1] || parts[1]}/${parts[0].substring(2)}`;
}

export default function EnergyDashboardPage() {
    const params = useParams();
    const router = useRouter();
    const lang = (params.lang as string) || "pt";
    const propertyId = params.propertyId as string;
    const [resolvedPropertyId, setResolvedPropertyId] = useState<string>(propertyId);

    const [bills, setBills] = useState<EnergyBillRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [filterMonths, setFilterMonths] = useState<number>(12);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchBills = async () => {
        setLoading(true);
        try {
            const targetId = resolvedPropertyId || propertyId;
            const res = await fetch(`/api/energy-bills?propertyId=${targetId}`);
            const data = await res.json();
            if (data.success) {
                if (Array.isArray(data.bills)) {
                    setBills(data.bills);
                }
                if (data.propertyId && data.propertyId !== propertyId) {
                    setResolvedPropertyId(data.propertyId);
                    window.history.replaceState(null, "", `/${lang}/dashboard/energy/${data.propertyId}`);
                }
            }
        } catch (err) {
            console.error("[EnergyDashboard] Failed to fetch bills:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (propertyId) {
            fetchBills();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propertyId]);

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja remover este registro de consumo?")) return;
        setDeletingId(id);
        try {
            const res = await fetch(`/api/energy-bills?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                setBills((prev) => prev.filter((b) => b.id !== id));
            }
        } catch (err) {
            console.error("[EnergyDashboard] Delete error:", err);
        } finally {
            setDeletingId(null);
        }
    };

    // Filtered bills by time range (e.g. 12, 24, 36 months)
    const filteredBills = useMemo(() => {
        if (bills.length === 0) return [];
        if (filterMonths === 0) return bills;

        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth() - filterMonths, 1);
        const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;

        return bills.filter((b) => b.reference_month >= cutoffStr);
    }, [bills, filterMonths]);

    // Latest full bill (for current status cards)
    const latestFullBill = useMemo(() => {
        return bills.find((b) => !b.is_historical_only) || bills[0] || null;
    }, [bills]);

    // Summary calculations
    const summary = useMemo(() => {
        if (!latestFullBill) return null;

        const currentBalance = latestFullBill.generation_balance_kwh || 0;
        const currentInjected = latestFullBill.solar_injected_kwh || 0;
        const currentConsumption = latestFullBill.grid_consumption_kwh || 0;
        const currentDailyAvg = latestFullBill.daily_avg_kwh || (currentConsumption / (latestFullBill.billing_days || 30));
        const currentTotal = latestFullBill.total_amount || 0;
        const currentAvailability = latestFullBill.availability_cost_amount || 0;
        const currentUnitPrice = latestFullBill.unit_price || 0;
        const currentSavings = latestFullBill.estimated_savings_amount || (currentInjected * currentUnitPrice);

        // Period totals
        const totalConsumptionPeriod = filteredBills.reduce((acc, b) => acc + (Number(b.grid_consumption_kwh) || 0), 0);
        const avgConsumptionPeriod = filteredBills.length > 0 ? totalConsumptionPeriod / filteredBills.length : 0;

        return {
            currentBalance,
            currentInjected,
            currentConsumption,
            currentDailyAvg,
            currentTotal,
            currentAvailability,
            currentUnitPrice,
            currentSavings,
            avgConsumptionPeriod,
        };
    }, [latestFullBill, filteredBills]);

    // Prepare chronological chart dataset
    const chartData: EnergyChartPoint[] = useMemo(() => {
        return [...filteredBills]
            .sort((a, b) => a.reference_month.localeCompare(b.reference_month))
            .map((b) => ({
                reference_month: b.reference_month,
                date_label: b.reference_month_label || formatMonthLabel(b.reference_month),
                grid_consumption_kwh: Number(b.grid_consumption_kwh) || 0,
                solar_injected_kwh: Number(b.solar_injected_kwh) || 0,
                solar_compensated_kwh: Number(b.solar_compensated_kwh) || 0,
                generation_balance_kwh: Number(b.generation_balance_kwh) || 0,
                daily_avg_kwh: Number(b.daily_avg_kwh) || (Number(b.grid_consumption_kwh) / (b.billing_days || 30)),
                total_amount: Number(b.total_amount) || 0,
                availability_cost_amount: Number(b.availability_cost_amount) || 0,
                estimated_savings: Number(b.estimated_savings_amount) || (Number(b.solar_injected_kwh) * (Number(b.unit_price) || 0)),
                unit_price: Number(b.unit_price) || 0,
                is_historical_only: b.is_historical_only,
            }));
    }, [filteredBills]);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Header & Navigation */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <Link
                            href={`/${lang}/imoveis`}
                            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4 mr-1.5" />
                            Voltar para Imóveis
                        </Link>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-600">
                            <Sun className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                                Gestão de Energia Solar & Consumo
                            </h1>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                {latestFullBill?.consumer_unit && (
                                    <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full font-mono">
                                        UC: {latestFullBill.consumer_unit}
                                    </span>
                                )}
                                <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                    <Sun className="w-3 h-3" />
                                    Microgeração Distribuída (GD)
                                </span>
                                {latestFullBill?.installation_class && (
                                    <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full">
                                        {latestFullBill.installation_class}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-3 self-start md:self-auto">
                    <Button
                        onClick={() => setIsUploadOpen(true)}
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-medium shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Importar Fatura de Energia
                    </Button>
                </div>
            </div>

            {/* Empty State Onboarding */}
            {!loading && bills.length === 0 && (
                <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center bg-card space-y-4">
                    <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 text-amber-600 rounded-3xl flex items-center justify-center mx-auto">
                        <Sun className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5 max-w-md mx-auto">
                        <h3 className="text-lg font-semibold text-foreground">Nenhuma fatura de energia cadastrada</h3>
                        <p className="text-sm text-muted-foreground">
                            Faça o upload de uma conta de luz recente da concessionária (ex: CEMIG). Nossa IA extrairá automaticamente o consumo, geração injetada, saldo de créditos e 13 meses de histórico sem armazenar o arquivo PDF!
                        </p>
                    </div>
                    <Button
                        onClick={() => setIsUploadOpen(true)}
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Enviar Primeira Fatura
                    </Button>
                </div>
            )}

            {/* Content when bills exist */}
            {bills.length > 0 && (
                <>
                    {/* Top 6 KPI Metric Summary Cards */}
                    {summary && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                            {/* Card 1: SALDO ATUAL DE GERAÇÃO */}
                            <div className="bg-card border border-emerald-300 dark:border-emerald-800/60 rounded-xl p-4 shadow-xs space-y-1 bg-gradient-to-br from-emerald-50/40 dark:from-emerald-950/20 to-transparent">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                        Saldo de Geração
                                    </span>
                                    <BatteryCharging className="w-4 h-4 text-emerald-600" />
                                </div>
                                <p className="text-2xl font-black text-emerald-800 dark:text-emerald-200">
                                    {formatNumber(summary.currentBalance)} <span className="text-sm font-normal">kWh</span>
                                </p>
                                <p className="text-[11px] text-emerald-600/90 dark:text-emerald-400">
                                    Créditos acumulados na rede
                                </p>
                            </div>

                            {/* Card 2: Energia Injetada */}
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                                        Energia Injetada
                                    </span>
                                    <Sun className="w-4 h-4 text-amber-500" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">
                                    {formatNumber(summary.currentInjected)} <span className="text-sm font-normal text-muted-foreground">kWh</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Exportado pelos painéis solares
                                </p>
                            </div>

                            {/* Card 3: Consumo da Rede */}
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                                        Consumo da Rede
                                    </span>
                                    <Zap className="w-4 h-4 text-blue-500" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">
                                    {formatNumber(summary.currentConsumption)} <span className="text-sm font-normal text-muted-foreground">kWh</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Média: {formatNumber(summary.currentDailyAvg, 2)} kWh/Dia
                                </p>
                            </div>

                            {/* Card 4: Valor a Pagar */}
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider">
                                        Valor a Pagar
                                    </span>
                                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">
                                    {formatCurrency(summary.currentTotal)}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Custo Disp.: {formatCurrency(summary.currentAvailability)}
                                </p>
                            </div>

                            {/* Card 5: Preço Unitário */}
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider">
                                        Preço Unitário
                                    </span>
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <p className="text-xl font-bold text-foreground font-mono">
                                    R$ {formatNumber(summary.currentUnitPrice, 4)}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Tarifa efetiva com tributos
                                </p>
                            </div>

                            {/* Card 6: Economia Solar Estimada */}
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1 bg-gradient-to-br from-amber-50/40 dark:from-amber-950/20 to-transparent">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                                        Economia Solar
                                    </span>
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                </div>
                                <p className="text-2xl font-black text-amber-700 dark:text-amber-300">
                                    {formatCurrency(summary.currentSavings)}
                                </p>
                                <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
                                    Economizado neste mês
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Chart Controls / Range Filter */}
                    <div className="flex items-center justify-between pt-2">
                        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-amber-500" />
                            Visualizações & Indicadores de Desempenho
                        </h2>
                        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border text-xs">
                            {[
                                { label: "12 Meses", val: 12 },
                                { label: "24 Meses", val: 24 },
                                { label: "36 Meses", val: 36 },
                                { label: "Tudo", val: 0 },
                            ].map((opt) => (
                                <button
                                    key={opt.val}
                                    onClick={() => setFilterMonths(opt.val)}
                                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                        filterMonths === opt.val
                                            ? "bg-background text-foreground shadow-xs"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 4 Interactive Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Chart 1: Balanço Energético */}
                        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Balanço Energético: Consumo vs. Energia Injetada (kWh)
                                </h3>
                                <span className="text-xs text-muted-foreground">Mensal</span>
                            </div>
                            <EnergyBalanceChart data={chartData} />
                        </div>

                        {/* Chart 2: Evolução dos Créditos de Geração */}
                        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Evolução do Saldo de Créditos de Geração (kWh)
                                </h3>
                                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                    Válido por 60 meses
                                </span>
                            </div>
                            <GenerationBalanceChart data={chartData} />
                        </div>

                        {/* Chart 3: Análise Financeira & Economia */}
                        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Comparativo Financeiro: Fatura Paga vs. Economia Solar (R$)
                                </h3>
                                <span className="text-xs text-muted-foreground">Impacto no Bolso</span>
                            </div>
                            <FinancialAnalysisChart data={chartData} />
                        </div>

                        {/* Chart 4: Média Diária & Sazonalidade */}
                        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Média Diária de Consumo & Sazonalidade (kWh/Dia)
                                </h3>
                                <span className="text-xs text-muted-foreground">Intensidade Diária</span>
                            </div>
                            <DailyAvgTrendChart data={chartData} />
                        </div>
                    </div>

                    {/* Histórico de Consumo (Interactive Data Table) */}
                    <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden space-y-0">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
                            <div>
                                <h3 className="text-base font-semibold text-foreground">Histórico de Consumo Detalhado</h3>
                                <p className="text-xs text-muted-foreground">
                                    Registros de consumo, injeção solar, saldo de créditos e custos por ciclo de faturamento
                                </p>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
                                {filteredBills.length} {filteredBills.length === 1 ? "registro" : "registros"}
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                                    <tr>
                                        <th className="py-3 px-4 font-semibold">MÊS/ANO</th>
                                        <th className="py-3 px-4 font-semibold text-right">Cons. kWh</th>
                                        <th className="py-3 px-4 font-semibold text-right">kWh/Dia</th>
                                        <th className="py-3 px-4 font-semibold text-right">Dias</th>
                                        <th className="py-3 px-4 font-semibold text-right text-emerald-600">Saldo Atual Geração</th>
                                        <th className="py-3 px-4 font-semibold text-right text-amber-600">Energia Injetada</th>
                                        <th className="py-3 px-4 font-semibold text-right">Custo Disponibilidade</th>
                                        <th className="py-3 px-4 font-semibold text-right">Preço Unit.</th>
                                        <th className="py-3 px-4 font-semibold text-right">Valor a Pagar</th>
                                        <th className="py-3 px-4 font-semibold text-center">Origem</th>
                                        <th className="py-3 px-4 font-semibold text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filteredBills.map((b) => {
                                        const daily = b.daily_avg_kwh || (b.grid_consumption_kwh / (b.billing_days || 30));
                                        return (
                                            <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="py-3 px-4 font-bold text-foreground">
                                                    {b.reference_month_label || formatMonthLabel(b.reference_month)}
                                                </td>
                                                <td className="py-3 px-4 text-right font-medium">
                                                    {formatNumber(b.grid_consumption_kwh, 0)}
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono">
                                                    {formatNumber(daily, 2)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-muted-foreground">
                                                    {b.billing_days || 30}
                                                </td>
                                                <td className="py-3 px-4 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                                                    {b.generation_balance_kwh > 0 ? `${formatNumber(b.generation_balance_kwh, 2)} kWh` : "-"}
                                                </td>
                                                <td className="py-3 px-4 text-right font-semibold text-amber-600 dark:text-amber-400">
                                                    {b.solar_injected_kwh > 0 ? `${formatNumber(b.solar_injected_kwh, 0)} kWh` : "-"}
                                                </td>
                                                <td className="py-3 px-4 text-right text-muted-foreground">
                                                    {b.availability_cost_amount > 0 ? formatCurrency(b.availability_cost_amount) : "-"}
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                                                    {b.unit_price ? `R$ ${formatNumber(b.unit_price, 4)}` : "-"}
                                                </td>
                                                <td className="py-3 px-4 text-right font-bold text-foreground">
                                                    {b.total_amount > 0 ? formatCurrency(b.total_amount) : "-"}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    {b.is_historical_only ? (
                                                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                                                            Histórico Base
                                                        </span>
                                                    ) : (
                                                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                                            Fatura Completa
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <button
                                                        onClick={() => handleDelete(b.id)}
                                                        disabled={deletingId === b.id}
                                                        className="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                                        title="Excluir registro"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Zero-Storage Upload Modal */}
            <EnergyBillUploadModal
                isOpen={isUploadOpen}
                onClose={() => setIsUploadOpen(false)}
                propertyId={resolvedPropertyId || propertyId}
                onSuccess={() => {
                    fetchBills();
                }}
            />
        </div>
    );
}
