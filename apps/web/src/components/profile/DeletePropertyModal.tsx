"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@kitnets/ui";
import {
    AlertTriangle,
    Trash2,
    Sun,
    Zap,
    Building2,
    CheckCircle2,
    Loader2,
} from "lucide-react";

interface DeletePropertyModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyLabel: string;
    propertyIndex: number;
    dict: any;
    onConfirm: (action: "delete_all" | "keep_energy") => Promise<void>;
}

export function DeletePropertyModal({
    isOpen,
    onClose,
    propertyLabel,
    propertyIndex,
    dict,
    onConfirm,
}: DeletePropertyModalProps) {
    const [selectedAction, setSelectedAction] = useState<"delete_all" | "keep_energy">("delete_all");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const m = dict?.profile?.deletePropertyModal || {};

    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            await onConfirm(selectedAction);
            onClose();
        } catch (error) {
            console.error("[DeletePropertyModal] Error:", error);
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

                {/* Energy Decision Body */}
                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-300">
                            <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>{m.energyQuestion || "O que você deseja fazer com a gestão de energia solar deste imóvel?"}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Este imóvel pode ter histórico de medições, faturas de luz ou geração solar registradas. Escolha a opção desejada:
                        </p>
                    </div>

                    {/* Options list */}
                    <div className="grid grid-cols-1 gap-3">
                        {/* Option 1: Delete all */}
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
                                    {m.deleteAllDesc || "O imóvel e todos os dados associados (geração solar, faturas e histórico de consumo) serão removidos permanentemente."}
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

                        {/* Option 2: Keep energy (convert to standalone UC) */}
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
                                    {m.keepEnergyDesc || "Remove o imóvel dos anúncios de locação, mas mantém o cadastro e as faturas como uma UC Avulsa na aba Energia Solar."}
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
                        disabled={isSubmitting}
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
