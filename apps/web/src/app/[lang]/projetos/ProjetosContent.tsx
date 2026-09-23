"use client";

/**
 * Projetos (until 2026-09 "Novos Investimentos"; the tables, types and routes keep the old name) —
 * what is being bought or built, one square card each, with the totals of the whole pipeline on
 * top. Off-plan units today; land + build, refurbishment and auction purchases share the same
 * skeleton (a cost plan → a disbursement ledger → a completion → rent or sale) and come next.
 * A card opens the project's dashboard (`?id=<investimento>`), where the
 * payments, the cash-flow simulator and the files live.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Building2, HardHat, Loader2, Plus, Wallet } from "lucide-react";
import { Button } from "@kitnets/ui";
import InvestmentSquareCard from "@/components/investments/InvestmentSquareCard";
import InvestmentDashboard from "@/components/investments/InvestmentDashboard";
import InvestmentFormModal, { type InvestmentFormValues } from "@/components/investments/InvestmentFormModal";
import { cn } from "@/lib/utils";
import { formatBRL, type InvestmentStatus, type NewInvestment } from "@/lib/new-investments";
import type { InvestmentCardSummary } from "@/lib/new-investment-metrics";

/** The hub shows one slice of the pipeline at a time: what is still running, what was sold, what became a property. */
type ProjectView = "andamento" | "vendidos" | "imoveis" | "todos";
const DEFAULT_VIEW: ProjectView = "andamento";
const VIEWS: Array<{ key: ProjectView; label: string }> = [
    { key: "andamento", label: "Em andamento" },
    { key: "vendidos", label: "Vendidos" },
    { key: "imoveis", label: "Em Imóveis" },
    { key: "todos", label: "Todos" },
];
const VIEW_STATUSES: Record<Exclude<ProjectView, "todos">, InvestmentStatus[]> = {
    andamento: ["ACTIVE", "ARCHIVED"],
    vendidos: ["SOLD"],
    imoveis: ["COMPLETED"],
};
const EMPTY_VIEW: Record<ProjectView, string> = {
    andamento: "Nenhum projeto em andamento.",
    vendidos: "Nenhum projeto vendido ainda.",
    imoveis: "Nenhum projeto virou imóvel da carteira ainda.",
    todos: "Nenhum projeto.",
};
const viewFromParam = (v: string | null): ProjectView => (VIEWS.some(x => x.key === v) ? (v as ProjectView) : DEFAULT_VIEW);
import type { ProjectDashboardView, ProjectListView } from "@/lib/new-investment-views";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The form's text fields, as the API's body. Empty strings become nulls, not zeros. */
function toPayload(values: InvestmentFormValues) {
    const optional = (v: string) => (v.trim() ? v.trim() : null);
    return {
        name: values.name.trim(),
        unit_label: optional(values.unit_label),
        developer: optional(values.developer),
        kind: values.kind,
        strategy: values.strategy,
        exit_plan: values.exit_plan,
        description: optional(values.description),
        street: optional(values.street),
        street_number: optional(values.street_number),
        neighborhood: optional(values.neighborhood),
        city: optional(values.city),
        state: optional(values.state),
        postal_code: optional(values.postal_code),
        total_price: optional(values.total_price),
        down_payment: optional(values.down_payment),
        financed_amount: optional(values.financed_amount),
        area_m2: optional(values.area_m2),
        contract_date: optional(values.contract_date),
        keys_expected_on: optional(values.keys_expected_on),
        index_before_keys: values.index_before_keys,
        index_after_keys: values.index_after_keys,
        estimated_rent: optional(values.estimated_rent),
        schedules: values.schedules.map(s => ({
            label: s.label || "Parcelas",
            kind: s.kind,
            installments: s.installments,
            amount: s.amount,
            first_due_on: s.first_due_on,
            periodicity: s.periodicity,
            index_code: s.index_code,
        })),
    };
}

interface Props {
    lang: string;
    /** The list as the page preloaded it on the server — the first paint has the cards; refreshes go through the API. */
    initial?: ProjectListView | null;
    /** The dashboard of `?id=`, preloaded the same way. */
    initialDashboard?: ProjectDashboardView | null;
}

export default function ProjetosContent({ lang, initial = null, initialDashboard = null }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedId = searchParams.get("id");

    const [investments, setInvestments] = useState<NewInvestment[] | null>(initial?.investments ?? null);
    const [summaries, setSummaries] = useState<Record<string, InvestmentCardSummary>>(
        () => Object.fromEntries((initial?.summaries ?? []).map(s => [s.id, s]))
    );
    /** Seeded from the server: no first fetch. Read once — later prop changes must not reset the list. */
    const [seeded] = useState(initial !== null);
    const [error, setError] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/investments");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Erro ao carregar os projetos");
        setInvestments(json.investments ?? []);
        setSummaries(Object.fromEntries(((json.summaries ?? []) as InvestmentCardSummary[]).map(s => [s.id, s])));
    }, []);

    useEffect(() => {
        if (seeded) return;
        let alive = true;
        load()
            .catch(err => { if (alive) { setError(err instanceof Error ? err.message : "Erro ao carregar"); setInvestments([]); } });
        return () => { alive = false; };
    }, [load, seeded]);

    const base = lang === "pt" ? "/projetos" : `/${lang}/projetos`;
    // The view lives in the URL (`?view=vendidos`): it survives opening a project and coming back,
    // and the server renders the same thing the client does — no flash from a stored preference.
    const view = viewFromParam(searchParams.get("view"));
    const viewQuery = view === DEFAULT_VIEW ? "" : `view=${view}`;
    const select = (id: string | null) => {
        const query = [id ? `id=${id}` : "", viewQuery].filter(Boolean).join("&");
        router.push(query ? `${base}?${query}` : base, { scroll: true });
    };
    const setView = (next: ProjectView) => router.replace(next === DEFAULT_VIEW ? base : `${base}?view=${next}`, { scroll: false });

    const counts = useMemo(() => {
        const all = investments ?? [];
        return {
            andamento: all.filter(i => VIEW_STATUSES.andamento.includes(i.status)).length,
            vendidos: all.filter(i => VIEW_STATUSES.vendidos.includes(i.status)).length,
            imoveis: all.filter(i => VIEW_STATUSES.imoveis.includes(i.status)).length,
            todos: all.length,
        };
    }, [investments]);
    const visible = useMemo(
        () => (investments ?? []).filter(i => view === "todos" || VIEW_STATUSES[view].includes(i.status)),
        [investments, view]
    );

    const totals = useMemo(() => {
        const list = visible.map(i => summaries[i.id]).filter((s): s is InvestmentCardSummary => Boolean(s));
        return {
            count: visible.length,
            paid: list.reduce((s, x) => s + x.paidToDate, 0),
            committed: list.reduce((s, x) => s + x.committed, 0),
            remaining: list.reduce((s, x) => s + x.remaining, 0),
            overdue: list.reduce((s, x) => s + x.overdueCount, 0),
            saleNet: list.reduce((s, x) => s + (x.saleNet ?? 0), 0),
            realizedGain: list.reduce((s, x) => s + (x.realizedGain ?? 0), 0),
        };
    }, [visible, summaries]);

    const create = async (values: InvestmentFormValues, contractPath: string | null, contractName: string | null): Promise<string | null> => {
        const res = await fetch("/api/investments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toPayload(values)),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            setError(typeof json.error === "string" ? json.error : Object.values(json.errors ?? {})[0] as string ?? "Erro ao criar o projeto");
            return null;
        }
        const id = json.investment?.id as string | undefined;
        if (id && contractPath) {
            // The contract the AI read is already in storage: file it under the investment.
            await fetch(`/api/investments/${id}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "CONTRACT", storage_path: contractPath, file_name: contractName }),
            });
        }
        setFormOpen(false);
        await load();
        if (id) select(id);
        return id ?? null;
    };

    const remove = async (id: string, name: string) => {
        if (!window.confirm(`Excluir "${name}"? Os pagamentos e arquivos deste projeto serão apagados.`)) return;
        setDeletingId(id);
        const res = await fetch(`/api/investments/${id}`, { method: "DELETE" });
        setDeletingId(null);
        if (!res.ok) {
            setError("Não foi possível excluir o projeto.");
            return;
        }
        await load();
    };

    if (selectedId && UUID.test(selectedId)) {
        return (
            <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
                <InvestmentDashboard
                    investmentId={selectedId}
                    lang={lang}
                    onBack={() => select(null)}
                    onChanged={() => { load().catch(() => {}); }}
                    initialBundle={initialDashboard}
                />
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground inline-flex items-center gap-2">
                        <HardHat className="w-6 h-6 text-emerald-600" /> Projetos
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        O que está sendo comprado ou construído: o que já foi pago, o que falta, quanto vai valer e quando começa a render.
                    </p>
                </div>
                <Button onClick={() => { setFormOpen(true); setError(null); }}>
                    <Plus className="w-4 h-4 mr-1" /> Novo projeto
                </Button>
            </div>

            {investments && investments.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais projetos mostrar">
                    {VIEWS.map(v => (
                        <button
                            key={v.key}
                            type="button"
                            role="tab"
                            aria-selected={view === v.key}
                            onClick={() => setView(v.key)}
                            className={cn(
                                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                view === v.key
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-emerald-300"
                            )}
                        >
                            {v.label} ({counts[v.key]})
                        </button>
                    ))}
                </div>
            )}

            {investments && visible.length > 0 && view === "vendidos" ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Pago até a venda</span>
                        <span className="block text-xl font-bold tabular-nums text-foreground">{formatBRL(totals.paid, 0)}</span>
                        <span className="text-xs text-muted-foreground">em {totals.count} projeto{totals.count === 1 ? "" : "s"} vendido{totals.count === 1 ? "" : "s"}</span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Vendas líquidas</span>
                        <span className="block text-xl font-bold tabular-nums text-emerald-600">{formatBRL(totals.saleNet, 0)}</span>
                        <span className="text-xs text-muted-foreground">após os custos de venda</span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Ganho realizado</span>
                        <span className={`block text-xl font-bold tabular-nums ${totals.realizedGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {totals.realizedGain > 0 ? "+" : ""}{formatBRL(totals.realizedGain, 0)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {totals.paid > 0 ? `${((totals.realizedGain / totals.paid) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% sobre o pago` : "—"}
                        </span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Custo total</span>
                        <span className="block text-xl font-bold tabular-nums text-foreground">{formatBRL(totals.committed, 0)}</span>
                        <span className="text-xs text-muted-foreground">o que foi pago; o resto passou ao comprador</span>
                    </div>
                </div>
            ) : investments && visible.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Investido até agora</span>
                        <span className="block text-xl font-bold tabular-nums text-foreground">{formatBRL(totals.paid, 0)}</span>
                        <span className="text-xs text-muted-foreground">em {totals.count} unidade{totals.count === 1 ? "" : "s"}</span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Falta pagar</span>
                        <span className="block text-xl font-bold tabular-nums text-amber-600">{formatBRL(totals.remaining, 0)}</span>
                        <span className="text-xs text-muted-foreground">parcelas previstas em contrato</span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Custo total</span>
                        <span className="block text-xl font-bold tabular-nums text-foreground">{formatBRL(totals.committed, 0)}</span>
                        <span className="text-xs text-muted-foreground">
                            {totals.committed > 0 ? `${((totals.paid / totals.committed) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% quitado` : "—"}
                        </span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Parcelas em atraso</span>
                        <span className={`block text-xl font-bold tabular-nums ${totals.overdue > 0 ? "text-rose-600" : "text-emerald-600"}`}>{totals.overdue}</span>
                        <span className="text-xs text-muted-foreground">{totals.overdue > 0 ? "lance o pagamento ou ajuste o plano" : "tudo em dia"}</span>
                    </div>
                </div>
            )}

            {error && (
                <p className="flex items-start gap-2 text-sm text-rose-600">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                </p>
            )}

            {investments === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                </div>
            ) : investments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center space-y-3">
                    <Building2 className="w-10 h-10 mx-auto text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhum projeto ainda</h2>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Envie o contrato de compra e venda: a IA lê o quadro resumo, monta o plano de parcelas e a partir
                        daí basta lançar cada pagamento com o comprovante.
                    </p>
                    <Button onClick={() => setFormOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Cadastrar o primeiro
                    </Button>
                </div>
            ) : visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center space-y-2">
                    <p className="text-sm text-muted-foreground">{EMPTY_VIEW[view]}</p>
                    <button type="button" onClick={() => setView("todos")} className="text-sm text-emerald-700 dark:text-emerald-400 underline underline-offset-2">
                        Ver todos os {counts.todos} projetos
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {visible.map(investment => (
                        <InvestmentSquareCard
                            key={investment.id}
                            investment={investment}
                            summary={summaries[investment.id]}
                            photoUrls={summaries[investment.id]?.photoUrls}
                            onSelect={() => select(investment.id)}
                            onDelete={e => { e.stopPropagation(); remove(investment.id, investment.name); }}
                            isDeleting={deletingId === investment.id}
                        />
                    ))}
                </div>
            )}

            {investments !== null && investments.length > 0 && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" />
                    Quando a unidade for entregue e começar a render, use &ldquo;Mover para Imóveis&rdquo; no painel dela.
                </p>
            )}

            <InvestmentFormModal open={formOpen} onClose={() => setFormOpen(false)} onSubmit={create} />
        </div>
    );
}
