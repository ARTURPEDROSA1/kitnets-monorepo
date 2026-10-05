"use client";

/**
 * Contratos — the hub of the account's leases, one contract's dashboard (`?id=`, the old
 * `?lease=` still works) and the form that creates or edits one. The list and the dashboard are
 * preloaded by the page on the server; refreshes go through the API. "Novo Contrato" opens the form
 * to type a contract in; "Importar contrato" is the AI import (one or many files, current or old).
 * Modals — terminate, delete, the import — are owned here so the hub and the dashboard share them.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { ReturnToPropertyLink, useReturnPropertyId } from "@/components/properties/ReturnToPropertyLink";
import ContratosHub from "@/components/contratos/ContratosHub";
import LeaseDashboard from "@/components/contratos/LeaseDashboard";
import LeaseForm, { emptyLeaseInitial, leaseToInitial, type LeaseFormDropdowns, type LeaseFormInitial } from "@/components/contratos/LeaseForm";
import LeaseBatchImportModal from "@/components/contratos/LeaseBatchImportModal";
import LeaseEndModal from "@/components/contratos/LeaseEndModal";
import { summarizeLeases, todayBRT, viewFromParam, type LeaseRow, type LeaseView } from "@/lib/lease-dashboard";
import { leaseIndexSeriesCode, type IndexPoint } from "@/lib/lease-summary";
import type { LeaseDashboardView, LeaseListView } from "@/lib/lease-views";
import type { LeaseWithDetails } from "@/types/lease";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FormState {
    editingId: string | null;
    initial: LeaseFormInitial;
}

interface Props {
    lang: string;
    /** The list as the page preloaded it on the server — the first paint has the rows; refreshes go through the API. */
    initial?: LeaseListView | null;
    /** The dashboard of `?id=`, preloaded the same way. */
    initialDashboard?: LeaseDashboardView | null;
}

export default function ContratosContent({ lang, initial = null, initialDashboard = null }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawId = searchParams.get("id") ?? searchParams.get("lease");
    const selectedId = rawId && UUID.test(rawId) ? rawId : null;
    const view = viewFromParam(searchParams.get("view"));
    // ?importar=1 (the dashboard's "Importar contrato"): the import opens straight away
    const wantsImport = searchParams.get("importar") === "1";
    const today = useMemo(() => todayBRT(), []);
    const base = lang === "pt" ? "/contratos" : `/${lang}/contratos`;

    // ── List ──────────────────────────────────────────────────────
    const [leases, setLeases] = useState<LeaseWithDetails[] | null>(initial?.leases ?? null);
    const [series, setSeries] = useState<Record<string, IndexPoint[] | null>>(initial?.series ?? {});
    /** `properties.id` → single/multi: the hub's cards name the energy bill or the condominium accordingly */
    const [propertyKinds, setPropertyKinds] = useState<LeaseListView["propertyKinds"]>(initial?.propertyKinds ?? {});
    const seriesRef = useRef(series);
    seriesRef.current = series;
    /** Seeded from the server: no first fetch. Read once — later prop changes must not reset the list. */
    const [seeded] = useState(initial !== null);
    const [listError, setListError] = useState<string | null>(null);

    const loadSeries = useCallback(async (list: LeaseWithDetails[], known: Record<string, IndexPoint[] | null>) => {
        const codes = [...new Set(list.map(l => leaseIndexSeriesCode(l.adjustment_index)).filter((c): c is string => Boolean(c)))].filter(c => !(c in known));
        if (codes.length === 0) return;
        const entries = await Promise.all(codes.map(async (code): Promise<[string, IndexPoint[] | null]> => {
            try {
                const res = await fetch(`/api/indices/${code}/calculator-data`);
                const json = await res.json();
                return [code, Array.isArray(json) ? json : null];
            } catch {
                return [code, null];
            }
        }));
        setSeries(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    }, []);

    const load = useCallback(async () => {
        const res = await fetch("/api/leases");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Erro ao carregar os contratos");
        const list = (json.leases ?? []) as LeaseWithDetails[];
        setLeases(list);
        if (json.propertyKinds && typeof json.propertyKinds === "object") setPropertyKinds(json.propertyKinds as LeaseListView["propertyKinds"]);
        void loadSeries(list, seriesRef.current);
    }, [loadSeries]);

    useEffect(() => {
        if (seeded) return;
        let alive = true;
        load().catch(err => { if (alive) { setListError(err instanceof Error ? err.message : "Erro ao carregar"); setLeases([]); } });
        return () => { alive = false; };
    }, [load, seeded]);

    const rows = useMemo(() => summarizeLeases(leases ?? [], series, today), [leases, series, today]);

    // ── Dropdowns (the form, the import modals) ──────────────────
    const [dropdowns, setDropdowns] = useState<LeaseFormDropdowns | null>(null);
    const fetchDropdowns = useCallback(async (): Promise<LeaseFormDropdowns | null> => {
        try {
            const res = await fetch("/api/leases/dropdowns");
            const data = await res.json();
            const next: LeaseFormDropdowns = { properties: data.properties || [], tenants: data.tenants || [], agencies: data.agencies || [], agents: data.agents || [] };
            setDropdowns(next);
            return next;
        } catch {
            console.error("Error fetching dropdowns");
            return null;
        }
    }, []);
    useEffect(() => { void fetchDropdowns(); }, [fetchDropdowns]);

    // ── Navigation ────────────────────────────────────────────────
    const viewQuery = view === "vigentes" ? "" : `view=${view}`;
    const select = useCallback((id: string | null) => {
        const query = [id ? `id=${id}` : "", viewQuery].filter(Boolean).join("&");
        router.push(query ? `${base}?${query}` : base, { scroll: true });
    }, [router, base, viewQuery]);
    const setView = (next: LeaseView) => router.replace(next === "vigentes" ? base : `${base}?view=${next}`, { scroll: false });

    // Opened from a property's "Contrato de Aluguel" card (?property=<id>): offers the way back
    const returnPropertyId = useReturnPropertyId();

    // ── Form ──────────────────────────────────────────────────────
    const [formState, setFormState] = useState<FormState | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [dashboardKey, setDashboardKey] = useState(0);

    const openNewForm = () => setFormState({ editingId: null, initial: emptyLeaseInitial() });

    const openEdit = async (id: string, known?: LeaseWithDetails) => {
        let full = known;
        if (!full || !full.charges) {
            try {
                const res = await fetch(`/api/leases/${id}`);
                const data = await res.json();
                full = data.lease as LeaseWithDetails;
            } catch {
                console.error("Error loading lease for edit");
                return;
            }
        }
        if (!full) return;
        setFormState({ editingId: id, initial: leaseToInitial(full) });
    };

    const onSaved = async (id: string, warning: string | null) => {
        setFormState(null);
        setNotice(warning);
        setDashboardKey(k => k + 1);
        await load().catch(() => {});
        select(id);
    };

    // ── AI import (one or many contracts, current or old) ──────────
    const [batchOpen, setBatchOpen] = useState(wantsImport);
    // the parameter is consumed: a reload does not reopen the import
    useEffect(() => {
        if (wantsImport) router.replace(base, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Files (open the contract PDF from the list) ───────────────
    const [viewingDoc, setViewingDoc] = useState<{ url: string; title: string; fileName: string } | null>(null);
    const [openingFileId, setOpeningFileId] = useState<string | null>(null);
    const openContractFile = async (row: LeaseRow) => {
        setOpeningFileId(row.lease.id);
        try {
            const res = await fetch(`/api/leases/${row.lease.id}`);
            const data = await res.json();
            const docs = (data.lease?.documents ?? []) as Array<{ document_type: string; file_name: string; file_url: string }>;
            const doc = docs.find(d => d.document_type === "CONTRACT") ?? docs[0];
            if (!doc) return;
            if (/\.pdf$/i.test(doc.file_name)) setViewingDoc({ url: doc.file_url, title: row.title, fileName: doc.file_name });
            else window.open(doc.file_url, "_blank", "noopener,noreferrer");
        } catch {
            console.error("Error opening the contract file");
        } finally {
            setOpeningFileId(null);
        }
    };

    // ── End: the tenant's notice of leaving, or a rescission (LeaseEndModal) ──
    const [terminateTarget, setTerminateTarget] = useState<LeaseWithDetails | null>(null);
    const openTerminate = (lease: LeaseWithDetails) => setTerminateTarget(lease);

    // ── Delete ────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<LeaseWithDetails | null>(null);
    const [deleting, setDeleting] = useState(false);
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/leases/${deleteTarget.id}`, { method: "DELETE" });
            if (!res.ok) { setListError("Não foi possível excluir o contrato."); return; }
            const wasSelected = selectedId === deleteTarget.id;
            setDeleteTarget(null);
            await load().catch(() => {});
            if (wasSelected) select(null);
        } catch {
            console.error("Error deleting lease");
        } finally {
            setDeleting(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────

    const modals = (
        <>
            {/* how the contract ends: the tenant's notice of leaving, or a rescission now */}
            {terminateTarget && (
                <LeaseEndModal
                    lease={terminateTarget}
                    today={today}
                    onClose={() => setTerminateTarget(null)}
                    onDone={message => {
                        setTerminateTarget(null);
                        setNotice(message);
                        setDashboardKey(k => k + 1);
                        load().catch(() => {});
                    }}
                />
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-foreground">Excluir Contrato</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Tem certeza que deseja excluir o contrato <strong>&ldquo;{deleteTarget.reference_name || deleteTarget.property_name}&rdquo;</strong>?
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">O registro sai das listas, mas é mantido no histórico.</p>
                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
                            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Excluir
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {batchOpen && (
                <LeaseBatchImportModal
                    dropdowns={dropdowns}
                    refreshDropdowns={fetchDropdowns}
                    onClose={created => {
                        setBatchOpen(false);
                        if (created.length > 0) load().catch(() => {});
                    }}
                    onOpenLease={id => select(id)}
                />
            )}

            {viewingDoc && (
                <PdfViewerModal isOpen onClose={() => setViewingDoc(null)} url={viewingDoc.url} title={viewingDoc.title} fileName={viewingDoc.fileName} />
            )}
        </>
    );

    if (formState) {
        if (!dropdowns) {
            return (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            );
        }
        return (
            <>
                <LeaseForm
                    key={formState.editingId ?? "new"}
                    editingId={formState.editingId}
                    initial={formState.initial}
                    dropdowns={dropdowns}
                    indexSeries={series}
                    onSaved={onSaved}
                    onCancel={() => setFormState(null)}
                    topSlot={<ReturnToPropertyLink propertyId={returnPropertyId} />}
                />
                {modals}
            </>
        );
    }

    if (selectedId) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
                <ReturnToPropertyLink propertyId={returnPropertyId} />
                <LeaseDashboard
                    key={selectedId}
                    leaseId={selectedId}
                    lang={lang}
                    today={today}
                    initialBundle={initialDashboard}
                    refreshKey={dashboardKey}
                    notice={notice}
                    onDismissNotice={() => setNotice(null)}
                    onBack={() => select(null)}
                    onEdit={bundle => { void openEdit(bundle.lease.id, bundle.lease); }}
                    onTerminate={openTerminate}
                    onDelete={setDeleteTarget}
                />
                {modals}
            </div>
        );
    }

    return (
        <>
            <ContratosHub
                rows={rows}
                today={today}
                propertyKinds={propertyKinds}
                loading={leases === null}
                error={listError}
                view={view}
                onViewChange={setView}
                actions={{
                    onOpen: row => select(row.lease.id),
                    onEdit: row => { void openEdit(row.lease.id); },
                    onTerminate: row => openTerminate(row.lease),
                    onDelete: row => setDeleteTarget(row.lease),
                    onOpenFile: row => { void openContractFile(row); },
                    openingFileId,
                }}
                onNew={openNewForm}
                onImport={() => setBatchOpen(true)}
            />
            {modals}
        </>
    );
}
