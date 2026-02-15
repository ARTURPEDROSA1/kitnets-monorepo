"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, FileText, TrendingUp, DollarSign, Droplets, Calendar, ChevronDown, Eye, EyeOff, BadgeDollarSign, Plus, Pencil, Trash2, CalendarRange } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";

interface Bill {
    id: string;
    reference_month: string;
    meter_number: string;
    previous_reading: number;
    current_reading: number;
    consumption_m3: number;
    billed_consumption_m3: number;
    reading_date: string;
    due_date: string;
    water_tariff: number;
    sewage_tariff: number;
    water_basic_fee: number;
    sewage_basic_fee: number;
    total_amount: number;
    effective_rate_per_m3: number;
    occurrence_code: string;
}

interface Property {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    connection_code: string;
}

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const FILTER_OPTIONS = [12, 24, 36, 48, 60] as const;

function formatMonth(ref: string): string {
    const [year, month] = ref.split("-");
    return `${MONTH_NAMES[parseInt(month) - 1]}/${year}`;
}

function formatCurrency(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number, decimals = 1): string {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-";
    const [y, m, d] = dateStr.substring(0, 10).split("-");
    return `${d}/${m}/${y}`;
}

const MASK = "••••••";
const MASK_CURRENCY = "R$ •••";

export default function BillingPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const lang = params.lang as string;
    const propertyId = params.propertyId as string;
    const gatewayId = searchParams.get("gateway");
    const supabase = createClient();

    const [property, setProperty] = useState<Property | null>(null);
    const [bills, setBills] = useState<Bill[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
    const [showAddress, setShowAddress] = useState(false);
    const [showValues, setShowValues] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [monthsFilter, setMonthsFilter] = useState<number | "custom">(12);
    const [customStart, setCustomStart] = useState(""); // "YYYY-MM"
    const [customEnd, setCustomEnd] = useState("");     // "YYYY-MM"

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);

            // Fetch property details
            const { data: propData } = await supabase
                .rpc("get_property_details", { p_property_id: propertyId });
            if (propData?.[0]) {
                setProperty(propData[0]);
            }

            // Fetch all bills
            const { data: billsData } = await supabase
                .rpc("get_property_bills", { p_property_id: propertyId });
            if (billsData) {
                setBills(billsData);
            }

            setLoading(false);
        };

        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propertyId]);

    // ── Filter bills by month range ─────────────────────────────
    const filteredBills = useMemo(() => {
        if (monthsFilter === "custom") {
            return bills.filter((b) => {
                if (customStart && b.reference_month < customStart) return false;
                if (customEnd && b.reference_month > customEnd) return false;
                return true;
            });
        }
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsFilter, 1);
        const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
        return bills.filter((b) => b.reference_month >= cutoffStr);
    }, [bills, monthsFilter, customStart, customEnd]);


    // ── Derived data ──────────────────────────────────────────
    const summaryStats = useMemo(() => {
        if (filteredBills.length === 0) return null;
        const totalCost = filteredBills.reduce((sum, b) => sum + Number(b.total_amount), 0);
        const totalConsumption = filteredBills.reduce((sum, b) => sum + Number(b.consumption_m3), 0);
        const avgMonthlyCost = totalCost / filteredBills.length;
        const avgMonthlyConsumption = totalConsumption / filteredBills.length;
        const latestRate = Number(filteredBills[0].effective_rate_per_m3);
        const highestBill = filteredBills.reduce((max, b) => Number(b.total_amount) > Number(max.total_amount) ? b : max, filteredBills[0]);
        return { totalCost, totalConsumption, avgMonthlyCost, avgMonthlyConsumption, latestRate, highestBill };
    }, [filteredBills]);

    // Chart data: consumption + cost by month (chronological)
    const chartData = useMemo(() => {
        return [...filteredBills]
            .sort((a, b) => a.reference_month.localeCompare(b.reference_month))
            .map((b) => ({
                date_label: formatMonth(b.reference_month),
                consumption: Number(b.consumption_m3),
                cost: Number(b.total_amount),
                rate: Number(b.effective_rate_per_m3),
            }));
    }, [filteredBills]);

    // ── Loading state ─────────────────────────────────────────
    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 bg-muted rounded w-64" />
                    <div className="h-4 bg-muted rounded w-48" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-28 bg-muted rounded-xl" />
                        ))}
                    </div>
                    <div className="h-80 bg-muted rounded-xl" />
                </div>
            </div>
        );
    }

    const backHref = gatewayId
        ? `/${lang}/dashboard/gateway/${gatewayId}`
        : `/${lang}/dashboard`;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* ── Header ─────────────────────────────────────── */}
            <div className="mb-8">
                <Link
                    href={backHref}
                    className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                </Link>

                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                                <FileText className="w-8 h-8 text-primary" />
                                Histórico de Contas
                            </h1>
                            {/* Privacy toggles */}
                            <div className="flex items-center gap-1 ml-2">
                                <button
                                    onClick={() => setShowAddress(!showAddress)}
                                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                                    title={showAddress ? "Ocultar dados do imóvel" : "Mostrar dados do imóvel"}
                                >
                                    {showAddress ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                                </button>
                                <button
                                    onClick={() => setShowValues(!showValues)}
                                    className={`p-2 rounded-lg hover:bg-muted/50 transition-colors ${showValues ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
                                    title={showValues ? "Ocultar valores em R$" : "Mostrar valores em R$"}
                                >
                                    <BadgeDollarSign className={`w-5 h-5 ${!showValues ? "opacity-40" : ""}`} />
                                </button>
                            </div>
                        </div>
                        {property && (
                            <div className="mt-2 space-y-1">
                                <p className="text-muted-foreground">{showAddress ? property.name : MASK}</p>
                                <p className="text-sm text-muted-foreground">{showAddress ? `${property.address} — ${property.city}/${property.state}` : MASK}</p>
                                {property.connection_code && (
                                    <p className="text-xs text-muted-foreground font-mono">Ligação: {showAddress ? property.connection_code : MASK}</p>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <Link
                            href={`/${lang}/dashboard/billing/${propertyId}/new${gatewayId ? `?gateway=${gatewayId}` : ""}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm mb-2"
                        >
                            <Plus className="w-4 h-4" />
                            Nova Conta
                        </Link>
                        <p className="text-sm text-muted-foreground">{filteredBills.length} de {bills.length} contas</p>
                        {bills[0] && <p className="font-mono text-sm text-muted-foreground">Hidrômetro: {showAddress ? bills[0].meter_number : MASK}</p>}
                    </div>
                </div>
            </div>

            {/* ── Month Filter ─────────────────────────────── */}
            <div className="flex flex-col gap-2 mb-8">
                {/* Preset buttons row */}
                <div className="flex items-center gap-1 flex-wrap bg-background border border-border rounded-lg p-1">
                    {FILTER_OPTIONS.map((months) => (
                        <button
                            key={months}
                            onClick={() => setMonthsFilter(months)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${monthsFilter === months
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                        >
                            {months === 12 ? "12 meses" : `${months / 12} anos`}
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            setMonthsFilter("custom");
                            if (bills.length > 0 && !customStart) {
                                const sorted = [...bills].sort((a, b) => a.reference_month.localeCompare(b.reference_month));
                                setCustomStart(sorted[0].reference_month);
                                setCustomEnd(sorted[sorted.length - 1].reference_month);
                            }
                        }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${monthsFilter === "custom"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                    >
                        <CalendarRange className="w-3.5 h-3.5" />
                        Período
                    </button>
                </div>

                {/* Custom date inputs (shown when "Período" is selected) */}
                {monthsFilter === "custom" && (
                    <div className="flex flex-col gap-2 bg-background border border-border rounded-lg p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-muted-foreground w-10 shrink-0">De:</label>
                            <input
                                type="month"
                                value={customStart}
                                max={customEnd}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="flex-1 min-w-0 px-2.5 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-muted-foreground w-10 shrink-0">Até:</label>
                            <input
                                type="month"
                                value={customEnd}
                                min={customStart}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="flex-1 min-w-0 px-2.5 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Summary Cards ──────────────────────────────── */}
            {summaryStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Total ({filteredBills.length} meses)</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {showValues ? formatCurrency(summaryStats.totalCost) : MASK_CURRENCY}
                        </p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Média Mensal</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {showValues ? formatCurrency(summaryStats.avgMonthlyCost) : MASK_CURRENCY}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {Math.round(summaryStats.avgMonthlyConsumption)} m³/mês
                        </p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Droplets className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Consumo Total</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {summaryStats.totalConsumption} <span className="text-base font-normal text-muted-foreground">m³</span>
                        </p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Conta Mais Alta</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {showValues ? formatCurrency(Number(summaryStats.highestBill.total_amount)) : MASK_CURRENCY}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {formatMonth(summaryStats.highestBill.reference_month)} — {Number(summaryStats.highestBill.consumption_m3)} m³
                        </p>
                    </div>
                </div>
            )}

            {/* ── Consumption Chart ──────────────────────────── */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm mb-10">
                <h2 className="text-lg font-semibold text-foreground mb-1">Consumo Mensal (m³)</h2>
                <p className="text-sm text-muted-foreground mb-6">Evolução do consumo da concessionária nos últimos {filteredBills.length} meses</p>
                <ConsumptionChart
                    data={chartData}
                    dataKey="consumption"
                    unit="m³"
                    color="#3b82f6"
                    height={300}
                />
            </div>

            {/* ── Cost Chart ─────────────────────────────────── */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm mb-10">
                <h2 className="text-lg font-semibold text-foreground mb-1">Valor Mensal (R$)</h2>
                <p className="text-sm text-muted-foreground mb-6">Evolução do custo da conta de água</p>
                <ConsumptionChart
                    data={chartData}
                    dataKey="cost"
                    unit="R$"
                    color="#10b981"
                    height={300}
                />
            </div>

            {/* ── Bills Table ────────────────────────────────── */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden mb-10">
                <div className="p-6 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">Detalhamento das Contas</h2>
                    <p className="text-sm text-muted-foreground">Clique em uma linha para ver detalhes</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Mês/Ano</th>
                                <th className="text-right px-6 py-3 font-medium text-muted-foreground">Consumo</th>
                                <th className="text-right px-6 py-3 font-medium text-muted-foreground">Valor</th>
                                <th className="text-right px-6 py-3 font-medium text-muted-foreground hidden md:table-cell">Taxa</th>
                                <th className="text-right px-6 py-3 font-medium text-muted-foreground hidden lg:table-cell">Leitura</th>
                                <th className="text-right px-6 py-3 font-medium text-muted-foreground hidden lg:table-cell">Vencimento</th>
                                <th className="px-4 py-3 w-20"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBills.map((bill) => {
                                const isSelected = selectedBill?.id === bill.id;
                                return (
                                    <React.Fragment key={bill.id}>
                                        <tr
                                            onClick={() => setSelectedBill(isSelected ? null : bill)}
                                            className={`border-b border-border cursor-pointer transition-colors hover:bg-muted/20 ${isSelected ? "bg-primary/5" : ""}`}
                                        >
                                            <td className="px-6 py-4 font-medium text-foreground">
                                                <span className="inline-flex items-center gap-2">
                                                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isSelected ? "rotate-180" : ""}`} />
                                                    {formatMonth(bill.reference_month)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right text-foreground">
                                                {formatNumber(Number(bill.consumption_m3))} m³
                                            </td>
                                            <td className="px-6 py-4 text-right font-semibold text-foreground">
                                                {showValues ? formatCurrency(Number(bill.total_amount)) : MASK_CURRENCY}
                                            </td>
                                            <td className="px-6 py-4 text-right text-muted-foreground hidden md:table-cell">
                                                {showValues ? `R$ ${formatNumber(Number(bill.effective_rate_per_m3), 2)}/m³` : MASK_CURRENCY}
                                            </td>
                                            <td className="px-6 py-4 text-right text-muted-foreground hidden lg:table-cell font-mono text-xs">
                                                {formatNumber(Number(bill.previous_reading), 0)} → {formatNumber(Number(bill.current_reading), 1)}
                                            </td>
                                            <td className="px-6 py-4 text-right text-muted-foreground hidden lg:table-cell">
                                                {formatDate(bill.due_date)}
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Link
                                                        href={`/${lang}/dashboard/billing/${propertyId}/new?gateway=${gatewayId || ""}&edit=${bill.reference_month}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                                        title="Editar conta"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </Link>
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!confirm(`Excluir conta de ${formatMonth(bill.reference_month)}?`)) return;
                                                            setDeletingId(bill.id);
                                                            const res = await fetch("/api/delete-bill", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ billId: bill.id }),
                                                            });
                                                            const result = await res.json();
                                                            if (res.ok && result.success) {
                                                                setBills(prev => prev.filter(b => b.id !== bill.id));
                                                                if (selectedBill?.id === bill.id) setSelectedBill(null);
                                                            } else {
                                                                alert(result.error || "Erro ao excluir conta");
                                                            }
                                                            setDeletingId(null);
                                                        }}
                                                        disabled={deletingId === bill.id}
                                                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                                                        title="Excluir conta"
                                                    >
                                                        {deletingId === bill.id ? (
                                                            <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Inline expanded detail */}
                                        {isSelected && (
                                            <tr className="bg-muted/10">
                                                <td colSpan={7} className="px-6 py-5">
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                        <div>
                                                            <p className="text-muted-foreground text-xs">Hidrômetro</p>
                                                            <p className="font-mono font-medium">{showAddress ? bill.meter_number : MASK}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground text-xs">Data da Leitura</p>
                                                            <p className="font-medium">{formatDate(bill.reading_date)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground text-xs">Leitura Anterior</p>
                                                            <p className="font-medium">{Number(bill.previous_reading)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground text-xs">Leitura Atual</p>
                                                            <p className="font-medium">{Number(bill.current_reading)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground text-xs">Cons. Real</p>
                                                            <p className="font-medium">{formatNumber(Number(bill.consumption_m3))} m³</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground text-xs">Cons. Faturado</p>
                                                            <p className="font-medium">{formatNumber(Number(bill.billed_consumption_m3))} m³</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground text-xs">Vencimento</p>
                                                            <p className="font-medium">{formatDate(bill.due_date)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground text-xs">Ocorrência</p>
                                                            <p className="font-medium">{bill.occurrence_code || "-"}</p>
                                                        </div>
                                                    </div>

                                                    {/* Tariff breakdown */}
                                                    {Number(bill.water_tariff) > 0 && (
                                                        <div className="mt-4 pt-4 border-t border-border">
                                                            <p className="text-sm font-semibold text-muted-foreground mb-3">Composição da Conta</p>
                                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                                                                <div className="bg-background rounded-lg p-3 border border-border">
                                                                    <p className="text-xs text-muted-foreground">Tarifa de Água</p>
                                                                    <p className="font-semibold">{showValues ? formatCurrency(Number(bill.water_tariff)) : MASK_CURRENCY}</p>
                                                                </div>
                                                                <div className="bg-background rounded-lg p-3 border border-border">
                                                                    <p className="text-xs text-muted-foreground">Tarifa de Esgoto</p>
                                                                    <p className="font-semibold">{showValues ? formatCurrency(Number(bill.sewage_tariff)) : MASK_CURRENCY}</p>
                                                                </div>
                                                                <div className="bg-background rounded-lg p-3 border border-border">
                                                                    <p className="text-xs text-muted-foreground">TBOA (Água)</p>
                                                                    <p className="font-semibold">{showValues ? formatCurrency(Number(bill.water_basic_fee)) : MASK_CURRENCY}</p>
                                                                </div>
                                                                <div className="bg-background rounded-lg p-3 border border-border">
                                                                    <p className="text-xs text-muted-foreground">TBOE (Esgoto)</p>
                                                                    <p className="font-semibold">{showValues ? formatCurrency(Number(bill.sewage_basic_fee)) : MASK_CURRENCY}</p>
                                                                </div>
                                                                <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                                                                    <p className="text-xs text-primary font-medium">Total</p>
                                                                    <p className="font-bold text-primary">{showValues ? formatCurrency(Number(bill.total_amount)) : MASK_CURRENCY}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
