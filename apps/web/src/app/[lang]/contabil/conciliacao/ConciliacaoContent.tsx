"use client";

/**
 * Contábil & Fiscal › Extrato e conciliação.
 *
 * The holding's bank ledger as the books see it (lib/accounting-bank-server.ts): rows posted
 * by the rules, rows that became a question — answered here in plain language by the owner,
 * or with any account by the contador — and the conferência of the bank balance: the book
 * balance of the bank account at a date against the balance on the bank's statement.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, CheckCircle2, CircleHelp, Loader2, Scale } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/DateInput";
import { ContabilNav } from "@/components/contabil/ContabilNav";
import { Money } from "@/components/privacy";
import { cn } from "@/lib/utils";
import { BANK_STATUS_LABELS, direction, type BankOption, type BankRowStatus, type CounterpartSource } from "@/lib/accounting-bank-posting";
import { formatMoney, parseAmountInput } from "@/lib/accounting-journal";

interface Props { lang: "en" | "pt" | "es" }

interface Row {
    id: string;
    occurred_on: string;
    amount: number;
    memo: string;
    property_id: string | null;
    account_id: string | null;
    account_option: string | null;
    status: BankRowStatus;
    entryId: string | null;
    counterpartAccountId: string | null;
    counterpartSource: CounterpartSource | null;
    suggestedOptionId: string | null;
}
interface Acc { id: string; code: string; name: string; account_type?: string }
interface Recon { as_of: string; statement_balance: number; book_balance: number; unposted_rows: number; note: string | null; created_by: string | null }

const SELECT = "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const OTHER = "__OUTRA__";
const dateBR = (iso: string) => iso.split("-").reverse().join("/");
/** A statement memo that carries the counterparty's CPF/CNPJ, PIX key or e-mail is hidden whole by the eye toggle (components/privacy): the identifier sits inside the free text. */
const IDENTIFIER = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|@|\+55|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SOURCE_LABELS: Record<CounterpartSource, string> = { ANSWER: "resposta", ROUTING: "pela importação", HISTORY: "aprendido", RULE: "regra" };
const STATUS_STYLE: Record<BankRowStatus, string> = {
    POSTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    READY: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
    QUESTION: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    NO_START: "bg-muted text-muted-foreground",
    BEFORE_OPENING: "bg-muted text-muted-foreground",
    CLOSED_MONTH: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
};

function lastDayOfPreviousMonth(): string {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

export default function ConciliacaoContent({ lang }: Props) {
    const base = lang === "pt" ? "" : `/${lang}`;
    const [rows, setRows] = useState<Row[]>([]);
    const [options, setOptions] = useState<BankOption[]>([]);
    const [accounts, setAccounts] = useState<Acc[]>([]);
    const [allAccounts, setAllAccounts] = useState<Acc[]>([]);
    const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
    const [openingDate, setOpeningDate] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [filter, setFilter] = useState<"QUESTION" | "ALL">("QUESTION");
    const [editing, setEditing] = useState<string | null>(null);
    const [choice, setChoice] = useState<Record<string, { option: string; account: string }>>({});

    const [asOf, setAsOf] = useState(lastDayOfPreviousMonth());
    const [statement, setStatement] = useState("");
    const [recon, setRecon] = useState<{ bookBalance: number; unposted: Row[] } | null>(null);
    const [history, setHistory] = useState<Recon[]>([]);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/accounting/bank");
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao carregar");
            setRows(d.rows ?? []);
            setOptions(d.options ?? []);
            setAccounts(d.accounts ?? []);
            setAllAccounts(d.allAccounts ?? []);
            setProperties(d.properties ?? []);
            setOpeningDate(d.openingDate ?? null);
        } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const loadRecon = useCallback(async (date: string) => {
        try {
            const res = await fetch(`/api/accounting/reconciliation?as_of=${date}`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao calcular");
            setRecon({ bookBalance: d.bookBalance, unposted: d.unposted ?? [] });
            setHistory(d.history ?? []);
        } catch (err) { setError((err as Error).message); }
    }, []);
    useEffect(() => { void loadRecon(asOf); }, [loadRecon, asOf]);

    const counts = useMemo(() => rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Partial<Record<BankRowStatus, number>>), [rows]);
    const accountName = (id: string | null) => {
        const a = allAccounts.find(x => x.id === id);
        return a ? `${a.code} ${a.name}` : "—";
    };
    const propertyName = (id: string | null) => properties.find(p => p.id === id)?.name ?? "";
    const visible = filter === "QUESTION" ? rows.filter(r => r.status === "QUESTION") : rows;

    const postReady = async () => {
        setBusy("post"); setError(null); setNotice(null);
        try {
            const res = await fetch("/api/accounting/bank", { method: "POST" });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao contabilizar");
            setNotice(`${d.posted} lançamento(s) contabilizado(s)${d.questions ? ` · ${d.questions} com dúvida` : ""}${d.errors?.length ? ` · ${d.errors.length} com erro: ${d.errors[0]}` : ""}`);
            await load();
            await loadRecon(asOf);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const suggested = rows.filter(r => r.status === "QUESTION" && r.suggestedOptionId).length;
    const acceptSuggestions = async () => {
        if (!window.confirm(`Aceitar a sugestão das ${suggested} dúvida(s) que têm uma e contabilizá-las? Dá para alterar cada uma depois, enquanto o mês estiver aberto.`)) return;
        setBusy("accept"); setError(null); setNotice(null);
        try {
            const res = await fetch("/api/accounting/bank/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao aceitar");
            setNotice(`${d.accepted} sugestão(ões) aceita(s) · ${d.summary?.posted ?? 0} contabilizada(s)${d.summary?.errors?.length ? ` · ${d.summary.errors.length} com erro: ${d.summary.errors[0]}` : ""}`);
            await load();
            await loadRecon(asOf);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const startEdit = (r: Row) => {
        setEditing(r.id);
        setChoice(c => ({ ...c, [r.id]: c[r.id] ?? { option: r.account_option ?? r.suggestedOptionId ?? "", account: r.account_option ? "" : r.account_id ?? "" } }));
    };

    const answer = async (r: Row) => {
        const c = choice[r.id];
        if (!c || (!c.option || (c.option === OTHER && !c.account))) { setError("Escolha uma opção"); return; }
        setBusy(r.id); setError(null); setNotice(null);
        try {
            const body = c.option === OTHER ? { id: r.id, account_id: c.account } : { id: r.id, option: c.option };
            const res = await fetch("/api/accounting/bank/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao registrar");
            setRows(prev => prev.map(x => (x.id === r.id ? d.row : x)));
            setEditing(null);
            await loadRecon(asOf);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const saveRecon = async () => {
        setBusy("recon"); setError(null);
        try {
            const res = await fetch("/api/accounting/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ as_of: asOf, statement_balance: parseAmountInput(statement) }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao registrar");
            await loadRecon(asOf);
            setNotice("Conferência registrada.");
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const statementValue = statement.trim() ? parseAmountInput(statement) : null;
    const difference = recon && statementValue !== null && Number.isFinite(statementValue) ? Math.round((statementValue - recon.bookBalance) * 100) / 100 : null;

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <ArrowLeftRight className="w-8 h-8 text-emerald-600" /> Extrato e conciliação
                </h1>
                <p className="text-base text-muted-foreground">
                    Cada lançamento do extrato vira um lançamento contábil. O que as regras reconhecem entra sozinho; o resto vira uma pergunta simples aqui. Depois, confira o saldo do banco com o saldo dos livros.
                </p>
            </div>
            <ContabilNav lang={lang} />

            {error && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}
            {notice && <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {notice}</div>}
            {!loading && !openingDate && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                    O extrato só é contabilizado depois que você escolher o <strong>início da escrituração</strong> (o mês do saldo de abertura) em <Link href={`${base}/contabil/politicas`} className="underline">Políticas contábeis</Link>. Até lá, as linhas ficam aguardando.
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhum lançamento de extrato ainda. Importe o extrato em <Link href={`${base}/contabil/contas-bancarias`} className="text-emerald-700 hover:underline">Contas bancárias</Link>.
                </div>
            ) : (
                <section className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {(Object.keys(BANK_STATUS_LABELS) as BankRowStatus[]).filter(s => counts[s]).map(s => (
                            <span key={s} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[s])}>{BANK_STATUS_LABELS[s]}: {counts[s]}</span>
                        ))}
                        {(counts.READY ?? 0) > 0 && (
                            <Button size="sm" className="ml-auto gap-2" onClick={postReady} disabled={busy === "post"}>
                                {busy === "post" && <Loader2 className="w-4 h-4 animate-spin" />} Contabilizar {counts.READY} pronto(s)
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-1 border-b border-border">
                        {(["QUESTION", "ALL"] as const).map(f => (
                            <button key={f} type="button" onClick={() => setFilter(f)}
                                className={cn("px-3 py-1.5 text-sm border-b-2 -mb-px", filter === f ? "border-emerald-600 font-medium" : "border-transparent text-muted-foreground")}>
                                {f === "QUESTION" ? `Dúvidas (${counts.QUESTION ?? 0})` : `Todos (${rows.length})`}
                            </button>
                        ))}
                        {filter === "QUESTION" && suggested > 0 && (
                            <Button size="sm" variant="outline" className="ml-auto mb-1 gap-1" onClick={acceptSuggestions} disabled={busy === "accept"}>
                                {busy === "accept" && <Loader2 className="w-4 h-4 animate-spin" />} Aceitar as {suggested} sugestões
                            </Button>
                        )}
                    </div>

                    {visible.length === 0 ? (
                        (counts.NO_START ?? 0) > 0
                            ? <p className="text-sm text-muted-foreground">As linhas do extrato aguardam o início da escrituração; as dúvidas aparecem depois.</p>
                            : <p className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Nenhuma dúvida: todo o extrato está classificado.</p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {visible.map(r => {
                                const dir = direction(r.amount);
                                const opts = options.filter(o => o.direction === dir);
                                const c = choice[r.id];
                                const canEdit = r.status !== "BEFORE_OPENING" && r.status !== "CLOSED_MONTH" && r.status !== "NO_START";
                                return (
                                    <li key={r.id} className="py-3 space-y-2">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                            <span className="font-medium w-24">{dateBR(r.occurred_on)}</span>
                                            <Money className={cn("font-semibold tabular-nums w-32 text-right", r.amount >= 0 ? "text-emerald-700" : "text-rose-700")}>{formatMoney(r.amount)}</Money>
                                            <span className={cn("flex-1 min-w-[200px] truncate", IDENTIFIER.test(r.memo) && "privacy-sensitive")} title={r.memo}>{r.memo || "—"}</span>
                                            {r.property_id && <span className="text-xs text-muted-foreground">{propertyName(r.property_id)}</span>}
                                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide", STATUS_STYLE[r.status])}>{BANK_STATUS_LABELS[r.status]}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pl-0 md:pl-[14.75rem]">
                                            {r.counterpartAccountId && r.status !== "QUESTION" && (
                                                <span>{r.amount >= 0 ? "Crédito em" : "Débito em"} <strong className="text-foreground">{accountName(r.counterpartAccountId)}</strong>{r.counterpartSource ? ` · ${SOURCE_LABELS[r.counterpartSource]}` : ""}</span>
                                            )}
                                            {canEdit && editing !== r.id && (
                                                <button type="button" onClick={() => startEdit(r)} className="text-emerald-700 hover:underline flex items-center gap-1">
                                                    {r.status === "QUESTION" ? <><CircleHelp className="w-3.5 h-3.5" /> O que é este lançamento?</> : "Alterar classificação"}
                                                </button>
                                            )}
                                        </div>
                                        {editing === r.id && (
                                            <div className="flex flex-wrap items-end gap-2 md:pl-[14.75rem]">
                                                <label className="space-y-1 flex-1 min-w-[240px]">
                                                    <span className="text-xs text-muted-foreground">{dir === "IN" ? "Esta entrada de dinheiro é…" : "Esta saída de dinheiro é…"}</span>
                                                    <select className={SELECT} value={c?.option ?? ""} onChange={e => setChoice(p => ({ ...p, [r.id]: { option: e.target.value, account: p[r.id]?.account ?? "" } }))}>
                                                        <option value="">Escolha…</option>
                                                        {opts.map(o => <option key={o.id} value={o.id}>{o.label}{o.id === r.suggestedOptionId ? " (sugestão)" : ""}</option>)}
                                                        <option value={OTHER}>Outra conta (contador)…</option>
                                                    </select>
                                                </label>
                                                {c?.option === OTHER && (
                                                    <label className="space-y-1 flex-1 min-w-[240px]">
                                                        <span className="text-xs text-muted-foreground">Conta</span>
                                                        <select className={SELECT} value={c.account} onChange={e => setChoice(p => ({ ...p, [r.id]: { option: OTHER, account: e.target.value } }))}>
                                                            <option value="">Escolha a conta…</option>
                                                            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                                                        </select>
                                                    </label>
                                                )}
                                                <Button size="sm" onClick={() => answer(r)} disabled={busy === r.id} className="gap-1">{busy === r.id && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar</Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                                                {c?.option && c.option !== OTHER && options.find(o => o.id === c.option)?.hint && (
                                                    <p className="w-full text-xs text-muted-foreground">{options.find(o => o.id === c.option)?.hint}</p>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Aluguéis recebidos baixam &quot;aluguéis a receber&quot;: a receita bruta e a taxa da imobiliária entram por competência, a partir de Receitas de cada imóvel, no <Link href={`${base}/contabil/fechamento`} className="text-emerald-700 hover:underline">Fechamento do mês</Link>. A resposta dada a um lançamento vale para os próximos com o mesmo histórico.
                    </p>
                </section>
            )}

            {/* Reconciliation */}
            <section className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
                <div className="space-y-1">
                    <h2 className="font-bold text-base flex items-center gap-2"><Scale className="w-4 h-4 text-emerald-600" /> Conferência do saldo bancário</h2>
                    <p className="text-xs text-muted-foreground">Informe o saldo que o banco mostra no extrato numa data. O saldo dos livros inclui o saldo de abertura e tudo o que foi contabilizado até essa data.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <label className="space-y-1 block">
                        <span className="text-xs font-medium text-muted-foreground">Data</span>
                        <DateInput value={asOf} onChange={iso => iso && setAsOf(iso)} className="h-9 rounded-lg text-sm" />
                    </label>
                    <label className="space-y-1 block">
                        <span className="text-xs font-medium text-muted-foreground">Saldo do extrato do banco</span>
                        <Input inputMode="decimal" value={statement} placeholder="0,00" onChange={e => setStatement(e.target.value)} className="h-9 text-sm text-right" />
                    </label>
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Saldo nos livros</span>
                        <Money as="p" className="h-9 flex items-center justify-end text-sm font-semibold tabular-nums">{recon ? formatMoney(recon.bookBalance) : "…"}</Money>
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Diferença</span>
                        <p className={cn("h-9 flex items-center justify-end text-sm font-semibold tabular-nums", difference === null ? "text-muted-foreground" : difference === 0 ? "text-emerald-700" : "text-amber-700")}>
                            {difference === null ? "—" : difference === 0 ? "Conferido" : <Money>{formatMoney(difference)}</Money>}
                        </p>
                    </div>
                </div>
                {recon && recon.unposted.length > 0 && (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                        {recon.unposted.length} lançamento(s) do extrato até {dateBR(asOf)} ainda fora dos livros (dúvidas, prontos ou em mês fechado) — somam <Money>{formatMoney(recon.unposted.reduce((s, r) => s + r.amount, 0))}</Money> e explicam parte da diferença.
                    </p>
                )}
                <Button size="sm" onClick={saveRecon} disabled={busy === "recon" || statementValue === null || !Number.isFinite(statementValue)} className="gap-1">
                    {busy === "recon" && <Loader2 className="w-4 h-4 animate-spin" />} Registrar conferência
                </Button>
                {history.length > 0 && (
                    <table className="w-full text-xs">
                        <thead className="text-muted-foreground">
                            <tr className="border-b border-border">
                                <th className="text-left py-1 font-medium">Data</th>
                                <th className="text-right font-medium">Extrato</th>
                                <th className="text-right font-medium">Livros</th>
                                <th className="text-right font-medium">Diferença</th>
                                <th className="text-right font-medium">Fora dos livros</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map(h => {
                                const diff = Math.round((Number(h.statement_balance) - Number(h.book_balance)) * 100) / 100;
                                return (
                                    <tr key={h.as_of} className="border-b border-border/60">
                                        <td className="py-1">{dateBR(h.as_of)}</td>
                                        <Money as="td" className="text-right">{formatMoney(Number(h.statement_balance))}</Money>
                                        <Money as="td" className="text-right">{formatMoney(Number(h.book_balance))}</Money>
                                        <td className={cn("text-right", diff === 0 ? "text-emerald-700" : "text-amber-700")}>{diff === 0 ? "Conferido" : <Money>{formatMoney(diff)}</Money>}</td>
                                        <td className="text-right">{h.unposted_rows}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}
