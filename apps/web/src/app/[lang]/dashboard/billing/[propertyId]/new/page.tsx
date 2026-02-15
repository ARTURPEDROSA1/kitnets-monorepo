"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Save, Calculator, AlertCircle, CheckCircle2, Upload, FileText } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";

interface PropertyInfo {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    connection_code: string;
}

interface FormData {
    referenceMonth: string;       // "2026-02"
    meterNumber: string;
    previousReading: string;
    currentReading: string;
    consumptionM3: string;
    billedConsumptionM3: string;
    readingDate: string;          // "2026-01-20"
    readingDateOrig: string;      // "2026-01-21"
    dueDate: string;
    waterTariff: string;
    sewageTariff: string;
    waterBasicFee: string;
    sewageBasicFee: string;
    totalAmount: string;
    occurrenceCode: string;
    notes: string;
}

const emptyForm: FormData = {
    referenceMonth: "",
    meterNumber: "",
    previousReading: "",
    currentReading: "",
    consumptionM3: "",
    billedConsumptionM3: "",
    readingDate: "",
    readingDateOrig: "",
    dueDate: "",
    waterTariff: "",
    sewageTariff: "",
    waterBasicFee: "",
    sewageBasicFee: "",
    totalAmount: "",
    occurrenceCode: "",
    notes: "",
};

function formatCurrency(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ManualBillEntryPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    const lang = params.lang as string;
    const propertyId = params.propertyId as string;
    const gatewayId = searchParams.get("gateway");
    const editMonth = searchParams.get("edit"); // e.g. "2026-02" — edit mode
    const supabase = createClient();

    const [property, setProperty] = useState<PropertyInfo | null>(null);
    const [form, setForm] = useState<FormData>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isEditMode, setIsEditMode] = useState(!!editMonth);
    const [lastBill, setLastBill] = useState<{ meter_number: string; current_reading: number; reference_month: string } | null>(null);
    const [extracting, setExtracting] = useState(false);
    const [extractionConfidence, setExtractionConfidence] = useState<number | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            // Property details
            const { data: propData } = await supabase
                .rpc("get_property_details", { p_property_id: propertyId });
            if (propData?.[0]) {
                setProperty(propData[0]);
            }

            // Fetch all bills
            const { data: bills } = await supabase
                .rpc("get_property_bills", { p_property_id: propertyId });

            // ── Edit mode: load existing bill into form ──
            if (editMonth && bills) {
                const bill = bills.find((b: { reference_month: string }) => b.reference_month === editMonth);
                if (bill) {
                    setIsEditMode(true);
                    setForm({
                        referenceMonth: bill.reference_month || "",
                        meterNumber: bill.meter_number || "",
                        previousReading: bill.previous_reading != null ? String(Number(bill.previous_reading)) : "",
                        currentReading: bill.current_reading != null ? String(Number(bill.current_reading)) : "",
                        consumptionM3: bill.consumption_m3 != null ? String(Number(bill.consumption_m3)) : "",
                        billedConsumptionM3: bill.billed_consumption_m3 != null ? String(Number(bill.billed_consumption_m3)) : "",
                        readingDate: bill.reading_date ? String(bill.reading_date).substring(0, 10) : "",
                        readingDateOrig: bill.reading_date_orig ? String(bill.reading_date_orig).substring(0, 10) : "",
                        dueDate: bill.due_date ? String(bill.due_date).substring(0, 10) : "",
                        waterTariff: Number(bill.water_tariff) ? String(Number(bill.water_tariff)) : "",
                        sewageTariff: Number(bill.sewage_tariff) ? String(Number(bill.sewage_tariff)) : "",
                        waterBasicFee: Number(bill.water_basic_fee) ? String(Number(bill.water_basic_fee)) : "",
                        sewageBasicFee: Number(bill.sewage_basic_fee) ? String(Number(bill.sewage_basic_fee)) : "",
                        totalAmount: bill.total_amount != null ? String(Number(bill.total_amount)) : "",
                        occurrenceCode: bill.occurrence_code || "",
                        notes: "",
                    });
                }
            } else if (bills?.[0]) {
                // ── New mode: pre-fill from last bill ──
                setLastBill({
                    meter_number: bills[0].meter_number,
                    current_reading: Number(bills[0].current_reading),
                    reference_month: bills[0].reference_month,
                });
                setForm(prev => ({
                    ...prev,
                    meterNumber: bills[0].meter_number || "",
                    previousReading: String(Number(bills[0].current_reading)),
                }));
            }
        };

        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propertyId]);

    // Auto-compute consumption when readings change
    const computedConsumption = React.useMemo(() => {
        const prev = parseFloat(form.previousReading);
        const curr = parseFloat(form.currentReading);
        if (!isNaN(prev) && !isNaN(curr) && curr >= prev) {
            return curr - prev;
        }
        return null;
    }, [form.previousReading, form.currentReading]);

    // Auto-compute effective rate
    const effectiveRate = React.useMemo(() => {
        const consumption = parseFloat(form.consumptionM3) || computedConsumption;
        const total = parseFloat(form.totalAmount);
        if (consumption && consumption > 0 && !isNaN(total)) {
            return Math.round((total / consumption) * 100) / 100;
        }
        return null;
    }, [form.consumptionM3, form.totalAmount, computedConsumption]);

    // Auto-compute daily average
    const dailyAverage = React.useMemo(() => {
        const consumption = parseFloat(form.consumptionM3) || computedConsumption;
        if (!consumption) return null;

        // Use reading dates to compute days in period
        const start = form.readingDateOrig || form.readingDate;
        if (!start || !form.referenceMonth) return null;

        // Approximate: ~30 days per billing period
        return Math.round((consumption / 30) * 100) / 100;
    }, [form.consumptionM3, form.readingDate, form.readingDateOrig, form.referenceMonth, computedConsumption]);

    // Auto-fill consumption when readings change
    React.useEffect(() => {
        if (computedConsumption !== null) {
            setForm(prev => ({
                ...prev,
                consumptionM3: String(computedConsumption),
                billedConsumptionM3: prev.billedConsumptionM3 || String(computedConsumption),
            }));
        }
    }, [computedConsumption]);

    const handleChange = (field: keyof FormData, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setError(null);
        setSuccess(false);
    };

    const handleFileUpload = async (file: File) => {
        setExtracting(true);
        setError(null);
        setExtractionConfidence(null);

        try {
            let uploadFile = file;

            // If PDF, convert first page to PNG in the browser
            if (file.type === "application/pdf") {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
                const page = await pdf.getPage(1);

                const scale = 2; // High-res for accurate OCR
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("Canvas context not available");

                await page.render({ canvasContext: ctx, viewport }).promise;

                const blob = await new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob(
                        (b) => (b ? resolve(b) : reject(new Error("Failed to convert PDF page to image"))),
                        "image/png"
                    );
                });

                uploadFile = new File([blob], "bill-page1.png", { type: "image/png" });
            }

            const formData = new window.FormData();
            formData.append("file", uploadFile);

            const res = await fetch("/api/extract-bill", {
                method: "POST",
                body: formData,
            });

            const result = await res.json();

            if (!res.ok || !result.success) {
                throw new Error(result.error || "Falha na extração");
            }

            const d = result.data;
            const safeStr = (v: unknown) => (v != null && v !== "null" ? String(v) : "");
            const safeNum = (v: unknown) => {
                const n = Number(v);
                return !isNaN(n) && n !== 0 ? String(n) : "";
            };

            setForm({
                referenceMonth: safeStr(d.referenceMonth),
                meterNumber: safeStr(d.meterNumber),
                previousReading: safeNum(d.previousReading),
                currentReading: safeNum(d.currentReading),
                consumptionM3: safeNum(d.consumptionM3),
                billedConsumptionM3: safeNum(d.billedConsumptionM3),
                readingDate: safeStr(d.readingDate),
                readingDateOrig: safeStr(d.readingDateOrig),
                dueDate: safeStr(d.dueDate),
                waterTariff: safeNum(d.waterTariff),
                sewageTariff: safeNum(d.sewageTariff),
                waterBasicFee: safeNum(d.waterBasicFee),
                sewageBasicFee: safeNum(d.sewageBasicFee),
                totalAmount: safeNum(d.totalAmount),
                occurrenceCode: safeStr(d.occurrenceCode),
                notes: "",
            });

            setExtractionConfidence(d.confidence ?? 0.9);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erro desconhecido";
            setError(`Falha ao extrair dados: ${message}`);
        } finally {
            setExtracting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        // Validation
        if (!form.referenceMonth) {
            setError("Mês de referência é obrigatório.");
            return;
        }
        if (!form.totalAmount || parseFloat(form.totalAmount) <= 0) {
            setError("Valor total é obrigatório e deve ser maior que zero.");
            return;
        }
        if (!form.consumptionM3 || parseFloat(form.consumptionM3) <= 0) {
            setError("Consumo é obrigatório e deve ser maior que zero.");
            return;
        }

        setSaving(true);

        try {
            const { error: rpcError } = await supabase.rpc("upsert_water_bill", {
                p_property_id: propertyId,
                p_reference_month: form.referenceMonth,
                p_meter_number: form.meterNumber || null,
                p_previous_reading: form.previousReading ? parseFloat(form.previousReading) : null,
                p_current_reading: form.currentReading ? parseFloat(form.currentReading) : null,
                p_consumption_m3: parseFloat(form.consumptionM3),
                p_billed_consumption_m3: form.billedConsumptionM3 ? parseFloat(form.billedConsumptionM3) : parseFloat(form.consumptionM3),
                p_reading_date: form.readingDate || null,
                p_reading_date_orig: form.readingDateOrig || null,
                p_due_date: form.dueDate || null,
                p_total_amount: parseFloat(form.totalAmount),
                p_water_tariff: form.waterTariff ? parseFloat(form.waterTariff) : 0,
                p_sewage_tariff: form.sewageTariff ? parseFloat(form.sewageTariff) : 0,
                p_water_basic_fee: form.waterBasicFee ? parseFloat(form.waterBasicFee) : 0,
                p_sewage_basic_fee: form.sewageBasicFee ? parseFloat(form.sewageBasicFee) : 0,
                p_occurrence_code: form.occurrenceCode || null,
                p_average_consumption_m3: null,
                p_notes: form.notes || null,
            });

            if (rpcError) {
                console.error(rpcError);
                setError(`Erro ao salvar: ${rpcError.message}`);
            } else {
                setSuccess(true);
                window.scrollTo({ top: 0, behavior: "smooth" });
                // Auto-navigate back after brief delay
                setTimeout(() => {
                    router.push(backHref);
                }, 1500);
            }
        } catch (err) {
            setError("Erro inesperado ao salvar a conta.");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const backHref = gatewayId
        ? `/${lang}/dashboard/billing/${propertyId}?gateway=${gatewayId}`
        : `/${lang}/dashboard/billing/${propertyId}`;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* ── Header ─────────────────────────────────────── */}
            <div className="mb-8">
                <Link
                    href={backHref}
                    className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar ao Histórico
                </Link>

                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <Save className="w-8 h-8 text-primary" />
                    {isEditMode ? "Editar Conta" : "Lançamento Manual de Conta"}
                </h1>
                {property && (
                    <p className="mt-2 text-muted-foreground">
                        {property.name} — {property.connection_code && `Ligação ${property.connection_code}`}
                    </p>
                )}
            </div>

            {/* ── Status Messages ─────────────────────────────── */}
            {success && (
                <div className="mb-6 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <div>
                        <p className="font-medium text-emerald-800 dark:text-emerald-300">
                            {isEditMode ? "Conta atualizada com sucesso!" : "Conta salva com sucesso!"}
                        </p>
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">
                            Referência: {form.referenceMonth} — {formatCurrency(parseFloat(form.totalAmount))}
                        </p>
                    </div>
                    <Link
                        href={backHref}
                        className="ml-auto text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                        Ver Histórico →
                    </Link>
                </div>
            )}

            {error && (
                <div className="mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <p className="text-red-800 dark:text-red-300">{error}</p>
                </div>
            )}

            {/* ── Upload / Drag-and-Drop Zone ───────────────── */}
            {!isEditMode && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={async (e) => {
                        e.preventDefault();
                        setDragActive(false);
                        const file = e.dataTransfer.files[0];
                        if (file) await handleFileUpload(file);
                    }}
                    className={`mb-8 border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${dragActive
                        ? "border-primary bg-primary/5 scale-[1.01]"
                        : extractionConfidence !== null
                            ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20"
                            : "border-border hover:border-primary/50 hover:bg-muted/20"
                        }`}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) await handleFileUpload(file);
                            e.target.value = "";
                        }}
                    />

                    {extracting ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="relative">
                                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                <FileText className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                            </div>
                            <div>
                                <p className="font-semibold text-foreground">Extraindo dados da conta...</p>
                                <p className="text-sm text-muted-foreground mt-1">GPT-4o está analisando o documento</p>
                            </div>
                        </div>
                    ) : extractionConfidence !== null ? (
                        <div className="flex flex-col items-center gap-2">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            <p className="font-semibold text-emerald-700 dark:text-emerald-300">Dados extraídos com sucesso!</p>
                            <p className="text-sm text-muted-foreground">
                                Confiança: <span className={`font-bold ${extractionConfidence >= 0.85 ? "text-emerald-600" : extractionConfidence >= 0.7 ? "text-amber-600" : "text-red-600"}`}>
                                    {Math.round(extractionConfidence * 100)}%
                                </span>
                                {" — "}Revise os campos abaixo antes de salvar
                            </p>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setExtractionConfidence(null); }}
                                className="mt-1 text-xs text-muted-foreground hover:text-foreground underline"
                            >
                                Enviar outra conta
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                                <Upload className="w-7 h-7 text-primary" />
                            </div>
                            <div>
                                <p className="font-semibold text-foreground">
                                    Arraste a conta de água aqui
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    ou clique para selecionar • PDF, JPG, PNG (máx 10MB)
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                                <FileText className="w-3 h-3" />
                                Preenchimento automático com IA
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* ── Form ─────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="space-y-8">

                {/* ── Section 1: Billing Period ────────────── */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-primary" />
                        Período e Identificação
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Mês de Referência *
                            </label>
                            <input
                                type="month"
                                value={form.referenceMonth}
                                onChange={(e) => handleChange("referenceMonth", e.target.value)}
                                className={`w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors ${isEditMode ? "opacity-60 cursor-not-allowed" : ""}`}
                                required
                                readOnly={isEditMode}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Nº Hidrômetro
                            </label>
                            <input
                                type="text"
                                value={form.meterNumber}
                                onChange={(e) => handleChange("meterNumber", e.target.value)}
                                placeholder="Ex: Y21SG1602635"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Código de Ocorrência
                            </label>
                            <input
                                type="text"
                                value={form.occurrenceCode}
                                onChange={(e) => handleChange("occurrenceCode", e.target.value)}
                                placeholder="Ex: 33"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* ── Section 2: Meter Readings ───────────── */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-4">
                        Leituras do Medidor
                    </h2>
                    {lastBill && (
                        <p className="text-xs text-muted-foreground mb-4 bg-muted/30 rounded-lg px-3 py-2">
                            💡 Leitura anterior preenchida automaticamente da última conta ({lastBill.reference_month}): <span className="font-mono font-semibold">{lastBill.current_reading}</span>
                        </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Leitura Anterior
                            </label>
                            <input
                                type="number"
                                step="1"
                                value={form.previousReading}
                                onChange={(e) => handleChange("previousReading", e.target.value)}
                                placeholder="Ex: 520"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Leitura Atual
                            </label>
                            <input
                                type="number"
                                step="1"
                                value={form.currentReading}
                                onChange={(e) => handleChange("currentReading", e.target.value)}
                                placeholder="Ex: 573"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Consumo Real (m³) *
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.consumptionM3}
                                onChange={(e) => handleChange("consumptionM3", e.target.value)}
                                placeholder="Auto-calculado"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                                required
                            />
                            {computedConsumption !== null && (
                                <p className="text-xs text-emerald-600 mt-1">
                                    ← Calculado: {computedConsumption} m³
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Consumo Faturado (m³)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.billedConsumptionM3}
                                onChange={(e) => handleChange("billedConsumptionM3", e.target.value)}
                                placeholder="Igual ao real se não informado"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                            />
                        </div>
                    </div>
                </div>

                {/* ── Section 3: Dates ─────────────────────── */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-4">
                        Datas
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Data de Leitura
                            </label>
                            <input
                                type="date"
                                value={form.readingDate}
                                onChange={(e) => handleChange("readingDate", e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Data da ronda programada</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Data Leitura Original
                            </label>
                            <input
                                type="date"
                                value={form.readingDateOrig}
                                onChange={(e) => handleChange("readingDateOrig", e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Data real da leitura física</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Vencimento
                            </label>
                            <input
                                type="date"
                                value={form.dueDate}
                                onChange={(e) => handleChange("dueDate", e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* ── Section 4: Charges ───────────────────── */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-4">
                        Composição da Conta (R$)
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Tarifa Água
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.waterTariff}
                                onChange={(e) => handleChange("waterTariff", e.target.value)}
                                placeholder="0,00"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                Tarifa Esgoto
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.sewageTariff}
                                onChange={(e) => handleChange("sewageTariff", e.target.value)}
                                placeholder="0,00"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                TBOA (Água)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.waterBasicFee}
                                onChange={(e) => handleChange("waterBasicFee", e.target.value)}
                                placeholder="0,00"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                TBOE (Esgoto)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.sewageBasicFee}
                                onChange={(e) => handleChange("sewageBasicFee", e.target.value)}
                                placeholder="0,00"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Valor Total a Pagar (R$) *
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.totalAmount}
                                onChange={(e) => handleChange("totalAmount", e.target.value)}
                                placeholder="Ex: 521.14"
                                className="w-full px-3 py-2.5 rounded-lg border-2 border-primary/30 bg-primary/5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono text-lg font-semibold"
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* ── Section 5: Notes ─────────────────────── */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-4">
                        Observações
                    </h2>
                    <textarea
                        value={form.notes}
                        onChange={(e) => handleChange("notes", e.target.value)}
                        placeholder="Notas sobre esta conta (opcional)..."
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                    />
                </div>

                {/* ── Derived Values Summary ───────────────── */}
                {(effectiveRate || dailyAverage) && (
                    <div className="bg-muted/30 border border-border rounded-xl p-6">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Valores Calculados pelo Sistema
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {effectiveRate && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Taxa Efetiva (R$/m³)</p>
                                    <p className="text-lg font-bold text-foreground">
                                        R$ {effectiveRate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            )}
                            {dailyAverage && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Média Diária</p>
                                    <p className="text-lg font-bold text-foreground">
                                        {dailyAverage.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m³/dia
                                    </p>
                                </div>
                            )}
                            {form.totalAmount && parseFloat(form.consumptionM3) > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Custo por Litro</p>
                                    <p className="text-lg font-bold text-foreground">
                                        R$ {(parseFloat(form.totalAmount) / (parseFloat(form.consumptionM3) * 1000)).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Submit ───────────────────────────────── */}
                <div className="flex items-center justify-between pt-2">
                    <Link
                        href={backHref}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancelar
                    </Link>
                    <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                {isEditMode ? "Atualizar Conta" : "Salvar Conta"}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
