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

export interface PanoramaSeriesSpec {
    /** the key the Panorama page maps its data to */
    key: string;
    label: string;
    color: string;
}

/**
 * The lines the Panorama chart can draw, in legend order: neighbours in this order were checked
 * for colour-vision separation, and the line ends carry the index name so identity never rests
 * on colour alone. The salário mínimo is not here: it is an amount in R$, not a monthly rate.
 */
export const PANORAMA_SERIES: PanoramaSeriesSpec[] = [
    { key: "CDI", label: "CDI", color: COMPARE_COLORS.CDI },
    { key: "IPCA", label: "IPCA", color: COMPARE_COLORS.IPCA },
    { key: "SELIC", label: "Selic", color: COMPARE_COLORS.SELIC },
    { key: "IGPM", label: "IGP-M", color: COMPARE_COLORS.IGPM },
    { key: "INPC", label: "INPC", color: "hsl(var(--index-chart-inpc))" },
    { key: "IVAR", label: "IVAR", color: "hsl(var(--index-chart-ivar))" },
    { key: "FIPEZAPLOCACAO", label: "FipeZAP Locação", color: "hsl(var(--index-chart-fipezap-locacao))" },
    { key: "FIPEZAPVENDA", label: "FipeZAP Venda", color: "hsl(var(--index-chart-fipezap-venda))" },
    { key: "FIPEZAPYIELD", label: "FipeZAP Yield", color: "hsl(var(--index-chart-fipezap-yield))" },
];

/** drawn when the Panorama opens; the others wait for their checkbox, so the chart starts readable */
export const PANORAMA_DEFAULT_ON: string[] = ["CDI", "IPCA", "IGPM", "FIPEZAPLOCACAO"];

/** the key of the salário mínimo amounts in the Panorama data (a level in R$, used by the calculator only) */
export const PANORAMA_MIN_WAGE_KEY = "REAJUSTESALARIOMINIMO";

/** "IGP-M" → "IGPM", "FIPEZAP Locação" → "FIPEZAPLOCACAO": the Panorama's series key for an index code. */
export function panoramaKey(code: string): string {
    return code.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

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
