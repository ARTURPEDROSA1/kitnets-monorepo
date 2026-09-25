"use client";

/**
 * Imobiliárias — the hub of the account's agencies, one agency's dashboard (`?id=`, the old
 * `?agency=` deep link kept) and the form that creates or edits one. A lease agreement can be
 * imported from the hub or from an agency's dashboard: the AI reads it and the contract, the
 * tenants, the corretor and the agency itself are created when they are not registered yet.
 * The list and the dashboard are preloaded by the page on the server; refreshes go through the API.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import ImobiliariasHub from "@/components/imobiliaria/ImobiliariasHub";
import AgencyDashboard from "@/components/imobiliaria/AgencyDashboard";
import AgencyForm, { prefillFor, type AgencyPrefill } from "@/components/imobiliaria/AgencyForm";
import AgencyAddModal from "@/components/imobiliaria/AgencyAddModal";
import LeaseBatchImportModal from "@/components/contratos/LeaseBatchImportModal";
import type { LeaseFormDropdowns } from "@/components/contratos/LeaseForm";
import { ReturnToPropertyLink, useReturnPropertyId } from "@/components/properties/ReturnToPropertyLink";
import { todayBRT } from "@/lib/lease-dashboard";
import { agencyRows, agencyViewFromParam, type AgencyRow, type AgencyView } from "@/lib/agency-dashboard";
import type { AgencyAgentSummary, AgencyDashboardView, AgencyLeaseSummary, AgencyListView, AgencyTenantSummary } from "@/lib/agency-views";
import type { AgencyWithRole } from "@/types/agency";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FormState {
    editing: AgencyWithRole | null;
    prefill: AgencyPrefill;
}

interface Props {
    lang: string;
    initial?: AgencyListView | null;
    initialDashboard?: AgencyDashboardView | null;
}

export default function ImobiliariaContent({ lang, initial = null, initialDashboard = null }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawId = searchParams.get("id") ?? searchParams.get("agency");
    const selectedId = rawId && UUID.test(rawId) ? rawId : null;
    const view = agencyViewFromParam(searchParams.get("view"));
    const today = useMemo(() => todayBRT(), []);
    const base = lang === "pt" ? "/imobiliaria" : `/${lang}/imobiliaria`;
    const contratosBase = lang === "pt" ? "/contratos" : `/${lang}/contratos`;

    // ── List ──────────────────────────────────────────────────────
    const [agencies, setAgencies] = useState<AgencyWithRole[] | null>(initial?.agencies ?? null);
    const [leases, setLeases] = useState<AgencyLeaseSummary[]>(initial?.leases ?? []);
    const [tenants, setTenants] = useState<AgencyTenantSummary[]>(initial?.tenants ?? []);
    const [agents, setAgents] = useState<AgencyAgentSummary[]>(initial?.agents ?? []);
    const [seeded] = useState(initial !== null);
    const [listError, setListError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/agencies");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Erro ao carregar as imobiliárias");
        setAgencies((json.agencies ?? []) as AgencyWithRole[]);
        setLeases((json.leases ?? []) as AgencyLeaseSummary[]);
        setTenants((json.tenants ?? []) as AgencyTenantSummary[]);
        setAgents((json.agents ?? []) as AgencyAgentSummary[]);
    }, []);

    useEffect(() => {
        if (seeded) return;
        let alive = true;
        load().catch(err => { if (alive) { setListError(err instanceof Error ? err.message : "Erro ao carregar"); setAgencies([]); } });
        return () => { alive = false; };
    }, [load, seeded]);

    const rows = useMemo(() => agencyRows(agencies ?? [], leases, tenants, agents, today), [agencies, leases, tenants, agents, today]);

    // Opened from a property's "Contrato de Aluguel" card (?property=<id>): offers the way back
    const returnPropertyId = useReturnPropertyId();

    // ── Navigation ────────────────────────────────────────────────
    const viewQuery = view === "ativas" ? "" : `view=${view}`;
    const select = useCallback((id: string | null) => {
        const query = [id ? `id=${id}` : "", viewQuery].filter(Boolean).join("&");
        router.push(query ? `${base}?${query}` : base, { scroll: true });
    }, [router, base, viewQuery]);
    const setView = (next: AgencyView) => router.replace(next === "ativas" ? base : `${base}?view=${next}`, { scroll: false });

    // ── Form ──────────────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [formState, setFormState] = useState<FormState | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [dashboardKey, setDashboardKey] = useState(0);

    const openManual = () => { setAddOpen(false); setFormState({ editing: null, prefill: prefillFor(null) }); };
    const openEdit = (agency: AgencyWithRole) => setFormState({ editing: agency, prefill: prefillFor(agency) });
    const onSaved = async (id: string, created: boolean) => {
        setFormState(null);
        setNotice(created ? "Imobiliária cadastrada. Importe os contratos de locação dela — a IA cria os contratos e os inquilinos — ou selecione-a no campo Imobiliária dos contratos que ela administra." : "Dados salvos.");
        setDashboardKey(k => k + 1);
        await load().catch(() => {});
        select(id);
    };

    // ── Lease import (the AI reads a lease agreement; the contract, tenants and agency are created when missing) ──
    const [importFor, setImportFor] = useState<{ agency: AgencyWithRole | null } | null>(null);
    const [dropdowns, setDropdowns] = useState<LeaseFormDropdowns | null>(null);
    const fetchDropdowns = useCallback(async (): Promise<LeaseFormDropdowns | null> => {
        try {
            const res = await fetch("/api/leases/dropdowns");
            const data = await res.json();
            const next: LeaseFormDropdowns = { properties: data.properties || [], tenants: data.tenants || [], agencies: data.agencies || [], agents: data.agents || [] };
            setDropdowns(next);
            return next;
        } catch {
            return null;
        }
    }, []);
    useEffect(() => {
        if (importFor && !dropdowns) void fetchDropdowns();
    }, [importFor, dropdowns, fetchDropdowns]);

    const closeImport = async (createdIds: string[]) => {
        setImportFor(null);
        // The import may have created agencies, contracts and tenants even when it was cancelled midway
        setDropdowns(null);
        await load().catch(() => {});
        if (createdIds.length > 0) {
            setNotice(createdIds.length === 1 ? "Contrato importado e vinculado à imobiliária." : `${createdIds.length} contratos importados e vinculados à imobiliária.`);
            setDashboardKey(k => k + 1);
        }
    };

    // ── Delete ────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<AgencyWithRole | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/agencies/${deleteTarget.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setDeleteError(typeof json.error === "string" ? json.error : "Erro ao excluir imobiliária."); return; }
            const wasSelected = selectedId === deleteTarget.id;
            setDeleteTarget(null);
            await load().catch(() => {});
            if (wasSelected) select(null);
        } catch {
            setDeleteError("Erro de conexão. Tente novamente.");
        } finally {
            setDeleting(false);
        }
    };

    const deleteModal = deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
                <button type="button" onClick={() => setDeleteTarget(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <h2 className="mb-2 text-xl font-bold text-foreground">Excluir imobiliária?</h2>
                    <p className="text-sm text-muted-foreground">
                        Tem certeza de que deseja excluir <span className="font-semibold text-foreground">{deleteTarget.trade_name || deleteTarget.name}</span>?
                        Os contratos e inquilinos que a nomeiam continuam existindo, sem a imobiliária.
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
                        {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...</> : "Excluir imobiliária"}
                    </Button>
                </div>
            </div>
        </div>
    );

    const importModal = importFor && (
        dropdowns ? (
            <LeaseBatchImportModal
                dropdowns={dropdowns}
                refreshDropdowns={fetchDropdowns}
                mode="current"
                fixedAgency={importFor.agency ? { id: importFor.agency.id, label: importFor.agency.trade_name || importFor.agency.name } : undefined}
                onClose={ids => { void closeImport(ids); }}
                onOpenLease={id => router.push(`${contratosBase}?id=${id}`)}
            />
        ) : (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-6 py-4 text-sm text-muted-foreground shadow-2xl">
                    <Loader2 className="h-4 w-4 animate-spin" /> Preparando a importação…
                </div>
            </div>
        )
    );

    if (formState) {
        return (
            <AgencyForm
                key={formState.editing?.id ?? "new"}
                editingId={formState.editing?.id ?? null}
                editing={formState.editing}
                prefill={formState.prefill}
                onSaved={id => { void onSaved(id, formState.editing === null); }}
                onCancel={() => setFormState(null)}
                topSlot={<ReturnToPropertyLink propertyId={returnPropertyId} className="flex w-fit" />}
            />
        );
    }

    if (selectedId) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
                <AgencyDashboard
                    key={selectedId}
                    agencyId={selectedId}
                    lang={lang}
                    today={today}
                    initialBundle={initialDashboard}
                    refreshKey={dashboardKey}
                    notice={notice}
                    onDismissNotice={() => setNotice(null)}
                    onBack={() => select(null)}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    onImportLease={agency => setImportFor({ agency })}
                />
                {deleteModal}
                {importModal}
            </div>
        );
    }

    return (
        <>
            <ImobiliariasHub
                rows={rows}
                loading={agencies === null}
                error={listError}
                view={view}
                onViewChange={setView}
                onOpen={(row: AgencyRow) => select(row.agency.id)}
                onDelete={row => setDeleteTarget(row.agency)}
                deletingId={deleting && deleteTarget ? deleteTarget.id : null}
                onNew={() => setAddOpen(true)}
                onImport={() => setImportFor({ agency: null })}
            />
            {addOpen && (
                <AgencyAddModal
                    onClose={() => setAddOpen(false)}
                    onManual={openManual}
                    onExtracted={prefill => { setAddOpen(false); setFormState({ editing: null, prefill }); }}
                />
            )}
            {deleteModal}
            {importModal}
        </>
    );
}
