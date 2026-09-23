"use client";

/**
 * The quadro resumo editor: one row per block of instalments.
 *
 * Shared by the creation form (where the AI fills it from the contract) and the gear on the
 * dashboard (where the owner corrects it afterwards — a delivery slips, the developer renegotiates,
 * the AI read a block wrong). Both write the same shape, which is what PATCH /api/investments/[id]
 * replaces wholesale.
 */
import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import {
    INDEX_LABELS,
    PAYMENT_KINDS,
    PERIODICITY_LABELS,
    formatBRL,
    type IndexCode,
    type PaymentKind,
    type Periodicity,
} from "@/lib/new-investments";

export interface ScheduleDraft {
    label: string;
    kind: PaymentKind;
    installments: number;
    amount: number;
    first_due_on: string;
    periodicity: Periodicity;
    index_code: IndexCode;
}

export const INDEX_CODES: IndexCode[] = ["NONE", "INCC", "IGPM", "IPCA", "CUB", "OTHER"];
export const PERIODICITIES: Periodicity[] = ["SINGLE", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];

/** What a block is worth in total: a SINGLE block is one payment whatever `installments` says. */
export const blockTotal = (s: ScheduleDraft): number =>
    s.amount * (s.periodicity === "SINGLE" ? 1 : Math.max(1, s.installments));

export const scheduleTotal = (schedules: ScheduleDraft[]): number =>
    schedules.reduce((sum, s) => sum + blockTotal(s), 0);

export const newScheduleDraft = (indexCode: IndexCode = "NONE"): ScheduleDraft => ({
    label: "Parcelas mensais",
    kind: "PARCELA",
    installments: 12,
    amount: 0,
    first_due_on: "",
    periodicity: "MONTHLY",
    index_code: indexCode,
});

interface Props {
    schedules: ScheduleDraft[];
    onChange: (schedules: ScheduleDraft[]) => void;
    /** Index a new block starts with (the contract's index until the keys). */
    defaultIndex?: IndexCode;
    disabled?: boolean;
    /** Heading and hint; omit for a bare table. */
    title?: string;
    hint?: string;
}

export default function InvestmentScheduleEditor({
    schedules,
    onChange,
    defaultIndex = "NONE",
    disabled,
    title = "Plano de pagamento",
    hint = "Cada linha é um bloco do quadro resumo: quantas parcelas, de quanto, a partir de quando.",
}: Props) {
    const patch = (index: number, values: Partial<ScheduleDraft>) =>
        onChange(schedules.map((s, i) => (i === index ? { ...s, ...values } : s)));

    return (
        <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onChange([...schedules, newScheduleDraft(defaultIndex)])} disabled={disabled}>
                    <Plus className="w-4 h-4 mr-1" /> Bloco
                </Button>
            </div>

            {schedules.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum bloco cadastrado. Sem ele não há previsão de parcelas no gráfico.
                </p>
            ) : (
                <div className="w-full min-w-0 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                <th className="text-left font-semibold px-2 py-1">Descrição</th>
                                <th className="text-left font-semibold px-2 py-1">Tipo</th>
                                <th className="text-right font-semibold px-2 py-1">Parcelas</th>
                                <th className="text-right font-semibold px-2 py-1">Valor</th>
                                <th className="text-left font-semibold px-2 py-1">1º vencimento</th>
                                <th className="text-left font-semibold px-2 py-1">Periodicidade</th>
                                <th className="text-left font-semibold px-2 py-1">Índice</th>
                                <th className="text-right font-semibold px-2 py-1">Total</th>
                                <th className="px-1" />
                            </tr>
                        </thead>
                        <tbody>
                            {schedules.map((s, index) => (
                                <tr key={index} className="border-t border-border/50">
                                    <td className="px-2 py-1">
                                        <Input value={s.label} onChange={e => patch(index, { label: e.target.value })} disabled={disabled} className="h-8 text-xs min-w-[8rem]" />
                                    </td>
                                    <td className="px-2 py-1">
                                        <select
                                            value={s.kind}
                                            onChange={e => patch(index, { kind: e.target.value as PaymentKind })}
                                            disabled={disabled}
                                            aria-label="Tipo do bloco"
                                            className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                                        >
                                            {PAYMENT_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-2 py-1">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={s.installments}
                                            disabled={disabled || s.periodicity === "SINGLE"}
                                            onChange={e => patch(index, { installments: Number(e.target.value) || 1 })}
                                            aria-label="Quantidade de parcelas"
                                            className="h-8 w-20 text-xs text-right tabular-nums"
                                        />
                                    </td>
                                    <td className="px-2 py-1">
                                        <Input
                                            inputMode="decimal"
                                            value={s.amount || ""}
                                            onChange={e => patch(index, { amount: Number(e.target.value.replace(/\./g, "").replace(",", ".")) || 0 })}
                                            disabled={disabled}
                                            aria-label="Valor de cada parcela"
                                            className="h-8 w-28 text-xs text-right tabular-nums"
                                        />
                                    </td>
                                    <td className="px-2 py-1">
                                        <Input
                                            type="date"
                                            value={s.first_due_on}
                                            onChange={e => patch(index, { first_due_on: e.target.value })}
                                            disabled={disabled}
                                            aria-label="Primeiro vencimento"
                                            className="h-8 text-xs tabular-nums"
                                        />
                                    </td>
                                    <td className="px-2 py-1">
                                        <select
                                            value={s.periodicity}
                                            onChange={e => patch(index, { periodicity: e.target.value as Periodicity })}
                                            disabled={disabled}
                                            aria-label="Periodicidade"
                                            className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                                        >
                                            {PERIODICITIES.map(p => <option key={p} value={p}>{PERIODICITY_LABELS[p]}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-2 py-1">
                                        <select
                                            value={s.index_code}
                                            onChange={e => patch(index, { index_code: e.target.value as IndexCode })}
                                            disabled={disabled}
                                            aria-label="Índice de correção"
                                            className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                                        >
                                            {INDEX_CODES.map(c => <option key={c} value={c}>{INDEX_LABELS[c]}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                        {formatBRL(blockTotal(s), 0)}
                                    </td>
                                    <td className="px-1 py-1">
                                        <button
                                            type="button"
                                            onClick={() => onChange(schedules.filter((_, i) => i !== index))}
                                            disabled={disabled}
                                            title="Remover bloco"
                                            aria-label="Remover bloco"
                                            className="p-1 rounded text-muted-foreground hover:text-rose-600 disabled:opacity-50"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={6} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Total do plano</td>
                                <td colSpan={3} className="px-2 py-2 text-right text-sm font-semibold tabular-nums">{formatBRL(scheduleTotal(schedules))}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}
