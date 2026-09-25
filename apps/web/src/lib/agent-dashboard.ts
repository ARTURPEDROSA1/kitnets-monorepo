/**
 * Corretores — the pure maths behind the hub (`/corretores`) and one corretor's dashboard (`?id=`):
 * what each corretor runs (the leases with their name on them), whom they look after (the tenants
 * with their name on them), what that rent adds up to, and what deserves a look.
 */
import type { AgentStatus, AgentWithAgency } from "@/types/agent";
import type { AgentLeaseSummary, AgentTenantSummary } from "@/lib/agent-views";
import { IN_FORCE, brl } from "@/lib/lease-dashboard";
import { monthsElapsed, monthsLabel } from "@/lib/tenant-dashboard";
import { formatCRECI } from "@/lib/validators";
import { telUrl, whatsappUrl } from "@/lib/social-links";

export { brl, monthsLabel };

// ── Status / type ────────────────────────────────────────────────────

export interface AgentStatusMeta { label: string; pill: string; bar: string }

export const AGENT_STATUS_META: Record<AgentStatus, AgentStatusMeta> = {
    ACTIVE: { label: "Ativo", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", bar: "bg-emerald-500" },
    INACTIVE: { label: "Inativo", pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300", bar: "bg-slate-400" },
};

export const AGENT_TYPE_LABELS: Record<string, string> = { AUTONOMO: "Corretor autônomo", IMOBILIARIA: "Imobiliária" };

// ── Views ────────────────────────────────────────────────────────────

export type AgentView = "ativos" | "inativos" | "todos";
export const DEFAULT_AGENT_VIEW: AgentView = "ativos";
export const AGENT_VIEWS: Array<{ key: AgentView; label: string; empty: string }> = [
    { key: "ativos", label: "Ativos", empty: "Nenhum corretor ativo." },
    { key: "inativos", label: "Inativos", empty: "Nenhum corretor inativo." },
    { key: "todos", label: "Todos", empty: "Nenhum corretor." },
];
export const agentViewFromParam = (v: string | null): AgentView => (AGENT_VIEWS.some(x => x.key === v) ? (v as AgentView) : DEFAULT_AGENT_VIEW);

export function inAgentView(status: AgentStatus, view: AgentView): boolean {
    return view === "todos" || (view === "ativos" ? status === "ACTIVE" : status === "INACTIVE");
}

// ── Rows ─────────────────────────────────────────────────────────────

export interface AgentRow {
    agent: AgentWithAgency;
    status: AgentStatus;
    /** the leases with this corretor on them, newest first */
    leases: AgentLeaseSummary[];
    /** the ones in force (stored ACTIVE / EXPIRING_SOON) */
    inForce: AgentLeaseSummary[];
    /** Σ rent of the leases in force */
    rentManaged: number;
    tenants: AgentTenantSummary[];
    /** tenants living there now */
    activeTenants: number;
    /** "CRECI-MG 12345" */
    creci: string;
    /** "Imobiliária Projetar" or "Corretor autônomo" */
    affiliation: string;
    /** registered on (YYYY-MM-DD) and for how long */
    since: string;
    monthsRegistered: number;
    hasPhone: boolean;
    hasEmail: boolean;
    /** wa.me link when the main phone is flagged as WhatsApp */
    whatsapp: string | null;
    tel: string | null;
    /** lower-cased text the search box matches against */
    haystack: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function affiliationOf(agent: Pick<AgentWithAgency, "agent_type" | "agency_name" | "agency_id">): string {
    if (agent.agent_type === "AUTONOMO") return "Corretor autônomo";
    return agent.agency_name ?? (agent.agency_id ? "Imobiliária" : "Imobiliária removida");
}

export function agentRows(agents: AgentWithAgency[], leases: AgentLeaseSummary[], tenants: AgentTenantSummary[], today: string): AgentRow[] {
    const leasesBy = new Map<string, AgentLeaseSummary[]>();
    for (const l of leases) leasesBy.set(l.agent_id, [...(leasesBy.get(l.agent_id) ?? []), l]);
    const tenantsBy = new Map<string, AgentTenantSummary[]>();
    for (const t of tenants) tenantsBy.set(t.agent_id, [...(tenantsBy.get(t.agent_id) ?? []), t]);

    return agents.map(agent => {
        const own = [...(leasesBy.get(agent.id) ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date));
        const inForce = own.filter(l => IN_FORCE.has(l.status));
        const ownTenants = tenantsBy.get(agent.id) ?? [];
        const since = agent.created_at.slice(0, 10);
        const affiliation = affiliationOf(agent);
        return {
            agent,
            status: agent.status,
            leases: own,
            inForce,
            rentManaged: Math.round(inForce.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0) * 100) / 100,
            tenants: ownTenants,
            activeTenants: ownTenants.filter(t => t.status === "ACTIVE").length,
            creci: formatCRECI(agent.creci_number, agent.creci_state),
            affiliation,
            since,
            monthsRegistered: monthsElapsed(since, today),
            hasPhone: Boolean(agent.main_phone),
            hasEmail: Boolean(agent.email),
            whatsapp: agent.main_phone && agent.main_phone_whatsapp ? whatsappUrl(agent.main_phone) : agent.additional_phone && agent.additional_phone_whatsapp ? whatsappUrl(agent.additional_phone) : null,
            tel: telUrl(agent.main_phone ?? agent.additional_phone),
            haystack: fold([agent.full_name, agent.creci_number, agent.cpf, affiliation, agent.email, agent.main_phone, ...own.map(l => `${l.property_name ?? ""} ${l.unit_name ?? ""} ${l.primary_tenant_name ?? ""}`)].filter(Boolean).join(" ")),
        };
    });
}

// ── Hub totals ───────────────────────────────────────────────────────

export interface AgentHubTotals {
    total: number;
    active: number;
    inactive: number;
    /** distinct leases in force with a corretor on them */
    leasesInForce: number;
    leasesTotal: number;
    /** Σ rent of those, each lease once */
    rentManaged: number;
    /** distinct tenants living there now with a corretor */
    tenantsServed: number;
    /** distinct agencies the active corretores work for */
    agencies: number;
    autonomous: number;
    /** active corretores with neither phone nor e-mail */
    withoutContact: number;
    /** active corretores with no lease in force and no current tenant */
    idle: number;
}

export function agentHubTotals(rows: AgentRow[]): AgentHubTotals {
    const active = rows.filter(r => r.status === "ACTIVE");
    const rentByLease = new Map<string, number>();
    const leaseIds = new Set<string>();
    const tenantIds = new Set<string>();
    for (const r of rows) {
        for (const l of r.leases) leaseIds.add(l.id);
        for (const l of r.inForce) rentByLease.set(l.id, Number(l.monthly_rent) || 0);
        for (const t of r.tenants) if (t.status === "ACTIVE") tenantIds.add(t.id);
    }
    return {
        total: rows.length,
        active: active.length,
        inactive: rows.length - active.length,
        leasesInForce: rentByLease.size,
        leasesTotal: leaseIds.size,
        rentManaged: Math.round([...rentByLease.values()].reduce((s, v) => s + v, 0) * 100) / 100,
        tenantsServed: tenantIds.size,
        agencies: new Set(active.filter(r => r.agent.agent_type === "IMOBILIARIA" && r.agent.agency_id).map(r => r.agent.agency_id as string)).size,
        autonomous: active.filter(r => r.agent.agent_type === "AUTONOMO").length,
        withoutContact: active.filter(r => !r.hasPhone && !r.hasEmail).length,
        idle: active.filter(r => r.inForce.length === 0 && r.activeTenants === 0).length,
    };
}

// ── Attention ────────────────────────────────────────────────────────

export type AgentAttentionKind = "inactive_with_leases" | "agency_gone" | "no_phone" | "idle";

export interface AgentAttentionItem {
    kind: AgentAttentionKind;
    tone: "rose" | "amber" | "slate";
    row: AgentRow;
    text: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Most pressing first: an inactive corretor still on contracts in force, an agency link gone, no phone, nothing to do. */
export function agentAttention(rows: AgentRow[]): AgentAttentionItem[] {
    const items: AgentAttentionItem[] = [];
    for (const row of rows) {
        const { agent } = row;
        if (agent.status === "INACTIVE" && row.inForce.length > 0) {
            items.push({ kind: "inactive_with_leases", tone: "rose", row, text: `Inativo, mas ainda responde por ${plural(row.inForce.length, "contrato em vigor", "contratos em vigor")}: reative ou troque o corretor nos contratos.` });
        }
        if (agent.status !== "ACTIVE") continue;
        if (agent.agent_type === "IMOBILIARIA" && !agent.agency_id) items.push({ kind: "agency_gone", tone: "amber", row, text: "A imobiliária deste corretor foi removida: vincule outra ou marque como autônomo." });
        if (!row.hasPhone) items.push({ kind: "no_phone", tone: "slate", row, text: "Sem telefone: complete o contato." });
        if (row.inForce.length === 0 && row.activeTenants === 0) items.push({ kind: "idle", tone: "slate", row, text: "Nenhum contrato em vigor nem inquilino atendido." });
    }
    const order: Record<AgentAttentionKind, number> = { inactive_with_leases: 0, agency_gone: 1, no_phone: 2, idle: 3 };
    return items.sort((a, b) => order[a.kind] - order[b.kind] || a.row.agent.full_name.localeCompare(b.row.agent.full_name));
}
