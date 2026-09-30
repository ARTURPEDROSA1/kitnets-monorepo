"use client";

/**
 * Four small figures under the period buttons — what the slice on screen adds up to, its average,
 * its high and its low — so the chart is read at a glance and the numbers stay reachable without
 * hovering.
 */
import { formatMonthYear, type SeriesSummary } from "@/lib/index-period";
import { formatPercent } from "./IndexTrendChart";

interface Props {
    summary: SeriesSummary | null;
    /** how a value of the series is written */
    format: (value: number) => string;
    /** "variation": monthly rates that compound; "level": values such as R$ or a yield */
    kind: "variation" | "level";
    /** label of the average, "Média mensal" by default */
    averageLabel?: string;
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatPercent(v)}`;

export function PeriodStats({ summary, format, kind, averageLabel = "Média mensal" }: Props) {
    if (!summary) return null;
    const items = [
        {
            label: kind === "variation" ? "Acumulado no período" : "Variação no período",
            value: signed(summary.accumulated),
            hint: `${formatMonthYear(summary.first.date)} – ${formatMonthYear(summary.last.date)} · ${summary.count} ${summary.count === 1 ? "valor" : "valores"}`,
        },
        { label: averageLabel, value: format(summary.average), hint: kind === "variation" ? "média simples das variações" : "média dos valores" },
        { label: "Máxima", value: format(summary.max.value), hint: formatMonthYear(summary.max.date) },
        { label: "Mínima", value: format(summary.min.value), hint: formatMonthYear(summary.min.date) },
    ];
    return (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {items.map((i) => (
                <div key={i.label} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{i.label}</dt>
                    <dd className="text-base font-bold tabular-nums text-foreground">{i.value}</dd>
                    <dd className="text-[11px] text-muted-foreground">{i.hint}</dd>
                </div>
            ))}
        </dl>
    );
}
