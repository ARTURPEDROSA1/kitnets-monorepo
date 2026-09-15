"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertCircle, CheckCircle2, ChevronDown, ChevronRight, FileText, Landmark, LineChart, Loader2, Plus, Receipt, Scale, Sparkles, SplitSquareVertical, Trash2, TrendingUp, Upload, Wand2,
} from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { cn } from "@/lib/utils";
import type { PropertyTransaction } from "@/lib/property-investment";
import {
    checkIptuTotals,
    effectiveTax,
    iptuFromExtraction,
    iptuYearsFromTransactions,
    MAX_INSTALLMENTS,
    parseReferencia,
    splitInstallments,
    summarizeTaxes,
    TAX_KINDS,
    TAX_PAYERS,
    type ExtractedIptu,
    type PropertyTax,
    type PropertyTaxInput,
    type TaxInstallment,
    type TaxKind,
    type TaxPayer,
} from "@/lib/property-taxes";
import { IptuHistoryModal } from "./IptuHistoryModal";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "./TableColumnFilters";
import { CellSumBar, useCellSum } from "./TableCellSum";
import MoneyInput, { parseMoneyText } from "./MoneyInput";

/** Excel-style sort/filter columns for the taxes table (values honour parcelas). */
const TAX_COLUMNS: ColumnDef<PropertyTax>[] = [
    { key: "year", label: "Ano", kind: "number", sum: false, get: r => r.year },
    { key: "kind", label: "Tributo", kind: "enum", get: r => r.kind, options: TAX_KINDS.map(k => ({ value: k.kind, label: k.label })) },
    { key: "amount", label: "Valor", kind: "number", align: "right", get: r => effectiveTax(r).amount },
    { key: "payer", label: "Pago por", kind: "enum", get: r => effectiveTax(r).payer, options: [{ value: "TENANT", label: "Inquilino" }, { value: "LANDLORD", label: "Proprietário" }, { value: "MIXED", label: "Misto" }] },
    { key: "date", label: "Data", kind: "date", get: r => r.paid_on },
    { key: "comment", label: "Comentários", kind: "text", get: r => r.comment ?? "" },
    { key: "parts", label: "Parcelas", kind: "number", sum: false, get: r => (r.installments?.length ? r.installments.length : 1) },
];

interface Props {
    propertyId?: string;
    /** Lets the dashboard feed the investment analysis with the loaded rows. */
    onRowsChange?: (rows: PropertyTax[]) => void;
    /** Rows loaded by the parent (overview): undefined = fetch here, null = parent still loading. */
    preloadedRows?: PropertyTax[] | null;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toInput = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "" : n.toFixed(2));
const parseInput = (s: string): number | null => {
    const n = parseMoneyText(s);
    return n !== null && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const BOX = "bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1.5 py-1 outline-none";

type Draft = Partial<Record<"year" | "kind" | "amount" | "paidBy" | "date" | "comment", string>>;
type PartDraft = Partial<Record<"amount" | "paidBy" | "date", string>>;

const rowToInput = (row: PropertyTax): PropertyTaxInput => ({
    id: row.id, year: row.year, kind: row.kind, amount: row.amount, paid_by: row.paid_by,
    paid_on: row.paid_on, comment: row.comment, installments: row.installments ?? [],
});

/** Renders page 1 of a PDF to a PNG file for the vision model (falls back to the PDF itself). */
async function fileForExtraction(file: File): Promise<File> {
    if (file.type !== "application/pdf") return file;
    try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument(new Uint8Array(await file.arrayBuffer())).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas indisponível");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Falha ao renderizar PDF"))), "image/png"));
        return new File([blob], "iptu-page1.png", { type: "image/png" });
    } catch (err) {
        console.warn("[IPTU import] PDF render failed, sending the PDF itself:", err);
        return file;
    }
}

type ReviewForm = Record<"year" | "amount" | "parts" | "paidBy" | "vencimento" | "aliquota" | "valorImposto" | "coletaLixo" | "tsa" | "desconto" | "valorVenalImovel" | "valorVenalPredial" | "valorVenalTerreno" | "areaConstruida" | "areaTerreno" | "inscricao" | "municipio" | "referencia" | "comment", string>;

export default function PropertyTaxesSection({ propertyId, onRowsChange, preloadedRows }: Props) {
    const endpoint = propertyId ? `/api/properties/${propertyId}/taxes` : null;
    // default payer for new rows: whoever paid the most recent one
    const [rows, setRows] = useState<PropertyTax[]>([]);
    const defaultPayer: TaxPayer = rows[0]?.paid_by ?? "TENANT";
    const sel = useCellSum();
    const [loading, setLoading] = useState<boolean>(Boolean(propertyId));
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [saving, setSaving] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [partDrafts, setPartDrafts] = useState<Record<string, PartDraft>>({});
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [historyOpen, setHistoryOpen] = useState(false);
    const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null);

    const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(null), 8000); };

    useEffect(() => { onRowsChange?.(rows); }, [rows, onRowsChange]);

    useEffect(() => {
        if (!endpoint) { setLoading(false); return; }
        if (preloadedRows !== undefined) {
            if (preloadedRows === null) { setLoading(true); return; }
            setRows(preloadedRows); setLoading(false);
            return;
        }
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
    }, [endpoint, preloadedRows]);

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
            setPartDrafts(prev => { const n = { ...prev }; Object.keys(n).forEach(k => { if (keys.some(id => k.startsWith(`${id}:`))) delete n[k]; }); return n; });
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
        if (!window.confirm(`Excluir ${row.kind} ${row.year} (${formatBRL(effectiveTax(row).amount)})?${row.document_path ? " O PDF atual do IPTU também será removido." : ""}`)) return;
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

    // ── Row-level inline editing ────────────────────────────────────────
    const setDraft = (id: string, field: keyof Draft, value: string) =>
        setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    const commit = (row: PropertyTax, field: keyof Draft) => {
        const raw = drafts[row.id]?.[field];
        if (raw === undefined) return;
        const clear = () => setDrafts(prev => { const n = { ...prev, [row.id]: { ...prev[row.id] } }; delete n[row.id][field]; return n; });
        const next = rowToInput(row);
        if (field === "year") { const y = Number(raw); if (!Number.isInteger(y) || y < 1990 || y > 2100 || y === row.year) return clear(); next.year = y; }
        else if (field === "kind") { if (raw === row.kind) return clear(); next.kind = raw as TaxKind; }
        else if (field === "paidBy") {
            if (raw === row.paid_by) return clear();
            next.paid_by = raw as TaxPayer;
            if (next.installments?.length) next.installments = next.installments.map(p => ({ ...p, paid_by: raw as TaxPayer }));
        }
        else if (field === "date") { const d = raw || null; if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return clear(); if (d === row.paid_on) return clear(); next.paid_on = d; }
        else if (field === "comment") { const c = raw.trim() ? raw.trim().slice(0, 500) : null; if (c === (row.comment ?? null)) return clear(); next.comment = c; }
        else {
            const v = parseInput(raw);
            if (v === null || v === row.amount) return clear();
            next.amount = v;
            if (next.installments?.length) next.installments = splitInstallments(v, next.installments.length, row.paid_by, next.installments);
        }
        void put([next], [row.id]);
    };

    // ── Parcelas ────────────────────────────────────────────────────────
    const toggleExpanded = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const splitRow = (row: PropertyTax, n: number) => {
        const next = rowToInput(row);
        next.installments = splitInstallments(effectiveTax(row).amount, n, row.paid_by, row.installments ?? []);
        setExpanded(prev => new Set([...prev, row.id]));
        void put([next], [row.id]);
    };
    const unsplitRow = (row: PropertyTax) => {
        const e = effectiveTax(row);
        const next = rowToInput(row);
        next.amount = e.amount;
        next.paid_by = e.byLandlord > e.byTenant ? "LANDLORD" : "TENANT";
        next.installments = [];
        void put([next], [row.id]);
    };
    const setPartDraft = (rowId: string, seq: number, field: keyof PartDraft, value: string) =>
        setPartDrafts(prev => ({ ...prev, [`${rowId}:${seq}`]: { ...prev[`${rowId}:${seq}`], [field]: value } }));
    const commitPart = (row: PropertyTax, part: TaxInstallment, field: keyof PartDraft) => {
        const key = `${row.id}:${part.seq}`;
        const raw = partDrafts[key]?.[field];
        if (raw === undefined) return;
        const clear = () => setPartDrafts(prev => { const n = { ...prev, [key]: { ...prev[key] } }; delete n[key][field]; return n; });
        const updated: TaxInstallment = { ...part };
        if (field === "amount") { const v = parseInput(raw); if (v === null || v === part.amount) return clear(); updated.amount = v; }
        else if (field === "paidBy") { if (raw === part.paid_by) return clear(); updated.paid_by = raw as TaxPayer; }
        else { const d = raw || null; if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return clear(); if (d === part.paid_on) return clear(); updated.paid_on = d; }
        const next = rowToInput(row);
        next.installments = (row.installments ?? []).map(p => (p.seq === part.seq ? updated : p));
        void put([next], [row.id]);
    };

    // ── Add dialog ──────────────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [add, setAdd] = useState({ year: String(new Date().getFullYear()), kind: "IPTU" as TaxKind, amount: "", paidBy: defaultPayer, date: "", comment: "", parts: "1" });
    const [adding, setAdding] = useState(false);
    const openAdd = () => { setAdd(a => ({ ...a, year: String(new Date().getFullYear()), amount: "", date: "", comment: "", parts: "1", paidBy: defaultPayer })); setAddOpen(true); };
    const submitAdd = async () => {
        const amount = parseInput(add.amount);
        const year = Number(add.year);
        if (amount === null || !Number.isInteger(year)) return;
        const n = Number(add.parts) || 1;
        setAdding(true);
        const ok = await put([{ year, kind: add.kind, amount, paid_by: add.paidBy, paid_on: add.date || null, comment: add.comment.trim() || null, installments: n > 1 ? splitInstallments(amount, n, add.paidBy) : [] }]);
        setAdding(false);
        if (ok) setAddOpen(false);
    };

    // ── Import IPTU (AI) ────────────────────────────────────────────────
    const [importOpen, setImportOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [extracting, setExtracting] = useState(false);
    const [extracted, setExtracted] = useState<ExtractedIptu | null>(null);
    const [review, setReview] = useState<ReviewForm | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);

    const openImport = () => { setImportFile(null); setExtracted(null); setReview(null); setImportError(null); setImportOpen(true); };

    const onImportFile = async (file: File | null) => {
        if (!file || !endpoint) return;
        setImportFile(file);
        setExtracted(null);
        setReview(null);
        setImportError(null);
        setExtracting(true);
        try {
            const form = new FormData();
            form.append("file", await fileForExtraction(file));
            const res = await fetch(`${endpoint}/extract`, { method: "POST", body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || "Falha na extração por IA");
            const x = data.data as ExtractedIptu;
            const input = iptuFromExtraction(x, defaultPayer);
            const ref = parseReferencia(x.referencia);
            setExtracted(x);
            setReview({
                year: String(input.year), amount: toInput(input.amount), parts: ref ? String(ref.de) : "1", paidBy: defaultPayer,
                vencimento: x.vencimento ?? "", aliquota: x.aliquotaPct === null ? "" : String(x.aliquotaPct),
                valorImposto: toInput(x.valorImposto), coletaLixo: toInput(x.coletaLixo), tsa: toInput(x.tsa), desconto: toInput(x.desconto),
                valorVenalImovel: toInput(x.valorVenalImovel), valorVenalPredial: toInput(x.valorVenalPredial), valorVenalTerreno: toInput(x.valorVenalTerreno),
                areaConstruida: toInput(x.areaConstruida), areaTerreno: toInput(x.areaTerreno),
                inscricao: x.inscricao ?? "", municipio: x.municipio ?? "", referencia: x.referencia ?? "", comment: "",
            });
        } catch (err) {
            setImportError((err as Error).message);
        } finally {
            setExtracting(false);
        }
    };

    const runImport = async () => {
        if (!endpoint || !review) return;
        const amount = parseInput(review.amount);
        const year = Number(review.year);
        if (amount === null || !Number.isInteger(year)) { setImportError("Informe o exercício e o valor total."); return; }
        const n = Number(review.parts) || 1;
        const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
        const data: PropertyTaxInput = {
            year, kind: "IPTU", amount, paid_by: review.paidBy as TaxPayer, paid_on: null,
            comment: review.comment.trim() || null,
            installments: n > 1 ? splitInstallments(amount, n, review.paidBy as TaxPayer) : [],
            municipio: review.municipio || null, inscricao: review.inscricao || null, referencia: review.referencia || null,
            vencimento: review.vencimento || null,
            area_terreno: num(review.areaTerreno), area_construida: num(review.areaConstruida),
            valor_venal_terreno: num(review.valorVenalTerreno), valor_venal_predial: num(review.valorVenalPredial), valor_venal_imovel: num(review.valorVenalImovel),
            aliquota_pct: num(review.aliquota), valor_imposto: num(review.valorImposto), coleta_lixo: num(review.coletaLixo), tsa: num(review.tsa), desconto: num(review.desconto),
        };
        setImporting(true);
        setImportError(null);
        try {
            const form = new FormData();
            form.append("data", JSON.stringify(data));
            if (importFile) form.append("file", importFile);
            const res = await fetch(`${endpoint}/import`, { method: "POST", body: form });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || "Erro ao importar");
            setRows(body.rows ?? []);
            setImportOpen(false);
            flash(`IPTU ${year} importado${importFile ? " · PDF guardado como documento atual" : ""}.`);
        } catch (err) {
            setImportError((err as Error).message);
        } finally {
            setImporting(false);
        }
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
            const seeds = iptuYearsFromTransactions((data.rows ?? []) as PropertyTransaction[], defaultPayer).filter(s => !existingYears.has(s.year));
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
    const reviewTotals = useMemo(() => (extracted ? checkIptuTotals(extracted) : null), [extracted]);
    const cf = useColumnFilters(rows, TAX_COLUMNS, { key: "year", dir: "desc" });

    if (!propertyId) return null;

    const payerLabel = (row: PropertyTax) => {
        const e = effectiveTax(row);
        if (e.payer === "MIXED") return `Misto · inquilino ${Math.round((e.byTenant / e.amount) * 100)}%`;
        return e.payer === "LANDLORD" ? "Proprietário" : "Inquilino";
    };
    const currentDoc = rows.find(r => r.document_url);

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                        <Scale className="w-4 h-4 text-emerald-600" />
                        Tributos do imóvel
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        IPTU por ano (em até {MAX_INSTALLMENTS} parcelas, cada uma com seu pagador), ITBI e outros tributos ao longo da vida do imóvel. É a fonte do IPTU:
                        o que o proprietário paga entra nos custos do mês do pagamento (Composição do Centro de Custos, DRE e análise); o ITBI entra no investimento como custo de aquisição.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={seedFromTransactions} disabled={seeding} className="gap-1.5 text-xs" title="Agrupa por ano os lançamentos de IPTU do investimento">
                        {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Gerar IPTU dos lançamentos
                    </Button>
                    <Button size="sm" variant="outline" onClick={openImport} className="gap-1.5 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30" title="Lê a guia do IPTU (PDF ou foto) com IA e guarda o documento">
                        <Sparkles className="w-3.5 h-3.5" /> Importar IPTU
                    </Button>
                    <Button size="sm" onClick={openAdd} className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Plus className="w-3.5 h-3.5" /> Adicionar tributo
                    </Button>
                </div>
            </div>

            {error && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {error}</div>}
            {notice && <div className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> {notice}</div>}

            {/* Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <Tile label="IPTU acumulado" value={formatBRL(summary.iptuTotal)} tone="rose" icon={<Receipt className="w-4 h-4" />}
                    hint={<>{summary.iptuYears} {summary.iptuYears === 1 ? "ano" : "anos"}{summary.firstYear ? ` · ${summary.firstYear}–${summary.lastYear}` : ""}<br />Média {formatBRL(summary.iptuAvgPerYear)}/ano</>} />
                <Tile label="Quem pagou o IPTU" value={summary.iptuTotal > 0 ? `${Math.round((summary.iptuByTenant / summary.iptuTotal) * 100)}% inquilino` : "—"} tone="violet" icon={<Landmark className="w-4 h-4" />}
                    hint={<>Inquilino {formatBRL(summary.iptuByTenant)}<br />Proprietário {formatBRL(summary.iptuByLandlord)}</>} />
                <Tile label="IPTU atual" value={summary.iptuLatest ? formatBRL(summary.iptuLatest.amount) : "—"} tone="amber" icon={<TrendingUp className="w-4 h-4" />}
                    hint={summary.iptuLatest
                        ? <>Exercício {summary.iptuLatest.year} · {formatBRL(summary.iptuLatest.amount / 12)}/mês
                            {summary.iptuGrowthPct !== null && <> · <span className={summary.iptuGrowthPct > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>{summary.iptuGrowthPct > 0 ? "+" : ""}{summary.iptuGrowthPct}% vs {summary.iptuLatest.year - 1}</span></>}
                        </>
                        : "Nenhum ano registrado"}
                    action={summary.iptuYears > 1 ? (
                        <button type="button" onClick={() => setHistoryOpen(true)} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline underline-offset-2">
                            <LineChart className="w-3.5 h-3.5" /> Ver histórico
                        </button>
                    ) : null} />
                <Tile label="ITBI e outros" value={formatBRL(summary.itbi + summary.other)} tone="blue" icon={<Scale className="w-4 h-4" />}
                    hint={<>ITBI {formatBRL(summary.itbi)}<br />Outros {formatBRL(summary.other)}</>}
                    action={currentDoc ? (
                        <button type="button" onClick={() => setViewer({ url: currentDoc.document_url!, title: `IPTU ${currentDoc.year}` })} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline underline-offset-2">
                            <FileText className="w-3.5 h-3.5" /> Ver guia atual (IPTU {currentDoc.year})
                        </button>
                    ) : null} />
            </div>

            <FilterChips columns={TAX_COLUMNS} ctl={cf} />

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : rows.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Nenhum tributo registrado. Importe a guia do IPTU, adicione o IPTU de cada ano e o ITBI, ou gere os anos de IPTU a partir dos lançamentos do investimento.
                </div>
            ) : (
                <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs min-w-[900px]">
                        <thead>
                            <ColumnHeaders columns={TAX_COLUMNS} ctl={cf} leading={<th className="px-1 py-2 w-6" />} trailing={<th className="px-2 py-2" />} />
                        </thead>
                        <tbody>
                            {cf.rows.length === 0 && (
                                <tr><td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">
                                    Nenhum tributo com os filtros atuais. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button>
                                </td></tr>
                            )}
                            {cf.rows.map(row => {
                                const d = drafts[row.id] ?? {};
                                const busy = saving.has(row.id);
                                const parts = row.installments ?? [];
                                const hasParts = parts.length > 0;
                                const open = expanded.has(row.id);
                                const e = effectiveTax(row);
                                return (
                                    <React.Fragment key={row.id}>
                                        <tr className="border-b border-border/60 hover:bg-muted/30">
                                            <td className="px-1 py-1">
                                                {hasParts && (
                                                    <button type="button" onClick={() => toggleExpanded(row.id)} className="p-0.5 rounded text-muted-foreground hover:text-foreground" title={open ? "Ocultar parcelas" : "Mostrar parcelas"}>
                                                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
                                            </td>
                                            <td {...sel.cellProps("year", row.id, null, "px-2 py-1")}>
                                                <input type="number" min={1990} max={2100} step={1} disabled={busy} value={d.year ?? String(row.year)}
                                                    onChange={ev => setDraft(row.id, "year", ev.target.value)} onBlur={() => commit(row, "year")}
                                                    className={cn(BOX, "w-20 font-semibold text-foreground")} />
                                                {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-muted-foreground" />}
                                                {row.extracted_at && <span className="block text-[9px] text-muted-foreground pl-1.5" title={`Valor venal ${row.valor_venal_imovel ? formatBRL(Number(row.valor_venal_imovel)) : "—"} · alíquota ${row.aliquota_pct ?? "—"}%`}>guia lida por IA</span>}
                                            </td>
                                            <td {...sel.cellProps("kind", row.id, null, "px-2 py-1")}>
                                                <select disabled={busy} value={d.kind ?? row.kind} onChange={ev => setDraft(row.id, "kind", ev.target.value)} onBlur={() => commit(row, "kind")} className={BOX}>
                                                    {TAX_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                                </select>
                                            </td>
                                            <td {...sel.cellProps("amount", row.id, e.amount, "px-2 py-1 text-right")}>
                                                <MoneyInput value={e.amount} draft={d.amount} disabled={busy}
                                                    onDraft={text => setDraft(row.id, "amount", text)} onCommit={() => commit(row, "amount")}
                                                    title={hasParts ? "Alterar o total redistribui entre as parcelas" : undefined}
                                                    className="w-32 font-semibold text-foreground" />
                                            </td>
                                            <td {...sel.cellProps("payer", row.id, null, "px-2 py-1")}>
                                                {e.payer === "MIXED" ? (
                                                    <span className="text-violet-700 dark:text-violet-400 font-medium" title={`Inquilino ${formatBRL(e.byTenant)} · Proprietário ${formatBRL(e.byLandlord)}`}>{payerLabel(row)}</span>
                                                ) : (
                                                    <select disabled={busy} value={d.paidBy ?? row.paid_by} onChange={ev => setDraft(row.id, "paidBy", ev.target.value)} onBlur={() => commit(row, "paidBy")}
                                                        title={hasParts ? "Aplica a todas as parcelas" : undefined}
                                                        className={cn(BOX, (d.paidBy ?? row.paid_by) === "LANDLORD" ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400")}>
                                                        {TAX_PAYERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                                    </select>
                                                )}
                                            </td>
                                            <td {...sel.cellProps("date", row.id, null, "px-2 py-1 whitespace-nowrap")}>
                                                <input type="date" disabled={busy} value={d.date ?? (row.paid_on ?? "")} onChange={ev => setDraft(row.id, "date", ev.target.value)} onBlur={() => commit(row, "date")} className={BOX} />
                                            </td>
                                            <td {...sel.cellProps("comment", row.id, null, "px-2 py-1")}>
                                                <input type="text" disabled={busy} value={d.comment ?? (row.comment ?? "")} placeholder="—"
                                                    onChange={ev => setDraft(row.id, "comment", ev.target.value)} onBlur={() => commit(row, "comment")}
                                                    onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                                                    className={cn(BOX, "w-40 truncate")} />
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap">
                                                {hasParts ? (
                                                    <span className="inline-flex items-center gap-1.5 px-1.5 py-1 border border-transparent">
                                                        <button type="button" onClick={() => toggleExpanded(row.id)} className="text-emerald-700 dark:text-emerald-400 underline underline-offset-2">{parts.length}x</button>
                                                        <button type="button" disabled={busy} onClick={() => unsplitRow(row)} className="text-muted-foreground hover:text-foreground" title="Voltar a pagamento único">unir</button>
                                                    </span>
                                                ) : (
                                                    <select disabled={busy} value="1" onChange={ev => { const n = Number(ev.target.value); if (n > 1) splitRow(row, n); }} className={BOX} title="Dividir em parcelas">
                                                        <option value="1">à vista</option>
                                                        {Array.from({ length: MAX_INSTALLMENTS - 1 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}x</option>)}
                                                    </select>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 text-right whitespace-nowrap">
                                                {row.document_url && (
                                                    <button type="button" onClick={() => setViewer({ url: row.document_url!, title: `IPTU ${row.year}` })} title="Ver a guia do IPTU (PDF)"
                                                        className="p-1 rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30">
                                                        <FileText className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button type="button" disabled={busy} onClick={() => remove(row)} title="Excluir" className="p-1 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                        {hasParts && open && parts.map(part => {
                                            const key = `${row.id}:${part.seq}`;
                                            const pd = partDrafts[key] ?? {};
                                            return (
                                                <tr key={key} className="border-b border-border/40 bg-muted/20 text-[11px]">
                                                    <td className="px-1 py-0.5" />
                                                    <td className="px-2 py-0.5 text-muted-foreground" colSpan={2}>
                                                        <span className="inline-flex items-center gap-1 pl-4"><SplitSquareVertical className="w-3 h-3" /> Parcela {part.seq}/{parts.length}</span>
                                                    </td>
                                                    <td className="px-2 py-0.5 text-right">
                                                        <MoneyInput value={part.amount} draft={pd.amount} disabled={busy}
                                                            onDraft={text => setPartDraft(row.id, part.seq, "amount", text)} onCommit={() => commitPart(row, part, "amount")}
                                                            className="w-32" />
                                                    </td>
                                                    <td className="px-2 py-0.5">
                                                        <select disabled={busy} value={pd.paidBy ?? part.paid_by} onChange={ev => setPartDraft(row.id, part.seq, "paidBy", ev.target.value)} onBlur={() => commitPart(row, part, "paidBy")}
                                                            className={cn(BOX, (pd.paidBy ?? part.paid_by) === "LANDLORD" ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400")}>
                                                            {TAX_PAYERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="px-2 py-0.5 whitespace-nowrap">
                                                        <input type="date" disabled={busy} value={pd.date ?? (part.paid_on ?? "")} onChange={ev => setPartDraft(row.id, part.seq, "date", ev.target.value)} onBlur={() => commitPart(row, part, "date")} className={BOX} />
                                                    </td>
                                                    <td className="px-2 py-0.5 text-muted-foreground" colSpan={3} />
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                    <ColumnMenu columns={TAX_COLUMNS} ctl={cf} />
                    <CellSumBar ctl={sel} />
                    <p className="text-[11px] text-muted-foreground mt-2 mx-2">
                        Escolha “2x…{MAX_INSTALLMENTS}x” para dividir um ano em parcelas e mudar o pagador de cada uma (por exemplo, o proprietário paga as parcelas de um período vago).
                        Pago por “Proprietário” entra nas despesas do mês da data informada (sem data: janeiro do ano).
                        Apenas a guia mais recente fica guardada como documento atual.
                    </p>
                </div>
            )}

            {/* Add dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-emerald-600" /> Adicionar tributo</DialogTitle>
                        <DialogDescription>IPTU de um exercício, ITBI da compra ou outro tributo do imóvel.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5"><Label>Tributo</Label>
                                <select value={add.kind} onChange={ev => setAdd(a => ({ ...a, kind: ev.target.value as TaxKind }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                    {TAX_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5"><Label>Ano (exercício)</Label><Input type="number" min={1990} max={2100} step={1} value={add.year} onChange={ev => setAdd(a => ({ ...a, year: ev.target.value }))} /></div>
                            <div className="space-y-1.5"><Label>Valor total (R$)</Label><Input type="number" step="0.01" min={0} placeholder="Ex: 913.04" value={add.amount} onChange={ev => setAdd(a => ({ ...a, amount: ev.target.value }))} /></div>
                            <div className="space-y-1.5"><Label>Parcelas</Label>
                                <select value={add.parts} onChange={ev => setAdd(a => ({ ...a, parts: ev.target.value }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                    <option value="1">À vista</option>
                                    {Array.from({ length: MAX_INSTALLMENTS - 1 }, (_, i) => i + 2).map(n => <option key={n} value={String(n)}>{n}x</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5"><Label>Pago por</Label>
                                <select value={add.paidBy} onChange={ev => setAdd(a => ({ ...a, paidBy: ev.target.value as TaxPayer }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                    {TAX_PAYERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5"><Label>Data do pagamento</Label><Input type="date" value={add.date} onChange={ev => setAdd(a => ({ ...a, date: ev.target.value }))} /></div>
                        </div>
                        <div className="space-y-1.5"><Label>Comentários</Label><Input value={add.comment} placeholder="Opcional" onChange={ev => setAdd(a => ({ ...a, comment: ev.target.value }))} /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
                        <Button onClick={submitAdd} disabled={adding || parseInput(add.amount) === null} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {adding && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import IPTU dialog */}
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-600" /> Importar guia do IPTU</DialogTitle>
                        <DialogDescription>
                            Envie o PDF (ou foto) da guia de IPTU. A IA lê o exercício, os valores venais, a alíquota, o imposto, a coleta de lixo, o desconto e o total; revise e salve.
                            O PDF fica guardado como a guia atual do imóvel.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
                        <div className="space-y-1.5">
                            <Label>Guia do IPTU (.pdf, .jpg, .png)</Label>
                            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" disabled={extracting || importing} onChange={ev => onImportFile(ev.target.files?.[0] ?? null)} />
                            {extracting && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Lendo a guia com IA…</span>}
                        </div>
                        {importError && <div className="text-xs text-rose-600 flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {importError}</div>}

                        {review && extracted && (
                            <div className="space-y-4">
                                <div className={cn("text-xs rounded-lg border px-3 py-2 flex items-start gap-2",
                                    reviewTotals?.matches === false
                                        ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
                                        : "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300")}>
                                    {reviewTotals?.matches === false ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                                    <span>
                                        Leitura concluída{extracted.municipio ? ` · ${extracted.municipio}` : ""}{extracted.contribuinte ? ` · ${extracted.contribuinte}` : ""} · confiança {Math.round(extracted.confidence * 100)}%.
                                        {reviewTotals?.matches === false && reviewTotals.computed !== null && <> Atenção: imposto + lixo + TSA − desconto = {formatBRL(reviewTotals.computed)}, diferente do total lido ({formatBRL(extracted.total ?? 0)}). Confira os valores.</>}
                                        {parseReferencia(extracted.referencia) && <> Esta guia é a parcela {extracted.referencia}: confirme o valor total do ano e o número de parcelas.</>}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <Field label="Exercício"><Input type="number" min={1990} max={2100} step={1} value={review.year} onChange={ev => setReview(f => f && ({ ...f, year: ev.target.value }))} /></Field>
                                    <Field label="Valor total do ano (R$)"><Input type="number" step="0.01" min={0} value={review.amount} onChange={ev => setReview(f => f && ({ ...f, amount: ev.target.value }))} /></Field>
                                    <Field label="Parcelas">
                                        <select value={review.parts} onChange={ev => setReview(f => f && ({ ...f, parts: ev.target.value }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                            <option value="1">À vista</option>
                                            {Array.from({ length: MAX_INSTALLMENTS - 1 }, (_, i) => i + 2).map(n => <option key={n} value={String(n)}>{n}x</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Pago por">
                                        <select value={review.paidBy} onChange={ev => setReview(f => f && ({ ...f, paidBy: ev.target.value }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                            {TAX_PAYERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Vencimento"><Input type="date" value={review.vencimento} onChange={ev => setReview(f => f && ({ ...f, vencimento: ev.target.value }))} /></Field>
                                    <Field label="Referência"><Input value={review.referencia} placeholder="Única / 1/6" onChange={ev => setReview(f => f && ({ ...f, referencia: ev.target.value }))} /></Field>
                                    <Field label="Valor do imposto (R$)"><Input type="number" step="0.01" min={0} value={review.valorImposto} onChange={ev => setReview(f => f && ({ ...f, valorImposto: ev.target.value }))} /></Field>
                                    <Field label="Coleta de lixo (R$)"><Input type="number" step="0.01" min={0} value={review.coletaLixo} onChange={ev => setReview(f => f && ({ ...f, coletaLixo: ev.target.value }))} /></Field>
                                    <Field label="Desconto (R$)"><Input type="number" step="0.01" min={0} value={review.desconto} onChange={ev => setReview(f => f && ({ ...f, desconto: ev.target.value }))} /></Field>
                                    <Field label="Alíquota (%)"><Input type="number" step="0.0001" min={0} value={review.aliquota} onChange={ev => setReview(f => f && ({ ...f, aliquota: ev.target.value }))} /></Field>
                                    <Field label="Valor venal do imóvel (R$)"><Input type="number" step="0.01" min={0} value={review.valorVenalImovel} onChange={ev => setReview(f => f && ({ ...f, valorVenalImovel: ev.target.value }))} /></Field>
                                    <Field label="Valor venal predial (R$)"><Input type="number" step="0.01" min={0} value={review.valorVenalPredial} onChange={ev => setReview(f => f && ({ ...f, valorVenalPredial: ev.target.value }))} /></Field>
                                    <Field label="Valor venal do terreno (R$)"><Input type="number" step="0.01" min={0} value={review.valorVenalTerreno} onChange={ev => setReview(f => f && ({ ...f, valorVenalTerreno: ev.target.value }))} /></Field>
                                    <Field label="Área construída (m²)"><Input type="number" step="0.01" min={0} value={review.areaConstruida} onChange={ev => setReview(f => f && ({ ...f, areaConstruida: ev.target.value }))} /></Field>
                                    <Field label="Área do terreno (m²)"><Input type="number" step="0.01" min={0} value={review.areaTerreno} onChange={ev => setReview(f => f && ({ ...f, areaTerreno: ev.target.value }))} /></Field>
                                    <Field label="Inscrição imobiliária"><Input value={review.inscricao} onChange={ev => setReview(f => f && ({ ...f, inscricao: ev.target.value }))} /></Field>
                                    <Field label="Município"><Input value={review.municipio} onChange={ev => setReview(f => f && ({ ...f, municipio: ev.target.value }))} /></Field>
                                    <Field label="TSA (R$)"><Input type="number" step="0.01" min={0} value={review.tsa} onChange={ev => setReview(f => f && ({ ...f, tsa: ev.target.value }))} /></Field>
                                </div>
                                <Field label="Comentários"><Input value={review.comment} placeholder="Opcional" onChange={ev => setReview(f => f && ({ ...f, comment: ev.target.value }))} /></Field>
                                {rows.some(r => r.kind === "IPTU" && r.year === Number(review.year)) && (
                                    <p className="text-[11px] text-amber-700 dark:text-amber-400">Já existe IPTU {review.year} no registro: ele será atualizado com os dados desta guia.</p>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setImportOpen(false)}>Fechar</Button>
                        <Button onClick={runImport} disabled={!review || importing || extracting} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Salvar IPTU{review ? ` ${review.year}` : ""}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <IptuHistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} rows={rows} />
            <PdfViewerModal isOpen={viewer !== null} onClose={() => setViewer(null)} url={viewer?.url ?? null} title={viewer?.title ?? "Guia do IPTU"} fileName={`${(viewer?.title ?? "iptu").toLowerCase().replace(/\s+/g, "-")}.pdf`} />
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Tile({ label, value, hint, icon, tone, action }: { label: string; value: string; hint: React.ReactNode; icon: React.ReactNode; tone: "emerald" | "blue" | "violet" | "amber" | "rose"; action?: React.ReactNode }) {
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
            {action}
        </div>
    );
}
