import { deltaClass, fmtPct } from "@/lib/fipezap-compare";
import { cn } from "@/lib/utils";

/** A signed percentage with ▲/▼ and colour by sign only (never by magnitude). */
export function Delta({ value, digits = 2, lang = "pt", sign = true, className, arrow = true }: { value: number | null | undefined; digits?: number; lang?: string; sign?: boolean; className?: string; arrow?: boolean }) {
    const none = value === null || value === undefined || !Number.isFinite(value);
    const glyph = none || Math.abs(value) < 0.005 ? "" : value > 0 ? "▲" : "▼";
    return (
        <span className={cn("tabular-nums whitespace-nowrap", deltaClass(none ? null : value), className)}>
            {arrow && glyph && <span aria-hidden="true" className="mr-0.5 text-[0.7em] align-middle">{glyph}</span>}
            {fmtPct(none ? null : value, { digits, sign, lang })}
        </span>
    );
}
