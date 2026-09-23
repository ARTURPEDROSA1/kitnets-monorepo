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
import { formatBRL, type NewInvestment } from "@/lib/new-investments";
import type { InvestmentCardSummary } from "@/lib/new-investment-metrics";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The form's text fields, as the API's body. Empty strings become nulls, not zeros. */
function toPayload(values: InvestmentFormValues) {
    const optional = (v: string) => (v.trim() ? v.trim() : null);
    return {
        name: values.name.trim(),
        unit_label: optional(values.unit_label),
        developer: optional(values.developer),
        kind: values.kind,
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

export default function ProjetosContent({ lang }: { lang: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedId = searchParams.get("id");

    const [investments, setInvestments] = useState<NewInvestment[] | null>(null);
    const [summaries, setSummaries] = useState<Record<string, InvestmentCardSummary>>({});
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
        let alive = true;
        load()
            .catch(err => { if (alive) { setError(err instanceof Error ? err.message : "Erro ao carregar"); setInvestments([]); } });
        return () => { alive = false; };
    }, [load]);

    const base = lang === "pt" ? "/projetos" : `/${lang}/projetos`;
    const select = (id: string | null) => router.push(id ? `${base}?id=${id}` : base, { scroll: true });

    const totals = useMemo(() => {
        const list = Object.values(summaries);
        return {
            paid: list.reduce((s, x) => s + x.paidToDate, 0),
            committed: list.reduce((s, x) => s + x.committed, 0),
            remaining: list.reduce((s, x) => s + x.remaining, 0),
            overdue: list.reduce((s, x) => s + x.overdueCount, 0),
        };
    }, [summaries]);

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
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Investido até agora</span>
                        <span className="block text-xl font-bold tabular-nums text-foreground">{formatBRL(totals.paid, 0)}</span>
                        <span className="text-xs text-muted-foreground">em {investments.length} unidade{investments.length === 1 ? "" : "s"}</span>
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
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {investments.map(investment => (
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
