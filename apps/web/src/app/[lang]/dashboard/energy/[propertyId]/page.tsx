"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
    Pencil,
    Trash2,
    CheckCircle2,
    HelpCircle,
    Building2,
    Sparkles,
    FileText,
    Share2,
    LineChart,
    ExternalLink,
    ChevronDown,
    Home,
    Users,
    MapPin,
} from "lucide-react";
import {
    EnergyBalanceChart,
    GenerationBalanceChart,
    FinancialAnalysisChart,
    DailyAvgTrendChart,
    EnergyChartPoint,
} from "@/components/energy/EnergyCharts";
import { EnergyBillUploadModal } from "@/components/energy/EnergyBillUploadModal";
import { HistoricUnitPriceModal } from "@/components/energy/HistoricUnitPriceModal";
import { EnergyDistributorLogo } from "@/components/energy/EnergyDistributorLogo";
import { AddStandaloneUcModal } from "@/components/energy/AddStandaloneUcModal";
import { EditEnergyBillModal } from "@/components/energy/EditEnergyBillModal";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { solarSavings } from "@/lib/energy-savings";
import type { OwnerPropertySummary } from "@/app/api/energy-bills/properties/route";
import { cn } from "@/lib/utils";
import { columnTableKey } from "@/lib/ui-preferences";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityButton, ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";

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
    pdf_url?: string | null;
    created_at: string;
}

const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatNumber = (val: number, decimals = 1) =>
    val.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// Units for the history table (column sums under the header and the cell-selection bar)
const formatKwh = (decimals: number) => (v: number) => `${formatNumber(v, decimals)} kWh`;
const formatDays = (v: number) => `${formatNumber(v, 0)} dias`;
const formatUnitPrice = (v: number) => `R$ ${formatNumber(v, 4)}`;
const dailyAvg = (b: EnergyBillRecord) => b.daily_avg_kwh || (b.grid_consumption_kwh / (b.billing_days || 30));

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
    const searchParams = useSearchParams();
    const lang = (params.lang as string) || "pt";
    const propertyId = params.propertyId as string;
    const [resolvedPropertyId, setResolvedPropertyId] = useState<string>(propertyId);

    const [bills, setBills] = useState<EnergyBillRecord[]>([]);
    const [properties, setProperties] = useState<OwnerPropertySummary[]>([]);
    const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isAddUcOpen, setIsAddUcOpen] = useState(false);
    const [isUnitPriceModalOpen, setIsUnitPriceModalOpen] = useState(false);
    const [editingBill, setEditingBill] = useState<EnergyBillRecord | null>(null);
    const [filterMonths, setFilterMonths] = useState<number>(12);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);
    const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
    const [pdfViewerTitle, setPdfViewerTitle] = useState<string>("Fatura de Energia");
    const [pdfViewerFileName, setPdfViewerFileName] = useState<string>("fatura-energia.pdf");

    const fetchProperties = async () => {
        try {
            const res = await fetch("/api/energy-bills/properties");
            const data = await res.json();
            if (data.success && Array.isArray(data.properties)) {
                setProperties(data.properties);
            }
        } catch (err) {
            console.error("[EnergyDashboard] Failed to fetch properties:", err);
        }
    };

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
                if (data.currentPdfUrl) {
                    setCurrentPdfUrl(data.currentPdfUrl);
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
        fetchProperties();
    }, []);

    useEffect(() => {
        if (searchParams.get("upload") === "true") {
            setIsUploadOpen(true);
        }
    }, [searchParams]);

    useEffect(() => {
        if (propertyId) {
            fetchBills();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propertyId]);

    const currentProperty = useMemo(() => {
        return properties.find((p) => p.id === resolvedPropertyId || p.id === propertyId) || null;
    }, [properties, resolvedPropertyId, propertyId]);

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

    const handleDeleteStandaloneUc = async () => {
        if (!currentProperty) return;
        if (!confirm(`Tem certeza que deseja remover a UC avulsa "${currentProperty.name}" e todo seu histórico?`)) {
            return;
        }
        try {
            const res = await fetch(`/api/energy-bills/properties?id=${currentProperty.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                router.push(`/${lang}/dashboard/energy`);
            } else {
                const data = await res.json();
                alert(data.error || "Erro ao remover UC.");
            }
        } catch (err) {
            console.error("[EnergyDashboard] Delete UC error:", err);
            alert("Erro de conexão ao remover UC.");
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

    // Spreadsheet-style history table: sort/filter per column, hide columns, select cells to sum
    const billColumns = useMemo<ColumnDef<EnergyBillRecord>[]>(() => [
        { key: "month", label: "Mês/Ano", kind: "month", get: b => b.reference_month.slice(0, 7) },
        { key: "cons", label: "Cons. kWh", kind: "number", align: "right", formatSum: formatKwh(0), get: b => b.grid_consumption_kwh },
        { key: "daily", label: "kWh/Dia", kind: "number", align: "right", sum: false, get: b => dailyAvg(b) },
        { key: "days", label: "Dias", kind: "number", align: "right", sum: false, get: b => b.billing_days || 30 },
        { key: "balance", label: "Saldo Atual Geração", kind: "number", align: "right", sum: false, className: "text-emerald-600 dark:text-emerald-400", get: b => b.generation_balance_kwh > 0 ? b.generation_balance_kwh : null },
        { key: "injected", label: "Energia Injetada", kind: "number", align: "right", formatSum: formatKwh(0), className: "text-amber-600 dark:text-amber-400", get: b => b.solar_injected_kwh > 0 ? b.solar_injected_kwh : null },
        { key: "availability", label: "Custo Disponibilidade", kind: "number", align: "right", get: b => b.availability_cost_amount > 0 ? b.availability_cost_amount : null },
        { key: "unitPrice", label: "Preço Unit.", kind: "number", align: "right", sum: false, get: b => b.unit_price ?? null },
        { key: "total", label: "Valor a Pagar", kind: "number", align: "right", get: b => b.total_amount > 0 ? b.total_amount : null },
        { key: "origin", label: "Origem", kind: "enum", align: "center", options: [{ value: "full", label: "Fatura Completa" }, { value: "hist", label: "Histórico Base" }], get: b => b.is_historical_only ? "hist" : "full" },
    ], []);
    const cf = useColumnFilters(filteredBills, billColumns, { key: "month", dir: "desc" });
    const vis = useColumnVisibility(columnTableKey("energy-bills"), { locked: ["month"] });
    const sel = useCellSum({ formatByCol: { cons: formatKwh(0), daily: formatKwh(2), days: formatDays, balance: formatKwh(2), injected: formatKwh(0), unitPrice: formatUnitPrice } });

    // Latest full bill (for current status cards)
    const latestFullBill = useMemo(() => {
        return bills.find((b) => !b.is_historical_only) || bills[0] || null;
    }, [bills]);

    // Active current PDF URL (from latest full bill or currentPdfUrl fallback)
    const activePdfUrl = useMemo(() => {
        return latestFullBill?.pdf_url || currentPdfUrl || null;
    }, [currentPdfUrl, latestFullBill]);

    // Formatted due date (Vencimento ex: 17/09/2026)
    const formattedDueDate = useMemo(() => {
        if (!latestFullBill?.due_date) return null;
        const match = latestFullBill.due_date.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return `${match[3]}/${match[2]}/${match[1]}`;
        }
        return latestFullBill.due_date;
    }, [latestFullBill]);

    // Summary calculations
    const summary = useMemo(() => {
        if (!latestFullBill) return null;

        const currentBalance = latestFullBill.generation_balance_kwh || 0;
        const currentInjected = latestFullBill.solar_injected_kwh || 0;
        const currentCompensated = latestFullBill.solar_compensated_kwh || 0;
        const currentSurplus = Math.max(0, currentInjected - currentCompensated);
        const currentConsumption = latestFullBill.grid_consumption_kwh || 0;
        const currentDailyAvg = latestFullBill.daily_avg_kwh || (currentConsumption / (latestFullBill.billing_days || 30));
        const currentTotal = latestFullBill.total_amount || 0;
        const currentAvailability = latestFullBill.availability_cost_amount || 0;
        const currentUnitPrice = latestFullBill.unit_price || 0;
        
        // What the utility actually credited on the bill; kWh × tariff only as a marked estimate.
        const savings = solarSavings(latestFullBill);
        const currentSavings = savings.amount;

        // Period totals
        const totalConsumptionPeriod = filteredBills.reduce((acc, b) => acc + (Number(b.grid_consumption_kwh) || 0), 0);
        const avgConsumptionPeriod = filteredBills.length > 0 ? totalConsumptionPeriod / filteredBills.length : 0;

        return {
            currentBalance,
            currentInjected,
            currentCompensated,
            currentSurplus,
            currentConsumption,
            currentDailyAvg,
            currentTotal,
            currentAvailability,
            currentUnitPrice,
            currentSavings,
            currentSavingsEstimated: savings.estimated,
            missingCompensatedKwh: savings.missingCompensatedKwh,
            avgConsumptionPeriod,
        };
    }, [latestFullBill, filteredBills]);

    // Prepare chronological chart dataset
    const chartData: EnergyChartPoint[] = useMemo(() => {
        return [...filteredBills]
            .sort((a, b) => a.reference_month.localeCompare(b.reference_month))
            .map((b) => {
                const compensatedKwh = Number(b.solar_compensated_kwh) || 0;
                const unitPrice = Number(b.unit_price) || 0;
                const billSavings = solarSavings(b);
                const calculatedSavings = billSavings.amount;

                return {
                    reference_month: b.reference_month,
                    date_label: b.reference_month_label || formatMonthLabel(b.reference_month),
                    grid_consumption_kwh: Number(b.grid_consumption_kwh) || 0,
                    solar_injected_kwh: Number(b.solar_injected_kwh) || 0,
                    solar_compensated_kwh: compensatedKwh,
                    generation_balance_kwh: Number(b.generation_balance_kwh) || 0,
                    daily_avg_kwh: Number(b.daily_avg_kwh) || (Number(b.grid_consumption_kwh) / (b.billing_days || 30)),
                    total_amount: Number(b.total_amount) || 0,
                    availability_cost_amount: Number(b.availability_cost_amount) || 0,
                    estimated_savings: calculatedSavings,
                    savings_estimated: billSavings.estimated,
                    unit_price: unitPrice,
                    is_historical_only: b.is_historical_only,
                };
            });
    }, [filteredBills]);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Header & Navigation */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link
                            href={`/${lang}/dashboard/energy`}
                            className="inline-flex items-center font-medium hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Painel Solar
                        </Link>
                        <span className="text-border">•</span>
                        <Link
                            href={`/${lang}/imoveis`}
                            className="inline-flex items-center font-medium hover:text-foreground transition-colors"
                        >
                            Imóveis
                        </Link>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-600 self-start sm:self-auto">
                            <Sun className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                                    Gestão de Energia Solar & Consumo
                                </h1>

                                {/* Property Selector Switcher */}
                                {properties.length > 1 ? (
                                    <div className="relative inline-flex items-center">
                                        <div className="flex items-center gap-1.5 bg-card border border-amber-400/60 dark:border-amber-500/40 rounded-xl px-3 py-1 shadow-2xs hover:border-amber-500 transition-colors">
                                            <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                                            <span className="text-xs font-semibold text-muted-foreground">Unidade:</span>
                                            <select
                                                value={resolvedPropertyId || propertyId}
                                                onChange={(e) => {
                                                    const newId = e.target.value;
                                                    if (newId && newId !== (resolvedPropertyId || propertyId)) {
                                                        router.push(`/${lang}/dashboard/energy/${newId}`);
                                                    }
                                                }}
                                                className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer pr-1"
                                                aria-label="Selecionar Unidade para Análise"
                                            >
                                                {properties.map((p) => (
                                                    <option key={p.id} value={p.id} className="bg-popover text-popover-foreground">
                                                        {p.name} {p.isStandaloneUc ? (p.ucCategory === "residencia_propria" ? "🏠 (Casa Própria)" : p.ucCategory === "parente" ? "👨‍👩‍👧 (Parente)" : "⚡ (Beneficiária)") : "🏢 (Aluguel GD)"}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ) : currentProperty ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                                        {currentProperty.isStandaloneUc ? (
                                            <Home className="w-3.5 h-3.5 text-blue-600" />
                                        ) : (
                                            <Building2 className="w-3.5 h-3.5 text-amber-600" />
                                        )}
                                        {currentProperty.name}
                                    </span>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {currentProperty?.address && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                                        <MapPin className="w-3 h-3 text-muted-foreground" />
                                        {currentProperty.address}
                                    </span>
                                )}
                                {latestFullBill?.consumer_unit && (
                                    <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full font-mono">
                                        UC: {latestFullBill.consumer_unit}
                                    </span>
                                )}

                                {/* Category Badge for Standalone UC or Rental GD */}
                                {currentProperty?.isStandaloneUc ? (
                                    <>
                                        {currentProperty.ucCategory === "residencia_propria" && (
                                            <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <Home className="w-3 h-3 text-blue-500" />
                                                Residência Própria (UC Avulsa)
                                            </span>
                                        )}
                                        {currentProperty.ucCategory === "parente" && (
                                            <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <Users className="w-3 h-3 text-emerald-500" />
                                                Casa de Parente (Fornecimento de Energia)
                                            </span>
                                        )}
                                        {currentProperty.ucCategory === "beneficiaria" && (
                                            <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <Zap className="w-3 h-3 text-amber-500" />
                                                Unidade Beneficiária (GD)
                                            </span>
                                        )}
                                        {(!currentProperty.ucCategory || currentProperty.ucCategory === "outro") && (
                                            <span className="text-xs bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <Building2 className="w-3 h-3 text-purple-500" />
                                                UC Avulsa
                                            </span>
                                        )}
                                        {currentProperty.notes && (
                                            <span className="text-xs text-muted-foreground italic">
                                                ({currentProperty.notes})
                                            </span>
                                        )}
                                        <button
                                            onClick={handleDeleteStandaloneUc}
                                            className="text-xs text-muted-foreground hover:text-red-600 flex items-center gap-1 ml-1 transition-colors"
                                            title="Excluir esta UC avulsa"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            Remover UC
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                        <Sun className="w-3 h-3" />
                                        {currentProperty?.solarKwp ? `Microgeração GD • ${currentProperty.solarKwp} kWp` : "Microgeração Distribuída (GD)"}
                                    </span>
                                )}

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
                <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
                    {currentProperty && !currentProperty.isStandaloneUc && !currentProperty.isOrphaned && (
                        <Link href={`/${lang}/imoveis?id=${currentProperty.id}`}>
                            <Button
                                variant="outline"
                                className="gap-2 text-sm font-medium text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Voltar ao Imóvel
                            </Button>
                        </Link>
                    )}

                    <Button
                        variant="outline"
                        onClick={() => setIsAddUcOpen(true)}
                        className="gap-2 text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Nova UC Avulsa
                    </Button>

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
                            Faça o upload de uma conta de luz recente da concessionária (ex: CEMIG). Nossa IA extrairá automaticamente o consumo, geração injetada, saldo de créditos e 13 meses de histórico, mantendo arquivado apenas o PDF da fatura vigente.
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
                    {/* Energy Distributor & Current PDF Bill Banner */}
                    <div className="bg-card border border-border/80 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4 bg-gradient-to-r from-card via-card to-emerald-500/5">
                        {/* Distributor Dynamic Logo */}
                        <div className="shrink-0 px-3.5 py-2.5 bg-white dark:bg-card border border-border rounded-xl shadow-2xs flex items-center justify-center">
                            <EnergyDistributorLogo companyName={latestFullBill?.utility_company || "CEMIG"} size="md" />
                        </div>

                        {/* Short & Concise Info: Fatura Vigente, Vencimento & Link to open */}
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                                <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                                    Fatura Vigente:
                                </span>
                                <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">
                                    {latestFullBill?.reference_month_label || formatMonthLabel(latestFullBill?.reference_month || "")}
                                </span>

                                {formattedDueDate && (
                                    <>
                                        <span className="text-muted-foreground">•</span>
                                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                                            Vencimento:
                                        </span>
                                        <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">
                                            {formattedDueDate}
                                        </span>
                                    </>
                                )}
                            </div>

                            <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                <span>Visualizar fatura original em PDF</span>
                                {activePdfUrl ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPdfViewerUrl(activePdfUrl);
                                            setPdfViewerTitle(`Fatura de Energia - ${currentProperty?.consumerUnit || latestFullBill?.consumer_unit || "CEMIG"} - ${latestFullBill?.reference_month_label || formatMonthLabel(latestFullBill?.reference_month || "")}`);
                                            setPdfViewerFileName(`fatura-energia-${latestFullBill?.reference_month || "atual"}.pdf`);
                                            setIsPdfViewerOpen(true);
                                        }}
                                        className="font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 inline-flex items-center gap-1 cursor-pointer transition-colors"
                                    >
                                        clicando aqui <FileText className="w-3.5 h-3.5 inline" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setIsUploadOpen(true)}
                                        className="font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 inline-flex items-center gap-1 cursor-pointer transition-colors"
                                    >
                                        clicando aqui para enviar o PDF <ExternalLink className="w-3.5 h-3.5 inline" />
                                    </button>
                                )}
                                .
                            </p>
                        </div>
                    </div>

                    {/* Top 7 KPI Metric Summary Cards */}
                    {summary && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
                            {/* Card 1: Saldo de Créditos */}
                            <div className="bg-card border border-emerald-300 dark:border-emerald-800/60 rounded-xl p-4 shadow-xs space-y-1 bg-gradient-to-br from-emerald-50/40 dark:from-emerald-950/20 to-transparent">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                        Saldo de Créditos
                                    </span>
                                    <BatteryCharging className="w-4 h-4 text-emerald-600" />
                                </div>
                                <p className="text-2xl font-black text-emerald-800 dark:text-emerald-200">
                                    {formatNumber(summary.currentBalance, 0)} <span className="text-sm font-normal">kWh</span>
                                </p>
                                <p className="text-[11px] text-emerald-600/90 dark:text-emerald-400">
                                    Créditos históricos nesta UC
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
                                    {formatNumber(summary.currentInjected, 0)} <span className="text-sm font-normal text-muted-foreground">kWh</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Total gerado e enviado à rede
                                </p>
                            </div>

                            {/* Card 3: Compensação Local */}
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-sky-600">
                                        Compensação Local
                                    </span>
                                    <Zap className="w-4 h-4 text-sky-500" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">
                                    {formatNumber(summary.currentCompensated, 0)} <span className="text-sm font-normal text-muted-foreground">kWh</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Abatido do consumo nesta UC
                                </p>
                            </div>

                            {/* Card 4: Excedente para Outras UCs */}
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-purple-600">
                                        Excedente p/ Outras UCs
                                    </span>
                                    <Share2 className="w-4 h-4 text-purple-500" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">
                                    {formatNumber(summary.currentSurplus, 0)} <span className="text-sm font-normal text-muted-foreground">kWh</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Injetada − Compensação Local
                                </p>
                            </div>

                            {/* Card 5: Valor a Pagar */}
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

                            {/* Card 6: Preço Unitário (Clickable -> Opens Historical Chart Modal) */}
                            <div
                                onClick={() => setIsUnitPriceModalOpen(true)}
                                className="bg-card border border-border hover:border-sky-500/60 rounded-xl p-4 shadow-xs space-y-1 cursor-pointer transition-all hover:shadow-md group relative"
                                title="Clique para visualizar o gráfico histórico do Preço Unitário"
                            >
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider group-hover:text-sky-600 transition-colors">
                                        Preço Unitário
                                    </span>
                                    <LineChart className="w-4 h-4 text-muted-foreground group-hover:text-sky-600 transition-colors" />
                                </div>
                                <p className="text-xl font-bold text-foreground font-mono">
                                    R$ {formatNumber(summary.currentUnitPrice, 4)}
                                </p>
                                <p className="text-[11px] text-sky-600 dark:text-sky-400 flex items-center gap-1 font-medium">
                                    Ver histórico <ExternalLink className="w-3 h-3 inline" />
                                </p>
                            </div>

                            {/* Card 7: Economia Solar */}
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1 bg-gradient-to-br from-amber-50/40 dark:from-amber-950/20 to-transparent">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                                        Economia Solar{summary.currentSavingsEstimated ? " (estimada)" : ""}
                                    </span>
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                </div>
                                <p className="text-2xl font-black text-amber-700 dark:text-amber-300">
                                    {formatCurrency(summary.currentSavings)}
                                </p>
                                <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
                                    {summary.missingCompensatedKwh
                                        ? "kWh compensados não informados: edite a fatura"
                                        : `${formatNumber(summary.currentCompensated, 0)} kWh compensados no mês`}
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
                                    Comparativo Financeiro: Fatura Paga vs. Economia Solar Compensada (R$)
                                </h3>
                                <span className="text-xs text-muted-foreground">Créditos Abatidos Localmente</span>
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

                    {/* Histórico de Consumo (spreadsheet-style table: sort/filter per column, hide columns, select cells to sum) */}
                    <div className="bg-card border border-border rounded-xl shadow-xs">
                        <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-muted/20 rounded-t-xl">
                            <div>
                                <h3 className="text-base font-semibold text-foreground">Histórico de Consumo Detalhado</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Registros de consumo, injeção solar, saldo de créditos e custos por ciclo de faturamento · clique no cabeçalho para ordenar e filtrar; selecione células para somar; duplo clique edita
                                </p>
                            </div>
                            <div className="flex items-center gap-2 self-start sm:self-auto">
                                <ColumnVisibilityButton ctl={vis} />
                                <span className="text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
                                    {cf.anyFilter ? `${cf.rows.length} de ${filteredBills.length}` : filteredBills.length} {filteredBills.length === 1 ? "registro" : "registros"}
                                </span>
                            </div>
                        </div>

                        {cf.anyFilter && (
                            <div className="px-4 pt-3">
                                <FilterChips columns={billColumns} ctl={cf} />
                            </div>
                        )}

                        {cf.rows.length === 0 ? (
                            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                                Nenhum registro com os filtros atuais. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto px-2 pb-2">
                                <table className="w-full text-xs">
                                    <thead>
                                        <ColumnHeaders columns={billColumns} ctl={cf} visibility={vis} trailing={<th className="px-2 py-2 font-semibold text-center">Ações</th>} />
                                    </thead>
                                    <tbody>
                                        {cf.rows.map((b) => {
                                            const daily = dailyAvg(b);
                                            const show = (key: string) => !vis.isHidden(key);
                                            const num = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
                                            return (
                                                <tr key={b.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors" onDoubleClick={() => setEditingBill(b)}>
                                                    <td {...sel.cellProps("month", b.id, null, "px-2 py-1.5 font-semibold text-foreground whitespace-nowrap")}>
                                                        {b.reference_month_label || formatMonthLabel(b.reference_month)}
                                                    </td>
                                                    {show("cons") && (
                                                        <td {...sel.cellProps("cons", b.id, b.grid_consumption_kwh, cn(num, "font-medium"))}>
                                                            {formatNumber(b.grid_consumption_kwh, 0)}
                                                        </td>
                                                    )}
                                                    {show("daily") && (
                                                        <td {...sel.cellProps("daily", b.id, daily, cn(num, "font-mono"))}>
                                                            {formatNumber(daily, 2)}
                                                        </td>
                                                    )}
                                                    {show("days") && (
                                                        <td {...sel.cellProps("days", b.id, b.billing_days || 30, cn(num, "text-muted-foreground"))}>
                                                            {b.billing_days || 30}
                                                        </td>
                                                    )}
                                                    {show("balance") && (
                                                        <td {...sel.cellProps("balance", b.id, b.generation_balance_kwh > 0 ? b.generation_balance_kwh : null, cn(num, "font-semibold text-emerald-700 dark:text-emerald-300"))}>
                                                            {b.generation_balance_kwh > 0 ? `${formatNumber(b.generation_balance_kwh, 2)} kWh` : "-"}
                                                        </td>
                                                    )}
                                                    {show("injected") && (
                                                        <td {...sel.cellProps("injected", b.id, b.solar_injected_kwh > 0 ? b.solar_injected_kwh : null, cn(num, "font-semibold text-amber-600 dark:text-amber-400"))}>
                                                            {b.solar_injected_kwh > 0 ? `${formatNumber(b.solar_injected_kwh, 0)} kWh` : "-"}
                                                        </td>
                                                    )}
                                                    {show("availability") && (
                                                        <td {...sel.cellProps("availability", b.id, b.availability_cost_amount > 0 ? b.availability_cost_amount : null, cn(num, "text-muted-foreground"))}>
                                                            {b.availability_cost_amount > 0 ? formatCurrency(b.availability_cost_amount) : "-"}
                                                        </td>
                                                    )}
                                                    {show("unitPrice") && (
                                                        <td {...sel.cellProps("unitPrice", b.id, b.unit_price ?? null, cn(num, "font-mono text-muted-foreground"))}>
                                                            {b.unit_price ? `R$ ${formatNumber(b.unit_price, 4)}` : "-"}
                                                        </td>
                                                    )}
                                                    {show("total") && (
                                                        <td {...sel.cellProps("total", b.id, b.total_amount > 0 ? b.total_amount : null, cn(num, "font-bold text-foreground"))}>
                                                            {b.total_amount > 0 ? formatCurrency(b.total_amount) : "-"}
                                                        </td>
                                                    )}
                                                    {show("origin") && (
                                                        <td {...sel.cellProps("origin", b.id, null, "px-2 py-1.5 text-center whitespace-nowrap")}>
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
                                                    )}
                                                    <td className="px-2 py-1.5 text-center whitespace-nowrap" onDoubleClick={(ev) => ev.stopPropagation()}>
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {(b.pdf_url || (b.id === latestFullBill?.id && activePdfUrl)) && (
                                                                <button
                                                                    onClick={() => {
                                                                        const billPdf = b.pdf_url || activePdfUrl;
                                                                        if (billPdf) {
                                                                            setPdfViewerUrl(billPdf);
                                                                            setPdfViewerTitle(`Fatura de Energia - ${b.reference_month_label || formatMonthLabel(b.reference_month)}`);
                                                                            setPdfViewerFileName(`fatura-${b.reference_month}.pdf`);
                                                                            setIsPdfViewerOpen(true);
                                                                        }
                                                                    }}
                                                                    className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 transition-colors shadow-2xs"
                                                                    title="Visualizar fatura em PDF dentro do Kitnets"
                                                                    aria-label="Visualizar fatura em PDF"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => setEditingBill(b)}
                                                                className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/60 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 transition-colors shadow-2xs"
                                                                title="Editar valores desta fatura"
                                                                aria-label="Editar fatura"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(b.id)}
                                                                disabled={deletingId === b.id}
                                                                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                                                title="Excluir registro"
                                                                aria-label="Excluir registro"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Zero-Storage Upload Modal - Strictly for Importing New Bills */}
            {isUploadOpen && (
                <EnergyBillUploadModal
                    isOpen={isUploadOpen}
                    onClose={() => setIsUploadOpen(false)}
                    propertyId={resolvedPropertyId || propertyId}
                    onSuccess={() => {
                        setIsUploadOpen(false);
                        fetchBills();
                    }}
                />
            )}

            {/* Historic Unit Price Modal */}
            <HistoricUnitPriceModal
                isOpen={isUnitPriceModalOpen}
                onClose={() => setIsUnitPriceModalOpen(false)}
                bills={bills}
                currentUnitPrice={summary?.currentUnitPrice}
            />

            {/* Add Standalone UC Modal */}
            <AddStandaloneUcModal
                isOpen={isAddUcOpen}
                onClose={() => setIsAddUcOpen(false)}
                onSuccess={(newProperty) => {
                    setProperties((prev) => [newProperty, ...prev]);
                    router.push(`/${lang}/dashboard/energy/${newProperty.id}`);
                }}
            />

            {/* Edit Energy Bill Modal - Dedicated for Bottom Table Editing */}
            {editingBill && (
                <EditEnergyBillModal
                    isOpen={!!editingBill}
                    onClose={() => setEditingBill(null)}
                    bill={editingBill}
                    onSuccess={() => {
                        setEditingBill(null);
                        fetchBills();
                    }}
                />
            )}
            {/* Spreadsheet helpers for the history table: selection sum bar, column sort/filter and columns menus */}
            <CellSumBar ctl={sel} />
            <ColumnMenu columns={billColumns} ctl={cf} />
            <ColumnVisibilityMenu columns={billColumns} ctl={vis} />

            {/* In-App PDF Document Viewer */}
            {isPdfViewerOpen && pdfViewerUrl && (
                <PdfViewerModal
                    isOpen={isPdfViewerOpen}
                    onClose={() => setIsPdfViewerOpen(false)}
                    url={pdfViewerUrl}
                    title={pdfViewerTitle}
                    fileName={pdfViewerFileName}
                />
            )}
        </div>
    );
}

