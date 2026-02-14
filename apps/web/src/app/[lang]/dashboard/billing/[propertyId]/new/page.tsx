"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Save, Calculator, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

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

    const lang = params.lang as string;
    const propertyId = params.propertyId as string;
    const gatewayId = searchParams.get("gateway");
    const supabase = createClient();

    const [property, setProperty] = useState<PropertyInfo | null>(null);
    const [form, setForm] = useState<FormData>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [lastBill, setLastBill] = useState<{ meter_number: string; current_reading: number; reference_month: string } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            // Property details
            const { data: propData } = await supabase
                .rpc("get_property_details", { p_property_id: propertyId });
            if (propData?.[0]) {
                setProperty(propData[0]);
            }

            // Last bill (for pre-filling meter number and previous reading)
            const { data: bills } = await supabase
                .rpc("get_property_bills", { p_property_id: propertyId });
            if (bills?.[0]) {
                setLastBill({
                    meter_number: bills[0].meter_number,
                    current_reading: Number(bills[0].current_reading),
                    reference_month: bills[0].reference_month,
                });
                // Pre-fill meter number and previous reading from last bill
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
                // Scroll to top
                window.scrollTo({ top: 0, behavior: "smooth" });
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
                    Lançamento Manual de Conta
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
                        <p className="font-medium text-emerald-800 dark:text-emerald-300">Conta salva com sucesso!</p>
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
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                required
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
                                        R$ {(parseFloat(form.totalAmount) / (parseFloat(form.consumptionM3) * 1000)).toFixed(4)}
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
                                Salvar Conta
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
