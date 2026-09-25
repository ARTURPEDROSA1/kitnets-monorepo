"use client";

/**
 * Inquilinos — the hub of the account's tenants, one tenant's dashboard (`?id=`, the old
 * `?tenant=` deep link from the property card still works) and the form that creates or edits
 * one. The list and the dashboard are preloaded by the page on the server; refreshes go through
 * the API. Former tenants stay: they are a view, never a deletion.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { ReturnToPropertyLink, useReturnPropertyId } from "@/components/properties/ReturnToPropertyLink";
import InquilinosHub from "@/components/inquilinos/InquilinosHub";
import TenantDashboard from "@/components/inquilinos/TenantDashboard";
import TenantForm, { emptyTenantForm, tenantToForm, type TenantFormDropdowns } from "@/components/inquilinos/TenantForm";
import { todayBRT } from "@/lib/lease-dashboard";
import { tenantRows, tenantViewFromParam, type TenantRow, type TenantView } from "@/lib/tenant-dashboard";
import type { TenantDashboardView, TenantLeaseSummary, TenantListView } from "@/lib/tenant-views";
import type { TenantFormData, TenantWithDetails } from "@/types/tenant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FormState {
    editingId: string | null;
    initial: TenantFormData;
}

interface Props {
    lang: string;
    /** The list as the page preloaded it on the server; refreshes go through the API. */
    initial?: TenantListView | null;
    /** The dashboard of `?id=`, preloaded the same way. */
    initialDashboard?: TenantDashboardView | null;
}

export default function InquilinosContent({ lang, initial = null, initialDashboard = null }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawId = searchParams.get("id") ?? searchParams.get("tenant");
    const selectedId = rawId && UUID.test(rawId) ? rawId : null;
    const view = tenantViewFromParam(searchParams.get("view"));
    const today = useMemo(() => todayBRT(), []);
    const base = lang === "pt" ? "/inquilinos" : `/${lang}/inquilinos`;

    // ── List ──────────────────────────────────────────────────────
    const [tenants, setTenants] = useState<TenantWithDetails[] | null>(initial?.tenants ?? null);
    const [leases, setLeases] = useState<TenantLeaseSummary[]>(initial?.leases ?? []);
    /** Seeded from the server: no first fetch. Read once — later prop changes must not reset the list. */
    const [seeded] = useState(initial !== null);
    const [listError, setListError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/tenants");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Erro ao carregar os inquilinos");
        setTenants((json.tenants ?? []) as TenantWithDetails[]);
        setLeases((json.leases ?? []) as TenantLeaseSummary[]);
    }, []);

    useEffect(() => {
        if (seeded) return;
        let alive = true;
        load().catch(err => { if (alive) { setListError(err instanceof Error ? err.message : "Erro ao carregar"); setTenants([]); } });
        return () => { alive = false; };
    }, [load, seeded]);

    const rows = useMemo(() => tenantRows(tenants ?? [], leases, today), [tenants, leases, today]);

    // ── Dropdowns (the form) ──────────────────────────────────────
    const [dropdowns, setDropdowns] = useState<TenantFormDropdowns | null>(null);
    const fetchDropdowns = useCallback(async () => {
        try {
            const [propsRes, agenciesRes, agentsRes] = await Promise.all([fetch("/api/tenants/properties"), fetch("/api/agencies"), fetch("/api/agents")]);
            const props = propsRes.ok ? await propsRes.json() : {};
            const ag = agenciesRes.ok ? await agenciesRes.json() : {};
            const at = agentsRes.ok ? await agentsRes.json() : {};
            setDropdowns({
                properties: props.properties || [],
                agencies: (ag.agencies || []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
                agents: (at.agents || []).map((a: { id: string; full_name: string; agency_id: string | null }) => ({ id: a.id, full_name: a.full_name, agency_id: a.agency_id })),
            });
        } catch (err) {
            console.error("[Inquilinos] Error fetching dropdown data:", err);
        }
    }, []);
    useEffect(() => { void fetchDropdowns(); }, [fetchDropdowns]);

    // ── Navigation ────────────────────────────────────────────────
    const viewQuery = view === "atuais" ? "" : `view=${view}`;
    const select = useCallback((id: string | null) => {
        const query = [id ? `id=${id}` : "", viewQuery].filter(Boolean).join("&");
        router.push(query ? `${base}?${query}` : base, { scroll: true });
    }, [router, base, viewQuery]);
    const setView = (next: TenantView) => router.replace(next === "atuais" ? base : `${base}?view=${next}`, { scroll: false });

    // Opened from a property's "Contrato de Aluguel" card (?property=<id>): offers the way back
    const returnPropertyId = useReturnPropertyId();

    // ── Form ──────────────────────────────────────────────────────
    const [formState, setFormState] = useState<FormState | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [dashboardKey, setDashboardKey] = useState(0);

    const openNew = () => setFormState({ editingId: null, initial: emptyTenantForm() });
    const openEdit = (tenant: TenantWithDetails) => setFormState({ editingId: tenant.id, initial: tenantToForm(tenant) });
    const onSaved = async (id: string, created: boolean) => {
        setFormState(null);
        setNotice(created ? "Inquilino cadastrado. Envie a foto clicando no avatar; o contrato dele entra em Contratos." : "Dados salvos.");
        setDashboardKey(k => k + 1);
        await load().catch(() => {});
        select(id);
    };

    // ── Delete ────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<TenantWithDetails | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/tenants/${deleteTarget.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setDeleteError(typeof json.error === "string" ? json.error : "Erro ao excluir inquilino."); return; }
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
                    <h2 className="mb-2 text-xl font-bold text-foreground">Excluir inquilino?</h2>
                    <p className="text-sm text-muted-foreground">
                        Tem certeza de que deseja excluir <span className="font-semibold text-foreground">{deleteTarget.full_name}</span>?
                        Quem apenas saiu do imóvel deve ficar como &ldquo;Antigo&rdquo;, no histórico — excluir é para cadastros errados.
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
                        {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...</> : "Excluir inquilino"}
                    </Button>
                </div>
            </div>
        </div>
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
            <TenantForm
                key={formState.editingId ?? "new"}
                editingId={formState.editingId}
                initial={formState.initial}
                dropdowns={dropdowns}
                onSaved={id => { void onSaved(id, formState.editingId === null); }}
                onCancel={() => setFormState(null)}
                topSlot={<ReturnToPropertyLink propertyId={returnPropertyId} className="mb-4 flex w-fit" />}
            />
        );
    }

    if (selectedId) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
                <ReturnToPropertyLink propertyId={returnPropertyId} />
                <TenantDashboard
                    key={selectedId}
                    tenantId={selectedId}
                    lang={lang}
                    today={today}
                    initialBundle={initialDashboard}
                    refreshKey={dashboardKey}
                    notice={notice}
                    onDismissNotice={() => setNotice(null)}
                    onBack={() => select(null)}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                />
                {deleteModal}
            </div>
        );
    }

    return (
        <>
            <InquilinosHub
                rows={rows}
                today={today}
                loading={tenants === null}
                error={listError}
                view={view}
                onViewChange={setView}
                onOpen={(row: TenantRow) => select(row.tenant.id)}
                onDelete={row => setDeleteTarget(row.tenant)}
                deletingId={deleting && deleteTarget ? deleteTarget.id : null}
                onNew={openNew}
            />
            {deleteModal}
        </>
    );
}
