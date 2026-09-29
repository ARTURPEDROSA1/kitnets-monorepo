"use client";

/**
 * Contábil & Fiscal › Fechamento do mês.
 *
 * The month by competência (lib/accounting-accruals.ts): rent from Receitas, depreciation or
 * fair value by the chosen model, the interest inside financing instalments — generated and
 * kept up to date while the month is open — and the conferência that stands between the month
 * and its closing (errors block; warnings need the owner's confirmation). Months close in
 * order; reopening one reopens the closed months after it. The contador downloads the month's
 * package (balancete, diário, razão, aluguéis a receber).
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Download, Info, Loader2, Lock, LockOpen, RefreshCw, Scale, XCircle,
} from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { ContabilNav } from "@/components/contabil/ContabilNav";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/accounting-journal";
import type { CheckItem, CheckLevel } from "@/lib/accounting-accruals";

interface Props { lang: "en" | "pt" | "es"; initialMonth: string | null }

interface Status {
    month: string;
    status: "OPEN" | "CLOSED";
    period: { closed_at: string | null; closed_note: string | null; reopened_at: string | null; reopen_reason: string | null } | null;
    items: CheckItem[];
    summary: { errors: number; warnings: number; canClose: boolean };
    automated: { rentEntries: number; grossRent: number; depreciation: number | null; fairValue: { gain: number; loss: number } | null; financing: number; pending: number; errors: string[] };
    result: { revenue: number; expenses: number; net: number };
}

const shiftMonth = (m: string, delta: number) => {
    const [y, mm] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mm - 1 + delta, 1)).toISOString().slice(0, 7);
};
const monthLabel = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
};
const shortMonth = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return `${new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "")}/${String(y).slice(2)}`;
};
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateBR = (iso: string) => iso.split("-").reverse().join("/");

const LEVEL: Record<CheckLevel, { icon: React.ElementType; className: string; label: string }> = {
    error: { icon: XCircle, className: "text-rose-600", label: "Impede o fechamento" },
    warning: { icon: AlertTriangle, className: "text-amber-600", label: "Aviso" },
    info: { icon: Info, className: "text-sky-600", label: "Informação" },
    ok: { icon: CheckCircle2, className: "text-emerald-600", label: "Conferido" },
};

export default function FechamentoContent({ lang, initialMonth }: Props) {
    const base = lang === "pt" ? "" : `/${lang}`;
    const [month, setMonth] = useState<string | null>(initialMonth);
    const [months, setMonths] = useState<Array<{ month: string; status: "OPEN" | "CLOSED" }>>([]);
    const [openingDate, setOpeningDate] = useState<string | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [aware, setAware] = useState(false);
    const [note, setNote] = useState("");

    const load = useCallback(async (m: string | null) => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/accounting/close${m ? `?month=${m}` : ""}`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao carregar");
            setMonth(d.month);
            setMonths(d.months ?? []);
            setOpeningDate(d.openingDate ?? null);
            setStatus(d.status);
            setAware(false);
        } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(initialMonth); }, [load, initialMonth]);

    const go = (m: string) => { setNotice(null); void load(m); };

    const post = async (payload: Record<string, unknown>) => {
        const res = await fetch("/api/accounting/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const d = await res.json().catch(() => ({}));
        return { ok: res.ok, d };
    };

    const sync = async () => {
        if (!month) return;
        setBusy("sync"); setError(null); setNotice(null);
        try {
            const { ok, d } = await post({ action: "sync", month });
            if (!ok) throw new Error(d.error || "Erro ao atualizar");
            const r = d.result;
            setNotice(`Lançamentos do mês atualizados: ${r.created} novo(s), ${r.replaced} atualizado(s), ${r.removed} removido(s), ${r.unchanged} sem mudança${r.errors?.length ? ` · ${r.errors.length} com erro: ${r.errors[0]}` : ""}.`);
            await load(month);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const syncAll = async () => {
        if (!window.confirm("Atualizar a competência de todos os meses abertos, do início da escrituração até hoje? Pode levar alguns minutos.")) return;
        setBusy("sync-all"); setError(null); setNotice(null);
        try {
            const { ok, d } = await post({ action: "sync-all" });
            if (!ok) throw new Error(d.error || "Erro ao atualizar");
            const results = (d.results ?? []) as Array<{ created: number; replaced: number; removed: number; errors: string[] }>;
            const t = results.reduce((a, r) => ({ c: a.c + r.created, u: a.u + r.replaced, x: a.x + r.removed, e: [...a.e, ...r.errors] }), { c: 0, u: 0, x: 0, e: [] as string[] });
            setNotice(`${results.length} mês(es) aberto(s) atualizado(s): ${t.c} lançamento(s) novo(s), ${t.u} atualizado(s), ${t.x} removido(s)${t.e.length ? ` · ${t.e.length} com erro: ${t.e[0]}` : ""}.`);
            await load(month);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const close = async () => {
        if (!month || !status) return;
        if (!window.confirm(`Fechar ${monthLabel(month)}? Os lançamentos são atualizados uma última vez e o mês fica travado: nada é lançado, alterado ou excluído nele. Para corrigir, reabra o mês.`)) return;
        setBusy("close"); setError(null); setNotice(null);
        try {
            const { ok, d } = await post({ action: "close", month, confirm: aware, note: note.trim() || undefined });
            if (!ok) {
                if (d.status) setStatus(d.status);
                throw new Error(d.error || "Erro ao fechar");
            }
            setNote("");
            setNotice(`${capitalize(monthLabel(month))} fechado.`);
            await load(month);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const reopen = async () => {
        if (!month) return;
        const later = months.filter(m => m.status === "CLOSED" && m.month > month).length;
        const reason = window.prompt(`Motivo para reabrir ${monthLabel(month)}${later ? ` (reabre também ${later} mês(es) fechado(s) depois dele)` : ""} — fica registrado:`);
        if (!reason?.trim()) return;
        setBusy("reopen"); setError(null); setNotice(null);
        try {
            const { ok, d } = await post({ action: "reopen", month, reason });
            if (!ok) throw new Error(d.error || "Erro ao reabrir");
            setNotice(`Reaberto(s): ${(d.reopened as string[]).map(shortMonth).join(", ")}.`);
            await load(month);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const closed = status?.status === "CLOSED";
    const counts = status?.summary;
    const grouped = (level: CheckLevel) => status?.items.filter(i => i.level === level) ?? [];

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <CalendarCheck className="w-8 h-8 text-emerald-600" /> Fechamento do mês
                </h1>
                <p className="text-base text-muted-foreground">
                    O mês por competência: os aluguéis de Receitas, a depreciação (ou o valor justo) e os juros dos financiamentos entram sozinhos e se atualizam enquanto o mês está aberto. Resolva o que impede o fechamento, feche e envie o pacote ao contador.
                </p>
            </div>
            <ContabilNav lang={lang} />

            {error && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}
            {notice && <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}</div>}
            {!loading && !openingDate && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                    Escolha primeiro o <strong>início da escrituração</strong> em <Link href={`${base}/contabil/politicas`} className="underline">Políticas contábeis</Link>: os meses dos livros começam nele.
                </div>
            )}

            {month && (
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" onClick={() => go(shiftMonth(month, -1))} aria-label="Mês anterior" disabled={loading}><ChevronLeft className="w-4 h-4" /></Button>
                        <span className="min-w-[170px] text-center font-semibold">{capitalize(monthLabel(month))}</span>
                        <Button variant="outline" size="icon" onClick={() => go(shiftMonth(month, 1))} aria-label="Próximo mês" disabled={loading}><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                    {status && (
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", closed ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200")}>
                            {closed ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />} {closed ? "Mês fechado" : "Mês aberto"}
                        </span>
                    )}
                    {closed && status?.period?.closed_at && <span className="text-xs text-muted-foreground">em {dateBR(status.period.closed_at.slice(0, 10))}{status.period.closed_note ? ` · ${status.period.closed_note}` : ""}</span>}
                    {!closed && status?.period?.reopen_reason && <span className="text-xs text-muted-foreground">reaberto: {status.period.reopen_reason}</span>}
                    <div className="ml-auto flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm" className="gap-1">
                            <a href={`/api/accounting/package?month=${month}`}><Download className="w-4 h-4" /> Pacote do contador</a>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-1">
                            <Link href={`${base}/contabil/balancete?from=${month}&to=${month}`}><Scale className="w-4 h-4" /> Balancete</Link>
                        </Button>
                    </div>
                </div>
            )}

            {months.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Meses da escrituração">
                    {months.map(m => (
                        <button key={m.month} type="button" onClick={() => go(m.month)}
                            className={cn("rounded-md border px-2 py-1 text-xs tabular-nums transition-colors",
                                m.month === month ? "border-emerald-600 bg-emerald-600 text-white" :
                                    m.status === "CLOSED" ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" :
                                        "border-border text-muted-foreground hover:bg-accent")}
                            title={m.status === "CLOSED" ? "Fechado" : "Aberto"}>
                            {m.status === "CLOSED" && <Lock className="inline w-2.5 h-2.5 mr-0.5 -mt-0.5" />}{shortMonth(m.month)}
                        </button>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Conferindo o mês…</div>
            ) : status && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="rounded-2xl border border-border bg-card p-4 space-y-1 min-w-0">
                            <p className="text-xs text-muted-foreground">Aluguéis por competência</p>
                            <p className="text-xl font-bold tabular-nums whitespace-nowrap">{formatMoney(status.automated.grossRent)}</p>
                            <p className="text-xs text-muted-foreground">{status.automated.rentEntries} lançamento(s) de Receitas</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4 space-y-1 min-w-0">
                            <p className="text-xs text-muted-foreground">{status.automated.fairValue ? "Ajuste a valor justo" : "Depreciação"}</p>
                            <p className="text-xl font-bold tabular-nums whitespace-nowrap">
                                {status.automated.fairValue ? formatMoney(status.automated.fairValue.gain - status.automated.fairValue.loss) : status.automated.depreciation === null ? "—" : formatMoney(status.automated.depreciation)}
                            </p>
                            <p className="text-xs text-muted-foreground">{status.automated.depreciation === null && !status.automated.fairValue ? "modelo a definir, ou valor justo" : status.automated.financing ? `${status.automated.financing} parcela(s) com juros separados` : "imóveis alugados"}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4 space-y-1 min-w-0">
                            <p className="text-xs text-muted-foreground">Resultado do mês nos livros</p>
                            <p className={cn("text-xl font-bold tabular-nums whitespace-nowrap", status.result.net < 0 && "text-rose-700")}>{formatMoney(status.result.net)}</p>
                            <p className="text-xs text-muted-foreground">receitas {formatMoney(status.result.revenue)} · despesas {formatMoney(status.result.expenses)}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4 space-y-1 min-w-0">
                            <p className="text-xs text-muted-foreground">Conferência</p>
                            <p className={cn("text-xl font-bold", counts && counts.errors ? "text-rose-700" : counts && counts.warnings ? "text-amber-700" : "text-emerald-700")}>
                                {counts && counts.errors ? `${counts.errors} pendência(s)` : counts && counts.warnings ? `${counts.warnings} aviso(s)` : "Tudo certo"}
                            </p>
                            <p className="text-xs text-muted-foreground">{status.automated.pending ? `${status.automated.pending} lançamento(s) automático(s) a atualizar` : "lançamentos automáticos em dia"}</p>
                        </div>
                    </div>

                    <section className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
                        <h2 className="font-bold text-base">Conferência do fechamento</h2>
                        {(["error", "warning", "info", "ok"] as CheckLevel[]).map(level => {
                            const list = grouped(level);
                            if (!list.length) return null;
                            const L = LEVEL[level];
                            return (
                                <div key={level} className="space-y-2">
                                    <p className={cn("text-xs font-semibold uppercase tracking-wide", L.className)}>{L.label}</p>
                                    <ul className="space-y-2">
                                        {list.map(item => (
                                            <li key={item.id} className="flex gap-3 text-sm">
                                                <L.icon className={cn("w-4 h-4 mt-0.5 shrink-0", L.className)} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium">{item.title}</p>
                                                    {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                                                </div>
                                                {item.href && level !== "ok" && (
                                                    <Link href={`${base}${item.href}`} className="shrink-0 text-xs text-emerald-700 hover:underline flex items-center gap-0.5 self-start mt-0.5">Resolver <ArrowRight className="w-3 h-3" /></Link>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </section>

                    <section className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
                        {closed ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <p className="text-sm text-muted-foreground flex-1 min-w-[240px]">
                                    Mês fechado: os lançamentos dele não mudam. Se um registro de origem mudou depois, reabra o mês (e os seguintes) para atualizar a competência.
                                </p>
                                <Button variant="outline" onClick={reopen} disabled={busy !== null} className="gap-2">
                                    {busy === "reopen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockOpen className="w-4 h-4" />} Reabrir mês
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button variant="outline" onClick={sync} disabled={busy !== null} className="gap-2">
                                        {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar lançamentos do mês
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={syncAll} disabled={busy !== null} className="gap-2 text-muted-foreground">
                                        {busy === "sync-all" && <Loader2 className="w-4 h-4 animate-spin" />} Atualizar todos os meses abertos
                                    </Button>
                                </div>
                                <div className="border-t border-border pt-4 space-y-3">
                                    {counts && counts.errors === 0 && counts.warnings > 0 && (
                                        <label className="flex items-start gap-2 text-sm">
                                            <input type="checkbox" className="mt-1" checked={aware} onChange={e => setAware(e.target.checked)} />
                                            <span>Estou ciente dos {counts.warnings} aviso(s) acima e quero fechar o mês assim mesmo.</span>
                                        </label>
                                    )}
                                    <div className="flex flex-wrap items-end gap-3">
                                        <label className="space-y-1 flex-1 min-w-[220px]">
                                            <span className="text-xs text-muted-foreground">Observação do fechamento (opcional)</span>
                                            <Input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="ex.: conferido com o contador" className="h-9 text-sm" />
                                        </label>
                                        <Button onClick={close} disabled={busy !== null || !counts?.canClose || (counts.warnings > 0 && !aware)} className="gap-2">
                                            {busy === "close" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Fechar o mês
                                        </Button>
                                    </div>
                                    {counts && counts.errors > 0 && <p className="text-xs text-rose-700 dark:text-rose-300">Resolva os itens que impedem o fechamento para liberar o botão.</p>}
                                </div>
                            </>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
