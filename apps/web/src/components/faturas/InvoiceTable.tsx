"use client";

/**
 * The invoices as a spreadsheet — the same machinery as the contracts, energy and water tables: click
 * a header to sort and filter (right-click: hide columns), select cells to sum, move between cells
 * with the arrow keys. One line per invoice: its number and place, the state, the month it refers
 * to, the due date, what it charges, the amount, and how it was settled. The number opens the
 * invoice's panel; the icons at the end record a payment or cancel it.
 */
import React, { useMemo } from "react";
import { Ban, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { columnTableKey } from "@/lib/ui-preferences";
import { Sensitive } from "@/components/privacy";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { DELIVERY_STATE_META, INVOICE_STATUS_META, PAID_VIA_LABELS, brl, deliveryState, isOpen, type InvoiceRow } from "@/lib/invoice-hub";
import { blockersText } from "@/lib/invoice-payer";
import { monthShort } from "@/lib/invoice-schedule";

export interface InvoiceTableActions {
    onOpen: (row: InvoiceRow) => void;
    onPay: (row: InvoiceRow) => void;
    onCancel: (row: InvoiceRow) => void;
}

interface Props {
    rows: InvoiceRow[];
    actions: InvoiceTableActions;
}

const TABLE_KEY = columnTableKey("invoices");

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/** "vence hoje", "vence em 5 dias", "há 3 dias" */
function dueHint(row: InvoiceRow): { text: string; tone?: string } | null {
    if (row.daysLate > 0) return { text: `há ${plural(row.daysLate, "dia", "dias")}`, tone: "text-rose-600 dark:text-rose-400" };
    if (row.daysToDue === null) return null;
    if (row.daysToDue === 0) return { text: "vence hoje", tone: "text-amber-600 dark:text-amber-400" };
    return { text: `em ${plural(row.daysToDue, "dia", "dias")}`, tone: row.daysToDue <= 5 ? "text-amber-600 dark:text-amber-400" : undefined };
}

const num = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";
const hintCls = "block text-[11px] font-normal text-muted-foreground";
const iconBtn = "rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground";

export default function InvoiceTable({ rows, actions }: Props) {
    const columns = useMemo<ColumnDef<InvoiceRow>[]>(() => [
        { key: "invoice", label: "Fatura", kind: "text", get: r => [`nº ${r.invoice.number}`, r.place, r.invoice.tenant_name].filter(Boolean).join(" · ") },
        { key: "status", label: "Status", kind: "enum", options: Object.entries(INVOICE_STATUS_META).map(([value, m]) => ({ value, label: m.label })), get: r => r.display },
        { key: "email", label: "E-mail", kind: "enum", title: "Até onde a fatura chegou: enviada, entregue na caixa do inquilino, página aberta", options: Object.entries(DELIVERY_STATE_META).map(([value, m]) => ({ value, label: m.label })), get: r => deliveryState(r.invoice) },
        { key: "month", label: "Referência", kind: "month", title: "O mês do vencimento", get: r => r.month },
        { key: "due", label: "Vencimento", kind: "date", get: r => r.invoice.due_date },
        { key: "items", label: "Itens", kind: "text", title: "O que a fatura cobra", get: r => r.itemsLabel },
        { key: "amount", label: "Valor", kind: "number", align: "right", title: "A soma dos itens", get: r => r.invoice.amount },
        { key: "paid_on", label: "Pago em", kind: "date", get: r => r.invoice.paid_on ?? "" },
        { key: "paid", label: "Recebido", kind: "number", align: "right", title: "O que o inquilino pagou (valor da fatura + multa e juros, quando houve)", get: r => r.invoice.paid_amount },
        { key: "via", label: "Forma", kind: "enum", options: Object.entries(PAID_VIA_LABELS).map(([value, label]) => ({ value, label })), get: r => r.invoice.paid_via ?? "" },
    ], []);

    const cf = useColumnFilters(rows, columns, { key: "due", dir: "desc" }, { storageKey: TABLE_KEY, filtersKey: TABLE_KEY });
    const vis = useColumnVisibility(TABLE_KEY, { locked: ["invoice"] });
    const sel = useCellSum();
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
                    Nenhuma fatura com os filtros das colunas. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="border-b border-border/60 bg-muted/30">
                            <ColumnHeaders columns={columns} ctl={cf} visibility={vis} trailing={<th className="w-px px-2 py-2" />} />
                        </thead>
                        <tbody>
                            {cf.rows.map(row => {
                                const { invoice } = row;
                                const id = invoice.id;
                                const meta = INVOICE_STATUS_META[row.display];
                                const hint = dueHint(row);
                                const open = isOpen(invoice.status);
                                const missing = open ? blockersText(invoice.blockers) : "";
                                const mail = deliveryState(invoice);
                                return (
                                    <tr key={id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                                        <td {...sel.cellProps("invoice", id, null, "min-w-[220px] max-w-[420px] px-3 py-2.5")}>
                                            <button type="button" onClick={() => actions.onOpen(row)} className="block w-full rounded text-left text-sm font-semibold leading-snug text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title="Abrir a fatura">
                                                <span className="block break-words">Fatura nº {invoice.number} · {row.place}</span>
                                            </button>
                                            <span className="block break-words text-[11px] leading-snug text-muted-foreground">
                                                {invoice.tenant_name ? <Sensitive>{invoice.tenant_name}</Sensitive> : "Sem inquilino"}
                                            </span>
                                        </td>
                                        {show("status") && (
                                            <td {...sel.cellProps("status", id, null, "px-3 py-2.5")}>
                                                <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                                                {missing && <span className={cn(hintCls, "max-w-[220px] text-amber-700 dark:text-amber-400")} title="O que falta para emitir o boleto e enviar o e-mail">falta: {missing}</span>}
                                            </td>
                                        )}
                                        {show("email") && (
                                            <td {...sel.cellProps("email", id, null, "whitespace-nowrap px-3 py-2.5")}>
                                                {mail === "nenhum"
                                                    ? <span className="text-muted-foreground">—</span>
                                                    : <span className={cn("font-medium", DELIVERY_STATE_META[mail].tone)}>{DELIVERY_STATE_META[mail].label}</span>}
                                                {invoice.first_viewed_at && <span className={hintCls}>aberta em {formatDateBR(invoice.first_viewed_at.slice(0, 10))}</span>}
                                            </td>
                                        )}
                                        {show("month") && (
                                            <td {...sel.cellProps("month", id, null, "whitespace-nowrap px-3 py-2.5 text-foreground")}>{monthShort(row.month)}</td>
                                        )}
                                        {show("due") && (
                                            <td {...sel.cellProps("due", id, null, "whitespace-nowrap px-3 py-2.5")}>
                                                <span className="block tabular-nums text-foreground">{formatDateBR(invoice.due_date)}</span>
                                                {hint && <span className={cn(hintCls, hint.tone)}>{hint.text}</span>}
                                            </td>
                                        )}
                                        {show("items") && (
                                            <td {...sel.cellProps("items", id, null, "min-w-[160px] max-w-[320px] px-3 py-2.5 text-foreground")}>
                                                <span className="block break-words leading-snug">{row.itemsLabel || "—"}</span>
                                            </td>
                                        )}
                                        {show("amount") && (
                                            <td {...sel.cellProps("amount", id, invoice.amount, cn(num, "privacy-money font-semibold text-foreground"))}>{brl(invoice.amount)}</td>
                                        )}
                                        {show("paid_on") && (
                                            <td {...sel.cellProps("paid_on", id, null, "whitespace-nowrap px-3 py-2.5 tabular-nums text-foreground")}>
                                                {invoice.paid_on ? formatDateBR(invoice.paid_on) : <span className="text-muted-foreground">—</span>}
                                            </td>
                                        )}
                                        {show("paid") && (
                                            <td {...sel.cellProps("paid", id, invoice.paid_amount, cn(num, "privacy-money text-foreground"))}>
                                                {invoice.paid_amount !== null ? brl(invoice.paid_amount) : <span className="text-muted-foreground">—</span>}
                                                {invoice.late_fee_amount > 0 && <span className={hintCls}>{brl(invoice.late_fee_amount)} de multa e juros</span>}
                                            </td>
                                        )}
                                        {show("via") && (
                                            <td {...sel.cellProps("via", id, null, "whitespace-nowrap px-3 py-2.5 text-foreground")}>
                                                {invoice.paid_via ? PAID_VIA_LABELS[invoice.paid_via] ?? invoice.paid_via : <span className="text-muted-foreground">—</span>}
                                            </td>
                                        )}
                                        <td className="whitespace-nowrap px-2 py-2.5">
                                            <span className="flex items-center justify-end gap-0.5">
                                                {open && (
                                                    <>
                                                        <button type="button" onClick={() => actions.onPay(row)} title="Registrar o pagamento (baixa manual)" aria-label={`Registrar o pagamento da fatura nº ${invoice.number}`} className={cn(iconBtn, "hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30")}>
                                                            <CheckCircle2 className="h-4 w-4" />
                                                        </button>
                                                        <button type="button" onClick={() => actions.onCancel(row)} title="Cancelar a fatura" aria-label={`Cancelar a fatura nº ${invoice.number}`} className={cn(iconBtn, "hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30")}>
                                                            <Ban className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                )}
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
            <ColumnVisibilityMenu columns={columns} ctl={vis} />
        </div>
    );
}
