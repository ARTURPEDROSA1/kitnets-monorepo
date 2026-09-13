"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Landmark, Loader2, Plus, Receipt, Scale, Trash2, Wand2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PropertyTransaction } from "@/lib/property-investment";
import {
    iptuYearsFromTransactions,
    summarizeTaxes,
    TAX_KINDS,
    TAX_PAYERS,
    type PropertyTax,
    type PropertyTaxInput,
    type TaxKind,
    type TaxPayer,
} from "@/lib/property-taxes";

interface Props {
    propertyId?: string;
    /** Property setting: default payer for new rows and the note shown under the tiles. */
    iptuPaidByLandlord?: boolean;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toInput = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "" : n.toFixed(2));
const parseInput = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

type Draft = Partial<Record<"year" | "kind" | "amount" | "paidBy" | "date" | "comment", string>>;

export default function PropertyTaxesSection({ propertyId, iptuPaidByLandlord = false }: Props) {
    const endpoint = propertyId ? `/api/properties/${propertyId}/taxes` : null;
    const [rows, setRows] = useState<PropertyTax[]>([]);
    const [loading, setLoading] = useState<boolean>(Boolean(propertyId));
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [saving, setSaving] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});

    const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(null), 8000); };

    useEffect(() => {
        if (!endpoint) { setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        fetch(endpoint)
            .then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Erro ao carregar tributos");
                if (!cancelled) setRows(data.rows ?? []);
            })
            .catch(err => { if (!cancelled) setError((err as Error).message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [endpoint]);

    const put = useCallback(async (inputs: PropertyTaxInput[], keys: string[] = []) => {
        if (!endpoint) return false;
        setSaving(prev => new Set([...prev, ...keys]));
        setError(null);
        try {
            const res = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: inputs }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Erro ao salvar");
            setRows(data.rows ?? []);
            setDrafts(prev => { const n = { ...prev }; keys.forEach(k => delete n[k]); return n; });
            return true;
        } catch (err) {
            setError((err as Error).message);
            return false;
        } finally {
            setSaving(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });
        }
    }, [endpoint]);

    const remove = async (row: PropertyTax) => {
        if (!endpoint) return;
        if (!window.confirm(`Excluir ${row.kind} ${row.year} (${formatBRL(row.amount)})?`)) return;
        setSaving(prev => new Set([...prev, row.id]));
        try {
            const res = await fetch(`${endpoint}?id=${row.id}`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Erro ao excluir");
            setRows(prev => prev.filter(r => r.id !== row.id));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(prev => { const n = new Set(prev); n.delete(row.id); return n; });
        }
    };

    // ── Inline editing ──────────────────────────────────────────────────
    const setDraft = (id: string, field: keyof Draft, value: string) =>
        setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    const commit = (row: PropertyTax, field: keyof Draft) => {
        const raw = drafts[row.id]?.[field];
        if (raw === undefined) return;
        const clear = () => setDrafts(prev => { const n = { ...prev, [row.id]: { ...prev[row.id] } }; delete n[row.id][field]; return n; });
        const next: PropertyTaxInput = { id: row.id, year: row.year, kind: row.kind, amount: row.amount, paid_by: row.paid_by, paid_on: row.paid_on, comment: row.comment };
        if (field === "year") { const y = Number(raw); if (!Number.isInteger(y) || y < 1990 || y > 2100 || y === row.year) return clear(); next.year = y; }
        else if (field === "kind") { if (raw === row.kind) return clear(); next.kind = raw as TaxKind; }
        else if (field === "paidBy") { if (raw === row.paid_by) return clear(); next.paid_by = raw as TaxPayer; }
        else if (field === "date") { const d = raw || null; if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return clear(); if (d === row.paid_on) return clear(); next.paid_on = d; }
        else if (field === "comment") { const c = raw.trim() ? raw.trim().slice(0, 500) : null; if (c === (row.comment ?? null)) return clear(); next.comment = c; }
        else { const v = parseInput(raw); if (v === null || v === row.amount) return clear(); next.amount = v; }
        void put([next], [row.id]);
    };

    // ── Add dialog ──────────────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [add, setAdd] = useState({ year: String(new Date().getFullYear()), kind: "IPTU" as TaxKind, amount: "", paidBy: (iptuPaidByLandlord ? "LANDLORD" : "TENANT") as TaxPayer, date: "", comment: "" });
    const [adding, setAdding] = useState(false);
    const openAdd = () => {
        setAdd(a => ({ ...a, year: String(new Date().getFullYear()), amount: "", date: "", comment: "", paidBy: iptuPaidByLandlord ? "LANDLORD" : "TENANT" }));
        setAddOpen(true);
    };
    const submitAdd = async () => {
        const amount = parseInput(add.amount);
        const year = Number(add.year);
        if (amount === null || !Number.isInteger(year)) return;
        setAdding(true);
        const ok = await put([{ year, kind: add.kind, amount, paid_by: add.paidBy, paid_on: add.date || null, comment: add.comment.trim() || null }]);
        setAdding(false);
        if (ok) setAddOpen(false);
    };

    // ── Seed IPTU years from the investment ledger ──────────────────────
    const [seeding, setSeeding] = useState(false);
    const seedFromTransactions = async () => {
        if (!propertyId) return;
        setSeeding(true);
        setError(null);
        try {
            const res = await fetch(`/api/properties/${propertyId}/transactions`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Erro ao ler lançamentos");
            const existingYears = new Set(rows.filter(r => r.kind === "IPTU").map(r => r.year));
            const seeds = iptuYearsFromTransactions((data.rows ?? []) as PropertyTransaction[], iptuPaidByLandlord ? "LANDLORD" : "TENANT")
                .filter(s => !existingYears.has(s.year));
            if (seeds.length === 0) { flash("Nenhum ano de IPTU novo encontrado nos lançamentos do investimento."); return; }
            if (!window.confirm(`Criar ${seeds.length} ano(s) de IPTU a partir dos lançamentos (${seeds[0].year}–${seeds[seeds.length - 1].year})?`)) return;
            if (await put(seeds)) flash(`${seeds.length} ano(s) de IPTU criados. Agora você pode excluir os lançamentos de IPTU do investimento.`);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSeeding(false);
        }
    };

    const summary = useMemo(() => summarizeTaxes(rows), [rows]);

    if (!propertyId) return null;

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                        <Scale className="w-4 h-4 text-emerald-600" />
                        Tributos do imóvel
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        IPTU por ano, ITBI e outros tributos ao longo da vida do imóvel, com quem pagou. Registro informativo:
                        o IPTU pago pelo proprietário entra nos custos pela coluna IPTU das Receitas de Aluguel; o ITBI entra no investimento como custo de aquisição.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={seedFromTransactions} disabled={seeding} className="gap-1.5 text-xs" title="Agrupa por ano os lançamentos de IPTU do investimento">
                        {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Gerar IPTU dos lançamentos
                    </Button>
                    <Button size="sm" onClick={openAdd} className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Plus className="w-3.5 h-3.5" /> Adicionar tributo
                    </Button>
                </div>
            </div>

            {error && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {error}</div>}
            {notice && <div className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> {notice}</div>}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile label="IPTU acumulado" value={formatBRL(summary.iptuTotal)} tone="rose" icon={<Receipt className="w-4 h-4" />}
                    hint={<>{summary.iptuYears} {summary.iptuYears === 1 ? "ano" : "anos"}{summary.firstYear ? ` · ${summary.firstYear}–${summary.lastYear}` : ""}<br />Média {formatBRL(summary.iptuAvgPerYear)}/ano</>} />
                <Tile label="Quem pagou o IPTU" value={summary.iptuTotal > 0 ? `${Math.round((summary.iptuByTenant / summary.iptuTotal) * 100)}% inquilino` : "—"} tone="violet" icon={<Landmark className="w-4 h-4" />}
                    hint={<>Inquilino {formatBRL(summary.iptuByTenant)}<br />Proprietário {formatBRL(summary.iptuByLandlord)}</>} />
                <Tile label="IPTU atual" value={summary.iptuLatest ? formatBRL(summary.iptuLatest.amount) : "—"} tone="amber" icon={<Receipt className="w-4 h-4" />}
                    hint={summary.iptuLatest ? `Exercício ${summary.iptuLatest.year} · ${formatBRL(summary.iptuLatest.amount / 12)}/mês` : "Nenhum ano registrado"} />
                <Tile label="ITBI e outros" value={formatBRL(summary.itbi + summary.other)} tone="blue" icon={<Scale className="w-4 h-4" />}
                    hint={<>ITBI {formatBRL(summary.itbi)}<br />Outros {formatBRL(summary.other)}</>} />
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : rows.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Nenhum tributo registrado. Adicione o IPTU de cada ano e o ITBI, ou gere os anos de IPTU a partir dos lançamentos do investimento.
                </div>
            ) : (
                <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs min-w-[760px]">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                                <th className="text-left px-2 py-2 font-semibold">Ano</th>
                                <th className="text-left px-2 py-2 font-semibold">Tributo</th>
                                <th className="text-right px-2 py-2 font-semibold">Valor</th>
                                <th className="text-left px-2 py-2 font-semibold">Pago por</th>
                                <th className="text-left px-2 py-2 font-semibold">Data</th>
                                <th className="text-left px-2 py-2 font-semibold">Comentários</th>
                                <th className="px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => {
                                const d = drafts[row.id] ?? {};
                                const busy = saving.has(row.id);
                                const box = "bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1.5 py-1 outline-none";
                                return (
                                    <tr key={row.id} className="border-b border-border/60 hover:bg-muted/30">
                                        <td className="px-2 py-1">
                                            <input type="number" min={1990} max={2100} step={1} disabled={busy} value={d.year ?? String(row.year)}
                                                onChange={e => setDraft(row.id, "year", e.target.value)} onBlur={() => commit(row, "year")}
                                                className={cn(box, "w-20 font-semibold text-foreground")} />
                                            {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-muted-foreground" />}
                                        </td>
                                        <td className="px-2 py-1">
                                            <select disabled={busy} value={d.kind ?? row.kind} onChange={e => setDraft(row.id, "kind", e.target.value)} onBlur={() => commit(row, "kind")} className={box}>
                                                {TAX_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            <input type="number" inputMode="decimal" step="0.01" min={0} disabled={busy} value={d.amount ?? toInput(row.amount)}
                                                onChange={e => setDraft(row.id, "amount", e.target.value)} onBlur={() => commit(row, "amount")}
                                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                className={cn(box, "w-28 text-right tabular-nums font-semibold text-foreground")} />
                                        </td>
                                        <td className="px-2 py-1">
                                            <select disabled={busy} value={d.paidBy ?? row.paid_by} onChange={e => setDraft(row.id, "paidBy", e.target.value)} onBlur={() => commit(row, "paidBy")}
                                                className={cn(box, (d.paidBy ?? row.paid_by) === "LANDLORD" ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400")}>
                                                {TAX_PAYERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap">
                                            <input type="date" disabled={busy} value={d.date ?? (row.paid_on ?? "")} onChange={e => setDraft(row.id, "date", e.target.value)} onBlur={() => commit(row, "date")} className={box} />
                                        </td>
                                        <td className="px-2 py-1">
                                            <input type="text" disabled={busy} value={d.comment ?? (row.comment ?? "")} placeholder="—"
                                                onChange={e => setDraft(row.id, "comment", e.target.value)} onBlur={() => commit(row, "comment")}
                                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                className={cn(box, "w-56 truncate")} />
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            <button type="button" disabled={busy} onClick={() => remove(row)} title="Excluir" className="p-1 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="text-[11px] text-muted-foreground mt-2 mx-2">
                        Pago por “Proprietário” não altera os KPIs por si só: lance o valor mensal na coluna IPTU das Receitas de Aluguel para que entre nas despesas.
                    </p>
                </div>
            )}

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-emerald-600" /> Adicionar tributo</DialogTitle>
                        <DialogDescription>IPTU de um exercício, ITBI da compra ou outro tributo do imóvel.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5"><Label>Tributo</Label>
                                <select value={add.kind} onChange={e => setAdd(a => ({ ...a, kind: e.target.value as TaxKind }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                    {TAX_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5"><Label>Ano (exercício)</Label><Input type="number" min={1990} max={2100} step={1} value={add.year} onChange={e => setAdd(a => ({ ...a, year: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label>Valor anual (R$)</Label><Input type="number" step="0.01" min={0} placeholder="Ex: 1677.36" value={add.amount} onChange={e => setAdd(a => ({ ...a, amount: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label>Pago por</Label>
                                <select value={add.paidBy} onChange={e => setAdd(a => ({ ...a, paidBy: e.target.value as TaxPayer }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                    {TAX_PAYERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5"><Label>Data do pagamento</Label><Input type="date" value={add.date} onChange={e => setAdd(a => ({ ...a, date: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label>Comentários</Label><Input value={add.comment} placeholder="Opcional" onChange={e => setAdd(a => ({ ...a, comment: e.target.value }))} /></div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
                        <Button onClick={submitAdd} disabled={adding || parseInput(add.amount) === null} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {adding && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Tile({ label, value, hint, icon, tone }: { label: string; value: string; hint: React.ReactNode; icon: React.ReactNode; tone: "emerald" | "blue" | "violet" | "amber" | "rose" }) {
    const tones = {
        emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600",
        blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600",
        violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-600",
        amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600",
        rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-600",
    } as const;
    return (
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1 flex flex-col">
            <div className="flex items-start justify-between gap-2 text-muted-foreground">
                <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{label}</span>
                <span className={cn("p-1.5 rounded-lg shrink-0", tones[tone])}>{icon}</span>
            </div>
            <span className="text-lg font-bold text-foreground block tabular-nums leading-tight">{value}</span>
            <span className="text-[11px] text-muted-foreground block leading-snug break-words">{hint}</span>
        </div>
    );
}
