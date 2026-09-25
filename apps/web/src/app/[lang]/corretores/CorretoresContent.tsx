"use client";

/**
 * Corretores — the hub of the account's corretores, one corretor's dashboard (`?id=`, the old
 * `?agent=` deep link kept) and the form that creates or edits one. The list and the dashboard are
 * preloaded by the page on the server; refreshes go through the API.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import CorretoresHub from "@/components/corretores/CorretoresHub";
import AgentDashboard from "@/components/corretores/AgentDashboard";
import AgentForm, { agentToForm, emptyAgentForm, type AgencyChoice } from "@/components/corretores/AgentForm";
import { todayBRT } from "@/lib/lease-dashboard";
import { agentRows, agentViewFromParam, type AgentRow, type AgentView } from "@/lib/agent-dashboard";
import type { AgentDashboardView, AgentLeaseSummary, AgentListView, AgentTenantSummary } from "@/lib/agent-views";
import type { AgentFormData, AgentWithAgency } from "@/types/agent";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FormState {
    editingId: string | null;
    initial: AgentFormData;
}

interface Props {
    lang: string;
    initial?: AgentListView | null;
    initialDashboard?: AgentDashboardView | null;
}

export default function CorretoresContent({ lang, initial = null, initialDashboard = null }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawId = searchParams.get("id") ?? searchParams.get("agent");
    const selectedId = rawId && UUID.test(rawId) ? rawId : null;
    const view = agentViewFromParam(searchParams.get("view"));
    const today = useMemo(() => todayBRT(), []);
    const base = lang === "pt" ? "/corretores" : `/${lang}/corretores`;

    // ── List ──────────────────────────────────────────────────────
    const [agents, setAgents] = useState<AgentWithAgency[] | null>(initial?.agents ?? null);
    const [leases, setLeases] = useState<AgentLeaseSummary[]>(initial?.leases ?? []);
    const [tenants, setTenants] = useState<AgentTenantSummary[]>(initial?.tenants ?? []);
    const [seeded] = useState(initial !== null);
    const [listError, setListError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/agents");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Erro ao carregar os corretores");
        setAgents((json.agents ?? []) as AgentWithAgency[]);
        setLeases((json.leases ?? []) as AgentLeaseSummary[]);
        setTenants((json.tenants ?? []) as AgentTenantSummary[]);
    }, []);

    useEffect(() => {
        if (seeded) return;
        let alive = true;
        load().catch(err => { if (alive) { setListError(err instanceof Error ? err.message : "Erro ao carregar"); setAgents([]); } });
        return () => { alive = false; };
    }, [load, seeded]);

    const rows = useMemo(() => agentRows(agents ?? [], leases, tenants, today), [agents, leases, tenants, today]);

    // ── Agencies (the form) ───────────────────────────────────────
    const [agencies, setAgencies] = useState<AgencyChoice[] | null>(null);
    useEffect(() => {
        let alive = true;
        fetch("/api/agencies")
            .then(res => (res.ok ? res.json() : { agencies: [] }))
            .then(json => { if (alive) setAgencies(((json.agencies ?? []) as Array<{ id: string; name: string; trade_name?: string | null }>).map(a => ({ id: a.id, name: a.name, trade_name: a.trade_name ?? null }))); })
            .catch(() => { if (alive) setAgencies([]); });
        return () => { alive = false; };
    }, []);

    // ── Navigation ────────────────────────────────────────────────
    const viewQuery = view === "ativos" ? "" : `view=${view}`;
    const select = useCallback((id: string | null) => {
        const query = [id ? `id=${id}` : "", viewQuery].filter(Boolean).join("&");
        router.push(query ? `${base}?${query}` : base, { scroll: true });
    }, [router, base, viewQuery]);
    const setView = (next: AgentView) => router.replace(next === "ativos" ? base : `${base}?view=${next}`, { scroll: false });

    // ── Form ──────────────────────────────────────────────────────
    const [formState, setFormState] = useState<FormState | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [dashboardKey, setDashboardKey] = useState(0);

    const openNew = () => setFormState({ editingId: null, initial: emptyAgentForm() });
    const openEdit = (agent: AgentWithAgency) => setFormState({ editingId: agent.id, initial: agentToForm(agent) });
    const onSaved = async (id: string, created: boolean) => {
        setFormState(null);
        setNotice(created ? "Corretor cadastrado. Envie a foto clicando no avatar; selecione-o no campo Corretor dos contratos que ele responde." : "Dados salvos.");
        setDashboardKey(k => k + 1);
        await load().catch(() => {});
        select(id);
    };

    const toggleStatus = async (agent: AgentWithAgency) => {
        const res = await fetch(`/api/agents/${agent.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...agentToForm(agent), status: agent.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
        });
        if (!res.ok) { setListError("Não foi possível alterar o status do corretor."); return; }
        setDashboardKey(k => k + 1);
        await load().catch(() => {});
    };

    // ── Delete ────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<AgentWithAgency | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/agents/${deleteTarget.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setDeleteError(typeof json.error === "string" ? json.error : "Erro ao excluir corretor."); return; }
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
                    <h2 className="mb-2 text-xl font-bold text-foreground">Excluir corretor?</h2>
                    <p className="text-sm text-muted-foreground">
                        Tem certeza de que deseja excluir <span className="font-semibold text-foreground">{deleteTarget.full_name}</span>?
                        Um corretor que só deixou de atuar pode ficar como &ldquo;Inativo&rdquo; — excluir é para cadastros errados.
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
                        {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...</> : "Excluir corretor"}
                    </Button>
                </div>
            </div>
        </div>
    );

    if (formState) {
        if (!agencies) {
            return (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            );
        }
        return (
            <AgentForm
                key={formState.editingId ?? "new"}
                editingId={formState.editingId}
                initial={formState.initial}
                agencies={agencies}
                onSaved={id => { void onSaved(id, formState.editingId === null); }}
                onCancel={() => setFormState(null)}
            />
        );
    }

    if (selectedId) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
                <AgentDashboard
                    key={selectedId}
                    agentId={selectedId}
                    lang={lang}
                    today={today}
                    initialBundle={initialDashboard}
                    refreshKey={dashboardKey}
                    notice={notice}
                    onDismissNotice={() => setNotice(null)}
                    onBack={() => select(null)}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    onToggleStatus={toggleStatus}
                />
                {deleteModal}
            </div>
        );
    }

    return (
        <>
            <CorretoresHub
                rows={rows}
                loading={agents === null}
                error={listError}
                view={view}
                onViewChange={setView}
                onOpen={(row: AgentRow) => select(row.agent.id)}
                onDelete={row => setDeleteTarget(row.agent)}
                deletingId={deleting && deleteTarget ? deleteTarget.id : null}
                onNew={openNew}
            />
            {deleteModal}
        </>
    );
}
