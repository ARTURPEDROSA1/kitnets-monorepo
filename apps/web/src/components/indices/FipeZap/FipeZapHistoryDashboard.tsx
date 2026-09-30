"use client";

/**
 * The history of the FipeZAP page: the trend chart with the series switch (Locação · Venda · Yield),
 * the bedroom bucket and the period buttons, then the heatmap and the table, all showing the same
 * slice. The series and the period change in the browser; the bedroom bucket is another database
 * series, so it goes through the URL (?bedrooms=) and the page fetches it again. The first change
 * asks the visitor for a contact (useLeadGate), as the old filter form did.
 */
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { FipeZapContext, FipeZapDataPoint } from "@/lib/fipezap";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEFAULT_MONTHLY_PERIOD, MONTHLY_PRESETS, filterByRange, formatRangeLabel, summarizeSeries } from "@/lib/index-period";
import { IndexTrendChart, formatPercent, type TrendPoint } from "../IndexTrendChart";
import { PeriodSelector } from "../PeriodSelector";
import { PeriodStats } from "../PeriodStats";
import { useIndexPeriod } from "../useIndexPeriod";
import { useLeadGate } from "../useLeadGate";
import { FipeZapHeatmap } from "./FipeZapHeatmap";
import { FipeZapTable } from "./FipeZapTable";

type Series = "locacao" | "venda" | "yield";

const SERIES: Array<{ value: Series; label: string; hint: string }> = [
    { value: "locacao", label: "Locação", hint: "variação mensal dos preços de locação" },
    { value: "venda", label: "Venda", hint: "variação mensal dos preços de venda" },
    { value: "yield", label: "Yield", hint: "rentabilidade mensal do aluguel sobre o preço" },
];

const BEDROOMS: Array<{ value: string; label: string }> = [
    { value: "todos", label: "Todos os dormitórios" },
    { value: "1", label: "1 dormitório" },
    { value: "2", label: "2 dormitórios" },
    { value: "3", label: "3 dormitórios" },
    { value: "4", label: "4+ dormitórios" },
];

const isSeries = (v: string): v is Series => v === "locacao" || v === "venda" || v === "yield";

const CARD = "rounded-xl border bg-card text-card-foreground shadow-sm";

interface Props {
    /** every series of the chosen bedroom bucket, the whole history */
    data: FipeZapContext;
    /** the series from the URL (?type=) */
    initialType: string;
    /** the bucket from the URL (?bedrooms=) */
    bedrooms: string;
}

export function FipeZapHistoryDashboard({ data, initialType, bedrooms }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const [series, setSeries] = useState<Series>(isSeries(initialType) ? initialType : "locacao");
    const { guard, modal } = useLeadGate();

    // the period helpers key on reference_date
    const rows = useMemo(
        () => [...data[series]].map((p) => ({ ...p, reference_date: p.date })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
        [data, series],
    );
    const earliest = rows[0]?.date ?? "";
    const latest = rows[rows.length - 1]?.date ?? "";
    const { period, custom, range, redundant, select, setCustom } = useIndexPeriod(earliest, latest, MONTHLY_PRESETS, DEFAULT_MONTHLY_PERIOD);

    const slice: FipeZapDataPoint[] = useMemo(() => filterByRange(rows, range), [rows, range]);
    const kind = series === "yield" ? "level" : "variation";
    const points = useMemo<TrendPoint[]>(() => slice.map((p) => ({
        date: p.date,
        value: Number(p.value_percent),
        details: kind === "level" ? [] : [
            ...(p.accumulated_12m !== null ? [{ label: "Acumulado 12 meses", value: formatPercent(Number(p.accumulated_12m)) }] : []),
            ...(p.accumulated_year !== null ? [{ label: `Acumulado em ${p.year}`, value: formatPercent(Number(p.accumulated_year)) }] : []),
        ],
    })), [slice, kind]);
    const summary = useMemo(() => summarizeSeries(points.map((p) => ({ date: p.date, value: p.value })), kind), [points, kind]);

    const current = SERIES.find((s) => s.value === series)!;
    const bucket = BEDROOMS.find((b) => b.value === bedrooms) ?? BEDROOMS[0];

    const changeBedrooms = (next: string) => guard(() => {
        const params = new URLSearchParams();
        if (series !== "locacao") params.set("type", series);
        if (next !== "todos") params.set("bedrooms", next);
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });

    return (
        <div className="grid gap-6">
            <div id="chart" className={cn(CARD, "min-w-0")}>
                <div className="flex flex-col gap-3 p-3 md:flex-row md:items-start md:justify-between md:p-6">
                    <div className="space-y-1.5">
                        <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">FipeZAP {current.label} – {bucket.label}</h3>
                        <p className="text-xs md:text-sm text-muted-foreground">Evolução histórica: {current.hint} · índice nacional</p>
                        <p className="text-xs text-muted-foreground">{rows.length > 0 ? `${formatRangeLabel(range)} · ${slice.length} ${slice.length === 1 ? "mês" : "meses"}` : "Sem dados"}</p>
                    </div>
                    {rows.length > 0 && (
                        <PeriodSelector
                            presets={MONTHLY_PRESETS}
                            value={period}
                            onSelect={(key) => guard(() => select(key))}
                            custom={custom}
                            onCustomChange={setCustom}
                            redundant={redundant}
                            bounds={{ start: earliest, end: latest }}
                        />
                    )}
                </div>
                <div className="space-y-4 p-3 pt-0 md:p-6 md:pt-0">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Série do FipeZAP">
                            {SERIES.map((s) => (
                                <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => guard(() => setSeries(s.value))}
                                    aria-pressed={series === s.value}
                                    className={cn("rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", series === s.value ? "border border-border bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Dormitórios:</span>
                            <Select value={bedrooms} onValueChange={changeBedrooms}>
                                <SelectTrigger className="h-8 w-[11.5rem] text-xs font-semibold" aria-label="Dormitórios da série do FipeZAP">
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                    {BEDROOMS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </label>
                    </div>
                    <PeriodStats summary={summary} format={formatPercent} kind={kind} averageLabel={kind === "level" ? "Yield médio" : "Média mensal"} />
                    <IndexTrendChart points={points} name={`FipeZAP ${current.label}`} />
                </div>
            </div>

            <div id="heatmap" className="min-w-0">
                <FipeZapHeatmap data={slice} />
            </div>

            <div id="table" className="min-w-0">
                <FipeZapTable data={slice} />
            </div>

            {modal}
        </div>
    );
}
