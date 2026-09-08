"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    X,
    Pencil,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Sun,
    DollarSign,
    FileText,
    Calculator,
} from "lucide-react";
import type { EnergyBillRecord } from "@/app/[lang]/dashboard/energy/[propertyId]/page";

interface EditEnergyBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    bill: EnergyBillRecord | null;
    onSuccess: () => void;
}

export function EditEnergyBillModal({
    isOpen,
    onClose,
    bill,
    onSuccess,
}: EditEnergyBillModalProps) {
    const [formData, setFormData] = useState<Partial<EnergyBillRecord>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        if (bill) {
            setFormData({
                reference_month: bill.reference_month || "",
                reference_month_label: bill.reference_month_label || "",
                due_date: bill.due_date ? bill.due_date.slice(0, 10) : "",
                billing_days: bill.billing_days || 30,
                grid_consumption_kwh: bill.grid_consumption_kwh ?? 0,
                daily_avg_kwh: bill.daily_avg_kwh ?? 0,
                solar_injected_kwh: bill.solar_injected_kwh ?? 0,
                solar_compensated_kwh: bill.solar_compensated_kwh ?? 0,
                generation_balance_kwh: bill.generation_balance_kwh ?? 0,
                total_amount: bill.total_amount ?? 0,
                availability_cost_amount: bill.availability_cost_amount ?? 0,
                unit_price: bill.unit_price ?? 0,
                consumer_unit: bill.consumer_unit || "",
                installation_class: bill.installation_class || "",
            });
            setError(null);
            setSuccessMessage(null);
        }
    }, [bill]);

    if (!isOpen || !bill) return null;

    const handleFieldChange = (field: keyof EnergyBillRecord, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleRecalculateDaily = () => {
        const cons = Number(formData.grid_consumption_kwh) || 0;
        const days = Number(formData.billing_days) || 30;
        if (days > 0) {
            const calculated = Math.round((cons / days) * 100) / 100;
            handleFieldChange("daily_avg_kwh", calculated);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const res = await fetch("/api/energy-bills", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: bill.id,
                    billData: formData,
                }),
            });

            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || "Erro ao salvar alterações na fatura");
            }

            setSuccessMessage("Fatura atualizada com sucesso!");
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 600);
        } catch (err) {
            console.error("[EditEnergyBillModal] Save error:", err);
            const msg = err instanceof Error ? err.message : "Erro desconhecido";
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 sm:pl-[calc(16rem+1.5rem)] overflow-y-auto">
            <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-600">
                            <Pencil className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">Editar Fatura de Energia</h3>
                            <p className="text-xs text-muted-foreground">
                                Ajuste os valores de consumo, compensação solar e tarifas para o ciclo{" "}
                                <span className="font-semibold text-foreground">
                                    {formData.reference_month_label || formData.reference_month}
                                </span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body Form */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-900">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm border border-emerald-200 dark:border-emerald-900">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Section 1: Identificação & Período */}
                        <div className="space-y-3.5 p-4 bg-muted/20 border border-border rounded-xl">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-blue-500" />
                                Identificação & Ciclo
                            </h4>
                            <div className="space-y-1">
                                <Label className="text-xs">Mês Ref. (YYYY-MM)</Label>
                                <Input
                                    value={formData.reference_month || ""}
                                    onChange={(e) => handleFieldChange("reference_month", e.target.value)}
                                    placeholder="2026-08"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Rótulo do Mês</Label>
                                <Input
                                    value={formData.reference_month_label || ""}
                                    onChange={(e) => handleFieldChange("reference_month_label", e.target.value)}
                                    placeholder="AGO/2026"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">Vencimento</Label>
                                    <Input
                                        type="date"
                                        value={formData.due_date || ""}
                                        onChange={(e) => handleFieldChange("due_date", e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Dias</Label>
                                    <Input
                                        type="number"
                                        value={formData.billing_days || 30}
                                        onChange={(e) => handleFieldChange("billing_days", parseInt(e.target.value) || 30)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Consumo & Solar GD */}
                        <div className="space-y-3.5 p-4 bg-muted/20 border border-border rounded-xl">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Sun className="w-3.5 h-3.5 text-amber-500" />
                                Consumo & Energia Solar
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Consumo (kWh)</Label>
                                    <Input
                                        type="number"
                                        value={formData.grid_consumption_kwh ?? ""}
                                        onChange={(e) => handleFieldChange("grid_consumption_kwh", parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold">Média kWh/Dia</Label>
                                        <button
                                            type="button"
                                            onClick={handleRecalculateDaily}
                                            className="text-[10px] text-sky-600 hover:text-sky-700 flex items-center gap-0.5"
                                            title="Calcular automaticamente: Consumo ÷ Dias"
                                        >
                                            <Calculator className="w-2.5 h-2.5" />
                                            Auto
                                        </button>
                                    </div>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.daily_avg_kwh ?? ""}
                                        onChange={(e) => handleFieldChange("daily_avg_kwh", parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs text-amber-600 font-semibold">Energia Injetada (kWh)</Label>
                                    <Input
                                        type="number"
                                        value={formData.solar_injected_kwh ?? ""}
                                        onChange={(e) => handleFieldChange("solar_injected_kwh", parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-sky-600 font-semibold">Compensada GD (kWh)</Label>
                                    <Input
                                        type="number"
                                        value={formData.solar_compensated_kwh ?? ""}
                                        onChange={(e) => handleFieldChange("solar_compensated_kwh", parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1 p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg">
                                <Label className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                    SALDO GERAÇÃO (kWh)
                                </Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    className="font-bold text-emerald-800 dark:text-emerald-200"
                                    value={formData.generation_balance_kwh ?? ""}
                                    onChange={(e) => handleFieldChange("generation_balance_kwh", parseFloat(e.target.value) || 0)}
                                    placeholder="ex: 1586.61"
                                />
                            </div>
                        </div>

                        {/* Section 3: Valores Financeiros */}
                        <div className="space-y-3.5 p-4 bg-muted/20 border border-border rounded-xl">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                                Valores & Tarifas
                            </h4>
                            <div className="space-y-1">
                                <Label className="text-xs font-bold text-foreground">Total a Pagar (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    className="font-bold text-base"
                                    value={formData.total_amount ?? ""}
                                    onChange={(e) => handleFieldChange("total_amount", parseFloat(e.target.value) || 0)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">Custo Disp. (R$)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.availability_cost_amount ?? ""}
                                        onChange={(e) => handleFieldChange("availability_cost_amount", parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Preço Unit. (R$)</Label>
                                    <Input
                                        type="number"
                                        step="0.0001"
                                        value={formData.unit_price ?? ""}
                                        onChange={(e) => handleFieldChange("unit_price", parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Classe / Instalação</Label>
                                <Input
                                    value={formData.installation_class || ""}
                                    onChange={(e) => handleFieldChange("installation_class", e.target.value)}
                                    placeholder="ex: Residencial Monofásico"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-amber-600 hover:bg-amber-700 text-white min-w-[140px]"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Salvar Alterações
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
