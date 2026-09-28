"use client";

/**
 * Contábil & Fiscal › Plano de contas.
 *
 * The holding's chart, created from the template on first visit (lib/accounting-chart.ts).
 * Model accounts (with a system key) can be renamed and switched off but not deleted: the
 * automation posts to them. The contador may add groups and analytic accounts under any
 * group; an account that has lines is deactivated, never deleted.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookText, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { ContabilNav } from "@/components/contabil/ContabilNav";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_LABELS, codeLevel, parentCode, type AccountingAccount } from "@/lib/accounting-chart";

interface Props { lang: "en" | "pt" | "es" }

export default function PlanoDeContasContent({ lang }: Props) {
    const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
    const [usage, setUsage] = useState<Record<string, number>>({});
    const [measurement, setMeasurement] = useState<string>("COST");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [showInactive, setShowInactive] = useState(false);
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
    const [adding, setAdding] = useState<{ parent: string; code: string; name: string; analytic: boolean } | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/accounting/accounts");
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao carregar");
            setAccounts(d.accounts ?? []);
            setUsage(d.usage ?? {});
            setMeasurement(d.measurement ?? "COST");
        } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const visible = useMemo(() => accounts.filter(a => showInactive || a.active), [accounts, showInactive]);
    const parents = useMemo(() => new Set(accounts.map(a => parentCode(a.code)).filter(Boolean)), [accounts]);

    const nextCode = (parent: string) => {
        const children = accounts.filter(a => parentCode(a.code) === parent).map(a => Number(a.code.split(".").pop()));
        const n = (children.length ? Math.max(...children) : 0) + 1;
        return codeLevel(parent) >= 3 ? `${parent}.${String(n).padStart(2, "0")}` : `${parent}.${n}`;
    };

    const call = async (method: string, body?: unknown, query = "") => {
        const res = await fetch(`/api/accounting/accounts${query}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Erro");
        return d;
    };

    const toggle = async (a: AccountingAccount) => {
        setBusy(a.id); setError(null);
        try {
            const d = await call("PATCH", { id: a.id, active: !a.active });
            setAccounts(prev => prev.map(x => (x.id === a.id ? d.account : x)));
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const rename = async () => {
        if (!editing) return;
        setBusy(editing.id); setError(null);
        try {
            const d = await call("PATCH", { id: editing.id, name: editing.name });
            setAccounts(prev => prev.map(x => (x.id === editing.id ? d.account : x)));
            setEditing(null);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const add = async () => {
        if (!adding) return;
        setBusy("add"); setError(null);
        try {
            await call("POST", { code: adding.code, name: adding.name, analytic: adding.analytic });
            setAdding(null);
            await load();
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const remove = async (a: AccountingAccount) => {
        if (!window.confirm(`Excluir a conta ${a.code} ${a.name}?`)) return;
        setBusy(a.id); setError(null);
        try {
            await call("DELETE", undefined, `?id=${a.id}`);
            setAccounts(prev => prev.filter(x => x.id !== a.id));
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <BookText className="w-8 h-8 text-emerald-600" /> Plano de contas
                </h1>
                <p className="text-base text-muted-foreground">
                    O plano da holding de locação: imóveis alugados como propriedades para investimento (terreno e edificação separados), tributos do Lucro Presumido e da reforma, receitas e despesas de aluguel. As contas com cadeado são usadas pela automação: podem ser renomeadas ou desativadas, não excluídas.
                </p>
            </div>
            <ContabilNav lang={lang} />

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Modelo dos imóveis: <strong className="text-foreground">{measurement === "FAIR_VALUE" ? "valor justo" : "custo menos depreciação"}</strong> (contas de depreciação ou de valor justo ligadas conforme as políticas)</span>
                <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
                    <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Mostrar contas inativas
                </label>
            </div>

            {error && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}
            {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>}

            {!loading && (
                <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium w-32">Código</th>
                                <th className="text-left px-3 py-2 font-medium">Conta</th>
                                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Tipo</th>
                                <th className="text-center px-3 py-2 font-medium hidden md:table-cell">Natureza</th>
                                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">Linhas</th>
                                <th className="px-3 py-2 w-40" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(a => {
                                const level = codeLevel(a.code);
                                const isEditing = editing?.id === a.id;
                                return (
                                    <React.Fragment key={a.id}>
                                        <tr className={cn("border-t border-border/60", !a.analytic && "bg-muted/20", !a.active && "opacity-50")}>
                                            <td className="px-3 py-1.5 font-mono text-xs">{a.code}</td>
                                            <td className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + (level - 1) * 1}rem` }}>
                                                {isEditing ? (
                                                    <div className="flex gap-2">
                                                        <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="h-8 text-sm" autoFocus
                                                            onKeyDown={e => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setEditing(null); }} />
                                                        <Button size="sm" onClick={rename} disabled={busy === a.id}>Salvar</Button>
                                                    </div>
                                                ) : (
                                                    <span className={cn(!a.analytic && "font-semibold")}>
                                                        {a.name}
                                                        {a.system_key && <Lock className="inline w-3 h-3 ml-1.5 text-muted-foreground" aria-label="conta do modelo" />}
                                                        {!a.active && <span className="ml-2 text-[10px] uppercase tracking-wide">inativa</span>}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-1.5 text-xs text-muted-foreground hidden md:table-cell">{ACCOUNT_TYPE_LABELS[a.account_type]}{a.analytic ? "" : " · grupo"}</td>
                                            <td className="px-3 py-1.5 text-xs text-center hidden md:table-cell">{a.nature === "D" ? "Devedora" : "Credora"}</td>
                                            <td className="px-3 py-1.5 text-xs text-right hidden md:table-cell">{usage[a.id] ?? ""}</td>
                                            <td className="px-3 py-1.5">
                                                <div className="flex justify-end gap-1">
                                                    {!a.analytic && (
                                                        <button type="button" title="Adicionar conta dentro deste grupo" className="p-1 text-muted-foreground hover:text-emerald-700"
                                                            onClick={() => setAdding({ parent: a.code, code: nextCode(a.code), name: "", analytic: codeLevel(a.code) >= 3 })}>
                                                            <Plus className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button type="button" title="Renomear" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => setEditing({ id: a.id, name: a.name })}>
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    {a.analytic && (
                                                        <button type="button" disabled={busy === a.id} className="px-1.5 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => toggle(a)}>
                                                            {a.active ? "Desativar" : "Ativar"}
                                                        </button>
                                                    )}
                                                    {!a.system_key && !usage[a.id] && !parents.has(a.code) && (
                                                        <button type="button" title="Excluir" disabled={busy === a.id} className="p-1 text-muted-foreground hover:text-rose-600" onClick={() => remove(a)}>
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {adding?.parent === a.code && (
                                            <tr className="border-t border-border/60 bg-emerald-50/40 dark:bg-emerald-950/10">
                                                <td className="px-3 py-2"><Input value={adding.code} onChange={e => setAdding({ ...adding, code: e.target.value })} className="h-8 text-xs font-mono" /></td>
                                                <td className="px-3 py-2" colSpan={4}>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Input value={adding.name} placeholder="Nome da conta" onChange={e => setAdding({ ...adding, name: e.target.value })} className="h-8 text-sm flex-1 min-w-[200px]" autoFocus />
                                                        <label className="text-xs flex items-center gap-1">
                                                            <input type="checkbox" checked={adding.analytic} onChange={e => setAdding({ ...adding, analytic: e.target.checked })} /> Analítica (recebe lançamentos)
                                                        </label>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex justify-end gap-1">
                                                        <Button size="sm" onClick={add} disabled={busy === "add"}>{busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancelar</Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-xs text-muted-foreground">O código referencial da Receita (Plano Referencial da ECD/ECF) é associado a cada conta quando a escrituração digital for gerada.</p>
        </div>
    );
}
