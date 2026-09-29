"use client";

/**
 * Contábil & Fiscal › Balancete.
 *
 * The balancete de verificação for a period (one month or several): per account, with the
 * groups summed, the balance before the period, the debits and credits in it and the balance at
 * the end (lib/accounting-reports.ts). Debits equal credits; a period with months still open is
 * marked as a preview.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, Loader2, Scale } from "lucide-react";
import { Button } from "@kitnets/ui";
import { DateInput } from "@/components/ui/DateInput";
import { ContabilNav } from "@/components/contabil/ContabilNav";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/accounting-journal";
import { formatBalance, type TrialBalanceRow } from "@/lib/accounting-reports";

interface Props { lang: "en" | "pt" | "es"; initialFrom: string | null; initialTo: string | null }

const previousMonth = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};
const monthBR = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

export default function BalanceteContent({ lang, initialFrom, initialTo }: Props) {
    const base = lang === "pt" ? "" : `/${lang}`;
    const [from, setFrom] = useState(initialFrom ?? initialTo ?? previousMonth());
    const [to, setTo] = useState(initialTo ?? initialFrom ?? previousMonth());
    const [rows, setRows] = useState<TrialBalanceRow[]>([]);
    const [totals, setTotals] = useState<{ debit: number; credit: number } | null>(null);
    const [allClosed, setAllClosed] = useState(false);
    const [openingDate, setOpeningDate] = useState<string | null>(null);
    const [onlyAnalytic, setOnlyAnalytic] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (f: string, t: string) => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/accounting/trial-balance?from=${f}&to=${t}`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao carregar");
            setRows(d.rows ?? []);
            setTotals(d.totals ?? null);
            setAllClosed(Boolean(d.allClosed));
            setOpeningDate(d.openingDate ?? null);
        } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(from, to); }, [load, from, to]);

    const shown = onlyAnalytic ? rows.filter(r => r.analytic) : rows;
    const balanced = totals ? Math.round(totals.debit * 100) === Math.round(totals.credit * 100) : true;

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <Scale className="w-8 h-8 text-emerald-600" /> Balancete
                </h1>
                <p className="text-base text-muted-foreground">
                    O saldo de cada conta no período: saldo anterior, débitos, créditos e saldo atual (D devedor, C credor). Os grupos somam as contas de dentro.
                </p>
            </div>
            <ContabilNav lang={lang} />

            {error && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}

            <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">De</span>
                    <DateInput mode="month" value={from} onChange={ym => { if (ym) { setFrom(ym); if (ym > to) setTo(ym); } }} className="h-9 rounded-lg text-sm w-36" />
                </label>
                <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Até</span>
                    <DateInput mode="month" value={to} onChange={ym => { if (ym) { setTo(ym); if (ym < from) setFrom(ym); } }} className="h-9 rounded-lg text-sm w-36" />
                </label>
                <label className="flex items-center gap-2 text-sm h-9">
                    <input type="checkbox" checked={onlyAnalytic} onChange={e => setOnlyAnalytic(e.target.checked)} /> Só contas analíticas
                </label>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium h-7", allClosed ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200")}>
                    {allClosed ? "Período fechado" : "Prévia: há meses abertos no período"}
                </span>
                <div className="ml-auto flex gap-2">
                    {from === to && (
                        <Button asChild variant="outline" size="sm" className="gap-1">
                            <Link href={`${base}/contabil/fechamento?month=${to}`}><CalendarCheck className="w-4 h-4" /> Fechamento de {monthBR(to)}</Link>
                        </Button>
                    )}
                </div>
            </div>
            {!loading && !openingDate && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                    A escrituração ainda não começou: escolha o início em <Link href={`${base}/contabil/politicas`} className="underline">Políticas contábeis</Link>.
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Somando os saldos…</div>
            ) : rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum saldo ou movimento no período.</div>
            ) : (
                <div className="bg-card border border-border rounded-2xl shadow-xs overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium">Conta</th>
                                <th className="text-right px-3 py-2 font-medium w-40">Saldo anterior</th>
                                <th className="text-right px-3 py-2 font-medium w-36">Débitos</th>
                                <th className="text-right px-3 py-2 font-medium w-36">Créditos</th>
                                <th className="text-right px-3 py-2 font-medium w-40">Saldo atual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map(r => (
                                <tr key={r.account_id} className={cn("border-t border-border/60", !r.analytic && "bg-muted/20 font-semibold")}>
                                    <td className="px-3 py-1.5" style={{ paddingLeft: onlyAnalytic ? undefined : `${0.75 + (r.level - 1) * 0.75}rem` }}>
                                        <span className="font-mono text-xs text-muted-foreground mr-2">{r.code}</span>{r.name}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{formatBalance(r.opening)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{r.debit ? formatMoney(r.debit) : "—"}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{r.credit ? formatMoney(r.credit) : "—"}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{formatBalance(r.closing)}</td>
                                </tr>
                            ))}
                        </tbody>
                        {totals && (
                            <tfoot>
                                <tr className="border-t-2 border-border font-semibold">
                                    <td className="px-3 py-2">Totais</td>
                                    <td />
                                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totals.debit)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totals.credit)}</td>
                                    <td className="px-3 py-2 text-right text-xs">
                                        {balanced ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> débitos = créditos</span> : <span className="text-rose-700">débitos ≠ créditos</span>}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}
        </div>
    );
}
