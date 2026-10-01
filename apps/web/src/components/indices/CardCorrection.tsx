"use client";

/**
 * The answer of one Panorama card to the calculator above it: the amount corrected by this card's
 * index between the two dates. Monthly rates compound (lib/index-correction.ts); the salário mínimo
 * scales by the ratio of the wages in force at the two dates; the FipeZAP yield is a level, not a
 * correction index, so its card shows nothing.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { correctByIndex, monthOf } from "@/lib/index-correction";
import { formatBRL, useCorrection } from "./PanoramaCalculator";

interface Props {
    /** the card's key in the Panorama data (lib/index-compare.ts panoramaKey) */
    seriesKey: string;
    kind: "variation" | "level" | "none";
}

export function CardCorrection({ seriesKey, kind }: Props) {
    const ctx = useCorrection();
    const levels = ctx?.data.levels[seriesKey];
    const sortedLevels = useMemo(() => (levels ? [...levels].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0)) : []), [levels]);

    if (!ctx || kind === "none" || ctx.value <= 0) return null;

    let corrected: number | null = null;
    let percent = 0;
    let note = "";

    if (kind === "variation") {
        const rates = ctx.data.rates[seriesKey];
        if (!rates || rates.length === 0) return null;
        const res = correctByIndex(ctx.value, ctx.start, ctx.end, rates);
        if ("error" in res) note = res.error;
        else {
            corrected = res.correctedValue;
            percent = res.accumulatedPercent;
        }
    } else {
        if (sortedLevels.length === 0) return null;
        // the wage in force at a date: the last adjustment up to that month
        const at = (date: string) => {
            const m = monthOf(date);
            let last: number | null = null;
            for (const l of sortedLevels) {
                if (l.month <= m) last = l.value;
                else break;
            }
            return last;
        };
        const a = at(ctx.start);
        const b = at(ctx.end);
        if (a === null || b === null || a === 0) note = "Sem salário mínimo vigente nas datas escolhidas.";
        else {
            corrected = ctx.value * (b / a);
            percent = (b / a - 1) * 100;
        }
    }

    return (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs">
            {corrected === null ? (
                <span className="text-muted-foreground">{note}</span>
            ) : (
                <>
                    <span className="text-muted-foreground">R$ {formatBRL(ctx.value)} corrigido: </span>
                    <strong className="text-sm tabular-nums text-foreground">R$ {formatBRL(corrected)}</strong>
                    <span className={cn("ml-1.5 tabular-nums", percent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {percent >= 0 ? "+" : ""}{percent.toFixed(2).replace(".", ",")}%
                    </span>
                </>
            )}
        </div>
    );
}
