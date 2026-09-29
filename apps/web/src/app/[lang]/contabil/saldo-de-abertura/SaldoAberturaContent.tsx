"use client";

/**
 * Contábil & Fiscal › Saldo de abertura.
 *
 * The balances of the asset, liability and equity accounts the day before the books start
 * on the platform — typed from the contador's balancete — posted as one OPENING entry on the
 * opening date (lib/accounting-opening.ts). Saving again replaces it while the month is open.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Landmark, Loader2, Lock, Save } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { ContabilNav } from "@/components/contabil/ContabilNav";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_LABELS, type AccountingAccount, type AccountType } from "@/lib/accounting-chart";
import { entryTotals, formatMoney, parseAmountInput } from "@/lib/accounting-journal";

interface Props { lang: "en" | "pt" | "es" }
type Acc = Pick<AccountingAccount, "id" | "code" | "name" | "account_type" | "nature" | "analytic" | "active">;

const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const dayBefore = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
};
const fmtInput = (n: number) => (n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

export default function SaldoAberturaContent({ lang }: Props) {
    const base = lang === "pt" ? "" : `/${lang}`;
    const [accounts, setAccounts] = useState<Acc[]>([]);
    const [values, setValues] = useState<Record<string, { debit: string; credit: string }>>({});
    const [openingDate, setOpeningDate] = useState<string | null>(null);
    const [locked, setLocked] = useState(false);
    const [entry, setEntry] = useState<{ created_by: string | null; created_at: string } | null>(null);
    const [plug, setPlug] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/accounting/opening");
                const d = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(d.error || "Erro ao carregar");
                setAccounts(d.accounts ?? []);
                setOpeningDate(d.openingDate ?? null);
                setLocked(Boolean(d.locked));
                setEntry(d.entry);
                const v: Record<string, { debit: string; credit: string }> = {};
                for (const l of (d.lines ?? []) as Array<{ account_id: string; debit: number; credit: number }>) v[l.account_id] = { debit: fmtInput(l.debit), credit: fmtInput(l.credit) };
                setValues(v);
            } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
        })();
    }, []);

    const shown = useMemo(() => accounts.filter(a => a.active || values[a.id]), [accounts, values]);
    const lines = useMemo(() => Object.entries(values)
        .map(([account_id, v]) => ({ account_id, debit: parseAmountInput(v.debit) || 0, credit: parseAmountInput(v.credit) || 0 }))
        .filter(l => l.debit || l.credit), [values]);
    const totals = entryTotals(lines);
    const difference = Math.round((totals.debit - totals.credit) * 100) / 100;

    const readOnly = locked || !openingDate;
    const set = (id: string, side: "debit" | "credit", text: string) =>
        setValues(prev => ({ ...prev, [id]: { debit: side === "debit" ? text : text ? "" : prev[id]?.debit ?? "", credit: side === "credit" ? text : text ? "" : prev[id]?.credit ?? "" } }));

    const save = async () => {
        setSaving(true); setError(null); setNotice(null);
        try {
            const res = await fetch("/api/accounting/opening", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines, plug }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao gravar");
            setNotice(d.plugged ? `Saldo de abertura lançado; a diferença de ${formatMoney(Math.abs(d.difference))} foi para ${d.difference > 0 ? "lucros" : "prejuízos"} acumulados.` : "Saldo de abertura lançado.");
            setEntry({ created_by: null, created_at: new Date().toISOString() });
            setPlug(false);
        } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
    };

    const groups: AccountType[] = ["ATIVO", "PASSIVO", "PL"];

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <Landmark className="w-8 h-8 text-emerald-600" /> Saldo de abertura
                </h1>
                <p className="text-base text-muted-foreground">
                    Os saldos das contas de ativo, passivo e patrimônio líquido no dia anterior ao início da escrituração na Kitnets.com{openingDate ? ` (${dateBR(dayBefore(openingDate))})` : ""}, copiados do balancete do contador. Eles entram como um único lançamento em {openingDate ? dateBR(openingDate) : "…"}.
                </p>
            </div>
            <ContabilNav lang={lang} />

            {error && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}
            {notice && <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {notice}</div>}
            {locked && <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm flex items-center gap-2"><Lock className="w-4 h-4" /> O mês do saldo de abertura está fechado: reabra-o em Lançamentos para alterar.</div>}
            {!loading && !openingDate && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                    Escolha primeiro o <strong>início da escrituração</strong> em <Link href={`${base}/contabil/politicas`} className="underline">Políticas contábeis</Link>: o saldo de abertura é o do dia anterior a ele.
                </div>
            )}
            {entry && !notice && <p className="text-xs text-muted-foreground">Saldo de abertura lançado{entry.created_by ? ` por ${entry.created_by}` : ""} em {dateBR(entry.created_at.slice(0, 10))}. Salvar de novo substitui o lançamento.</p>}
            <p className="text-xs text-muted-foreground">A data de início fica em <Link href={`${base}/contabil/politicas`} className="text-emerald-700 hover:underline">Políticas contábeis</Link>.</p>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : (
                <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium">Conta</th>
                                <th className="text-right px-3 py-2 font-medium w-40">Saldo devedor</th>
                                <th className="text-right px-3 py-2 font-medium w-40">Saldo credor</th>
                            </tr>
                        </thead>
                        {groups.map(g => {
                            const list = shown.filter(a => a.account_type === g);
                            return (
                                <tbody key={g}>
                                    <tr className="bg-muted/20"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ACCOUNT_TYPE_LABELS[g]}</td></tr>
                                    {list.map(a => a.analytic ? (
                                        <tr key={a.id} className="border-t border-border/60">
                                            <td className="px-3 py-1"><span className="font-mono text-xs text-muted-foreground mr-2">{a.code}</span>{a.name}</td>
                                            <td className="px-2 py-1"><Input disabled={readOnly} inputMode="decimal" value={values[a.id]?.debit ?? ""} placeholder={a.nature === "D" ? "0,00" : ""} onChange={e => set(a.id, "debit", e.target.value)} className="h-8 text-right text-sm" /></td>
                                            <td className="px-2 py-1"><Input disabled={readOnly} inputMode="decimal" value={values[a.id]?.credit ?? ""} placeholder={a.nature === "C" ? "0,00" : ""} onChange={e => set(a.id, "credit", e.target.value)} className="h-8 text-right text-sm" /></td>
                                        </tr>
                                    ) : (
                                        <tr key={a.id} className="border-t border-border/60">
                                            <td colSpan={3} className="px-3 py-1 text-xs font-semibold text-muted-foreground"><span className="font-mono mr-2">{a.code}</span>{a.name}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            );
                        })}
                        <tfoot>
                            <tr className="border-t-2 border-border font-semibold">
                                <td className="px-3 py-2">Totais</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totals.debit)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totals.credit)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {!loading && (
                <div className="flex flex-wrap items-center gap-4">
                    <span className={cn("text-sm font-medium", difference === 0 ? "text-emerald-700" : "text-amber-700")}>
                        {difference === 0 ? (lines.length ? "Balanceado" : "Informe os saldos") : `Diferença: ${formatMoney(Math.abs(difference))} (${difference > 0 ? "devedores maiores" : "credores maiores"})`}
                    </span>
                    {difference !== 0 && (
                        <label className="text-sm flex items-center gap-2">
                            <input type="checkbox" checked={plug} onChange={e => setPlug(e.target.checked)} disabled={readOnly} />
                            Lançar a diferença em {difference > 0 ? "lucros acumulados" : "prejuízos acumulados"}
                        </label>
                    )}
                    <Button onClick={save} disabled={readOnly || saving || lines.length < 2 || (difference !== 0 && !plug)} className="gap-2 ml-auto">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lançar saldo de abertura
                    </Button>
                </div>
            )}
        </div>
    );
}
