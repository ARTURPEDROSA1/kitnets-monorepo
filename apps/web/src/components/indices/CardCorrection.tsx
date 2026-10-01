"use client";

/**
 * The answer of one Panorama card to the calculator above it: the amount corrected by this card's
 * index between the two dates (panorama-correction.ts). An index shorter than the period says from
 * which month, or up to which, it was applied. The FipeZAP yield is a level, not a correction index,
 * so its card shows nothing.
 */
import { formatMonthYear } from "@/lib/index-period";
import { PercentBadge, computeCorrection, formatBRL, useCorrection, type CorrectionKind } from "./PanoramaCalculator";

interface Props {
    /** the card's key in the Panorama data (lib/index-compare.ts panoramaKey) */
    seriesKey: string;
    kind: CorrectionKind;
}

export function CardCorrection({ seriesKey, kind }: Props) {
    const ctx = useCorrection();
    if (!ctx) return null;
    const result = computeCorrection(ctx, seriesKey, kind);
    if (result === null) return null;

    return (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs">
            {"corrected" in result ? (
                <>
                    <span className="text-muted-foreground">R$ {formatBRL(ctx.value)} corrigido: </span>
                    <strong className="text-sm tabular-nums text-foreground">R$ {formatBRL(result.corrected)}</strong>
                    <PercentBadge percent={result.percent} className="ml-1.5" />
                    {result.fromMonth && <span className="text-muted-foreground"> · desde {formatMonthYear(`${result.fromMonth}-01`)}</span>}
                    {result.throughMonth && <span className="text-muted-foreground"> · até {formatMonthYear(`${result.throughMonth}-01`)}</span>}
                </>
            ) : (
                <span className="text-muted-foreground">{result.note}</span>
            )}
        </div>
    );
}
