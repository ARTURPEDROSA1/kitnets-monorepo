"use client";

/**
 * The contracts as a table: one line each with the place, the tenant, the rent, the term (with how
 * much of it has run), the next adjustment and who manages it. Sortable by the columns that matter;
 * a row opens the contract's dashboard, the icons at the end edit, terminate or delete it.
 */
import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, FileText, Loader2, PenLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { MANAGEMENT_LABELS, STATUS_META, brl, type LeaseRow } from "@/lib/lease-dashboard";

export interface LeaseTableActions {
    onOpen: (row: LeaseRow) => void;
    onEdit: (row: LeaseRow) => void;
    onTerminate: (row: LeaseRow) => void;
    onDelete: (row: LeaseRow) => void;
    onOpenFile: (row: LeaseRow) => void;
    /** the lease whose file is being fetched */
    openingFileId: string | null;
}

interface Props {
    rows: LeaseRow[];
    actions: LeaseTableActions;
}

type SortKey = "title" | "rent" | "start" | "end" | "adjustment";
type Sort = { key: SortKey; dir: 1 | -1 };

const DEFAULT_SORT: Sort = { key: "end", dir: 1 };

/** "faltam 25 dias", "vencido há 3 dias", "termina hoje", "prazo indeterminado" */
function termHint(row: LeaseRow): { text: string; tone?: string } {
    const left = row.summary.daysLeft;
    if (left === null) return { text: "prazo indeterminado" };
    if (!row.inForce) return { text: row.stored === "TERMINATED" ? "rescindido" : "encerrado" };
    if (left < 0) return { text: `vencido há ${plural(-left, "dia", "dias")}`, tone: "text-rose-600 dark:text-rose-400" };
    if (left === 0) return { text: "termina hoje", tone: "text-amber-600 dark:text-amber-400" };
    return { text: `faltam ${plural(left, "dia", "dias")}`, tone: left <= 90 ? "text-amber-600 dark:text-amber-400" : undefined };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function sortValue(row: LeaseRow, key: SortKey): string | number {
    switch (key) {
        case "title": return row.title.toLowerCase();
        case "rent": return Number(row.lease.monthly_rent) || 0;
        case "start": return row.lease.start_date;
        case "end": return row.summary.effectiveEnd ?? "9999-12-31";
        case "adjustment": return row.inForce && row.summary.nextAdjustmentDate ? row.summary.nextAdjustmentDate : "9999-12-31";
    }
}

function Th({ label, sortKey, className, align = "left", sort, toggle }: { label: string; sortKey?: SortKey; className?: string; align?: "left" | "right"; sort: Sort; toggle: (key: SortKey) => void }) {
    return (
        <th className={cn("px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", align === "right" ? "text-right" : "text-left", className)}>
            {sortKey ? (
                <button type="button" onClick={() => toggle(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === sortKey && "text-foreground")} title={`Ordenar por ${label.toLowerCase()}`}>
                    {label}
                    {sort.key === sortKey ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
                </button>
            ) : label}
        </th>
    );
}

export default function LeaseTable({ rows, actions }: Props) {
    const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

    const sorted = useMemo(() => {
        const list = [...rows];
        list.sort((a, b) => {
            const va = sortValue(a, sort.key), vb = sortValue(b, sort.key);
            const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
            return cmp * sort.dir || a.title.localeCompare(b.title);
        });
        return list;
    }, [rows, sort]);

    const toggle = (key: SortKey) => setSort(prev => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
    const th = { sort, toggle };

    return (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <div className="overflow-x-auto">
                <table className="w-full text-xs [&_td]:whitespace-nowrap">
                    <thead className="border-b border-border/60 bg-muted/30">
                        <tr>
                            <Th label="Contrato" sortKey="title" {...th} />
                            <Th label="Status" {...th} />
                            <Th label="Aluguel" sortKey="rent" align="right" {...th} />
                            <Th label="Início" sortKey="start" {...th} />
                            <Th label="Término" sortKey="end" {...th} />
                            <Th label="Reajuste" sortKey="adjustment" {...th} />
                            <Th label="Gestão" {...th} />
                            <Th label="Arquivo" className="text-center" {...th} />
                            <th className="w-px px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(row => {
                            const { lease, summary, status } = row;
                            const meta = STATUS_META[status];
                            const hint = termHint(row);
                            const progress = summary.progressPct;
                            const nextAdj = row.inForce ? summary.nextAdjustmentDate : null;
                            // no figure before the first month of the cycle is published
                            const acc = summary.monthsCounted > 0 ? summary.accumulatedPct : null;
                            const busy = actions.openingFileId === lease.id;
                            return (
                                <tr
                                    key={lease.id}
                                    className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/30"
                                    onClick={() => actions.onOpen(row)}
                                    onKeyDown={e => { if (e.key === "Enter") actions.onOpen(row); }}
                                    tabIndex={0}
                                >
                                    <td className="max-w-[260px] px-3 py-2.5">
                                        <span className="block truncate text-sm font-semibold text-foreground" title={row.title}>{row.title}</span>
                                        <span className="block truncate text-[11px] text-muted-foreground" title={`${row.place} · ${lease.primary_tenant_name ?? "—"}`}>
                                            {row.title !== row.place ? `${row.place} · ` : ""}{lease.primary_tenant_name ?? "Sem inquilino"}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                        <span className="block text-sm font-semibold tabular-nums text-foreground">{brl(Number(lease.monthly_rent) || 0)}</span>
                                        <span className="block text-[11px] text-muted-foreground">dia {lease.rent_due_day}</span>
                                    </td>
                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{formatDateBR(lease.start_date)}</td>
                                    <td className="px-3 py-2.5">
                                        <span className="block tabular-nums text-foreground">{summary.effectiveEnd ? formatDateBR(summary.effectiveEnd) : "—"}</span>
                                        <span className={cn("block text-[11px] text-muted-foreground", hint.tone)}>{hint.text}</span>
                                        {progress !== null && row.inForce && (
                                            <span className="mt-1 block h-1 w-24 overflow-hidden rounded-full bg-muted" title={`${progress}% do prazo`}>
                                                <span className={cn("block h-full", summary.daysLeft !== null && summary.daysLeft < 0 ? "bg-rose-500" : summary.daysLeft !== null && summary.daysLeft <= 90 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${progress}%` }} />
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {nextAdj ? (
                                            <>
                                                <span className="block tabular-nums text-foreground">{formatDateBR(nextAdj)}</span>
                                                <span className="block text-[11px] text-muted-foreground">
                                                    {row.indexLabel}
                                                    {acc !== null && <span className={cn("ml-1 font-medium", acc < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")} title={`${summary.monthsCounted} de ${summary.frequencyMonths} meses do ciclo já divulgados`}>{pct(acc)}</span>}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">{row.inForce ? row.indexLabel : "—"}</span>
                                        )}
                                    </td>
                                    <td className="max-w-[180px] px-3 py-2.5">
                                        <span className="block truncate text-foreground" title={lease.agency_name ?? lease.agent_name ?? MANAGEMENT_LABELS[lease.management_type]}>
                                            {lease.management_type === "AGENCY" ? lease.agency_name ?? "Imobiliária" : lease.management_type === "AGENT" ? lease.agent_name ?? "Corretor" : "Própria"}
                                        </span>
                                        <span className="block text-[11px] text-muted-foreground">{MANAGEMENT_LABELS[lease.management_type]}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        {row.hasFile ? (
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); actions.onOpenFile(row); }}
                                                disabled={busy}
                                                title="Abrir o PDF do contrato"
                                                aria-label="Abrir o PDF do contrato"
                                                className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                            >
                                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                            </button>
                                        ) : (
                                            <span className="text-[11px] text-muted-foreground" title="Sem arquivo: anexe o PDF no painel do contrato">sem PDF</span>
                                        )}
                                    </td>
                                    <td className="px-2 py-2.5">
                                        <span className="flex items-center justify-end gap-0.5">
                                            <button type="button" onClick={e => { e.stopPropagation(); actions.onEdit(row); }} title="Editar contrato" aria-label={`Editar ${row.title}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                                                <PenLine className="h-4 w-4" />
                                            </button>
                                            {row.inForce && (
                                                <button type="button" onClick={e => { e.stopPropagation(); actions.onTerminate(row); }} title="Rescindir contrato" aria-label={`Rescindir ${row.title}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30">
                                                    <Ban className="h-4 w-4" />
                                                </button>
                                            )}
                                            <button type="button" onClick={e => { e.stopPropagation(); actions.onDelete(row); }} title="Excluir contrato" aria-label={`Excluir ${row.title}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
