"use client";

/**
 * Energia — the hub of the account's consumer units (rental properties and standalone UCs). Each
 * card opens the unit's energy dashboard (`/dashboard/energy/[propertyId]`). The list is preloaded
 * by the page on the server; refreshes go through the API.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import EnergyHub from "@/components/energy/EnergyHub";
import { AddStandaloneUcModal } from "@/components/energy/AddStandaloneUcModal";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { todayBRT } from "@/lib/lease-dashboard";
import { energyRows, energyViewFromParam, type EnergyUnitRow, type EnergyView } from "@/lib/energy-hub";
import type { OwnerPropertySummary } from "@/lib/energy-properties-server";

interface Props {
    lang: string;
    initialProperties?: OwnerPropertySummary[];
}

export default function EnergyHubContent({ lang, initialProperties }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const view = energyViewFromParam(searchParams.get("view"));
    const today = useMemo(() => todayBRT(), []);
    const base = `/${lang}/dashboard/energy`;

    // ── List ──────────────────────────────────────────────────────
    const [units, setUnits] = useState<OwnerPropertySummary[] | null>(initialProperties ?? null);
    const [seeded] = useState(initialProperties !== undefined);
    const [listError, setListError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/energy-bills/properties");
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error(json.error || "Erro ao carregar as unidades");
        setUnits((json.properties ?? []) as OwnerPropertySummary[]);
    }, []);

    useEffect(() => {
        if (seeded) return;
        let alive = true;
        load().catch(err => { if (alive) { setListError(err instanceof Error ? err.message : "Erro ao carregar"); setUnits([]); } });
        return () => { alive = false; };
    }, [load, seeded]);

    const rows = useMemo(() => energyRows(units ?? [], today), [units, today]);

    // ── Navigation ────────────────────────────────────────────────
    const setView = (next: EnergyView) => router.replace(next === "todas" ? base : `${base}?view=${next}`, { scroll: false });
    const open = (row: EnergyUnitRow) => router.push(`${base}/${row.unit.id}`);

    // ── Add a standalone UC ───────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);

    // ── Latest bill PDF ───────────────────────────────────────────
    const [pdf, setPdf] = useState<{ url: string; title: string; fileName: string } | null>(null);
    const viewPdf = (row: EnergyUnitRow) => {
        if (!row.unit.latestBillPdfUrl) return;
        const month = row.latest?.label ?? row.unit.latestMonthLabel ?? row.unit.latestMonth ?? "";
        setPdf({
            url: row.unit.latestBillPdfUrl,
            title: `Fatura de Energia - ${row.unit.consumerUnit || row.unit.name} - ${month}`,
            fileName: `fatura-energia-${row.unit.latestMonth || "atual"}.pdf`,
        });
    };

    // ── Delete (standalone / orphaned units only) ─────────────────
    const [deleteTarget, setDeleteTarget] = useState<EnergyUnitRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/energy-bills/properties?id=${deleteTarget.unit.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setDeleteError(typeof json.error === "string" ? json.error : "Erro ao remover a unidade."); return; }
            setUnits(prev => (prev ?? []).filter(u => u.id !== deleteTarget.unit.id));
            setDeleteTarget(null);
        } catch {
            setDeleteError("Erro de conexão. Tente novamente.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <EnergyHub
                lang={lang}
                rows={rows}
                loading={units === null}
                error={listError}
                view={view}
                onViewChange={setView}
                onOpen={open}
                onDelete={setDeleteTarget}
                onViewPdf={viewPdf}
                deletingId={deleting && deleteTarget ? deleteTarget.unit.id : null}
                onAddUc={() => setAddOpen(true)}
            />

            <AddStandaloneUcModal
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                onSuccess={created => {
                    setAddOpen(false);
                    setUnits(prev => [created, ...(prev ?? [])]);
                    router.push(`${base}/${created.id}`);
                }}
            />

            {pdf && (
                <PdfViewerModal isOpen onClose={() => setPdf(null)} url={pdf.url} title={pdf.title} fileName={pdf.fileName} />
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
                    <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
                        <button type="button" onClick={() => setDeleteTarget(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
                        <div className="mb-6 text-center">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h2 className="mb-2 text-xl font-bold text-foreground">{deleteTarget.kind === "orphaned" ? "Remover unidade desvinculada?" : "Excluir UC avulsa?"}</h2>
                            <p className="text-sm text-muted-foreground">
                                {deleteTarget.kind === "orphaned"
                                    ? <>Remover <span className="font-semibold text-foreground">{deleteTarget.unit.name}</span> da Energia? O imóvel não está mais no seu portfólio de aluguel.</>
                                    : <>Tem certeza de que deseja excluir <span className="font-semibold text-foreground">{deleteTarget.unit.name}</span> e todo o histórico de faturas dela?</>}
                            </p>
                        </div>
                        {deleteError && (
                            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                                <AlertTriangle className="h-4 w-4 shrink-0" /> {deleteError}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
                            <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
                                {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removendo...</> : deleteTarget.kind === "orphaned" ? "Remover" : "Excluir UC"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
