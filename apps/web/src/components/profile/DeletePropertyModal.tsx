"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@kitnets/ui";
import {
    AlertTriangle,
    Trash2,
    Sun,
    Zap,
    Building2,
    Loader2,
} from "lucide-react";

/** What removing the property takes with it (GET /api/energy-bills/properties/sync-deletion). */
interface DeletionPreview {
    hasRow: boolean;
    leases?: number;
    deletedLeases?: number;
    invoices?: number;
    tenants?: number;
    energyBills?: number;
    waterBills?: number;
    incomeMonths?: number;
    transactions?: number;
    taxes?: number;
}

interface DeletePropertyModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyLabel: string;
    /** the property's slot in the profile (0 = the first) */
    propertyIndex: number;
    /** what its row is called (name, else "street, number"): the server checks it is still the same property */
    rowName: string;
    /** the property's row id, when it has one */
    propertyId: string | null;
    lang: string;
    dict: any;
    /** throws with the reason when the server refuses; the dialog shows it and stays open */
    onConfirm: (action: "delete_all" | "keep_energy") => Promise<void>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function DeletePropertyModal({
    isOpen,
    onClose,
    propertyLabel,
    propertyIndex,
    rowName,
    propertyId,
    lang,
    dict,
    onConfirm,
}: DeletePropertyModalProps) {
    const [selectedAction, setSelectedAction] = useState<"delete_all" | "keep_energy">("delete_all");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<DeletionPreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const m = dict?.profile?.deletePropertyModal || {};

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setPreview(null);
        setPreviewError(null);
        setError(null);
        const params = new URLSearchParams({ slot: String(propertyIndex), name: rowName });
        if (propertyId) params.set("propertyId", propertyId);
        fetch(`/api/energy-bills/properties/sync-deletion?${params}`)
            .then(async res => {
                const json = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok) setPreviewError(typeof json.error === "string" ? json.error : "Não foi possível verificar o que está vinculado ao imóvel.");
                else setPreview(json as DeletionPreview);
            })
            .catch(() => { if (!cancelled) setPreviewError("Erro de conexão ao verificar o imóvel."); });
        return () => { cancelled = true; };
    }, [isOpen, propertyIndex, rowName, propertyId]);

    const leases = preview?.leases ?? 0;
    const invoices = preview?.invoices ?? 0;
    const blocked = leases > 0 || invoices > 0;
    const ready = preview !== null && !previewError && !blocked;

    const removes = preview?.hasRow ? [
        preview.incomeMonths ? plural(preview.incomeMonths, "mês de receitas", "meses de receitas") : null,
        preview.transactions ? plural(preview.transactions, "lançamento de investimento", "lançamentos de investimento") : null,
        preview.taxes ? plural(preview.taxes, "tributo", "tributos") : null,
        preview.tenants ? plural(preview.tenants, "inquilino sem contrato", "inquilinos sem contrato") : null,
        preview.deletedLeases ? plural(preview.deletedLeases, "contrato já excluído", "contratos já excluídos") : null,
    ].filter(Boolean) : [];
    const keeps = preview?.hasRow ? [
        preview.energyBills ? plural(preview.energyBills, "conta de energia", "contas de energia") : null,
        preview.waterBills ? plural(preview.waterBills, "conta de água", "contas de água") : null,
    ].filter(Boolean) : [];

    const handleConfirm = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
            await onConfirm(selectedAction);
            onClose();
        } catch (err) {
            setError((err as Error).message || "Não foi possível excluir o imóvel — nada foi apagado.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
            <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden border-border bg-card">
                {/* Header */}
                <div className="p-6 pb-4 border-b border-border bg-muted/30">
                    <DialogHeader className="space-y-2.5 text-left">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 shrink-0">
                                <Trash2 className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold text-foreground">
                                    {m.title || "Excluir Imóvel"}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    {m.subtitle || "Tem certeza que deseja remover este imóvel do seu portfólio?"}
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Property summary pill */}
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background border border-border text-xs font-medium text-foreground">
                            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{propertyLabel}</span>
                        </div>
                    </DialogHeader>
                </div>

                <div className="p-6 space-y-4">
                    {/* What goes and what stops it — from the property's own records, never a namesake's */}
                    {preview === null && !previewError && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando o que está vinculado a este imóvel…
                        </p>
                    )}
                    {previewError && (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{previewError}</p>
                    )}
                    {blocked && (
                        <div className="space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-4 h-4 shrink-0" /> Este imóvel não pode ser excluído agora</p>
                            {leases > 0 && (
                                <p>
                                    Tem {plural(leases, "contrato", "contratos")} em{" "}
                                    <Link href={`/${lang}/contratos`} className="font-semibold underline underline-offset-2">Contratos</Link>. Exclua {leases === 1 ? "o contrato" : "os contratos"} primeiro.
                                </p>
                            )}
                            {invoices > 0 && <p>Tem {plural(invoices, "fatura emitida", "faturas emitidas")}: faturas são registros financeiros e ficam com o imóvel.</p>}
                        </div>
                    )}
                    {ready && preview?.hasRow && (removes.length > 0 || keeps.length > 0) && (
                        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                            {removes.length > 0 && <p><span className="font-semibold text-foreground">Apaga junto:</span> {removes.join(" · ")}.</p>}
                            {keeps.length > 0 && selectedAction === "delete_all" && <p><span className="font-semibold text-foreground">Fica guardado sem imóvel:</span> {keeps.join(" · ")} — podem ser vinculadas de novo.</p>}
                        </div>
                    )}

                    {ready && (
                        <>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-300">
                                    <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>{m.energyQuestion || "O que você deseja fazer com a gestão de energia deste imóvel?"}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSelectedAction("delete_all")}
                                    className={`flex items-start gap-3.5 p-3.5 rounded-xl border text-left transition-all ${
                                        selectedAction === "delete_all"
                                            ? "border-red-500/60 bg-red-50/60 dark:bg-red-950/20 ring-1 ring-red-500"
                                            : "border-border hover:border-muted-foreground/30 bg-card hover:bg-muted/10"
                                    }`}
                                >
                                    <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 shrink-0 mt-0.5">
                                        <Trash2 className="w-4 h-4" />
                                    </div>
                                    <div className="space-y-1 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-bold text-foreground">
                                                {m.deleteAllTitle || "Excluir imóvel e apagar dados de energia"}
                                            </p>
                                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                                                {m.badgeDeleteAll || "Apagar Tudo"}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            {m.deleteAllDesc || "O imóvel e o que é só dele (receitas, investimento, tributos) são apagados. As contas de energia e água ficam guardadas sem imóvel; o PDF da conta vigente é apagado."}
                                        </p>
                                    </div>
                                    <div className="shrink-0 mt-0.5">
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                            selectedAction === "delete_all"
                                                ? "border-red-600 bg-red-600 text-white"
                                                : "border-muted-foreground/40"
                                        }`}>
                                            {selectedAction === "delete_all" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setSelectedAction("keep_energy")}
                                    className={`flex items-start gap-3.5 p-3.5 rounded-xl border text-left transition-all ${
                                        selectedAction === "keep_energy"
                                            ? "border-amber-500/60 bg-amber-50/60 dark:bg-amber-950/20 ring-1 ring-amber-500"
                                            : "border-border hover:border-muted-foreground/30 bg-card hover:bg-muted/10"
                                    }`}
                                >
                                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                                        <Sun className="w-4 h-4" />
                                    </div>
                                    <div className="space-y-1 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-bold text-foreground">
                                                {m.keepEnergyTitle || "Excluir imóvel mas MANTER dados de energia"}
                                            </p>
                                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">
                                                {m.badgeStandalone || "UC Avulsa"}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            {m.keepEnergyDesc || "Remove o imóvel dos anúncios de locação, mas mantém o cadastro e as faturas como uma UC Avulsa na aba Energia."}
                                        </p>
                                    </div>
                                    <div className="shrink-0 mt-0.5">
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                            selectedAction === "keep_energy"
                                                ? "border-amber-600 bg-amber-600 text-white"
                                                : "border-muted-foreground/40"
                                        }`}>
                                            {selectedAction === "keep_energy" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </>
                    )}

                    {error && (
                        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 px-6 border-t border-border bg-muted/20 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={onClose}
                        className="text-xs h-9"
                    >
                        {m.cancel || "Cancelar"}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={isSubmitting || !ready}
                        onClick={handleConfirm}
                        className={`text-xs h-9 flex items-center gap-1.5 ${
                            selectedAction === "delete_all"
                                ? "bg-red-600 hover:bg-red-700 text-white"
                                : "bg-amber-600 hover:bg-amber-700 text-white"
                        }`}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>{m.deleting || "Excluindo..."}</span>
                            </>
                        ) : selectedAction === "delete_all" ? (
                            <>
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{m.confirmDeleteAll || "Excluir Imóvel e Dados de Energia"}</span>
                            </>
                        ) : (
                            <>
                                <Sun className="w-3.5 h-3.5" />
                                <span>{m.confirmKeepEnergy || "Excluir Imóvel e Manter Energia"}</span>
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
