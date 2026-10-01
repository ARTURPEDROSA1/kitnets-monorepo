"use client";

/**
 * The answer of one Panorama card to the calculator above it: the amount corrected by this card's
 * index between the two dates (computeCorrection in PanoramaCalculator.tsx). The FipeZAP yield is a
 * level, not a correction index, so its card shows nothing.
 */
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
                    {result.through && <span className="text-muted-foreground"> · até {result.through}</span>}
                </>
            ) : (
                <span className="text-muted-foreground">{result.note}</span>
            )}
        </div>
    );
}
