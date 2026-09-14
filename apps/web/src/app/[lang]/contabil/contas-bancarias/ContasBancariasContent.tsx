"use client";

/**
 * Contábil & Fiscal › Contas bancárias.
 *
 * The holding's bank account feeds the accounting side (DRE, balanço,
 * impostos) and both property ledgers. Until the Banco Inter API sync has
 * credentials, the owner imports the statement the bank e-mails (OFX, CSV,
 * TXT or PDF): every row is suggested a destination, reviewed here, written
 * once to the bank ledger and routed to the property.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Circle, FileSpreadsheet, KeyRound, Landmark, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DESTINATION_LABELS, routingProblem, type BankDestination, type BankTransaction, type RoutedRow } from "@/lib/bank-ledger";
import { formatDateBR, KIND_LABELS, TRANSACTION_KINDS, type TransactionKind } from "@/lib/property-investment";

interface Props { lang: "en" | "pt" | "es" }
type PropertyOpt = { id: string; name: string };
type ReviewRow = RoutedRow & { include: boolean };

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SELECT = "bg-transparent border rounded-md px-1.5 py-1 outline-none text-xs max-w-[180px]";

const STEPS: Array<{ title: string; detail: string; done: boolean }> = [
    { title: "Importação do extrato (OFX, CSV, TXT ou PDF)", detail: "O extrato que o Inter envia por e-mail entra aqui: cada lançamento é classificado, casado com o imóvel e revisado antes de gravar.", done: true },
    { title: "Receitas e investimento de cada imóvel", detail: "Entradas (PIX/TED do inquilino) viram meses em Receitas de Aluguel com origem BANK; saídas classificadas vão para o registro de investimento do imóvel.", done: true },
    { title: "Credenciais da API do Banco Inter", detail: "Certificado mTLS e chave privada, client id e client secret da aplicação, agência e conta. Guardados como segredos no servidor, nunca no navegador.", done: false },
    { title: "Sincronização diária", detail: "Busca os lançamentos da conta, classifica com as mesmas regras e deixa os novos para revisão — sem precisar do e-mail.", done: false },
    { title: "Plano de contas da holding", detail: "Cada lançamento vira uma conta contábil (receita de aluguel, despesas, financiamento, impostos) para gerar DRE, balanço e apuração de impostos.", done: false },
];

export default function ContasBancariasContent({ lang }: Props) {
    const base = lang === "pt" ? "" : `/${lang}`;
    const [properties, setProperties] = useState<PropertyOpt[]>([]);
    const [ledger, setLedger] = useState<BankTransaction[]>([]);
    const [ledgerLoading, setLedgerLoading] = useState(true);
    const [rows, setRows] = useState<ReviewRow[]>([]);
    const [source, setSource] = useState<string | null>(null);
    const [parsing, setParsing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const loadLedger = useCallback(async () => {
        try {
            const res = await fetch("/api/bank/transactions?limit=200");
            const d = await res.json().catch(() => ({}));
            if (res.ok) { setLedger(d.rows ?? []); setProperties(d.properties ?? []); }
        } finally { setLedgerLoading(false); }
    }, []);
    useEffect(() => { void loadLedger(); }, [loadLedger]);

    const onFile = async (file: File | null) => {
        if (!file) return;
        setError(null); setNotice(null); setParsing(true); setRows([]);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch("/api/bank/statement", { method: "POST", body: form });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Não foi possível ler o extrato");
            const parsed = (d.rows ?? []) as RoutedRow[];
            setProperties(d.properties ?? properties);
            setSource(d.source ?? null);
            setRows(parsed.map(r => ({ ...r, include: !r.duplicate && r.destination !== "IGNORED" && routingProblem(r) === null })));
        } catch (err) { setError((err as Error).message); } finally { setParsing(false); }
    };
    const patch = (i: number, p: Partial<ReviewRow>) => setRows(prev => prev.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...p };
        if (p.destination === "IGNORED") next.include = true;
        else if (p.destination || p.property_id !== undefined || p.kind !== undefined) next.include = !next.duplicate && routingProblem(next) === null;
        return next;
    }));
    const selected = useMemo(() => rows.filter(r => r.include && !r.duplicate && routingProblem(r) === null), [rows]);
    const pending = useMemo(() => rows.filter(r => !r.duplicate && r.destination !== "IGNORED" && routingProblem(r) !== null), [rows]);

    const runImport = async () => {
        if (selected.length === 0) return;
        setImporting(true); setError(null);
        try {
            const res = await fetch("/api/bank/statement/commit", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: selected.map(r => ({ date: r.date, amount: r.amount, memo: r.memo, reference: r.reference, source: r.source, destination: r.destination, property_id: r.property_id, kind: r.kind, bank: "Banco Inter" })) }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao importar");
            setLedger(d.rows ?? []);
            setRows([]);
            setNotice(`${d.imported} lançamentos importados · ${d.income} para receitas · ${d.investment} para investimento · ${d.ignored} só contábil${d.skipped ? ` · ${d.skipped} já existiam` : ""}`);
        } catch (err) { setError((err as Error).message); } finally { setImporting(false); }
    };

    const removeRow = async (row: BankTransaction) => {
        if (!window.confirm(`Excluir o lançamento de ${formatDateBR(row.occurred_on)} (${formatBRL(row.amount)})?${row.destination === "INVESTMENT" ? " O lançamento de investimento criado também será removido." : ""}`)) return;
        setBusy(row.id);
        try {
            const res = await fetch(`/api/bank/transactions?id=${row.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao excluir");
            setLedger(prev => prev.filter(r => r.id !== row.id));
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    };

    const propertyName = (id: string | null) => properties.find(p => p.id === id)?.name ?? "—";

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-8 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <Landmark className="w-8 h-8 text-emerald-600" /> Contas bancárias
                </h1>
                <p className="text-base text-muted-foreground">
                    A conta da holding é a fonte de tudo que é contábil: DRE, balanço patrimonial e impostos. Cada lançamento é classificado automaticamente, casado com o imóvel (receitas de aluguel e custos) e revisado por você antes de entrar nos livros.
                </p>
            </div>

            {/* Statement import */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-0.5">
                        <h2 className="font-bold text-base text-foreground flex items-center gap-2"><Upload className="w-4 h-4 text-emerald-600" /> Importar extrato</h2>
                        <p className="text-xs text-muted-foreground">
                            Sem conectar a conta: envie o extrato que o banco manda por e-mail — OFX, CSV, TXT ou PDF (o PDF é lido por IA). Lançamentos já importados são reconhecidos e não entram duas vezes.
                        </p>
                    </div>
                    <div className="shrink-0 w-full md:w-80">
                        <Input type="file" accept=".ofx,.qfx,.csv,.tsv,.txt,.xlsx,.pdf" disabled={parsing} onChange={e => onFile(e.target.files?.[0] ?? null)} />
                        {parsing && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-1"><Loader2 className="w-3 h-3 animate-spin" /> Lendo o extrato…</span>}
                    </div>
                </div>
                {error && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {error}</div>}
                {notice && <div className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> {notice}</div>}

                {rows.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                                <span className="font-semibold text-foreground">{rows.length} lançamentos</span> lidos{source ? ` (${source})` : ""} · {selected.length} prontos para importar
                                {rows.some(r => r.duplicate) && <> · {rows.filter(r => r.duplicate).length} já importados</>}
                                {pending.length > 0 && <> · <span className="text-amber-700 dark:text-amber-400">{pending.length} precisam de imóvel ou tipo</span></>}
                            </span>
                            <span>Sugestões: histórico de importações → nome do imóvel/inquilino no lançamento → tipo pelo histórico</span>
                        </div>
                        <div className="overflow-x-auto border border-border rounded-xl max-h-[60vh]">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground sticky top-0">
                                    <tr>
                                        <th className="px-2 py-1.5" /><th className="text-left px-2 py-1.5">Data</th><th className="text-left px-2 py-1.5">Histórico</th><th className="text-right px-2 py-1.5">Valor</th>
                                        <th className="text-left px-2 py-1.5">Destino</th><th className="text-left px-2 py-1.5">Imóvel</th><th className="text-left px-2 py-1.5">Tipo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, i) => {
                                        const problem = routingProblem(r);
                                        return (
                                            <tr key={r.reference + i} className={cn("border-t border-border/60 align-middle", r.duplicate && "opacity-50")}>
                                                <td className="px-2 py-1"><input type="checkbox" className="accent-emerald-600" checked={r.include} disabled={r.duplicate || (r.destination !== "IGNORED" && problem !== null)} onChange={e => patch(i, { include: e.target.checked })} /></td>
                                                <td className="px-2 py-1 whitespace-nowrap">{formatDateBR(r.date)}</td>
                                                <td className="px-2 py-1 max-w-[320px] truncate" title={r.memo}>
                                                    {r.memo}
                                                    {r.duplicate && <span className="ml-1 text-[10px] text-muted-foreground">(já importado)</span>}
                                                    {r.reason === "history" && !r.duplicate && <span className="ml-1 text-[10px] text-emerald-700">(como da última vez)</span>}
                                                </td>
                                                <td className={cn("px-2 py-1 text-right tabular-nums whitespace-nowrap font-semibold", r.amount > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-foreground")}>{formatBRL(r.amount)}</td>
                                                <td className="px-2 py-1">
                                                    <select value={r.destination} disabled={r.duplicate} onChange={e => patch(i, { destination: e.target.value as BankDestination })} className={SELECT}>
                                                        {(Object.keys(DESTINATION_LABELS) as BankDestination[]).map(d => <option key={d} value={d}>{DESTINATION_LABELS[d]}</option>)}
                                                    </select>
                                                </td>
                                                <td className="px-2 py-1">
                                                    <select value={r.property_id ?? ""} disabled={r.duplicate || r.destination === "IGNORED"} onChange={e => patch(i, { property_id: e.target.value || null })} className={cn(SELECT, r.destination !== "IGNORED" && !r.property_id && "border-amber-400")}>
                                                        <option value="">— imóvel —</option>
                                                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </select>
                                                </td>
                                                <td className="px-2 py-1">
                                                    {r.destination === "INVESTMENT" ? (
                                                        <select value={r.kind ?? ""} disabled={r.duplicate} onChange={e => patch(i, { kind: (e.target.value || null) as TransactionKind | null })} className={cn(SELECT, !r.kind && "border-amber-400")}>
                                                            <option value="">— tipo —</option>
                                                            {TRANSACTION_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                                        </select>
                                                    ) : r.destination === "INCOME" ? <span className="text-muted-foreground">mês {r.date.slice(0, 7).split("-").reverse().join("/")}</span> : <span className="text-muted-foreground">—</span>}
                                                    {problem && !r.duplicate && r.destination !== "IGNORED" && <span className="block text-[10px] text-amber-700 dark:text-amber-400">{problem}</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] text-muted-foreground max-w-2xl">
                                Receita: a entrada vira o valor recebido do mês em Receitas de Aluguel (soma a outras entradas bancárias do mês; substitui um valor digitado à mão). Investimento: a saída vira um lançamento com o tipo escolhido. Ignorar: fica só no livro da conta.
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setRows([])}>Descartar</Button>
                                <Button size="sm" onClick={runImport} disabled={importing || selected.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                                    {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Importar {selected.length || ""} lançamentos
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bank ledger */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-3">
                <div className="space-y-0.5">
                    <h2 className="font-bold text-base text-foreground flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-blue-600" /> Livro da conta</h2>
                    <p className="text-xs text-muted-foreground">Todos os lançamentos importados, uma única vez, com o destino de cada um. É a base do DRE e do balanço da holding.</p>
                </div>
                {ledgerLoading ? (
                    <div className="text-sm text-muted-foreground text-center py-6 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
                ) : ledger.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">Nenhum lançamento importado ainda. Envie o primeiro extrato acima.</div>
                ) : (
                    <div className="overflow-x-auto border border-border rounded-xl max-h-[50vh]">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground sticky top-0">
                                <tr>
                                    <th className="text-left px-2 py-1.5">Data</th><th className="text-left px-2 py-1.5">Histórico</th><th className="text-right px-2 py-1.5">Valor</th>
                                    <th className="text-left px-2 py-1.5">Destino</th><th className="text-left px-2 py-1.5">Imóvel</th><th className="text-left px-2 py-1.5">Tipo</th><th className="text-left px-2 py-1.5">Origem</th><th className="px-2 py-1.5" />
                                </tr>
                            </thead>
                            <tbody>
                                {ledger.map(r => (
                                    <tr key={r.id} className="border-t border-border/60">
                                        <td className="px-2 py-1 whitespace-nowrap">{formatDateBR(r.occurred_on)}</td>
                                        <td className="px-2 py-1 max-w-[320px] truncate" title={r.memo}>{r.memo}</td>
                                        <td className={cn("px-2 py-1 text-right tabular-nums whitespace-nowrap font-semibold", r.amount > 0 ? "text-emerald-700 dark:text-emerald-400" : "")}>{formatBRL(r.amount)}</td>
                                        <td className="px-2 py-1">{DESTINATION_LABELS[r.destination]}</td>
                                        <td className="px-2 py-1">{propertyName(r.property_id)}</td>
                                        <td className="px-2 py-1">{r.kind ? KIND_LABELS[r.kind] : "—"}</td>
                                        <td className="px-2 py-1 text-muted-foreground">{r.source}</td>
                                        <td className="px-2 py-1 text-right">
                                            <button type="button" disabled={busy === r.id} onClick={() => removeRow(r)} className="text-muted-foreground hover:text-rose-600" title="Excluir">
                                                {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <h2 className="font-bold text-base text-foreground">Banco Inter · conta PJ</h2>
                            <p className="text-xs text-muted-foreground">Integração via API oficial do Inter (Open Finance). Somente leitura do extrato.</p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                            <Circle className="w-3 h-3" /> Não conectada
                        </span>
                    </div>
                    <ol className="space-y-3">
                        {STEPS.map(s => (
                            <li key={s.title} className="flex items-start gap-3">
                                {s.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
                                <div>
                                    <p className={`text-sm font-semibold ${s.done ? "text-foreground" : "text-muted-foreground"}`}>{s.title}</p>
                                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground flex items-start gap-3">
                        <KeyRound className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                        <p>Para ativar a conexão, as credenciais da aplicação Inter (certificado, chave, client id/secret e conta) são configuradas como segredos do servidor pela equipe Kitnets.com. Nenhuma senha de internet banking é usada ou armazenada.</p>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Por imóvel</h3>
                        <p className="text-xs text-muted-foreground">Cada imóvel também aceita o extrato direto em Investimento no imóvel › Importar extrato, para quem prefere revisar por imóvel.</p>
                        <Link href={`${base}/imoveis`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">Ir para Imóveis <ArrowRight className="w-3.5 h-3.5" /></Link>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-2">
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-blue-600" /> O que vem a seguir</h3>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                            <li>DRE mensal e anual da holding</li>
                            <li>Balanço patrimonial com os imóveis pelo valor de mercado</li>
                            <li>Apuração de impostos (Simples, Lucro Presumido) a partir dos lançamentos</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
