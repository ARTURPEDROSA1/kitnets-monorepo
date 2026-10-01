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
import { addMonths, firstDayOfMonth, formatDateBR, lastDayOfMonth, type IndexMonthValue } from "@/lib/index-correction";

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

const FIELD = "w-full h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500";
const DEFAULT_VALUE = "1.000,00";

export function PanoramaProvider({ data, children }: { data: PanoramaData; children: ReactNode }) {
    const { earliestMonth, latestMonth } = useMemo(() => {
        let lo = "";
        let hi = "";
        for (const list of Object.values(data.rates)) {
            for (const v of list) {
                if (!lo || v.month < lo) lo = v.month;
                if (!hi || v.month > hi) hi = v.month;
            }
        }
        return { earliestMonth: lo, latestMonth: hi };
    }, [data]);
    const minDate = earliestMonth ? firstDayOfMonth(earliestMonth) : "";
    const maxDate = latestMonth ? lastDayOfMonth(latestMonth) : "";
    // the last twelve published months: a month's last day to the latest month's last day
    const defaultStart = latestMonth ? lastDayOfMonth(addMonths(latestMonth, -12)) : "";

    const [rawValue, setRawValue] = useState(DEFAULT_VALUE);
    const [start, setStart] = useState(defaultStart);
    const [end, setEnd] = useState(maxDate);
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
        setEnd(maxDate);
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
                            {applied && <> Resultado de <strong className="text-foreground">R$ {formatBRL(applied.value)}</strong> entre {formatDateBR(applied.start)} e {formatDateBR(applied.end)} nos cards abaixo.</>}
                        </span>
                    </p>
                </div>
            </section>
            <CorrectionContext.Provider value={applied}>{children}</CorrectionContext.Provider>
        </>
    );
}
