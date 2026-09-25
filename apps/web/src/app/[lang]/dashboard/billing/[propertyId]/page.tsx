"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@kitnets/ui";
import {
    ArrowLeft,
    BarChart3,
    Building2,
    Calendar,
    DollarSign,
    Droplets,
    FileText,
    Gauge,
    Link2,
    MapPin,
    Pencil,
    Plus,
    Trash2,
    TrendingUp,
    Upload,
} from "lucide-react";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import AgencyLogo from "@/components/imobiliaria/AgencyLogo";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";
import { cn } from "@/lib/utils";
import { columnTableKey, recordTableKey } from "@/lib/ui-preferences";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { parseMoneyText } from "@/components/properties/MoneyInput";

/**
 * Water bills dashboard of one property (/dashboard/billing/<propertyId>).
 * Source of truth: the water utility's bills (water_bills). The optional
 * ?gateway= query only keeps a way back to the founder-only gateway page.
 */

interface Bill {
    id: string;
    reference_month: string;
    meter_number: string | null;
    previous_reading: number | null;
    current_reading: number | null;
    consumption_m3: number;
    billed_consumption_m3: number | null;
    reading_date: string | null;
    reading_date_orig: string | null;
    due_date: string | null;
    water_tariff: number;
    sewage_tariff: number;
    water_basic_fee: number;
    sewage_basic_fee: number;
    total_amount: number;
    effective_rate_per_m3: number | null;
    occurrence_code: string | null;
    average_consumption_m3: number | null;
    notes: string | null;
    bill_pdf_url: string | null;
}

interface Property {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    connection_code: string | null;
}

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PERIODS = [
    { label: "12 Meses", val: 12 },
    { label: "24 Meses", val: 24 },
    { label: "36 Meses", val: 36 },
    { label: "60 Meses", val: 60 },
    { label: "Tudo", val: 0 },
];

const formatMonth = (ref: string) => {
    const [year, month] = ref.split("-");
    const name = MONTH_NAMES[parseInt(month, 10) - 1];
    return name ? `${name}/${year}` : ref;
};
const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatNumber = (v: number, decimals = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const [y, m, d] = dateStr.slice(0, 10).split("-");
    return d && m && y ? `${d}/${m}/${y}` : dateStr;
};
const formatM3 = (decimals: number) => (v: number) => `${formatNumber(v, decimals)} m³`;
const formatRate = (v: number) => `R$ ${formatNumber(v, 2)}/m³`;
const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** PostgREST returns numeric columns as strings: normalise once. */
function normaliseBill(raw: Record<string, unknown>): Bill {
    const consumption = num(raw.consumption_m3) ?? 0;
    const total = num(raw.total_amount) ?? 0;
    return {
        id: String(raw.id),
        reference_month: String(raw.reference_month),
        meter_number: (raw.meter_number as string | null) ?? null,
        previous_reading: num(raw.previous_reading),
        current_reading: num(raw.current_reading),
        consumption_m3: consumption,
        billed_consumption_m3: num(raw.billed_consumption_m3),
        reading_date: (raw.reading_date as string | null) ?? null,
        reading_date_orig: (raw.reading_date_orig as string | null) ?? null,
        due_date: (raw.due_date as string | null) ?? null,
        water_tariff: num(raw.water_tariff) ?? 0,
        sewage_tariff: num(raw.sewage_tariff) ?? 0,
        water_basic_fee: num(raw.water_basic_fee) ?? 0,
        sewage_basic_fee: num(raw.sewage_basic_fee) ?? 0,
        total_amount: total,
        effective_rate_per_m3: num(raw.effective_rate_per_m3) ?? (consumption > 0 ? Math.round((total / consumption) * 100) / 100 : null),
        occurrence_code: (raw.occurrence_code as string | null) ?? null,
        average_consumption_m3: num(raw.average_consumption_m3),
        notes: (raw.notes as string | null) ?? null,
        bill_pdf_url: (raw.bill_pdf_url as string | null) ?? null,
    };
}

/** Body of POST /api/water-bills (upsert on property + month) for a whole bill. */
function toBillInput(b: Bill) {
    return {
        referenceMonth: b.reference_month,
        meterNumber: b.meter_number,
        previousReading: b.previous_reading,
        currentReading: b.current_reading,
        consumptionM3: b.consumption_m3,
        billedConsumptionM3: b.billed_consumption_m3,
        readingDate: b.reading_date?.slice(0, 10) ?? null,
        readingDateOrig: b.reading_date_orig?.slice(0, 10) ?? null,
        dueDate: b.due_date?.slice(0, 10) ?? null,
        totalAmount: b.total_amount,
        waterTariff: b.water_tariff,
        sewageTariff: b.sewage_tariff,
        waterBasicFee: b.water_basic_fee,
        sewageBasicFee: b.sewage_basic_fee,
        occurrenceCode: b.occurrence_code,
        averageConsumptionM3: b.average_consumption_m3,
        notes: b.notes,
    };
}

/** Bill fields edited straight in the table (double-click / Enter on the cell) */
type InlineField = "consumption_m3" | "billed_consumption_m3" | "previous_reading" | "current_reading" | "water_tariff" | "sewage_tariff" | "water_basic_fee" | "sewage_basic_fee" | "total_amount";

const CELL_INPUT = "text-right bg-transparent border border-transparent hover:border-border focus:border-blue-500 focus:bg-background rounded-none w-full min-w-[4rem] px-1.5 py-1 outline-none tabular-nums";

/** Editable number cell: formatted with its unit at rest, a plain number while editing. */
function UnitInput({ value, draft, onDraft, onCommit, decimals, prefix = "", suffix = "", dashWhenEmpty, disabled, className }: {
    value: number | null | undefined;
    draft?: string;
    onDraft: (text: string) => void;
    onCommit: () => void;
    decimals: number;
    prefix?: string;
    suffix?: string;
    /** show "-" for null / 0 */
    dashWhenEmpty?: boolean;
    disabled?: boolean;
    className?: string;
}) {
    const [editing, setEditing] = useState(false);
    const fmt = (n: number) => `${prefix}${formatNumber(n, decimals)}${suffix}`;
    const empty = value === null || value === undefined || !Number.isFinite(value) || (dashWhenEmpty && value <= 0);
    const parsedDraft = draft !== undefined ? parseMoneyText(draft) : null;
    const rest = draft !== undefined ? (parsedDraft === null ? draft : fmt(parsedDraft)) : empty ? "-" : fmt(value as number);
    const text = editing ? (draft ?? (value === null || value === undefined ? "" : String(Number((value as number).toFixed(decimals))))) : rest;
    return (
        <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={text}
            onFocus={ev => { setEditing(true); requestAnimationFrame(() => ev.target.select()); }}
            onChange={ev => onDraft(ev.target.value)}
            onBlur={() => { setEditing(false); onCommit(); }}
            onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
            className={cn(CELL_INPUT, className)}
        />
    );
}

export default function BillingPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const lang = (params.lang as string) || "pt";
    const propertyId = params.propertyId as string;
    const gatewayId = searchParams.get("gateway");

    const [property, setProperty] = useState<Property | null>(null);
    const [bills, setBills] = useState<Bill[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [filterMonths, setFilterMonths] = useState<number>(12);

    // The current bill's PDF and the utility's logo, kept in the water-bills bucket (signed URLs from the API)
    const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [pdfOpen, setPdfOpen] = useState(false);
    const [docBusy, setDocBusy] = useState(false);
    const [docError, setDocError] = useState<string | null>(null);
    const [docNotice, setDocNotice] = useState<string | null>(null);
    const docInput = React.useRef<HTMLInputElement>(null);

    // Orphaned bills (property_id IS NULL — from deleted properties)
    const [orphanedBills, setOrphanedBills] = useState<{ id: string; reference_month: string }[]>([]);
    const [claimingOrphans, setClaimingOrphans] = useState(false);

    const fetchBills = async () => {
        const res = await fetch(`/api/water-bills?propertyId=${encodeURIComponent(propertyId)}`);
        if (!res.ok) return;
        const data = await res.json();
        const { property: propData, bills: billsData } = data;
        setCurrentPdfUrl(typeof data.currentPdfUrl === "string" ? data.currentPdfUrl : null);
        setLogoUrl(typeof data.logoUrl === "string" ? data.logoUrl : null);
        if (propData) setProperty(propData);
        if (Array.isArray(billsData)) setBills(billsData.map(normaliseBill));
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                await fetchBills();
            } catch (err) {
                console.error("[WaterDashboard] Failed to load water bills:", err);
            } finally {
                setLoading(false);
            }
            try {
                const res = await fetch("/api/water-bills/orphaned");
                if (res.ok) {
                    const { bills: orphans } = await res.json();
                    if (Array.isArray(orphans) && orphans.length > 0) setOrphanedBills(orphans);
                }
            } catch { /* not critical */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propertyId]);

    const handleClaimOrphans = async () => {
        if (orphanedBills.length === 0) return;
        setClaimingOrphans(true);
        try {
            const res = await fetch("/api/water-bills/orphaned", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ billIds: orphanedBills.map(b => b.id), propertyId }),
            });
            if (res.ok) {
                await fetchBills();
                setOrphanedBills([]);
            }
        } catch (err) {
            console.error("[WaterDashboard] Failed to claim orphaned bills:", err);
        } finally {
            setClaimingOrphans(false);
        }
    };

    const handleDelete = async (bill: Bill) => {
        if (!confirm(`Excluir a conta de ${formatMonth(bill.reference_month)}?`)) return;
        setDeletingId(bill.id);
        try {
            const res = await fetch("/api/delete-bill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ billId: bill.id }),
            });
            const result = await res.json().catch(() => ({}));
            if (res.ok && result.success) setBills(prev => prev.filter(b => b.id !== bill.id));
            else alert(result.error || "Erro ao excluir conta");
        } finally {
            setDeletingId(null);
        }
    };

    // ── The current bill's PDF (one per property, like the energy bills) ──
    const uploadDocument = async (file: File) => {
        setDocBusy(true);
        setDocError(null);
        setDocNotice(null);
        try {
            const body = new FormData();
            body.append("file", file);
            if (bills[0]) body.append("referenceMonth", bills[0].reference_month);
            const res = await fetch(`/api/water-bills/document/${propertyId}`, { method: "POST", body });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setDocError(typeof json.error === "string" ? json.error : "Não foi possível guardar o PDF."); return; }
            setCurrentPdfUrl(typeof json.currentPdfUrl === "string" ? json.currentPdfUrl : null);
            setLogoUrl(typeof json.logoUrl === "string" ? json.logoUrl : null);
            setDocNotice(json.logoExtracted ? "PDF guardado. O logo da concessionária foi lido do cabeçalho e virou a capa do imóvel em Água." : json.pdfStored ? "PDF da conta vigente guardado." : "Há uma conta mais recente lançada: o PDF não substituiu o vigente.");
        } catch {
            setDocError("Erro de conexão ao enviar o PDF.");
        } finally {
            setDocBusy(false);
        }
    };
    const removeDocument = async () => {
        if (!confirm("Remover o PDF da conta vigente?")) return;
        setDocBusy(true);
        setDocError(null);
        const res = await fetch(`/api/water-bills/document/${propertyId}`, { method: "DELETE" });
        setDocBusy(false);
        if (!res.ok) { setDocError("Não foi possível remover o PDF."); return; }
        setCurrentPdfUrl(null);
        setDocNotice(null);
    };

    // ── Period (charts + table) ─────────────────────────────────────────
    const filteredBills = useMemo(() => {
        if (bills.length === 0 || filterMonths === 0) return bills;
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth() - filterMonths, 1);
        const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
        return bills.filter(b => b.reference_month >= cutoffStr);
    }, [bills, filterMonths]);

    const latest = bills[0] ?? null;   // API returns newest first

    const summary = useMemo(() => {
        if (filteredBills.length === 0) return null;
        const totalCost = filteredBills.reduce((s, b) => s + b.total_amount, 0);
        const totalM3 = filteredBills.reduce((s, b) => s + b.consumption_m3, 0);
        const highest = filteredBills.reduce((max, b) => (b.total_amount > max.total_amount ? b : max), filteredBills[0]);
        return {
            months: filteredBills.length,
            totalCost,
            totalM3,
            avgCost: totalCost / filteredBills.length,
            avgM3: totalM3 / filteredBills.length,
            highest,
        };
    }, [filteredBills]);

    const chartData = useMemo(
        () => [...filteredBills]
            .sort((a, b) => a.reference_month.localeCompare(b.reference_month))
            .map(b => ({ date_label: formatMonth(b.reference_month), consumption: b.consumption_m3, cost: b.total_amount })),
        [filteredBills],
    );

    // ── Spreadsheet-style history table ─────────────────────────────────
    const columns = useMemo<ColumnDef<Bill>[]>(() => [
        { key: "month", label: "Mês/Ano", kind: "month", get: b => b.reference_month.slice(0, 7) },
        { key: "consumption", label: "Consumo", kind: "number", align: "right", formatSum: formatM3(1), title: "Consumo medido (m³)", get: b => b.consumption_m3 },
        { key: "billed", label: "Faturado", kind: "number", align: "right", formatSum: formatM3(1), title: "Consumo faturado (m³)", get: b => b.billed_consumption_m3 },
        { key: "prevReading", label: "Leit. anterior", kind: "number", align: "right", sum: false, get: b => b.previous_reading },
        { key: "currReading", label: "Leit. atual", kind: "number", align: "right", sum: false, get: b => b.current_reading },
        { key: "readingDate", label: "Data leitura", kind: "date", align: "right", get: b => b.reading_date?.slice(0, 10) ?? null },
        { key: "dueDate", label: "Vencimento", kind: "date", align: "right", get: b => b.due_date?.slice(0, 10) ?? null },
        { key: "waterTariff", label: "Tarifa água", kind: "number", align: "right", get: b => b.water_tariff },
        { key: "sewageTariff", label: "Tarifa esgoto", kind: "number", align: "right", get: b => b.sewage_tariff },
        { key: "waterFee", label: "TBOA", kind: "number", align: "right", title: "Tarifa básica operacional de água", get: b => b.water_basic_fee },
        { key: "sewageFee", label: "TBOE", kind: "number", align: "right", title: "Tarifa básica operacional de esgoto", get: b => b.sewage_basic_fee },
        { key: "total", label: "Valor", kind: "number", align: "right", get: b => b.total_amount },
        { key: "rate", label: "R$/m³", kind: "number", align: "right", sum: false, title: "Valor ÷ consumo", get: b => b.effective_rate_per_m3 },
        { key: "occurrence", label: "Ocorrência", kind: "text", get: b => b.occurrence_code ?? "" },
    ], []);
    const cf = useColumnFilters(filteredBills, columns, { key: "month", dir: "desc" }, {
        storageKey: columnTableKey("water-bills"),
        filtersKey: recordTableKey("water-bills", propertyId),
    });
    const vis = useColumnVisibility(columnTableKey("water-bills"), {
        locked: ["month"],
        defaultHidden: ["prevReading", "currReading", "readingDate", "waterTariff", "sewageTariff", "waterFee", "sewageFee", "occurrence"],
    });
    const sel = useCellSum({ formatByCol: { consumption: formatM3(1), billed: formatM3(1), prevReading: v => formatNumber(v, 0), currReading: v => formatNumber(v, 1), rate: formatRate } });

    // Inline edits: draft while typing, save on blur/Enter through the upsert (optimistic, reverted on failure)
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
    const [inlineError, setInlineError] = useState<string | null>(null);
    const draftKey = (id: string, field: InlineField) => `${id}:${field}`;
    const setDraft = (id: string, field: InlineField, text: string) => setDrafts(d => ({ ...d, [draftKey(id, field)]: text }));
    const cancelDraft = (id: string, field: InlineField) => setDrafts(d => { const n = { ...d }; delete n[draftKey(id, field)]; return n; });
    const commitDraft = async (b: Bill, field: InlineField) => {
        const k = draftKey(b.id, field);
        const raw = drafts[k];
        if (raw === undefined) return;
        cancelDraft(b.id, field);
        const value = parseMoneyText(raw);
        if (value === null || value < 0) return;
        if (value === (b[field] ?? 0)) return;
        if ((field === "consumption_m3" || field === "total_amount") && value <= 0) {
            setInlineError(field === "consumption_m3" ? "O consumo deve ser maior que zero." : "O valor da conta deve ser maior que zero.");
            return;
        }
        const next: Bill = { ...b, [field]: value };
        if (field === "consumption_m3" || field === "total_amount") {
            next.effective_rate_per_m3 = next.consumption_m3 > 0 ? Math.round((next.total_amount / next.consumption_m3) * 100) / 100 : null;
        }
        setBills(prev => prev.map(x => (x.id === b.id ? next : x)));
        setSavingCells(prev => new Set(prev).add(k));
        setInlineError(null);
        try {
            const res = await fetch("/api/water-bills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ propertyId, bill: toBillInput(next) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || "Erro ao salvar a conta");
        } catch (err) {
            console.error("[WaterDashboard] Inline edit failed:", err);
            setBills(prev => prev.map(x => (x.id === b.id ? b : x)));
            setInlineError(err instanceof Error ? err.message : "Erro ao salvar a conta");
        } finally {
            setSavingCells(prev => { const n = new Set(prev); n.delete(k); return n; });
        }
    };

    const editHref = (month?: string) => {
        const query = [gatewayId ? `gateway=${gatewayId}` : "", month ? `edit=${month}` : ""].filter(Boolean).join("&");
        return `/${lang}/dashboard/billing/${propertyId}/new${query ? `?${query}` : ""}`;
    };

    // ── Loading ─────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse space-y-6">
                <div className="h-8 bg-muted rounded w-64" />
                <div className="h-4 bg-muted rounded w-48" />
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3.5">
                    {[...Array(7)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl" />)}
                </div>
                <div className="h-80 bg-muted rounded-xl" />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Header & Navigation */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link href={`/${lang}/dashboard/water`} className="inline-flex items-center font-medium hover:text-foreground transition-colors">
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Gestão de Água
                        </Link>
                        <span className="text-border">•</span>
                        <Link href={`/${lang}/imoveis`} className="inline-flex items-center font-medium hover:text-foreground transition-colors">
                            Imóveis
                        </Link>
                        {gatewayId && (
                            <>
                                <span className="text-border">•</span>
                                <Link href={`/${lang}/dashboard/gateway/${gatewayId}`} className="inline-flex items-center font-medium hover:text-foreground transition-colors">
                                    Gateway
                                </Link>
                            </>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 bg-blue-100 dark:bg-blue-900/50 rounded-xl text-blue-600 self-start sm:self-auto">
                            <Droplets className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Gestão de Água & Contas</h1>
                                {property && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                                        {property.name}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {property?.address && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                                        <MapPin className="w-3 h-3" />
                                        {property.address}{property.city ? ` — ${property.city}${property.state ? `/${property.state}` : ""}` : ""}
                                    </span>
                                )}
                                {property?.connection_code && (
                                    <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1">
                                        <Link2 className="w-3 h-3" />
                                        Ligação: {property.connection_code}
                                    </span>
                                )}
                                {latest?.meter_number && (
                                    <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1">
                                        <Gauge className="w-3 h-3" />
                                        Hidrômetro: {latest.meter_number}
                                    </span>
                                )}
                                <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                    <Droplets className="w-3 h-3" />
                                    Água principal (paga pelo proprietário)
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Header Actions */}
                <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
                    <Link href={`/${lang}/imoveis?id=${propertyId}`}>
                        <Button variant="outline" className="gap-2 text-sm font-medium text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30">
                            <ArrowLeft className="w-4 h-4" />
                            Voltar ao Imóvel
                        </Button>
                    </Link>
                    <Link href={editHref()}>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 font-medium shadow-sm">
                            <Plus className="w-4 h-4" />
                            Nova Conta de Água
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Orphaned bills */}
            {orphanedBills.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                {orphanedBills.length} {orphanedBills.length === 1 ? "conta de água órfã encontrada" : "contas de água órfãs encontradas"}
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                Essas contas perderam o vínculo com o imóvel anterior. Deseja vinculá-las a este imóvel?
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClaimOrphans}
                        disabled={claimingOrphans}
                        className="shrink-0 px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                        {claimingOrphans ? "Vinculando..." : "Vincular ao Imóvel"}
                    </button>
                </div>
            )}

            {/* The current bill: the utility's logo (the card's cover in Água) and the PDF kept for the newest bill */}
            <div className="bg-card border border-border/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4 sm:flex-row sm:items-center">
                <AgencyLogo agencyId={propertyId} url={logoUrl} name={property?.name ?? "Imóvel"} width={144} height={80} editable endpoint={`/api/water-bills/logo/${propertyId}`} subject="desta concessionária" onChanged={() => fetchBills()} />
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">Conta vigente:</span>
                        <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">{latest ? formatMonth(latest.reference_month) : "—"}</span>
                        {latest?.due_date && (
                            <>
                                <span className="text-muted-foreground">•</span>
                                <span className="font-semibold uppercase tracking-wider text-muted-foreground">Vencimento:</span>
                                <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">{formatDate(latest.due_date)}</span>
                            </>
                        )}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                        {currentPdfUrl ? "O PDF da conta vigente está guardado; a conta seguinte o substitui." : "Guarde o PDF da conta vigente. Sem logo, a IA lê o da concessionária no cabeçalho do PDF e ele vira a capa do imóvel em Água."}
                    </p>
                    {docError && <p className="text-xs text-red-600">{docError}</p>}
                    {docNotice && <p className="text-xs text-emerald-700 dark:text-emerald-400">{docNotice}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    {currentPdfUrl && (
                        <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)} className="gap-1.5"><FileText className="w-4 h-4 text-blue-600" /> Ver PDF</Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => docInput.current?.click()} disabled={docBusy} className="gap-1.5"><Upload className="w-4 h-4" /> {docBusy ? "Enviando..." : currentPdfUrl ? "Substituir PDF" : "Enviar PDF"}</Button>
                    {currentPdfUrl && (
                        <Button variant="ghost" size="sm" onClick={removeDocument} disabled={docBusy} className="gap-1.5 text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /> Remover</Button>
                    )}
                    <input ref={docInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadDocument(f); }} />
                </div>
            </div>

            {bills.length === 0 ? (
                /* Empty state */
                <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center bg-card space-y-4">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-3xl flex items-center justify-center mx-auto">
                        <Droplets className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5 max-w-md mx-auto">
                        <h3 className="text-lg font-semibold text-foreground">Nenhuma conta de água ainda</h3>
                        <p className="text-sm text-muted-foreground">Importe a conta da concessionária para acompanhar consumo, tarifa e custo mês a mês.</p>
                    </div>
                    <Link href={editHref()}>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 font-medium">
                            <Plus className="w-4 h-4" />
                            Importar primeira conta
                        </Button>
                    </Link>
                </div>
            ) : (
                <>
                    {/* KPI tiles: current bill + period */}
                    {latest && summary && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
                            <div className="bg-card border border-blue-300 dark:border-blue-800/60 rounded-xl p-4 shadow-xs space-y-1 bg-gradient-to-br from-blue-50/40 dark:from-blue-950/20 to-transparent">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">Consumo atual</span>
                                    <Droplets className="w-4 h-4 text-blue-600" />
                                </div>
                                <p className="text-2xl font-black text-blue-800 dark:text-blue-200">
                                    {formatNumber(latest.consumption_m3, 0)} <span className="text-sm font-normal">m³</span>
                                </p>
                                <p className="text-[11px] text-blue-600/90 dark:text-blue-400">Conta de {formatMonth(latest.reference_month)}</p>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider">Valor a pagar</span>
                                    <DollarSign className="w-4 h-4" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">{formatCurrency(latest.total_amount)}</p>
                                <p className="text-[11px] text-muted-foreground">Vencimento {formatDate(latest.due_date)}</p>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider">Tarifa efetiva</span>
                                    <TrendingUp className="w-4 h-4" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">
                                    {latest.effective_rate_per_m3 !== null ? `R$ ${formatNumber(latest.effective_rate_per_m3, 2)}` : "-"}
                                    <span className="text-sm font-normal text-muted-foreground"> /m³</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">Valor ÷ consumo da conta atual</p>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider">Leitura</span>
                                    <Gauge className="w-4 h-4" />
                                </div>
                                <p className="text-2xl font-bold text-foreground tabular-nums">
                                    {latest.current_reading !== null ? formatNumber(latest.current_reading, 0) : "-"}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {latest.previous_reading !== null ? `anterior ${formatNumber(latest.previous_reading, 0)} · ` : ""}{formatDate(latest.reading_date)}
                                </p>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider">Média mensal</span>
                                    <BarChart3 className="w-4 h-4" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.avgCost)}</p>
                                <p className="text-[11px] text-muted-foreground">{formatNumber(summary.avgM3, 1)} m³/mês · {summary.months} {summary.months === 1 ? "mês" : "meses"}</p>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider">Total no período</span>
                                    <DollarSign className="w-4 h-4" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.totalCost)}</p>
                                <p className="text-[11px] text-muted-foreground">{formatNumber(summary.totalM3, 0)} m³ consumidos</p>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-xs font-semibold uppercase tracking-wider">Conta mais alta</span>
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.highest.total_amount)}</p>
                                <p className="text-[11px] text-muted-foreground">{formatMonth(summary.highest.reference_month)} · {formatNumber(summary.highest.consumption_m3, 0)} m³</p>
                            </div>
                        </div>
                    )}

                    {/* Charts */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-blue-600" />
                                Visualizações & Indicadores
                            </h2>
                            <div className="inline-flex items-center rounded-xl border border-border bg-card p-1 text-xs font-semibold shadow-xs">
                                {PERIODS.map(opt => (
                                    <button
                                        key={opt.val}
                                        type="button"
                                        onClick={() => setFilterMonths(opt.val)}
                                        className={cn("px-3 py-1.5 rounded-lg transition-colors", filterMonths === opt.val ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-card border border-border rounded-xl p-6 shadow-xs">
                                <h3 className="text-sm font-bold text-foreground">Consumo mensal (m³)</h3>
                                <p className="text-xs text-muted-foreground mb-4">Consumo medido pela concessionária · {filteredBills.length} {filteredBills.length === 1 ? "mês" : "meses"}</p>
                                <ConsumptionChart data={chartData} dataKey="consumption" unit="m³" color="#3b82f6" height={280} />
                            </div>
                            <div className="bg-card border border-border rounded-xl p-6 shadow-xs">
                                <h3 className="text-sm font-bold text-foreground">Valor mensal (R$)</h3>
                                <p className="text-xs text-muted-foreground mb-4">Custo da conta de água mês a mês</p>
                                <ConsumptionChart data={chartData} dataKey="cost" unit="R$" color="#10b981" height={280} />
                            </div>
                        </div>
                    </div>

                    {/* History table (spreadsheet-style: sort/filter per column, right-click to hide columns, select cells to sum, inline edit) */}
                    <div className="bg-card border border-border rounded-xl shadow-xs">
                        <div className="px-6 py-4 border-b border-border bg-muted/20 rounded-t-xl">
                            <h3 className="text-base font-semibold text-foreground">Histórico de Contas</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Contas da concessionária por mês · clique no cabeçalho para ordenar e filtrar (botão direito: colunas); selecione células para somar; duplo clique ou Enter edita na própria célula; o lápis abre a conta completa
                            </p>
                            {inlineError && <p className="text-xs text-red-600 mt-1">{inlineError}</p>}
                        </div>

                        {cf.anyFilter && (
                            <div className="px-4 pt-3">
                                <FilterChips columns={columns} ctl={cf} />
                            </div>
                        )}

                        {cf.rows.length === 0 ? (
                            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                                {filteredBills.length === 0 ? "Nenhuma conta no período escolhido." : <>Nenhuma conta com os filtros atuais. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button></>}
                            </div>
                        ) : (
                            <div className="overflow-x-auto px-2 pb-2">
                                <table className="w-full text-xs">
                                    <thead>
                                        <ColumnHeaders columns={columns} ctl={cf} visibility={vis} trailing={<th className="px-2 py-2 font-semibold text-center">Ações</th>} />
                                    </thead>
                                    <tbody>
                                        {cf.rows.map(b => {
                                            const show = (key: string) => !vis.isHidden(key);
                                            const ro = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
                                            const edit = "px-1 py-0.5 text-right whitespace-nowrap";
                                            const cell = (col: string, field: InlineField, decimals: number, opts: { prefix?: string; suffix?: string; dashWhenEmpty?: boolean; className?: string } = {}) => (
                                                <td {...sel.cellProps(col, b.id, b[field], edit, () => cancelDraft(b.id, field))}>
                                                    <UnitInput
                                                        value={b[field]}
                                                        draft={drafts[draftKey(b.id, field)]}
                                                        disabled={savingCells.has(draftKey(b.id, field))}
                                                        onDraft={text => setDraft(b.id, field, text)}
                                                        onCommit={() => commitDraft(b, field)}
                                                        decimals={decimals}
                                                        {...opts}
                                                    />
                                                </td>
                                            );
                                            return (
                                                <tr key={b.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                                                    <td {...sel.cellProps("month", b.id, null, "px-2 py-1.5 font-semibold text-foreground whitespace-nowrap")}>
                                                        {formatMonth(b.reference_month)}
                                                    </td>
                                                    {show("consumption") && cell("consumption", "consumption_m3", 1, { suffix: " m³", className: "font-semibold text-blue-700 dark:text-blue-300" })}
                                                    {show("billed") && cell("billed", "billed_consumption_m3", 1, { suffix: " m³", dashWhenEmpty: true, className: "text-muted-foreground" })}
                                                    {show("prevReading") && cell("prevReading", "previous_reading", 0, { dashWhenEmpty: true, className: "font-mono text-muted-foreground" })}
                                                    {show("currReading") && cell("currReading", "current_reading", 1, { dashWhenEmpty: true, className: "font-mono text-muted-foreground" })}
                                                    {show("readingDate") && (
                                                        <td {...sel.cellProps("readingDate", b.id, null, cn(ro, "text-muted-foreground"))}>{formatDate(b.reading_date)}</td>
                                                    )}
                                                    {show("dueDate") && (
                                                        <td {...sel.cellProps("dueDate", b.id, null, cn(ro, "text-muted-foreground"))}>{formatDate(b.due_date)}</td>
                                                    )}
                                                    {show("waterTariff") && cell("waterTariff", "water_tariff", 2, { prefix: "R$ ", dashWhenEmpty: true, className: "text-muted-foreground" })}
                                                    {show("sewageTariff") && cell("sewageTariff", "sewage_tariff", 2, { prefix: "R$ ", dashWhenEmpty: true, className: "text-muted-foreground" })}
                                                    {show("waterFee") && cell("waterFee", "water_basic_fee", 2, { prefix: "R$ ", dashWhenEmpty: true, className: "text-muted-foreground" })}
                                                    {show("sewageFee") && cell("sewageFee", "sewage_basic_fee", 2, { prefix: "R$ ", dashWhenEmpty: true, className: "text-muted-foreground" })}
                                                    {show("total") && cell("total", "total_amount", 2, { prefix: "R$ ", className: "font-bold text-foreground" })}
                                                    {show("rate") && (
                                                        <td {...sel.cellProps("rate", b.id, b.effective_rate_per_m3, cn(ro, "font-mono text-muted-foreground"))}>
                                                            {b.effective_rate_per_m3 !== null ? `R$ ${formatNumber(b.effective_rate_per_m3, 2)}` : "-"}
                                                        </td>
                                                    )}
                                                    {show("occurrence") && (
                                                        <td {...sel.cellProps("occurrence", b.id, null, "px-2 py-1.5 whitespace-nowrap text-muted-foreground")}>{b.occurrence_code || "-"}</td>
                                                    )}
                                                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {b.bill_pdf_url && (
                                                                <a
                                                                    href={b.bill_pdf_url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/60 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 transition-colors shadow-2xs"
                                                                    title="Abrir a conta em PDF"
                                                                    aria-label="Abrir a conta em PDF"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5" />
                                                                </a>
                                                            )}
                                                            <Link
                                                                href={editHref(b.reference_month)}
                                                                className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/60 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 transition-colors shadow-2xs"
                                                                title="Editar a conta completa"
                                                                aria-label="Editar conta"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </Link>
                                                            <button
                                                                onClick={() => handleDelete(b)}
                                                                disabled={deletingId === b.id}
                                                                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                                                                title="Excluir conta"
                                                                aria-label="Excluir conta"
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

            {pdfOpen && currentPdfUrl && (
                <PdfViewerModal isOpen onClose={() => setPdfOpen(false)} url={currentPdfUrl} title={`Conta de Água - ${property?.name ?? ""} - ${latest ? formatMonth(latest.reference_month) : ""}`} fileName={`conta-agua-${latest?.reference_month ?? "atual"}.pdf`} />
            )}

            {/* Spreadsheet helpers: selection sum bar, column sort/filter and columns menus */}
            <CellSumBar ctl={sel} />
            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} />
        </div>
    );
}
