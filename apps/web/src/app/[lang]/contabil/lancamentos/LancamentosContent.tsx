"use client";

/**
 * Contábil & Fiscal › Lançamentos.
 *
 * The holding's journal in double entry, month by month. Manual entries (and the opening
 * balance) are typed here; the automation (bank statement, accruals, taxes) will post to the
 * same journal. A closed month accepts nothing: corrections are reversals dated in an open
 * month. The database enforces all of it (migration 20260928090000_accounting_base.sql);
 * the form only says so earlier.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Lock, LockOpen, NotebookPen, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/DateInput";
import { ContabilNav } from "@/components/contabil/ContabilNav";
import { cn } from "@/lib/utils";
import { compareCodes, type AccountingAccount } from "@/lib/accounting-chart";
import {
    ENTRY_SOURCE_LABELS, entryTotals, formatMoney, validateEntryDraft, type AccountingPeriod, type EntrySource, type JournalEntry,
} from "@/lib/accounting-journal";

interface Props { lang: "en" | "pt" | "es" }
interface PropertyOpt { id: string; name: string }
interface DraftLine { key: number; account_id: string; debit: string; credit: string; property_id: string; memo: string }

const SELECT = "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const currentMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (m: string, delta: number) => {
    const [y, mm] = m.split("-").map(Number);
    const d = new Date(Date.UTC(y, mm - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
};
const monthLabel = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
};
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateBR = (iso: string) => iso.split("-").reverse().join("/");
/** "1.500,50" / "1500,50" / "1500.50" / "1.500" → number (a lone dot with 1–2 decimals is the decimal point). */
const toNumber = (s: string) => {
    const t = s.trim().replace(/\s|R\$/g, "");
    if (t === "") return 0;
    if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
    return /^\d+\.\d{1,2}$/.test(t) ? Number(t) : Number(t.replace(/\./g, ""));
};

let lineKey = 0;
const emptyLine = (): DraftLine => ({ key: ++lineKey, account_id: "", debit: "", credit: "", property_id: "", memo: "" });

export default function LancamentosContent({ lang }: Props) {
    const [month, setMonth] = useState(currentMonth());
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
    const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
    const [properties, setProperties] = useState<PropertyOpt[]>([]);
    const [openingDate, setOpeningDate] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [date, setDate] = useState(`${currentMonth()}-01`);
    const [description, setDescription] = useState("");
    const [source, setSource] = useState<EntrySource>("MANUAL");
    const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
    const [formProblems, setFormProblems] = useState<string[]>([]);

    const load = useCallback(async (m: string) => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/accounting/entries?month=${m}`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao carregar");
            setEntries(d.entries ?? []);
            setAccounts(d.accounts ?? []);
            setPeriods(d.periods ?? []);
            setProperties(d.properties ?? []);
            setOpeningDate(d.openingDate ?? null);
        } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(month); }, [load, month]);

    const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
    const postable = useMemo(() => accounts.filter(a => a.analytic && a.active).sort((a, b) => compareCodes(a.code, b.code)), [accounts]);
    const period = periods.find(p => p.month.slice(0, 7) === month);
    const closed = period?.status === "CLOSED";
    const closedSet = useMemo(() => new Set(periods.filter(p => p.status === "CLOSED").map(p => p.month.slice(0, 7))), [periods]);
    const propertyName = (id: string | null) => properties.find(p => p.id === id)?.name ?? "";

    const draft = useMemo(() => ({
        entry_date: date,
        description,
        source,
        lines: lines.map(l => ({ account_id: l.account_id, debit: toNumber(l.debit), credit: toNumber(l.credit), property_id: l.property_id || null, memo: l.memo || null })),
    }), [date, description, source, lines]);
    const totals = entryTotals(draft.lines);

    const patchLine = (key: number, p: Partial<DraftLine>) => setLines(prev => prev.map(l => (l.key === key ? { ...l, ...p } : l)));

    const resetForm = () => {
        setDescription(""); setSource("MANUAL"); setLines([emptyLine(), emptyLine()]); setFormProblems([]);
    };

    const submit = async () => {
        const problems = validateEntryDraft(draft, { accounts: accountById, closedMonths: closedSet, openingDate });
        setFormProblems(problems);
        if (problems.length) return;
        setBusy("post");
        try {
            const res = await fetch("/api/accounting/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao lançar");
            resetForm();
            setFormOpen(false);
            const m = date.slice(0, 7);
            if (m !== month) setMonth(m); else await load(month);
        } catch (err) { setFormProblems([(err as Error).message]); } finally { setBusy(null); }
    };

    const reverse = async (e: JournalEntry) => {
        const today = new Date().toISOString().slice(0, 10);
        if (!window.confirm(`Estornar "${e.description}"? O estorno será lançado com data de hoje (${dateBR(today)}), com débitos e créditos invertidos.`)) return;
        setBusy(e.id); setError(null);
        try {
            const res = await fetch(`/api/accounting/entries/${e.id}/reverse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: today }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao estornar");
            await load(month);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const remove = async (e: JournalEntry) => {
        if (!window.confirm(`Excluir o lançamento "${e.description}"?`)) return;
        setBusy(e.id); setError(null);
        try {
            const res = await fetch(`/api/accounting/entries/${e.id}`, { method: "DELETE" });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao excluir");
            setEntries(prev => prev.filter(x => x.id !== e.id));
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const setPeriod = async (action: "close" | "reopen") => {
        let payload: Record<string, string> = { month, action };
        if (action === "reopen") {
            const reason = window.prompt(`Motivo para reabrir ${monthLabel(month)} (fica registrado):`);
            if (!reason?.trim()) return;
            payload = { ...payload, reason };
        } else if (!window.confirm(`Fechar ${monthLabel(month)}? Nada mais poderá ser lançado, alterado ou excluído nele; correções serão estornos em um mês aberto.`)) {
            return;
        }
        setBusy("period"); setError(null);
        try {
            const res = await fetch("/api/accounting/periods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro");
            setPeriods(d.periods ?? []);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const monthTotals = useMemo(() => entryTotals(entries.flatMap(e => e.lines)), [entries]);

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <NotebookPen className="w-8 h-8 text-emerald-600" /> Lançamentos
                </h1>
                <p className="text-base text-muted-foreground">
                    O livro da holding em partidas dobradas: todo lançamento tem débitos e créditos iguais. Mês fechado não aceita alteração; a correção é um estorno em um mês aberto.
                </p>
            </div>
            <ContabilNav lang={lang} />

            {/* Month bar */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Mês anterior"><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="min-w-[160px] text-center font-semibold">{capitalize(monthLabel(month))}</span>
                    <Button variant="outline" size="icon" onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Próximo mês"><ChevronRight className="w-4 h-4" /></Button>
                </div>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", closed ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200")}>
                    {closed ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />} {closed ? "Mês fechado" : "Mês aberto"}
                </span>
                {closed && period?.closed_at && <span className="text-xs text-muted-foreground">em {dateBR(period.closed_at.slice(0, 10))}{period.closed_note ? ` · ${period.closed_note}` : ""}</span>}
                {!closed && period?.reopen_reason && <span className="text-xs text-muted-foreground">reaberto: {period.reopen_reason}</span>}
                <div className="ml-auto flex gap-2">
                    {closed ? (
                        <Button variant="outline" size="sm" onClick={() => setPeriod("reopen")} disabled={busy === "period"}>Reabrir mês</Button>
                    ) : (
                        month < currentMonth() && <Button variant="outline" size="sm" onClick={() => setPeriod("close")} disabled={busy === "period"}>Fechar mês</Button>
                    )}
                    <Button size="sm" className="gap-1" onClick={() => { setFormOpen(o => !o); if (!formOpen) setDate(month === currentMonth() ? new Date().toISOString().slice(0, 10) : `${month}-01`); }} disabled={closed && !formOpen}>
                        <Plus className="w-4 h-4" /> Novo lançamento
                    </Button>
                </div>
            </div>

            {error && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}

            {/* Entry form */}
            {formOpen && (
                <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-base">Novo lançamento</h2>
                        <button type="button" onClick={() => setFormOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_200px] gap-3">
                        <label className="space-y-1 block">
                            <span className="text-xs font-medium text-muted-foreground">Data</span>
                            <DateInput value={date} onChange={iso => iso && setDate(iso)} className="h-9 rounded-lg text-sm" />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-medium text-muted-foreground">Histórico</span>
                            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="ex.: Aporte de capital do sócio" className="h-9 rounded-lg text-sm" />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                            <select className={SELECT} value={source} onChange={e => setSource(e.target.value as EntrySource)}>
                                <option value="MANUAL">Lançamento manual</option>
                                <option value="OPENING">Saldo de abertura</option>
                            </select>
                        </label>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[720px]">
                            <thead className="text-xs text-muted-foreground">
                                <tr>
                                    <th className="text-left font-medium pb-1 pr-2">Conta</th>
                                    <th className="text-right font-medium pb-1 px-2 w-32">Débito</th>
                                    <th className="text-right font-medium pb-1 px-2 w-32">Crédito</th>
                                    <th className="text-left font-medium pb-1 px-2 w-44">Imóvel</th>
                                    <th className="text-left font-medium pb-1 px-2 w-44">Observação</th>
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map(l => (
                                    <tr key={l.key}>
                                        <td className="pr-2 py-1">
                                            <select className={SELECT} value={l.account_id} onChange={e => patchLine(l.key, { account_id: e.target.value })}>
                                                <option value="">Escolha a conta…</option>
                                                {postable.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-1 py-1"><Input inputMode="decimal" value={l.debit} placeholder="0,00" onChange={e => patchLine(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="h-9 text-right text-sm" /></td>
                                        <td className="px-1 py-1"><Input inputMode="decimal" value={l.credit} placeholder="0,00" onChange={e => patchLine(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="h-9 text-right text-sm" /></td>
                                        <td className="px-1 py-1">
                                            <select className={SELECT} value={l.property_id} onChange={e => patchLine(l.key, { property_id: e.target.value })}>
                                                <option value="">—</option>
                                                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-1 py-1"><Input value={l.memo} onChange={e => patchLine(l.key, { memo: e.target.value })} className="h-9 text-sm" /></td>
                                        <td className="pl-1 py-1">
                                            {lines.length > 2 && (
                                                <button type="button" onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))} className="text-muted-foreground hover:text-rose-600" aria-label="Remover linha"><X className="w-4 h-4" /></button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-border text-sm">
                                    <td className="pt-2">
                                        <button type="button" onClick={() => setLines(prev => [...prev, emptyLine()])} className="text-xs text-emerald-700 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> linha</button>
                                    </td>
                                    <td className="pt-2 text-right font-semibold">{formatMoney(totals.debit)}</td>
                                    <td className="pt-2 text-right font-semibold">{formatMoney(totals.credit)}</td>
                                    <td className="pt-2 pl-2 text-xs" colSpan={3}>
                                        {totals.balanced
                                            ? <span className="text-emerald-700">Balanceado</span>
                                            : <span className="text-amber-700">Diferença: {formatMoney(Math.abs(totals.debit - totals.credit))}</span>}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {formProblems.length > 0 && (
                        <ul className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-900 dark:text-amber-100 list-disc pl-8">
                            {formProblems.map(p => <li key={p}>{p}</li>)}
                        </ul>
                    )}
                    <div className="flex gap-2">
                        <Button onClick={submit} disabled={busy === "post"} className="gap-2">{busy === "post" && <Loader2 className="w-4 h-4 animate-spin" />} Lançar</Button>
                        <Button variant="ghost" onClick={resetForm}>Limpar</Button>
                    </div>
                </div>
            )}

            {/* Journal */}
            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum lançamento em {monthLabel(month)}.</div>
            ) : (
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{entries.length} lançamento(s) · débitos {formatMoney(monthTotals.debit)} · créditos {formatMoney(monthTotals.credit)}</p>
                    {entries.map(e => {
                        const canDelete = !closed && (e.source === "MANUAL" || e.source === "OPENING" || e.source === "REVERSAL") && !e.reversed_by;
                        const canReverse = e.source !== "REVERSAL" && !e.reversed_by;
                        return (
                            <div key={e.id} className={cn("bg-card border border-border rounded-xl p-4 space-y-2", e.reversed_by && "opacity-70")}>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold">{dateBR(e.entry_date)}</span>
                                    <span className="text-sm">{e.description}</span>
                                    <span className="text-[10px] uppercase tracking-wide rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{ENTRY_SOURCE_LABELS[e.source]}</span>
                                    {e.reversed_by && <span className="text-[10px] uppercase tracking-wide rounded bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 text-amber-800 dark:text-amber-200">estornado</span>}
                                    <div className="ml-auto flex items-center gap-1">
                                        {e.created_by && <span className="text-[11px] text-muted-foreground mr-2">por {e.created_by}</span>}
                                        {canReverse && (
                                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" disabled={busy === e.id} onClick={() => reverse(e)}><RotateCcw className="w-3.5 h-3.5" /> Estornar</Button>
                                        )}
                                        {canDelete && (
                                            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-rose-600" disabled={busy === e.id} onClick={() => remove(e)} aria-label="Excluir"><Trash2 className="w-3.5 h-3.5" /></Button>
                                        )}
                                    </div>
                                </div>
                                <table className="w-full text-xs">
                                    <tbody>
                                        {e.lines.map(l => {
                                            const a = accountById.get(l.account_id);
                                            return (
                                                <tr key={l.id} className="border-t border-border/50">
                                                    <td className={cn("py-1 pr-2", l.credit > 0 && "pl-6")}>{a ? `${a.code} ${a.name}` : "—"}</td>
                                                    <td className="py-1 px-2 text-muted-foreground hidden sm:table-cell">{[propertyName(l.property_id), l.memo].filter(Boolean).join(" · ")}</td>
                                                    <td className="py-1 px-2 text-right w-32">{l.debit > 0 ? formatMoney(l.debit) : ""}</td>
                                                    <td className="py-1 pl-2 text-right w-32">{l.credit > 0 ? formatMoney(l.credit) : ""}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
