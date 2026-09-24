/**
 * Colours of the FipeZap city dashboard. Restraint on purpose: the selected place is ink, Brazil is
 * a neutral grey, the other cities fade to the border colour, and inflation/interest overlays are
 * dashed. Compared cities take the theme's chart palette in order. Everything is a CSS variable so
 * dark mode follows the theme.
 */
export const INK = "hsl(var(--primary))";
export const NATIONAL = "hsl(var(--muted-foreground))";
export const MUTED = "hsl(var(--border))";
export const GRID = "hsl(var(--border))";
export const IPCA = "hsl(var(--chart-4))";
export const IGPM = "hsl(var(--chart-1))";
export const CDI = "hsl(var(--chart-2))";
export const COMPARE = ["hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-5))", "hsl(var(--chart-1))", "hsl(var(--chart-4))"];
export const POSITIVE = "hsl(160 60% 40%)";
export const NEGATIVE = "hsl(350 70% 55%)";

export const TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
export const TOOLTIP_STYLE = { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--card-foreground))", fontSize: 12 };

/** Colour of one place's series given the selected slug and the comparison list. */
export function seriesColor(slug: string, selected: string, compare: string[]): string {
    if (slug === selected) return INK;
    if (slug === "brasil") return NATIONAL;
    const i = compare.indexOf(slug);
    return i >= 0 ? COMPARE[i % COMPARE.length] : MUTED;
}
