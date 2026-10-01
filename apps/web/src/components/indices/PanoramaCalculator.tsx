"use client";

/**
 * The Panorama's "quanto vale hoje?" calculator: one amount and two dates at the top of the page;
 * "Calcular" applies them and every index card below answers with the amount corrected by its own
 * series (CardCorrection reads the same context). The maths is the one of each index page
 * (lib/index-correction.ts): calendar days, partial months pro rata die; the salário mínimo, a
 * level in R$, scales the amount by the ratio of the wages in force at the two dates.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Calculator, CalendarRange, DollarSign, Info, RotateCcw } from "lucide-react";
import { DateInput } from "@/components/ui/DateInput";
import { cn } from "@/lib/utils";
import { PANORAMA_MIN_WAGE_KEY, PANORAMA_SERIES } from "@/lib/index-compare";
import { addMonths, correctByIndex, firstDayOfMonth, formatDateBR, lastDayOfMonth, monthOf, type IndexMonthValue } from "@/lib/index-correction";
import { formatMonthYear } from "@/lib/index-period";

export interface PanoramaData {
    /** monthly rates in %, by Panorama key (lib/index-compare.ts) */
    rates: Record<string, IndexMonthValue[]>;
    /** levels in R$ (the salário mínimo), by key */
    levels: Record<string, IndexMonthValue[]>;
}

export interface Correction {
    /** the amount typed, in R$ */
    value: number;
    /** ISO dates */
    start: string;
    end: string;
    data: PanoramaData;
}

const CorrectionContext = createContext<Correction | null>(null);

/** The amount and dates applied with "Calcular"; null before the first calculation (and outside the provider). */
export const useCorrection = () => useContext(CorrectionContext);

export const formatBRL = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseBRLInput = (raw: string) => parseFloat(raw.replace(/[^\d,]/g, "").replace(",", ".")) || 0;

export type CorrectionKind = "variation" | "level" | "none";
export type CorrectionResult =
    /** `through`: the index stops before the end date, so the correction runs up to that month */
    | { corrected: number; percent: number; through?: string }
    | { note: string };

/**
 * The amount of `ctx` corrected by one index: monthly rates compound (lib/index-correction.ts), a
 * level (the salário mínimo) scales by the ratio of the values in force at the two dates. An index
 * whose last published month is before the end date is applied up to that month (`through` says so).
 * Null when the index has no data or is not a correction index (the FipeZAP yield).
 */
export function computeCorrection(ctx: Correction, seriesKey: string, kind: CorrectionKind): CorrectionResult | null {
    if (kind === "none" || ctx.value <= 0) return null;
    if (kind === "variation") {
        const rates = ctx.data.rates[seriesKey];
        if (!rates || rates.length === 0) return null;
        const latestMonth = rates.reduce((m, v) => (v.month > m ? v.month : m), "");
        const seriesEnd = lastDayOfMonth(latestMonth);
        const end = ctx.end > seriesEnd ? seriesEnd : ctx.end;
        const res = correctByIndex(ctx.value, ctx.start, end, rates);
        if ("error" in res) return { note: res.error };
        return { corrected: res.correctedValue, percent: res.accumulatedPercent, through: end !== ctx.end ? formatMonthYear(latestMonth) : undefined };
    }
    const levels = ctx.data.levels[seriesKey];
    if (!levels || levels.length === 0) return null;
    const sorted = [...levels].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
    // the value in force at a date: the last adjustment up to that month
    const at = (date: string) => {
        const m = monthOf(date);
        let last: number | null = null;
        for (const l of sorted) {
            if (l.month <= m) last = l.value;
            else break;
        }
        return last;
    };
    const a = at(ctx.start);
    const b = at(ctx.end);
    if (a === null || b === null || a === 0) return { note: "Sem salário mínimo vigente nas datas escolhidas." };
    return { corrected: ctx.value * (b / a), percent: (b / a - 1) * 100 };
}

/** "+3,35%" in green, "-0,20%" in red */
export function PercentBadge({ percent, className }: { percent: number; className?: string }) {
    return (
        <span className={cn("tabular-nums", percent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400", className)}>
            {percent >= 0 ? "+" : ""}{percent.toFixed(2).replace(".", ",")}%
        </span>
    );
}

/** Every index's answer, right under the calculator, so the reader need not scroll to the cards. */
function ResultsList({ applied }: { applied: Correction }) {
    const rows = [
        ...PANORAMA_SERIES.filter((s) => s.key !== "FIPEZAPYIELD").map((s) => ({ key: s.key, label: s.label, result: computeCorrection(applied, s.key, "variation") })),
        { key: PANORAMA_MIN_WAGE_KEY, label: "Salário Mínimo", result: computeCorrection(applied, PANORAMA_MIN_WAGE_KEY, "level") },
    ].filter((r) => r.result !== null);
    if (rows.length === 0) return null;
    return (
        <div className="rounded-lg border border-border bg-muted/20 p-3 md:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                R$ {formatBRL(applied.value)} de {formatDateBR(applied.start)} a {formatDateBR(applied.end)}, corrigido por cada índice
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {rows.map((r) => (
                    <div key={r.key} className="rounded-md border border-border/70 bg-card px-3 py-2">
                        <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
                        {r.result && "corrected" in r.result ? (
                            <>
                                <dd className="text-sm font-bold tabular-nums text-foreground">R$ {formatBRL(r.result.corrected)}</dd>
                                <dd className="text-[11px]">
                                    <PercentBadge percent={r.result.percent} />
                                    {r.result.through && <span className="text-muted-foreground"> · até {r.result.through}</span>}
                                </dd>
                            </>
                        ) : (
                            <dd className="text-[11px] text-muted-foreground">{r.result?.note}</dd>
                        )}
                    </div>
                ))}
            </dl>
        </div>
    );
}

const FIELD = "w-full h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500";
const DEFAULT_VALUE = "1.000,00";

export function PanoramaProvider({ data, children }: { data: PanoramaData; children: ReactNode }) {
    const { earliestMonth, latestMonth, commonMonth } = useMemo(() => {
        let lo = "";
        let hi = "";
        let common = ""; // the newest month every index on the page has published (they close their months on different days)
        for (const spec of PANORAMA_SERIES) {
            const list = data.rates[spec.key];
            if (!list || list.length === 0) continue;
            let seriesLast = "";
            for (const v of list) {
                if (!lo || v.month < lo) lo = v.month;
                if (!hi || v.month > hi) hi = v.month;
                if (v.month > seriesLast) seriesLast = v.month;
            }
            if (!common || seriesLast < common) common = seriesLast;
        }
        return { earliestMonth: lo, latestMonth: hi, commonMonth: common };
    }, [data]);
    const minDate = earliestMonth ? firstDayOfMonth(earliestMonth) : "";
    const maxDate = latestMonth ? lastDayOfMonth(latestMonth) : "";
    // defaults: the last twelve months every index has published, a month's last day to another's
    const defaultEnd = commonMonth ? lastDayOfMonth(commonMonth) : maxDate;
    const defaultStart = commonMonth ? lastDayOfMonth(addMonths(commonMonth, -12)) : "";

    const [rawValue, setRawValue] = useState(DEFAULT_VALUE);
    const [start, setStart] = useState(defaultStart);
    const [end, setEnd] = useState(defaultEnd);
    const [error, setError] = useState<string | null>(null);
    const [applied, setApplied] = useState<Correction | null>(null);

    const calculate = () => {
        const value = parseBRLInput(rawValue);
        if (value <= 0) {
            setError("Informe um valor maior que zero.");
            setApplied(null);
            return;
        }
        if (!start || !end) {
            setError("Informe as duas datas (dd/mm/aaaa).");
            setApplied(null);
            return;
        }
        if (end <= start) {
            setError("A data final deve ser posterior à data inicial.");
            setApplied(null);
            return;
        }
        setError(null);
        setRawValue(formatBRL(value));
        setApplied({ value, start, end, data });
    };

    const reset = () => {
        setRawValue(DEFAULT_VALUE);
        setStart(defaultStart);
        setEnd(defaultEnd);
        setError(null);
        setApplied(null);
    };

    return (
        <>
            <section className="mb-8 rounded-xl border bg-card text-card-foreground shadow-sm">
                <div className="flex items-center gap-3 border-b bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-cyan-500/5 p-4 dark:from-emerald-500/10 dark:via-teal-500/10 dark:to-cyan-500/10 md:p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
                        <Calculator className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg md:text-xl font-bold tracking-tight">Quanto vale hoje?</h2>
                        <p className="text-xs md:text-sm text-muted-foreground">Digite um valor e as datas, clique em Calcular: cada card abaixo mostra o valor corrigido pelo seu índice.</p>
                    </div>
                </div>
                <div className="space-y-3 p-4 md:p-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1.5">
                            <label htmlFor="panorama-valor" className="flex items-center gap-1 text-sm font-medium text-foreground">
                                <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Valor a ser corrigido
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">R$</span>
                                <input
                                    id="panorama-valor"
                                    type="text"
                                    inputMode="decimal"
                                    value={rawValue}
                                    onChange={(e) => { setRawValue(e.target.value.replace(/[^\d.,]/g, "")); setError(null); }}
                                    onBlur={() => { const n = parseBRLInput(rawValue); if (n > 0) setRawValue(formatBRL(n)); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") calculate(); }}
                                    placeholder="Ex.: 1.000,00"
                                    className={`${FIELD} pl-10 ${error && parseBRLInput(rawValue) <= 0 ? "border-red-500" : ""}`}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="panorama-inicio" className="flex items-center gap-1 text-sm font-medium text-foreground">
                                <CalendarRange className="h-3.5 w-3.5 text-emerald-600" /> Data inicial
                            </label>
                            <DateInput id="panorama-inicio" value={start} onChange={(iso) => { if (iso) { setStart(iso); setError(null); } }} variant="bare" className={FIELD} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="panorama-fim" className="flex items-center gap-1 text-sm font-medium text-foreground">
                                <CalendarRange className="h-3.5 w-3.5 text-emerald-600" /> Data final
                            </label>
                            <DateInput id="panorama-fim" value={end} onChange={(iso) => { if (iso) { setEnd(iso); setError(null); } }} variant="bare" className={FIELD} />
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                type="button"
                                onClick={calculate}
                                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg hover:shadow-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            >
                                <Calculator className="h-4 w-4" />
                                Calcular
                            </button>
                            <button
                                type="button"
                                onClick={reset}
                                title="Limpar"
                                aria-label="Limpar"
                                className="flex h-11 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                <RotateCcw className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    {error && (
                        <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                            <Info className="h-3 w-3 shrink-0" /> {error}
                        </p>
                    )}
                    <p className="flex items-start gap-1 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                            Datas de {minDate ? formatDateBR(minDate) : "—"} a {maxDate ? formatDateBR(maxDate) : "—"} (últimos 10 anos). Conta os dias corridos; meses parciais entram pro rata die, como na calculadora de cada índice. O salário mínimo corrige pela razão entre os valores vigentes nas duas datas.
                        </span>
                    </p>
                    {applied && <ResultsList applied={applied} />}
                </div>
            </section>
            <CorrectionContext.Provider value={applied}>{children}</CorrectionContext.Provider>
        </>
    );
}
