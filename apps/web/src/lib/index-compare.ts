/**
 * "Comparar com" on the index charts: which indexes each page can overlay on its own series, and
 * the colour of each line.
 *
 * CDI compares with Selic and IPCA, Selic with CDI and IPCA, every other index with CDI and IPCA;
 * IPCA itself cannot compare with IPCA, so it gets CDI and IGP-M. The salário mínimo page has no
 * comparison: it charts a yearly amount in R$, not a monthly rate. The colours are CSS variables
 * from globals.css — a lighter step on the light surface, a darker one on the dark surface, both
 * checked for colour-vision deficiency with the dataviz palette script.
 */
import type { SeriesPoint } from "./index-period";

export interface ComparisonSeries {
    /** the index code as the database and the URLs know it ("CDI", "IGPM") */
    code: string;
    /** how the chart names it ("IGP-M") */
    label: string;
    /** the line colour */
    color: string;
    /** the whole monthly series, any order */
    points: SeriesPoint[];
}

export const MAIN_SERIES_COLOR = "hsl(var(--index-chart-main))";

export const COMPARE_LABELS: Record<string, string> = {
    CDI: "CDI",
    SELIC: "Selic",
    IPCA: "IPCA",
    IGPM: "IGP-M",
};

export const COMPARE_COLORS: Record<string, string> = {
    CDI: "hsl(var(--index-chart-cdi))",
    SELIC: "hsl(var(--index-chart-selic))",
    IPCA: "hsl(var(--index-chart-ipca))",
    IGPM: "hsl(var(--index-chart-igpm))",
};

/** The two indexes the page of `code` can overlay, in button order. */
export function compareCodesFor(code: string): string[] {
    switch (code.toUpperCase()) {
        case "CDI":
            return ["SELIC", "IPCA"];
        case "SELIC":
            return ["CDI", "IPCA"];
        case "IPCA":
            return ["CDI", "IGPM"];
        case "REAJUSTE-SALARIO-MINIMO":
            return [];
        default:
            return ["CDI", "IPCA"];
    }
}
