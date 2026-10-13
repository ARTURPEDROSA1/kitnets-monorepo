"use client";

/**
 * The month's rents as a spreadsheet — the same machinery as the contracts and the ledgers: click a header
 * to sort and filter (right-click: hide columns), select cells to sum. One line per rent due in the month,
 * in due-date order: when it falls due (a dot in its status colour), the contract (the tenant under it), the
 * status, the contract's rent, what came in before and after the agency's fee, and who manages it. Sorted by
 * due date in the current month, a "hoje" line splits what already fell due from what is still ahead. A
 * receipt posted since the last visit stays lit (an emerald tint and "novo") for this visit.
 */
import React, { useMemo } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { columnTableKey } from "@/lib/ui-preferences";
import { Money, Sensitive } from "@/components/privacy";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { useColumnWidths } from "@/components/properties/TableColumnWidths";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { LeaseTitle } from "@/components/contratos/LeaseTitle";
import { brl } from "@/lib/lease-dashboard";
import type { MonthRent, RentStatus } from "@/lib/dashboard-hub";
import type { IncomeSource } from "@/lib/property-income";
import { INK } from "./ink";

interface Props {
    rents: MonthRent[];
    /** ids of the receipts posted since the last visit */
    fresh: Set<string>;
    /** `YYYY-MM-DD`: where the "hoje" line goes */
    today: string;
    /** "" for Portuguese, "/en" | "/es" otherwise */
    base: string;
}

const TABLE_KEY = columnTableKey("dashboard-rents");

export const STATUS_LABEL: Record<RentStatus, string> = { recebido: "Recebido", a_vencer: "A vencer", vencido: "Vencido" };
export const STATUS_DOT: Record<RentStatus, string> = { recebido: "bg-emerald-500", a_vencer: "bg-amber-400", vencido: "bg-rose-500" };
const SOURCE_LABEL: Record<IncomeSource, string> = { MANUAL: "lançado à mão", IMPORT: "planilha", BANK: "extrato", INVOICE: "fatura" };

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const ddmm = (d: string) => formatDateBR(d).slice(0, 5);

/** The status pill: "recebido 11/10", "vence hoje", "vence em 3 dias", "vencido há 7 dias"; the detail in its title. */
export function RentPill({ rent }: { rent: MonthRent }) {
    const { status, days, received } = rent;
    const text = status === "recebido" ? (received?.on ? `recebido ${ddmm(received.on)}` : "recebido")
        : status === "a_vencer" ? (days === 0 ? "vence hoje" : `vence em ${plural(days, "dia", "dias")}`)
            : `vencido há ${plural(-days, "dia", "dias")}`;
    const title = status === "recebido" ? `Recebido${received?.on ? ` em ${formatDateBR(received.on)}` : ""} · ${SOURCE_LABEL[received!.source]}`
        : status === "vencido" ? (rent.invoice ? "Fatura em atraso" : "Passou do vencimento e a razão de receitas não tem o recebimento")
            : `Vence em ${formatDateBR(rent.due)}`;
    const cls = status === "recebido" ? cn("bg-emerald-500/15", INK.in)
        : status === "vencido" ? cn("bg-rose-500/15", INK.late)
            : days <= 3 ? cn("bg-amber-500/20", INK.due) : "bg-slate-500/10 text-muted-foreground";
    return <span title={title} className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{text}</span>;
}

const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
const hintCls = "block text-[11px] font-normal text-muted-foreground";
/** A contract of a unit without a name of its own: the unit leads the cell. */
const unitFirst = (r: MonthRent) => Boolean(r.lease.unit_name?.trim() && r.lease.property_name && !r.lease.reference_name?.trim());

export default function RentBoard({ rents, fresh, today, base }: Props) {
    const managers = useMemo(() => [...new Set(rents.map(r => r.manager))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rents]);
    const columns = useMemo<ColumnDef<MonthRent>[]>(() => [
        { key: "due", label: "Venc.", kind: "date", title: "O dia em que o aluguel vence no mês; o ponto tem a cor da situação", get: r => r.due },
        { key: "contract", label: "Contrato", kind: "text", get: r => [r.title, r.place, r.tenant].filter(Boolean).join(" · ") },
        { key: "status", label: "Situação", kind: "enum", options: (Object.keys(STATUS_LABEL) as RentStatus[]).map(value => ({ value, label: STATUS_LABEL[value] })), get: r => r.status },
        { key: "rent", label: "Aluguel", kind: "number", align: "right", title: "O aluguel de contrato, antes da taxa da imobiliária", get: r => r.rent },
        { key: "received", label: "Recebido", kind: "number", align: "right", title: "O aluguel que entrou, antes da taxa da imobiliária, pela razão de receitas do imóvel ou pela fatura paga", get: r => r.received?.gross ?? null },
        { key: "net", label: "Líquido", kind: "number", align: "right", title: "O aluguel que entrou, depois da taxa da imobiliária", get: r => r.received?.net ?? null },
        { key: "manager", label: "Gestão", kind: "enum", options: managers.map(m => ({ value: m, label: m })), get: r => r.manager },
    ], [managers]);

    const cf = useColumnFilters(rents, columns, { key: "due", dir: "asc" }, { storageKey: TABLE_KEY, filtersKey: TABLE_KEY });
    const vis = useColumnVisibility(TABLE_KEY);
    const widths = useColumnWidths(TABLE_KEY);
    const sel = useCellSum({ widths });
    const show = (key: string) => !vis.isHidden(key);
    const shown = columns.filter(c => show(c.key)).length;
    // the "hoje" line: in due-date order, between the last rent already due and the first still ahead
    const todayAt = cf.sort.key === "due" && cf.sort.dir === "asc" ? cf.rows.findIndex(r => r.due >= today) : -1;
    const sum = (pick: (r: MonthRent) => number) => brl(cf.rows.reduce((s, r) => s + pick(r), 0));

    return (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
            {cf.anyFilter && (
                <div className="px-3 pt-3">
                    <FilterChips columns={columns} ctl={cf} />
                </div>
            )}
            {cf.rows.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Nenhum aluguel com os filtros das colunas. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={widths.tableStyle}>
                        <thead className="border-b border-border/60 bg-muted/30">
                            <ColumnHeaders columns={columns} ctl={cf} widths={widths} visibility={vis} />
                        </thead>
                        <tbody>
                            {cf.rows.map((rent, i) => {
                                const { id, lease, received } = rent;
                                const isFresh = fresh.has(id);
                                return (
                                    <React.Fragment key={id}>
                                        {i === todayAt && i > 0 && (
                                            <tr aria-label={`hoje, ${ddmm(today)}`}>
                                                <td colSpan={shown} className="p-0">
                                                    <span className="flex items-center gap-2 px-3 py-1">
                                                        <span className={cn("text-[11px] font-semibold", INK.in)}>hoje, {ddmm(today)}</span>
                                                        <span className="h-px flex-1 bg-emerald-500/50" />
                                                    </span>
                                                </td>
                                            </tr>
                                        )}
                                        <tr
                                            className={cn(
                                                "border-b border-border/50 last:border-0",
                                                isFresh ? "bg-emerald-500/[0.07] hover:bg-emerald-500/[0.11]" : rent.status === "vencido" ? "bg-rose-500/[0.05] hover:bg-rose-500/[0.09]" : "hover:bg-muted/30",
                                            )}
                                        >
                                            {show("due") && (
                                                <td {...sel.cellProps("due", id, null, "whitespace-nowrap px-3 py-2 tabular-nums")}>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[rent.status])} aria-label={STATUS_LABEL[rent.status]} />
                                                        <span className={cn("font-semibold", rent.status === "recebido" && !isFresh ? "text-muted-foreground" : "text-foreground")}>{ddmm(rent.due)}</span>
                                                    </span>
                                                    {isFresh && <span className={cn("ml-3.5 mt-0.5 inline-block rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold", INK.in)}>novo</span>}
                                                </td>
                                            )}
                                            {show("contract") && (
                                                <td {...sel.cellProps("contract", id, null, "min-w-[124px] max-w-[300px] px-3 py-2 sm:min-w-[190px]")}>
                                                    {/* a unit's contract leads with the unit ("Kitnet 3"), the building under it; a named contract keeps its name */}
                                                    <Link href={`${base}/contratos?id=${lease.id}`} className="block break-words text-[13px] font-semibold leading-snug text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title={`Abrir o contrato de ${rent.place}`}>
                                                        {unitFirst(rent) ? lease.unit_name : <LeaseTitle title={rent.title} tenant={rent.tenant} />}
                                                    </Link>
                                                    <span className={hintCls}>
                                                        {unitFirst(rent) ? <>{lease.property_name} · </> : rent.title !== rent.place ? <>{rent.place} · </> : null}
                                                        {rent.tenant ? <Sensitive>{rent.tenant}</Sensitive> : "sem inquilino"}
                                                    </span>
                                                </td>
                                            )}
                                            {show("status") && (
                                                <td {...sel.cellProps("status", id, null, "whitespace-nowrap px-3 py-2")}>
                                                    <span className="flex flex-col items-start gap-0.5">
                                                        <RentPill rent={rent} />
                                                        {rent.invoice && rent.status !== "recebido" && (
                                                            <Link
                                                                href={`${base}/faturas?id=${rent.invoice.id}`}
                                                                title={`Abrir a fatura nº ${rent.invoice.number}`}
                                                                className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                                            >
                                                                <FileText className="h-3 w-3" /> nº {rent.invoice.number}
                                                            </Link>
                                                        )}
                                                    </span>
                                                </td>
                                            )}
                                            {show("rent") && (
                                                <td {...sel.cellProps("rent", id, rent.rent, cn(num, "privacy-money text-foreground"))}>{brl(rent.rent)}</td>
                                            )}
                                            {show("received") && (
                                                <td {...sel.cellProps("received", id, received?.gross ?? null, cn(num, "privacy-money font-semibold text-foreground"))}>
                                                    {received ? brl(received.gross) : <span className="font-normal text-muted-foreground">—</span>}
                                                </td>
                                            )}
                                            {show("net") && (
                                                <td {...sel.cellProps("net", id, received?.net ?? null, cn(num, "privacy-money text-foreground"))}>
                                                    {received ? brl(received.net) : <span className="text-muted-foreground">—</span>}
                                                </td>
                                            )}
                                            {show("manager") && (
                                                <td {...sel.cellProps("manager", id, null, "whitespace-nowrap px-3 py-2")}>
                                                    <span className="inline-block max-w-[120px] truncate align-bottom leading-snug text-foreground" title={rent.manager}>{rent.manager}</span>
                                                    {received && received.fee > 0 && (
                                                        <span className={cn("privacy-money ml-1 whitespace-nowrap text-[11px]", INK.fee)} title="A taxa que a imobiliária reteve no mês">
                                                            {received.feePct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                        <tfoot className="border-t border-border/60 bg-muted/20 text-[12px]">
                            <tr>
                                {show("due") && <td className="px-3 py-2 font-semibold text-foreground">Soma</td>}
                                {show("contract") && <td className="px-3 py-2 text-muted-foreground">{plural(cf.rows.length, "aluguel", "aluguéis")}</td>}
                                {show("status") && <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{cf.rows.filter(r => r.status === "recebido").length} de {cf.rows.length} recebidos</td>}
                                {show("rent") && <td className={cn(num, "font-semibold text-foreground")}><Money>{sum(r => r.rent)}</Money></td>}
                                {show("received") && <td className={cn(num, "font-semibold text-foreground")}><Money>{sum(r => r.received?.gross ?? 0)}</Money></td>}
                                {show("net") && <td className={cn(num, "font-semibold text-foreground")}><Money>{sum(r => r.received?.net ?? 0)}</Money></td>}
                                {show("manager") && <td />}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
            <CellSumBar ctl={sel} />
            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} widths={widths} />
        </div>
    );
}
