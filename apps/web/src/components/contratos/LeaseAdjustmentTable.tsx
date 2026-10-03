"use client";

/**
 * "Histórico de reajustes" on the contract's dashboard, as a spreadsheet: the contract's initial
 * amounts, every adjustment in order (1º, 2º…) with where it came from — an addendum ("aditivo", the
 * truth when there is one, opened from its cell) or Kitnets' calculation by the contract's index —
 * what is waiting for its index, and the next one with its preview. Same machinery as the other
 * tables: sort and filter on the headers, sum cells, hide columns.
 */
import React, { useMemo, useState } from "react";
import { AlertTriangle, FilePlus2, FileText, Loader2, Trash2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { columnTableKey, recordTableKey } from "@/lib/ui-preferences";
import { Money } from "@/components/privacy";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { useColumnWidths } from "@/components/properties/TableColumnWidths";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { formatDateBR } from "@/lib/dates";
import { brl } from "@/lib/lease-dashboard";
import { LEASE_INDEX_LABELS, round2, type LeaseSummary } from "@/lib/lease-summary";
import type { AdjustmentRow, StoredAdjustment } from "@/lib/lease-adjustments";
import type { LeaseAdjustmentsView } from "@/lib/lease-views";
import type { LeaseDocument } from "@/types/lease";

interface Props {
    leaseId: string;
    startDate: string;
    adjustments: LeaseAdjustmentsView;
    /** the current cycle, for the line of the next adjustment */
    summary: LeaseSummary;
    /** the lease's index, as the contract names it ("IVAR") */
    indexLabel: string;
    /** the rent in force and the condominium's preview for the next adjustment, when it follows an index */
    currentRent: number;
    currentCondo: number | null;
    nextCondo: number | null;
    inForce: boolean;
    documents: LeaseDocument[];
    onView: (url: string, name: string) => void;
    /** opens "Registrar aditivo"; with a date, for that adjustment */
    onAddendum: (date: string | null) => void;
    /** an addendum was removed: the dashboard reloads */
    onChanged: () => void;
}

type Origin = "CONTRACT" | "CALCULATED" | "ADDENDUM" | "AGREEMENT" | "UNRECORDED" | "WAITING" | "PREVIEW";

const ORIGIN: Record<Origin, { label: string; pill: string }> = {
    CONTRACT: { label: "Contrato", pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    CALCULATED: { label: "Calculado pelo Kitnets", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
    ADDENDUM: { label: "Aditivo", pill: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300" },
    AGREEMENT: { label: "Acordo sem aditivo", pill: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300" },
    UNRECORDED: { label: "Calculado, não gravado", pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    WAITING: { label: "Aguardando", pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    PREVIEW: { label: "Prévia", pill: "border border-border bg-background text-muted-foreground" },
};

interface Line {
    id: string;
    origin: Origin;
    /** "Valor inicial", "1º reajuste", "2º reajuste · próximo" */
    step: string;
    date: string;
    indexName: string | null;
    indexPct: number | null;
    previousRent: number | null;
    rent: number | null;
    changeAmount: number | null;
    changePct: number | null;
    previousCondo: number | null;
    condo: number | null;
    /** rent + condominium after this line */
    total: number | null;
    doc: LeaseDocument | null;
    notes: string | null;
    /** the stored row behind an adjustment */
    row: StoredAdjustment | null;
}

const TABLE_KEY = columnTableKey("lease-adjustments");
const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const indexNameOf = (code: string | null) => (code ? LEASE_INDEX_LABELS[code] ?? code : null);
const pill = "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider";
const num = "whitespace-nowrap px-3 py-2 text-right tabular-nums";
const link = "inline-flex max-w-[220px] items-center gap-1 rounded text-left text-[11px] font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400";

export default function LeaseAdjustmentTable({ leaseId, startDate, adjustments, summary, indexLabel, currentRent, currentCondo, nextCondo, inForce, documents, onView, onAddendum, onChanged }: Props) {
    const [removing, setRemoving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { rows, initial, waiting } = adjustments;
    const latestId = rows.length > 0 ? rows[rows.length - 1].id : null;

    const lines = useMemo<Line[]>(() => {
        const out: Line[] = [];
        const contract = documents.filter(d => d.document_type === "CONTRACT").sort((a, b) => (a.uploaded_at < b.uploaded_at ? -1 : 1))[0] ?? null;
        let rent = initial.rent, condo = initial.condo;
        out.push({
            id: "start", origin: "CONTRACT", step: "Valor inicial", date: startDate.slice(0, 10), indexName: null, indexPct: null,
            previousRent: null, rent, changeAmount: null, changePct: null, previousCondo: null, condo, total: rent + (condo ?? 0), doc: contract, notes: null, row: null,
        });

        let n = 0;
        const adjustment = (id: string, origin: Origin, r: AdjustmentRow, stored: StoredAdjustment | null): Line => {
            const newCondo = r.new_condo ?? condo;
            const line: Line = {
                id, origin, step: `${++n}º reajuste`, date: r.effective_date.slice(0, 10), indexName: indexNameOf(r.index_code), indexPct: r.index_pct,
                previousRent: r.previous_rent, rent: r.new_rent, changeAmount: round2(r.new_rent - r.previous_rent),
                changePct: r.previous_rent > 0 ? round2((r.new_rent / r.previous_rent - 1) * 100) : null,
                previousCondo: r.new_condo !== null ? r.previous_condo : null, condo: newCondo, total: r.new_rent + (newCondo ?? 0),
                doc: r.document_id ? documents.find(d => d.id === r.document_id) ?? null : null, notes: r.notes, row: stored,
            };
            rent = r.new_rent;
            condo = newCondo;
            return line;
        };
        for (const r of rows) out.push(adjustment(r.id, r.source === "ADDENDUM" ? (r.document_id ? "ADDENDUM" : "AGREEMENT") : "CALCULATED", r, r));
        // calculated but not written (the write failed): shown, so the history is whole, and flagged
        for (const r of adjustments.pending ?? []) out.push(adjustment(`pending:${r.effective_date}`, "UNRECORDED", r, null));

        if (waiting) {
            out.push({
                id: `waiting:${waiting.date}`, origin: "WAITING", step: `${++n}º reajuste`, date: waiting.date, indexName: indexLabel, indexPct: null,
                previousRent: rent, rent: null, changeAmount: null, changePct: null, previousCondo: null, condo: null, total: null, doc: null, row: null,
                notes: waiting.reason === "NO_SERIES"
                    ? "O índice deste contrato não tem série no Kitnets: registre o aditivo (ou o valor acordado) deste reajuste."
                    : `O ${indexLabel} do ciclo ainda não foi todo divulgado: o reajuste entra sozinho quando sair. Se houve aditivo, registre-o.`,
            });
        }

        if (inForce && summary.nextAdjustmentDate) {
            const known = summary.accumulatedPct !== null && summary.monthsCounted > 0 && summary.adjustedRent !== null;
            const preview = known ? (summary.adjustedRent as number) : null;
            const previewCondo = nextCondo ?? currentCondo;
            out.push({
                id: "next", origin: "PREVIEW", step: `${++n}º reajuste · próximo`, date: summary.nextAdjustmentDate, indexName: indexLabel,
                indexPct: known ? summary.accumulatedPct : null, previousRent: currentRent, rent: preview,
                changeAmount: preview !== null ? round2(preview - currentRent) : null, changePct: known ? summary.accumulatedPct : null,
                previousCondo: nextCondo !== null ? currentCondo : null, condo: previewCondo, total: preview !== null ? preview + (previewCondo ?? 0) : null,
                doc: null, row: null,
                notes: known
                    ? `Prévia com o índice até ${formatDateBR(summary.indexThroughDate)}; o valor fecha na data do reajuste.`
                    : summary.firstClosingDate ? `O índice começa a contar em ${formatDateBR(summary.firstClosingDate)}, quando fecha o 1º mês do ciclo.` : null,
            });
        }
        return out;
    }, [rows, adjustments.pending, initial, waiting, documents, startDate, summary, indexLabel, inForce, currentRent, currentCondo, nextCondo]);

    const columns = useMemo<ColumnDef<Line>[]>(() => [
        { key: "step", label: "Reajuste", kind: "text", get: r => r.step },
        { key: "date", label: "Data", kind: "date", get: r => r.date },
        { key: "origin", label: "Origem", kind: "enum", title: "De onde veio o valor: o aditivo, quando há um; sem aditivo, o cálculo do Kitnets", options: Object.entries(ORIGIN).map(([value, o]) => ({ value, label: o.label })), get: r => r.origin },
        { key: "index", label: "Índice", kind: "text", get: r => r.indexName ?? "" },
        { key: "index_pct", label: "Índice do ciclo", kind: "number", align: "right", sum: false, title: "O índice acumulado no ciclo que fechou na data (no próximo, o acumulado até agora)", get: r => r.indexPct },
        { key: "previous_rent", label: "Aluguel anterior", kind: "number", align: "right", sum: false, get: r => r.previousRent },
        { key: "rent", label: "Aluguel", kind: "number", align: "right", sum: false, title: "O aluguel a partir da data", get: r => r.rent },
        { key: "change", label: "Variação (R$)", kind: "number", align: "right", get: r => r.changeAmount },
        { key: "change_pct", label: "Variação (%)", kind: "number", align: "right", sum: false, title: "Quanto o aluguel mudou de fato: num aditivo pode ser diferente do índice", get: r => r.changePct },
        { key: "previous_condo", label: "Condomínio anterior", kind: "number", align: "right", sum: false, get: r => r.previousCondo },
        { key: "condo", label: "Condomínio", kind: "number", align: "right", sum: false, title: "O condomínio a partir da data", get: r => r.condo },
        { key: "total", label: "Aluguel + condomínio", kind: "number", align: "right", sum: false, get: r => r.total },
        { key: "document", label: "Aditivo", kind: "text", title: "O arquivo do aditivo (ou do contrato, na primeira linha): clique para abrir", get: r => r.doc?.file_name ?? "" },
        { key: "notes", label: "Observação", kind: "text", get: r => r.notes ?? "" },
    ], []);

    const cf = useColumnFilters(lines, columns, { key: "date", dir: "asc" }, { storageKey: TABLE_KEY, filtersKey: recordTableKey("lease-adjustments", leaseId) });
    const vis = useColumnVisibility(TABLE_KEY, { locked: ["step", "date", "rent"], defaultHidden: ["index", "previous_condo", "total"] });
    const widths = useColumnWidths(TABLE_KEY);
    const sel = useCellSum({ formatByCol: { index_pct: pctText, change_pct: pctText }, widths });
    const show = (key: string) => !vis.isHidden(key);

    const remove = async (row: StoredAdjustment) => {
        if (!window.confirm(`Remover o aditivo de ${formatDateBR(row.effective_date)}? O aluguel volta ao valor anterior e, sem aditivo, vale o cálculo do Kitnets.`)) return;
        setRemoving(row.id); setError(null);
        try {
            const res = await fetch(`/api/leases/${leaseId}/reajustes?id=${row.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(json.error || "Não foi possível remover o aditivo."); return; }
            onChanged();
        } catch {
            setError("Não foi possível remover o aditivo.");
        } finally {
            setRemoving(null);
        }
    };

    const money = (value: number | null, strong = false, preview = false) =>
        value === null ? <span className="text-muted-foreground">—</span>
            : <span className={cn(strong && !preview && "font-semibold text-foreground", preview && "italic text-muted-foreground")}><Money>{brl(value)}</Money></span>;

    return (
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">Histórico de reajustes</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        O valor inicial do contrato e cada reajuste, um a partir do outro. Com aditivo, vale o que ele diz; sem aditivo, vale o cálculo do Kitnets pelo índice do contrato.
                    </p>
                </div>
                {adjustments.available && (
                    <Button variant="outline" size="sm" onClick={() => onAddendum(null)}>
                        <FilePlus2 className="mr-1 h-4 w-4" /> Registrar aditivo
                    </Button>
                )}
            </header>

            {!adjustments.available ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">O histórico de reajustes não pôde ser lido agora. Recarregue a página em instantes.</p>
            ) : (
                <>
                    {adjustments.error && (
                        <p role="alert" className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>O reajuste calculado ainda não foi gravado no contrato: o aluguel do contrato segue no valor anterior. Recarregue a página; se continuar, envie esta mensagem ao suporte: <code className="break-all">{adjustments.error}</code></span>
                        </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                        <span>Uma linha por reajuste · clique no cabeçalho para ordenar e filtrar · arraste sobre as células para somar</span>
                        <span>{cf.rows.length} de {lines.length}</span>
                    </div>
                    {cf.anyFilter && (
                        <div className="px-3 pt-3">
                            <FilterChips columns={columns} ctl={cf} />
                        </div>
                    )}
                    {cf.rows.length === 0 ? (
                        <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                            Nenhuma linha com os filtros das colunas. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs" style={widths.tableStyle}>
                                <thead className="border-b border-border/60 bg-muted/30">
                                    <ColumnHeaders columns={columns} ctl={cf} widths={widths} visibility={vis} />
                                </thead>
                                <tbody>
                                    {cf.rows.map(line => {
                                        const preview = line.origin === "PREVIEW";
                                        const tone = line.changePct === null || line.changePct === 0 ? "text-muted-foreground" : line.changePct < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400";
                                        return (
                                            <tr key={line.id} className={cn("border-b border-border/50 last:border-0 hover:bg-muted/30", (line.origin === "WAITING" || line.origin === "UNRECORDED") && "bg-amber-50/60 dark:bg-amber-950/20")}>
                                                <td {...sel.cellProps("step", line.id, null, "whitespace-nowrap px-3 py-2 font-semibold text-foreground")}>{line.step}</td>
                                                <td {...sel.cellProps("date", line.id, null, "whitespace-nowrap px-3 py-2 tabular-nums text-foreground")}>{formatDateBR(line.date)}</td>
                                                {show("origin") && <td {...sel.cellProps("origin", line.id, null, "px-3 py-2")}><span className={cn(pill, ORIGIN[line.origin].pill)}>{ORIGIN[line.origin].label}</span></td>}
                                                {show("index") && <td {...sel.cellProps("index", line.id, null, "whitespace-nowrap px-3 py-2 text-muted-foreground")}>{line.indexName ?? "—"}</td>}
                                                {show("index_pct") && (
                                                    <td {...sel.cellProps("index_pct", line.id, line.indexPct, cn(num, "text-muted-foreground"))}>
                                                        {line.indexPct !== null ? <>{!show("index") && line.indexName ? `${line.indexName} ` : ""}{pctText(line.indexPct)}{preview ? " até agora" : ""}</> : "—"}
                                                    </td>
                                                )}
                                                {show("previous_rent") && <td {...sel.cellProps("previous_rent", line.id, line.previousRent, cn(num, "text-muted-foreground"))}>{money(line.previousRent)}</td>}
                                                <td {...sel.cellProps("rent", line.id, line.rent, num)}>{money(line.rent, true, preview)}</td>
                                                {show("change") && <td {...sel.cellProps("change", line.id, line.changeAmount, cn(num, preview ? "italic text-muted-foreground" : tone))}>{line.changeAmount === null ? "—" : <Money>{line.changeAmount > 0 ? "+" : line.changeAmount < 0 ? "−" : ""}{brl(Math.abs(line.changeAmount))}</Money>}</td>}
                                                {show("change_pct") && <td {...sel.cellProps("change_pct", line.id, line.changePct, cn(num, "font-medium", preview ? "italic text-muted-foreground" : tone))}>{line.changePct === null ? "—" : line.changePct === 0 ? "sem alteração" : pctText(line.changePct)}</td>}
                                                {show("previous_condo") && <td {...sel.cellProps("previous_condo", line.id, line.previousCondo, cn(num, "text-muted-foreground"))}>{money(line.previousCondo)}</td>}
                                                {show("condo") && <td {...sel.cellProps("condo", line.id, line.condo, num)}>{money(line.condo, line.previousCondo !== null || line.origin === "CONTRACT", preview)}</td>}
                                                {show("total") && <td {...sel.cellProps("total", line.id, line.total, num)}>{money(line.total, true, preview)}</td>}
                                                {/* a plain cell: its links and buttons take the click */}
                                                {show("document") && (
                                                    <td {...widths.cellProps("document", "px-3 py-2")}>
                                                        <span className="flex items-center gap-1.5">
                                                            {line.doc ? (
                                                                <button type="button" onClick={() => onView(line.doc!.file_url, line.doc!.file_name)} className={link} title={`Abrir ${line.doc.file_name}`}>
                                                                    <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{line.origin === "CONTRACT" ? "Contrato" : line.doc.file_name}</span>
                                                                </button>
                                                            ) : line.row && line.origin !== "ADDENDUM" ? (
                                                                <button type="button" onClick={() => onAddendum(line.date)} className={cn(link, "text-muted-foreground dark:text-muted-foreground")} title="Enviar o aditivo deste reajuste: o valor dele passa a valer no lugar do calculado">
                                                                    <FilePlus2 className="h-3.5 w-3.5 shrink-0" /> {line.origin === "AGREEMENT" ? "Anexar o aditivo" : "Registrar aditivo"}
                                                                </button>
                                                            ) : line.origin === "WAITING" ? (
                                                                <button type="button" onClick={() => onAddendum(line.date)} className={cn(link, "text-muted-foreground dark:text-muted-foreground")}>
                                                                    <FilePlus2 className="h-3.5 w-3.5 shrink-0" /> Registrar aditivo
                                                                </button>
                                                            ) : <span className="text-muted-foreground">—</span>}
                                                            {line.row && line.row.source === "ADDENDUM" && line.row.id === latestId && (
                                                                <button type="button" onClick={() => void remove(line.row!)} disabled={removing !== null} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-rose-600" title="Remover o aditivo" aria-label={`Remover o aditivo de ${formatDateBR(line.date)}`}>
                                                                    {removing === line.row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                                </button>
                                                            )}
                                                        </span>
                                                    </td>
                                                )}
                                                {show("notes") && <td {...sel.cellProps("notes", line.id, null, "min-w-[200px] max-w-[360px] px-3 py-2 text-[11px] leading-snug text-muted-foreground")}>{line.notes ?? ""}</td>}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
            {error && <p className="border-t border-border/60 px-4 py-2 text-xs text-rose-600">{error}</p>}
            <CellSumBar ctl={sel} />
            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} widths={widths} />
        </section>
    );
}
