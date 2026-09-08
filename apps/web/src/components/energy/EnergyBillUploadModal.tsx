"use client";

import React, { useState, useRef } from "react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    X,
    UploadCloud,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Sun,
    DollarSign,
    FileText,
    TrendingUp,
} from "lucide-react";
import type { ExtractedEnergyBill } from "@/app/api/energy-bills/extract/route";

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    onSuccess: () => void;
}

export function EnergyBillUploadModal({
    isOpen,
    onClose,
    propertyId,
    onSuccess,
}: UploadModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [extracted, setExtracted] = useState<ExtractedEnergyBill | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileSelect = async (selectedFile: File) => {
        setError(null);
        setFile(selectedFile);

        // In-memory preview only
        if (selectedFile.type.startsWith("image/")) {
            setPreviewUrl(URL.createObjectURL(selectedFile));
        } else {
            setPreviewUrl(null);
        }

        // Trigger AI extraction
        await runAiExtraction(selectedFile);
    };

    const runAiExtraction = async (uploadFile: File) => {
        setLoading(true);
        setError(null);

        try {
            let processedFile = uploadFile;

            // If PDF, convert first page to PNG in browser for optimal Vision OCR
            if (uploadFile.type === "application/pdf") {
                try {
                    const pdfjsLib = await import("pdfjs-dist");
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

                    const arrayBuffer = await uploadFile.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
                    const page = await pdf.getPage(1);

                    const scale = 2;
                    const viewport = page.getViewport({ scale });
                    const canvas = document.createElement("canvas");
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    const ctx = canvas.getContext("2d");
                    if (!ctx) throw new Error("Canvas indisponível");

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

                    const blob = await new Promise<Blob>((resolve, reject) => {
                        canvas.toBlob(
                            (b) => (b ? resolve(b) : reject(new Error("Falha ao renderizar PDF"))),
                            "image/png"
                        );
                    });

                    processedFile = new File([blob], "energy-bill-page1.png", { type: "image/png" });
                    setPreviewUrl(URL.createObjectURL(blob));
                } catch (pdfErr) {
                    console.warn("[UploadModal] Client-side PDF render failed, sending raw PDF:", pdfErr);
                    // Fall back to sending raw PDF
                    processedFile = uploadFile;
                }
            }

            const formData = new FormData();
            formData.append("file", processedFile);

            const res = await fetch("/api/energy-bills/extract", {
                method: "POST",
                body: formData,
            });

            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || "Falha na extração por IA");
            }

            setExtracted(result.data);
        } catch (err) {
            console.error("[UploadModal] Extraction error:", err);
            const msg = err instanceof Error ? err.message : "Erro desconhecido";
            setError(`Erro ao processar fatura: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!extracted || !extracted.referenceMonth) {
            setError("Mês de referência é obrigatório");
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("propertyId", propertyId);
            formData.append("billData", JSON.stringify(extracted));
            formData.append("historicalConsumption", JSON.stringify(extracted.historicalConsumption || []));
            if (file) {
                formData.append("file", file);
            }

            const res = await fetch("/api/energy-bills", {
                method: "POST",
                body: formData,
            });

            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || "Falha ao gravar no banco");
            }

            onSuccess();
            onClose();
        } catch (err) {
            console.error("[UploadModal] Save error:", err);
            const msg = err instanceof Error ? err.message : "Erro ao salvar";
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    const updateField = <K extends keyof ExtractedEnergyBill>(key: K, value: ExtractedEnergyBill[K]) => {
        if (!extracted) return;
        setExtracted({ ...extracted, [key]: value });
    };

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 sm:pl-[calc(16rem+1.5rem)] overflow-y-auto">
            <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-600">
                            <Sun className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">Importar Fatura de Energia Solar</h3>
                            <p className="text-xs text-muted-foreground">Extração instantânea por IA com leitura de histórico (Sem armazenar o arquivo PDF)</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-900">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Step 1: Upload Dropzone (if no extraction yet) */}
                    {!extracted && !loading && (
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragActive(false);
                                if (e.dataTransfer.files?.[0]) {
                                    handleFileSelect(e.dataTransfer.files[0]);
                                }
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                                dragActive
                                    ? "border-amber-500 bg-amber-500/10"
                                    : "border-border hover:border-amber-500 hover:bg-muted/40"
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                                }}
                            />
                            <div className="mx-auto w-14 h-14 bg-amber-100 dark:bg-amber-900/40 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
                                <UploadCloud className="w-7 h-7" />
                            </div>
                            <h4 className="text-base font-semibold text-foreground">
                                Arraste ou clique para selecionar a conta de luz (PDF ou Foto)
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
                                Suporta faturas da CEMIG e outras concessionárias brasileiras com Geração Distribuída (GD).
                            </p>
                            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-muted rounded-full text-[11px] text-muted-foreground">
                                <span>🔒 Privacidade garantida: o PDF não é armazenado na nuvem.</span>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Loading Extraction State */}
                    {loading && (
                        <div className="py-16 text-center space-y-4">
                            <Loader2 className="w-10 h-10 animate-spin text-amber-500 mx-auto" />
                            <div className="space-y-1">
                                <h4 className="text-base font-semibold text-foreground">Analisando fatura com Gemini Vision...</h4>
                                <p className="text-xs text-muted-foreground">
                                    Lendo Unidade Consumidora, Consumo kWh, Energia Injetada, Saldo de Créditos e Histórico de 13 meses...
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Extracted Data Review Form */}
                    {extracted && !loading && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl">
                                <div className="flex items-center gap-3">
                                    {previewUrl && (
                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-emerald-300 dark:border-emerald-800 shrink-0 bg-white">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={previewUrl} alt="Prévia" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <div className="text-emerald-800 dark:text-emerald-300 text-sm font-medium">
                                        <div className="flex items-center gap-1.5">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                            <span>Dados extraídos com sucesso! Revise os campos antes de confirmar.</span>
                                        </div>
                                        {file && <p className="text-xs text-emerald-600/80 font-normal">{file.name}</p>}
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setExtracted(null);
                                        setFile(null);
                                        setPreviewUrl(null);
                                    }}
                                    className="text-xs h-7"
                                >
                                    Enviar outro arquivo
                                </Button>
                            </div>

                            {/* Form Sections */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Section 1: Identificação & Período */}
                                <div className="space-y-3.5 p-4 bg-muted/20 border border-border rounded-xl">
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5 text-blue-500" />
                                        Identificação & Ciclo
                                    </h4>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Unidade Consumidora (UC)</Label>
                                        <Input
                                            value={extracted.consumerUnit || ""}
                                            onChange={(e) => updateField("consumerUnit", e.target.value)}
                                            placeholder="ex: 2.777.942.018-25"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Mês Ref. (YYYY-MM)</Label>
                                            <Input
                                                value={extracted.referenceMonth || ""}
                                                onChange={(e) => updateField("referenceMonth", e.target.value)}
                                                placeholder="2026-08"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Rótulo Mês</Label>
                                            <Input
                                                value={extracted.referenceMonthLabel || ""}
                                                onChange={(e) => updateField("referenceMonthLabel", e.target.value)}
                                                placeholder="AGO/2026"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Vencimento</Label>
                                            <Input
                                                type="date"
                                                value={extracted.dueDate || ""}
                                                onChange={(e) => updateField("dueDate", e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Dias</Label>
                                            <Input
                                                type="number"
                                                value={extracted.billingDays || 30}
                                                onChange={(e) => updateField("billingDays", parseInt(e.target.value) || 30)}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Classe da Ligação</Label>
                                        <Input
                                            value={extracted.installationClass || ""}
                                            onChange={(e) => updateField("installationClass", e.target.value)}
                                            placeholder="Residencial Trifásico"
                                        />
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
                                            <Label className="text-xs">Consumo (kWh)</Label>
                                            <Input
                                                type="number"
                                                value={extracted.gridConsumptionKwh ?? ""}
                                                onChange={(e) => updateField("gridConsumptionKwh", parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Média kWh/Dia</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={extracted.dailyAvgKwh ?? ""}
                                                onChange={(e) => updateField("dailyAvgKwh", parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-amber-600 font-semibold">Energia Injetada (kWh)</Label>
                                            <Input
                                                type="number"
                                                value={extracted.solarInjectedKwh ?? ""}
                                                onChange={(e) => updateField("solarInjectedKwh", parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Compensada GD (kWh)</Label>
                                            <Input
                                                type="number"
                                                value={extracted.solarCompensatedKwh ?? ""}
                                                onChange={(e) => updateField("solarCompensatedKwh", parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg">
                                        <Label className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                            SALDO ATUAL DE GERAÇÃO (kWh)
                                        </Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            className="font-bold text-emerald-800 dark:text-emerald-200"
                                            value={extracted.generationBalanceKwh ?? ""}
                                            onChange={(e) => updateField("generationBalanceKwh", parseFloat(e.target.value) || 0)}
                                            placeholder="ex: 441.24"
                                        />
                                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                            Créditos acumulados junto à concessionária
                                        </p>
                                    </div>
                                </div>

                                {/* Section 3: Valores & Tarifas */}
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
                                            value={extracted.totalAmount ?? ""}
                                            onChange={(e) => updateField("totalAmount", parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Custo Disp. (R$)</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={extracted.availabilityCostAmount ?? ""}
                                                onChange={(e) => updateField("availabilityCostAmount", parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Preço Unit. (R$)</Label>
                                            <Input
                                                type="number"
                                                step="0.0001"
                                                value={extracted.unitPrice ?? ""}
                                                onChange={(e) => updateField("unitPrice", parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Bandeira</Label>
                                            <Input
                                                value={extracted.flagType || "Verde"}
                                                onChange={(e) => updateField("flagType", e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Valor Band. (R$)</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={extracted.flagAmount ?? 0}
                                                onChange={(e) => updateField("flagAmount", parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 4: Extracted 13-Month History Preview */}
                            {extracted.historicalConsumption && extracted.historicalConsumption.length > 0 && (
                                <div className="space-y-2 p-4 bg-muted/10 border border-border rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <TrendingUp className="w-3.5 h-3.5 text-violet-500" />
                                            Histórico de Consumo Detectado na Fatura ({extracted.historicalConsumption.length} meses)
                                        </h4>
                                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                            Será importado automaticamente como histórico base
                                        </span>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto border border-border rounded-lg">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-muted/60 text-muted-foreground sticky top-0">
                                                <tr>
                                                    <th className="py-1.5 px-3 font-medium">MÊS/ANO</th>
                                                    <th className="py-1.5 px-3 font-medium">Cons. kWh</th>
                                                    <th className="py-1.5 px-3 font-medium">Média kWh/Dia</th>
                                                    <th className="py-1.5 px-3 font-medium">Dias</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {extracted.historicalConsumption.map((h, i) => (
                                                    <tr key={i} className="hover:bg-muted/30">
                                                        <td className="py-1.5 px-3 font-medium text-foreground">{h.month}</td>
                                                        <td className="py-1.5 px-3">{h.consumptionKwh}</td>
                                                        <td className="py-1.5 px-3">{h.dailyAvgKwh}</td>
                                                        <td className="py-1.5 px-3">{h.days}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    {extracted && (
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-medium"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Gravando no Banco...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Confirmar e Gravar Fatura
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
