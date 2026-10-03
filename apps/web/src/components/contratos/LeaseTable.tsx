"use client";

/**
 * The contracts as a spreadsheet — the same machinery as the energy, water and Panorama tables:
 * click a header to sort and filter (right-click: hide columns), select cells to sum, move between
 * cells with the arrow keys. One line per lease: the place and the tenant, the status, the rent, the
 * property's own charge (condomínio for a multi-unit property, energia for a house or apartment),
 * the tenant's monthly total, the contract's total value, the term (with how much of it has run),
 * the next adjustment, who manages it and whether the PDF is attached. The title opens the
 * contract's dashboard; the icons at the end edit, terminate or delete it.
 */
import React, { useMemo } from "react";
import { Ban, FileText, Loader2, PenLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { columnTableKey } from "@/lib/ui-preferences";
import { Sensitive } from "@/components/privacy";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { useColumnWidths } from "@/components/properties/TableColumnWidths";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { MANAGEMENT_LABELS, STATUS_META, brl, statusMeta, todayBRT, type LeaseRow } from "@/lib/lease-dashboard";
import { leaseTermTotals } from "@/lib/lease-term";
import { amountOf, leaseTotals, type LeaseTotals, type PropertyKind } from "@/lib/lease-charges";
import { LeaseTitle } from "./LeaseTitle";

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
    /** `properties.id` → single/multi; a lease of a unit counts as multi when the property is unknown */
    propertyKinds?: Record<string, PropertyKind>;
}

const TABLE_KEY = columnTableKey("leases");
const RESPONSIBILITY_SHORT: Record<string, string> = { TENANT: "inquilino", LANDLORD: "proprietário", INCLUDED: "incluso no aluguel", INCLUDED_IN_CONDO: "incluso no condomínio" };

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

/**
 * The line under the title: only what the title does not already say. A reference that follows the
 * suggestion ("SANTO ANTONIO · Kitnet 35 - Robson Mesquita - 2024") names both the place and the
 * tenant, so it gets no subtitle; a bare place gets the tenant; a custom name gets both.
 */
function subtitleOf(row: LeaseRow): { place: string | null; tenant: string | null; noTenant: boolean } {
    const title = row.title.toLowerCase();
    const tenant = row.lease.primary_tenant_name;
    return {
        place: title.includes(row.place.toLowerCase()) ? null : row.place,
        tenant: tenant && !title.includes(tenant.toLowerCase()) ? tenant : null,
        noTenant: !tenant,
    };
}
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const num = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";
const hintCls = "block text-[11px] font-normal text-muted-foreground";
const iconBtn = "rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground";

export default function LeaseTable({ rows, actions, propertyKinds = {} }: Props) {
    const today = todayBRT();
    // the charge and the totals of every row, once (the columns' getters and the cells read them)
    const totals = useMemo(() => {
        const m = new Map<string, LeaseTotals>();
        for (const row of rows) {
            const { lease } = row;
            const kind = propertyKinds[lease.property_id] ?? (lease.unit_id ? "multi" : null);
            // the contract's own schedule (first and last months pro rata), each payment at the amount in force then;
            // the list has no ledger, so nothing here is "realizado": the contract's panel splits the two
            const term = leaseTermTotals({ ...lease, monthly_rent: Number(lease.monthly_rent) || 0 }, lease.adjustments ?? [], [], today);
            m.set(lease.id, { ...leaseTotals(Number(lease.monthly_rent) || 0, lease.charges, row.termMonths, kind), total: term.forecastKnown ? term.total.total : null });
        }
        return m;
    }, [rows, propertyKinds, today]);
    const totalsOf = (row: LeaseRow) => totals.get(row.lease.id) ?? leaseTotals(Number(row.lease.monthly_rent) || 0, row.lease.charges, row.termMonths, null);

    const columns = useMemo<ColumnDef<LeaseRow>[]>(() => [
        { key: "title", label: "Contrato", kind: "text", get: r => [r.title, r.place, r.lease.primary_tenant_name].filter(Boolean).join(" · ") },
        { key: "status", label: "Status", kind: "enum", options: Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label })), get: r => r.status },
        { key: "rent", label: "Aluguel", kind: "number", align: "right", title: "O aluguel de contrato (bruto, antes da taxa da imobiliária)", get: r => Number(r.lease.monthly_rent) || 0 },
        { key: "charge", label: "Condomínio / Energia", kind: "number", align: "right", title: "Condomínio de um imóvel multiunidade ou energia de uma casa/apartamento, como o contrato diz", get: r => { const c = totalsOf(r).featured.charge; return c && amountOf(c) > 0 ? amountOf(c) : null; } },
        { key: "monthly", label: "Total mensal", kind: "number", align: "right", title: "Aluguel + encargos com valor fixo pagos pelo inquilino", get: r => totalsOf(r).monthly },
        { key: "total", label: "Valor total", kind: "number", align: "right", title: "O que o contrato soma no prazo: o primeiro e o último mês pro rata, cada pagamento pelo valor que valia e os que faltam pelo valor de hoje (vazio quando o prazo é indeterminado). O painel do contrato separa o realizado do previsto", get: r => totalsOf(r).total },
        { key: "start", label: "Início", kind: "date", get: r => r.lease.start_date.slice(0, 10) },
        { key: "end", label: "Término", kind: "date", get: r => r.summary.effectiveEnd ?? "" },
        { key: "adjustment", label: "Reajuste", kind: "date", title: "Próximo reajuste do aluguel", get: r => (r.inForce && r.summary.nextAdjustmentDate ? r.summary.nextAdjustmentDate : "") },
        { key: "management", label: "Gestão", kind: "enum", options: Object.entries(MANAGEMENT_LABELS).map(([value, label]) => ({ value, label })), get: r => r.lease.management_type },
        { key: "file", label: "Arquivo", kind: "enum", align: "center", options: [{ value: "sim", label: "Com PDF" }, { value: "nao", label: "Sem PDF" }], get: r => (r.hasFile ? "sim" : "nao") },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [totals]);

    const cf = useColumnFilters(rows, columns, { key: "end", dir: "asc" }, { storageKey: TABLE_KEY, filtersKey: TABLE_KEY });
    const vis = useColumnVisibility(TABLE_KEY, { locked: ["title"] });
    const widths = useColumnWidths(TABLE_KEY);
    const sel = useCellSum({ widths });
    const show = (key: string) => !vis.isHidden(key);

    return (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <span>Clique no cabeçalho para ordenar e filtrar (botão direito: colunas) · selecione células para somar · setas movem entre as células</span>
                <span>{cf.rows.length} de {rows.length}</span>
            </div>
            {cf.anyFilter && (
                <div className="px-3 pt-3">
                    <FilterChips columns={columns} ctl={cf} />
                </div>
            )}
            {cf.rows.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Nenhum contrato com os filtros das colunas. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={widths.tableStyle}>
                        <thead className="border-b border-border/60 bg-muted/30">
                            <ColumnHeaders columns={columns} ctl={cf} widths={widths} visibility={vis} trailing={<th className="w-px px-2 py-2" />} />
                        </thead>
                        <tbody>
                            {cf.rows.map(row => {
                                const { lease, summary } = row;
                                const id = lease.id;
                                const meta = statusMeta(row);
                                const hint = termHint(row);
                                const progress = summary.progressPct;
                                const nextAdj = row.inForce ? summary.nextAdjustmentDate : null;
                                // no figure before the first month of the cycle is published
                                const acc = summary.monthsCounted > 0 ? summary.accumulatedPct : null;
                                const busy = actions.openingFileId === id;
                                const subtitle = subtitleOf(row);
                                const { featured, tenantFixed, monthly, total } = totalsOf(row);
                                const chargeAmount = featured.charge && amountOf(featured.charge) > 0 ? amountOf(featured.charge) : null;
                                return (
                                    <tr key={id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                                        <td {...sel.cellProps("title", id, null, "min-w-[220px] max-w-[420px] px-3 py-2.5")}>
                                            <button type="button" onClick={() => actions.onOpen(row)} className="block w-full rounded text-left text-sm font-semibold leading-snug text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title="Abrir o painel do contrato">
                                                <span className="block break-words"><LeaseTitle title={row.title} tenant={lease.primary_tenant_name} /></span>
                                            </button>
                                            {(subtitle.place || subtitle.tenant || subtitle.noTenant) && (
                                                <span className="block break-words text-[11px] leading-snug text-muted-foreground">
                                                    {subtitle.place}
                                                    {subtitle.place && (subtitle.tenant || subtitle.noTenant) ? " · " : ""}
                                                    {subtitle.tenant ? <Sensitive>{subtitle.tenant}</Sensitive> : subtitle.noTenant ? "Sem inquilino" : null}
                                                </span>
                                            )}
                                        </td>
                                        {show("status") && (
                                            <td {...sel.cellProps("status", id, null, "whitespace-nowrap px-3 py-2.5")}>
                                                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                                            </td>
                                        )}
                                        {show("rent") && (
                                            <td {...sel.cellProps("rent", id, Number(lease.monthly_rent) || 0, cn(num, "privacy-money font-semibold text-foreground"))}>
                                                {brl(Number(lease.monthly_rent) || 0)}
                                                <span className={hintCls}>dia {lease.rent_due_day}</span>
                                            </td>
                                        )}
                                        {show("charge") && (
                                            <td {...sel.cellProps("charge", id, chargeAmount, cn(num, "privacy-money text-foreground"))}>
                                                {chargeAmount !== null ? brl(chargeAmount) : <span className="text-muted-foreground">—</span>}
                                                <span className={hintCls}>
                                                    {featured.charge
                                                        ? `${featured.label.toLowerCase()} · ${RESPONSIBILITY_SHORT[featured.charge.responsibility] ?? featured.charge.responsibility.toLowerCase()}${chargeAmount === null ? " · sem valor" : ""}`
                                                        : `${featured.label.toLowerCase()} não informado`}
                                                </span>
                                            </td>
                                        )}
                                        {show("monthly") && (
                                            <td {...sel.cellProps("monthly", id, monthly, cn(num, "privacy-money font-semibold text-foreground"))}>
                                                {brl(monthly)}
                                                <span className={hintCls}>{tenantFixed.items.length > 0 ? `aluguel + ${brl(tenantFixed.total, 0)} de encargos` : "só o aluguel"}</span>
                                            </td>
                                        )}
                                        {show("total") && (
                                            <td {...sel.cellProps("total", id, total, cn(num, "privacy-money text-foreground"))}>
                                                {total !== null ? brl(total) : <span className="text-muted-foreground">—</span>}
                                                <span className={hintCls}>{row.termMonths !== null ? `${row.termMonths} meses` : "prazo indeterminado"}</span>
                                            </td>
                                        )}
                                        {show("start") && (
                                            <td {...sel.cellProps("start", id, null, "whitespace-nowrap px-3 py-2.5 tabular-nums text-foreground")}>{formatDateBR(lease.start_date)}</td>
                                        )}
                                        {show("end") && (
                                            <td {...sel.cellProps("end", id, null, "whitespace-nowrap px-3 py-2.5")}>
                                                <span className="block tabular-nums text-foreground">{summary.effectiveEnd ? formatDateBR(summary.effectiveEnd) : "—"}</span>
                                                <span className={cn(hintCls, hint.tone)}>{hint.text}</span>
                                                {progress !== null && row.inForce && (
                                                    <span className="mt-1 block h-1 w-24 overflow-hidden rounded-full bg-muted" title={`${progress}% do prazo`}>
                                                        <span className={cn("block h-full", summary.daysLeft !== null && summary.daysLeft < 0 ? "bg-rose-500" : summary.daysLeft !== null && summary.daysLeft <= 90 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${progress}%` }} />
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        {show("adjustment") && (
                                            <td {...sel.cellProps("adjustment", id, null, "whitespace-nowrap px-3 py-2.5")}>
                                                {nextAdj ? (
                                                    <>
                                                        <span className="block tabular-nums text-foreground">{formatDateBR(nextAdj)}</span>
                                                        <span className={hintCls}>
                                                            {row.indexLabel}
                                                            {acc !== null && <span className={cn("ml-1 font-medium", acc < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")} title={`${summary.monthsCounted} de ${summary.frequencyMonths} meses do ciclo já divulgados`}>{pct(acc)}</span>}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground">{row.inForce ? row.indexLabel : "—"}</span>
                                                )}
                                            </td>
                                        )}
                                        {show("management") && (
                                            <td {...sel.cellProps("management", id, null, "min-w-[160px] max-w-[280px] px-3 py-2.5")}>
                                                <span className="block break-words leading-snug text-foreground">
                                                    {lease.management_type === "AGENCY" ? lease.agency_name ?? "Imobiliária" : lease.management_type === "AGENT" ? lease.agent_name ?? "Corretor" : "Própria"}
                                                </span>
                                                <span className={hintCls}>{MANAGEMENT_LABELS[lease.management_type]}</span>
                                            </td>
                                        )}
                                        {show("file") && (
                                            <td {...sel.cellProps("file", id, null, "whitespace-nowrap px-3 py-2.5 text-center")}>
                                                {row.hasFile ? (
                                                    <button type="button" onClick={() => actions.onOpenFile(row)} disabled={busy} title="Abrir o PDF do contrato" aria-label="Abrir o PDF do contrato" className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                                    </button>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground" title="Sem arquivo: anexe o PDF no painel do contrato">sem PDF</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="whitespace-nowrap px-2 py-2.5">
                                            <span className="flex items-center justify-end gap-0.5">
                                                <button type="button" onClick={() => actions.onEdit(row)} title="Editar contrato" aria-label={`Editar o contrato de ${row.place}`} className={iconBtn}>
                                                    <PenLine className="h-4 w-4" />
                                                </button>
                                                {row.inForce && (
                                                    <button type="button" onClick={() => actions.onTerminate(row)} title="Rescindir contrato" aria-label={`Rescindir o contrato de ${row.place}`} className={cn(iconBtn, "hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30")}>
                                                        <Ban className="h-4 w-4" />
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => actions.onDelete(row)} title="Excluir contrato" aria-label={`Excluir o contrato de ${row.place}`} className={cn(iconBtn, "hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30")}>
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
            )}
            <CellSumBar ctl={sel} />
            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} widths={widths} />
        </div>
    );
}
