"use client";

/**
 * "Cobranças recorrentes": what each lease in force charges the tenant every month and who collects it
 * — one line per lease and component (the rent, then each charge the tenant pays). The owner answers
 * "quem cobra" here (or in the contract, per charge, as "Emissor da fatura"): what the owner collects
 * goes into the lease's invoice. Same spreadsheet machinery as the other tables.
 */
import React, { useMemo } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { columnTableKey } from "@/lib/ui-preferences";
import { Money, Sensitive } from "@/components/privacy";
import { formatDateBR } from "@/lib/dates";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { useColumnWidths } from "@/components/properties/TableColumnWidths";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { MANAGEMENT_LABELS } from "@/lib/lease-dashboard";
import { COLLECTORS, COLLECTOR_LABELS, type CollectionComponent, type Collector } from "@/lib/invoice-collection";
import { brl, type RecurringRow } from "@/lib/invoice-hub";

interface Props {
    rows: RecurringRow[];
    /** `<lease id>:<component key>` being saved, or `<lease id>:pause` */
    savingKey: string | null;
    onCollector: (leaseId: string, componentKey: string, collector: Collector | null) => void;
    onPause: (leaseId: string, paused: boolean) => void;
    onOpenLease: (leaseId: string) => void;
}

interface ComponentRow {
    id: string;
    lease: RecurringRow;
    component: CollectionComponent;
}

const TABLE_KEY = columnTableKey("invoice-recurring");

/** What a blank answer means for this component. */
function blankLabel(c: CollectionComponent): string {
    if (c.undecided) return "A definir";
    if (c.derived && c.collector) return `Segue a gestão: ${COLLECTOR_LABELS[c.collector]}`;
    return "Não informado";
}

const hintCls = "block text-[11px] font-normal text-muted-foreground";

export default function RecurringChargesTable({ rows, savingKey, onCollector, onPause, onOpenLease }: Props) {
    const lines = useMemo<ComponentRow[]>(
        () => rows.flatMap(lease => lease.lease.components.map(component => ({ id: `${lease.lease.lease_id}:${component.key}`, lease, component }))),
        [rows]
    );

    const columns = useMemo<ColumnDef<ComponentRow>[]>(() => [
        { key: "lease", label: "Contrato", kind: "text", get: r => [r.lease.lease.title, r.lease.lease.place, r.lease.lease.tenant_name].filter(Boolean).join(" · ") },
        { key: "component", label: "Componente", kind: "text", get: r => r.component.label },
        { key: "amount", label: "Valor mensal", kind: "number", align: "right", title: "O valor do contrato; um encargo sem valor fixo não entra na fatura", get: r => r.component.amount },
        { key: "collector", label: "Quem cobra", kind: "enum", title: "Quem emite a cobrança ao inquilino. Proprietário: entra na sua fatura", options: [...COLLECTORS.map(value => ({ value: value as string, label: COLLECTOR_LABELS[value] })), { value: "", label: "Sem resposta" }], get: r => r.component.collector ?? "" },
        { key: "billable", label: "Na fatura", kind: "enum", align: "center", options: [{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }], get: r => (r.component.billable ? "sim" : "nao") },
        { key: "due_day", label: "Vence dia", kind: "number", align: "right", sum: false, get: r => r.lease.lease.due_day },
        { key: "management", label: "Gestão", kind: "enum", options: Object.entries(MANAGEMENT_LABELS).map(([value, label]) => ({ value, label })), get: r => r.lease.lease.management_type },
        { key: "state", label: "Cobrança", kind: "enum", align: "center", options: [{ value: "ativa", label: "Ativa" }, { value: "pausada", label: "Pausada" }], get: r => (r.lease.lease.paused ? "pausada" : "ativa") },
    ], []);

    // by contract, so a lease's rent and charges stay together
    const cf = useColumnFilters(lines, columns, { key: "lease", dir: "asc" }, { storageKey: TABLE_KEY, filtersKey: TABLE_KEY });
    const vis = useColumnVisibility(TABLE_KEY, { locked: ["lease", "component", "collector"] });
    const widths = useColumnWidths(TABLE_KEY);
    const sel = useCellSum({ formatByCol: { due_day: v => String(v) }, widths });
    const show = (key: string) => !vis.isHidden(key);

    if (lines.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
                Nenhum contrato em vigor. Cadastre ou importe um contrato em Contratos para definir o que é cobrado do inquilino.
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <span>Uma linha por contrato e componente · o que o proprietário cobra entra na fatura do mês · clique no cabeçalho para ordenar e filtrar</span>
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
                                const { lease, component } = line;
                                const l = lease.lease;
                                const saving = savingKey === line.id;
                                const pausing = savingKey === `${l.lease_id}:pause`;
                                return (
                                    <tr key={line.id} className={cn("border-b border-border/50 last:border-0 hover:bg-muted/30", l.paused && "opacity-70")}>
                                        <td {...sel.cellProps("lease", line.id, null, "min-w-[220px] max-w-[420px] px-3 py-2.5")}>
                                            <button type="button" onClick={() => onOpenLease(l.lease_id)} className="block w-full rounded text-left text-sm font-semibold leading-snug text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title="Abrir o contrato">
                                                <span className="block break-words">{l.title}</span>
                                            </button>
                                            <span className="block break-words text-[11px] leading-snug text-muted-foreground">
                                                {l.tenant_name ? <Sensitive>{l.tenant_name}</Sensitive> : "Sem inquilino"}
                                                {!l.tenant_email && lease.monthly > 0 && <span className="text-amber-700 dark:text-amber-400"> · sem e-mail</span>}
                                            </span>
                                        </td>
                                        <td {...sel.cellProps("component", line.id, null, "whitespace-nowrap px-3 py-2.5 font-medium text-foreground")}>{component.label}</td>
                                        {show("amount") && (
                                            <td {...sel.cellProps("amount", line.id, component.amount, "whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-foreground")}>
                                                {component.amount !== null ? <Money>{brl(component.amount)}</Money> : <span className="text-muted-foreground" title="O contrato não dá um valor fixo a este encargo">sem valor</span>}
                                                {/* when the contract readjusts this line: the rent's date, shared by what follows it */}
                                                {component.adjustment && component.amount !== null && l.next_adjustment && (
                                                    <span className="block text-[11px] font-normal text-muted-foreground">
                                                        {component.adjustment === "WITH_RENT" ? "reajusta com o aluguel em " : "reajuste em "}{formatDateBR(l.next_adjustment)}
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        {/* a plain cell: inside a selectable one a select only opens on a double click */}
                                        <td {...widths.cellProps("collector", "px-3 py-2")}>
                                            <span className="flex items-center gap-1.5">
                                                <select
                                                    className={cn("h-8 min-w-[200px] rounded-md border bg-background px-2 text-xs", component.undecided && "border-amber-400")}
                                                    value={component.stored ?? ""}
                                                    disabled={saving}
                                                    onChange={e => onCollector(l.lease_id, component.key, (e.target.value || null) as Collector | null)}
                                                    aria-label={`Quem cobra ${component.label} de ${l.title}`}
                                                >
                                                    <option value="">{blankLabel(component)}</option>
                                                    {COLLECTORS.map(c => <option key={c} value={c}>{c === "OWNER" ? "Proprietário (entra na fatura)" : COLLECTOR_LABELS[c]}</option>)}
                                                </select>
                                                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                            </span>
                                        </td>
                                        {show("billable") && (
                                            <td {...sel.cellProps("billable", line.id, null, "whitespace-nowrap px-3 py-2.5 text-center")}>
                                                {component.billable
                                                    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Sim</span>
                                                    : <span className="text-muted-foreground" title={component.collector === "OWNER" ? "Sem valor fixo no contrato" : undefined}>{component.collector === "OWNER" ? "sem valor" : "não"}</span>}
                                            </td>
                                        )}
                                        {show("due_day") && (
                                            <td {...sel.cellProps("due_day", line.id, l.due_day, "whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-foreground")}>{l.due_day}</td>
                                        )}
                                        {show("management") && (
                                            <td {...sel.cellProps("management", line.id, null, "min-w-[140px] max-w-[260px] px-3 py-2.5")}>
                                                <span className="block break-words leading-snug text-foreground">{l.manager_name ?? (l.management_type === "SELF_MANAGED" ? "Própria" : MANAGEMENT_LABELS[l.management_type])}</span>
                                                <span className={hintCls}>{MANAGEMENT_LABELS[l.management_type]}</span>
                                            </td>
                                        )}
                                        {show("state") && (
                                            <td {...sel.cellProps("state", line.id, null, "whitespace-nowrap px-3 py-2 text-center")}>
                                                <button
                                                    type="button"
                                                    onClick={() => onPause(l.lease_id, !l.paused)}
                                                    disabled={pausing}
                                                    title={l.paused ? "Retomar: o contrato volta a gerar fatura" : "Pausar: o contrato deixa de gerar fatura"}
                                                    className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium", l.paused ? "border-amber-300 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground hover:text-foreground")}
                                                >
                                                    {pausing ? <Loader2 className="h-3 w-3 animate-spin" /> : l.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                                                    {l.paused ? "Pausada" : "Ativa"}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <CellSumBar ctl={sel} />
            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} widths={widths} />
        </div>
    );
}
