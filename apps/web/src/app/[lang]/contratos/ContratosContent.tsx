"use client";

/**
 * Contratos — the hub of the account's leases, one contract's dashboard (`?id=`, the old
 * `?lease=` still works) and the form that creates or edits one. The list and the dashboard are
 * preloaded by the page on the server; refreshes go through the API. Modals — terminate, delete,
 * the AI import of a new contract, the batch import of old ones — are owned here so the hub and
 * the dashboard share them.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { ReturnToPropertyLink, useReturnPropertyId } from "@/components/properties/ReturnToPropertyLink";
import ContratosHub from "@/components/contratos/ContratosHub";
import LeaseDashboard from "@/components/contratos/LeaseDashboard";
import LeaseForm, { EMPTY_LEASE_FORM, emptyLeaseInitial, formatDateBR, leaseToInitial, maskDate, moneyToMask, parseDateBR, type LeaseFormDropdowns, type LeaseFormInitial } from "@/components/contratos/LeaseForm";
import LeaseImportModal, { type LeaseImportResult } from "@/components/contratos/LeaseImportModal";
import LeaseBatchImportModal from "@/components/contratos/LeaseBatchImportModal";
import { summarizeLeases, todayBRT, viewFromParam, type LeaseRow, type LeaseView } from "@/lib/lease-dashboard";
import { leaseIndexSeriesCode, type IndexPoint } from "@/lib/lease-summary";
import type { LeaseDashboardView, LeaseListView } from "@/lib/lease-views";
import type { LeaseWithDetails } from "@/types/lease";
import { toISODate } from "@/lib/dates";
import { LEASE_UPLOAD_MAX_SIZE } from "@/lib/lease-upload-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Files the multipart route takes when the direct upload is not available (POST /api/leases/[id]/documents).
const ROUTE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

interface FormState {
    editingId: string | null;
    initial: LeaseFormInitial;
    aiImported: boolean;
    importedFile: File | null;
    importedStoragePath: string | null;
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
    // ?importar=1 (the dashboard's "Importar contrato"): the import of current contracts opens straight away
    const wantsImport = searchParams.get("importar") === "1";
    const today = useMemo(() => todayBRT(), []);
    const base = lang === "pt" ? "/contratos" : `/${lang}/contratos`;

    // ── List ──────────────────────────────────────────────────────
    const [leases, setLeases] = useState<LeaseWithDetails[] | null>(initial?.leases ?? null);
    const [series, setSeries] = useState<Record<string, IndexPoint[] | null>>(initial?.series ?? {});
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

    const openNewForm = () => setFormState({ editingId: null, initial: emptyLeaseInitial(), aiImported: false, importedFile: null, importedStoragePath: null });

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
        setFormState({ editingId: id, initial: leaseToInitial(full), aiImported: false, importedFile: null, importedStoragePath: null });
    };

    const onSaved = async (id: string, warning: string | null) => {
        setFormState(null);
        setNotice(warning);
        setDashboardKey(k => k + 1);
        await load().catch(() => {});
        select(id);
    };

    // ── AI import of a new contract ───────────────────────────────
    const [importOpen, setImportOpen] = useState(false);
    const [batchOpen, setBatchOpen] = useState(wantsImport);
    /** "history" for "Importar contratos antigos"; "current" when the dashboard asked for an import */
    const [batchMode, setBatchMode] = useState<"history" | "current">(wantsImport ? "current" : "history");
    // the parameter is consumed: a reload does not reopen the import
    useEffect(() => {
        if (wantsImport) router.replace(base, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleImportComplete = async (result: LeaseImportResult) => {
        // The import may have just created the property, the agency and the tenants.
        const fresh = await fetchDropdowns();
        const { lease } = result.data;
        const propertyName = fresh?.properties.find(p => p.id === result.propertyId)?.name;
        const tenantName = fresh?.tenants.find(t => t.id === result.primaryTenantId)?.full_name;
        const year = lease.start_date ? lease.start_date.slice(0, 4) : new Date().getFullYear();

        const initialForm: LeaseFormInitial = {
            form: {
                ...EMPTY_LEASE_FORM,
                reference_name: propertyName && tenantName ? `${propertyName} - ${tenantName} - ${year}` : "",
                property_id: result.propertyId,
                primary_tenant_id: result.primaryTenantId,
                management_type: result.agencyId ? "AGENCY" : result.agentId ? "AGENT" : "SELF_MANAGED",
                agency_id: result.agencyId,
                agent_id: result.agentId,
                start_date: formatDateBR(lease.start_date),
                end_date: formatDateBR(lease.end_date),
                monthly_rent: moneyToMask(lease.monthly_rent),
                rent_due_day: lease.rent_due_day?.toString() || "",
                security_deposit: moneyToMask(lease.security_deposit),
                deposit_months: lease.deposit_months?.toString() || "",
                adjustment_index: lease.adjustment_index || "",
                adjustment_frequency: lease.adjustment_frequency?.toString() || "12",
                status: lease.end_date && lease.end_date < toISODate(new Date()) ? "EXPIRED" : "ACTIVE",
                notes: lease.notes || "",
            },
            additionalTenants: result.additionalTenants,
            charges: result.data.charges.map(c => ({
                charge_type: c.charge_type,
                label: c.label,
                responsibility: c.responsibility,
                amount: moneyToMask(c.amount),
                adjustment_index: c.adjustment_index || "",
                adjustment_notes: c.adjustment_notes || "",
            })),
            // Everything the AI filled must be in sight for the review.
            openSections: { adjustment: !!lease.adjustment_index, charges: result.data.charges.length > 0, notes: !!lease.notes },
        };
        // A file already in storage is adopted whatever its size; one that still has to go through the route must fit it
        const importedFile = result.storagePath || (ROUTE_MIME_TYPES.includes(result.file.type) && result.file.size <= LEASE_UPLOAD_MAX_SIZE) ? result.file : null;
        setImportOpen(false);
        setFormState({ editingId: null, initial: initialForm, aiImported: true, importedFile, importedStoragePath: result.storagePath });
    };

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

    // ── Terminate ─────────────────────────────────────────────────
    const [terminateTarget, setTerminateTarget] = useState<LeaseWithDetails | null>(null);
    const [terminateDate, setTerminateDate] = useState("");
    const [terminateReason, setTerminateReason] = useState("");
    const [terminating, setTerminating] = useState(false);
    const [terminateError, setTerminateError] = useState<string | null>(null);

    const openTerminate = (lease: LeaseWithDetails) => { setTerminateTarget(lease); setTerminateDate(""); setTerminateReason(""); setTerminateError(null); };
    const handleTerminate = async () => {
        if (!terminateTarget || !terminateDate) return;
        const iso = parseDateBR(terminateDate);
        if (!iso) { setTerminateError("Data inválida. Use DD/MM/AAAA."); return; }
        setTerminating(true);
        setTerminateError(null);
        try {
            const res = await fetch(`/api/leases/${terminateTarget.id}/terminate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ termination_date: iso, termination_reason: terminateReason }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setTerminateError(typeof json.error === "string" ? json.error : Object.values(json.errors ?? {})[0] as string ?? "Não foi possível rescindir o contrato.");
                return;
            }
            setTerminateTarget(null);
            setDashboardKey(k => k + 1);
            await load().catch(() => {});
        } catch {
            setTerminateError("Erro de conexão. Tente novamente.");
        } finally {
            setTerminating(false);
        }
    };

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
            {terminateTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                            <Ban className="h-5 w-5 text-amber-500" /> Rescindir Contrato
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Rescindir <strong>&ldquo;{terminateTarget.reference_name || terminateTarget.property_name}&rdquo;</strong>. O contrato fica no histórico, marcado como rescindido.
                        </p>
                        <div className="mt-4 space-y-3">
                            <div>
                                <Label>Data de Rescisão *</Label>
                                <Input value={terminateDate} onChange={e => setTerminateDate(maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} />
                            </div>
                            <div>
                                <Label>Motivo da Rescisão</Label>
                                <textarea className="flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm" value={terminateReason} onChange={e => setTerminateReason(e.target.value)} placeholder="Motivo (opcional)..." />
                            </div>
                            {terminateError && <p className="text-xs text-rose-600">{terminateError}</p>}
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setTerminateTarget(null)} disabled={terminating}>Cancelar</Button>
                            <Button variant="destructive" onClick={handleTerminate} disabled={!terminateDate || terminating}>
                                {terminating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                                Rescindir
                            </Button>
                        </div>
                    </div>
                </div>
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

            {importOpen && dropdowns && (
                <LeaseImportModal
                    properties={dropdowns.properties}
                    agencies={dropdowns.agencies}
                    onClose={() => {
                        setImportOpen(false);
                        // The import may have created records before it was cancelled.
                        void fetchDropdowns();
                    }}
                    onManual={() => { setImportOpen(false); openNewForm(); }}
                    onComplete={handleImportComplete}
                />
            )}

            {batchOpen && (
                <LeaseBatchImportModal
                    dropdowns={dropdowns}
                    refreshDropdowns={fetchDropdowns}
                    mode={batchMode}
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
                    aiImported={formState.aiImported}
                    importedFile={formState.importedFile}
                    importedStoragePath={formState.importedStoragePath}
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
                onNew={() => { if (dropdowns) setImportOpen(true); else openNewForm(); }}
                onImportOld={() => { setBatchMode("history"); setBatchOpen(true); }}
            />
            {modals}
        </>
    );
}
