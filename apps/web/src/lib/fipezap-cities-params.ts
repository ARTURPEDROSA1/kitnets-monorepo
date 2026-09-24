/**
 * URL state of the "FipeZAP por cidade" page (/indices/fipezap/cidades[/<cidade>]).
 *
 *   ?tipo=venda|locacao|yield     what the page reads (default venda)
 *   &dorm=total|1|2|3|4           bedroom bucket (default total; most cities publish only total)
 *   &comparar=slug,slug           up to MAX_COMPARE cities drawn next to the selected one
 *   &periodo=ytd|1y|…|all|custom  window of the history chart (default 5y; all = the 15 stored years)
 *   &de=YYYY-MM&ate=YYYY-MM       bounds when periodo=custom
 * The city itself comes from the path; unknown slugs fall back to the national index.
 */
import { FIPEZAP_NATIONAL_SLUG, fipezapCityBySlug } from "./fipezap-cities";
import type { FipezapDorm } from "./fipezap-import";

export type FipezapTipo = "venda" | "locacao" | "yield";
export type FipezapPeriodo = "ytd" | "1y" | "2y" | "3y" | "5y" | "10y" | "all" | "custom";

export interface FipezapCitiesState {
    cidade: string;
    tipo: FipezapTipo;
    dorm: FipezapDorm;
    comparar: string[];
    periodo: FipezapPeriodo;
    de: string | null;
    ate: string | null;
}

export const MAX_COMPARE = 5;
export const TIPOS: readonly FipezapTipo[] = ["venda", "locacao", "yield"];
export const DORMS: readonly FipezapDorm[] = ["total", "1", "2", "3", "4"];
export const PERIODOS: readonly FipezapPeriodo[] = ["ytd", "1y", "2y", "3y", "5y", "10y", "all", "custom"];
export const DEFAULT_STATE: FipezapCitiesState = { cidade: FIPEZAP_NATIONAL_SLUG, tipo: "venda", dorm: "total", comparar: [], periodo: "5y", de: null, ate: null };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function parseFipezapCitiesParams(sp: SearchParams, cidade?: string | null): FipezapCitiesState {
    const city = cidade && fipezapCityBySlug(cidade) ? cidade : FIPEZAP_NATIONAL_SLUG;
    const tipo = first(sp.tipo) as FipezapTipo;
    const dorm = first(sp.dorm) as FipezapDorm;
    const periodo = first(sp.periodo) as FipezapPeriodo;
    const comparar: string[] = [];
    for (const slug of first(sp.comparar).split(",").map(s => s.trim()).filter(Boolean)) {
        if (slug === city || comparar.includes(slug) || !fipezapCityBySlug(slug)) continue;
        if (comparar.length < MAX_COMPARE) comparar.push(slug);
    }
    const de = first(sp.de), ate = first(sp.ate);
    const custom = periodo === "custom" && isMonth(de) && isMonth(ate);
    return {
        cidade: city,
        tipo: TIPOS.includes(tipo) ? tipo : DEFAULT_STATE.tipo,
        dorm: DORMS.includes(dorm) ? dorm : DEFAULT_STATE.dorm,
        comparar,
        periodo: custom ? "custom" : PERIODOS.includes(periodo) && periodo !== "custom" ? periodo : DEFAULT_STATE.periodo,
        de: custom ? (de <= ate ? de : ate) : null,
        ate: custom ? (de <= ate ? ate : de) : null,
    };
}

/** Path + query for a state; defaults are left out so canonical URLs stay short. pt has no locale prefix. */
export function buildFipezapCitiesHref(lang: string, state: FipezapCitiesState, patch: Partial<FipezapCitiesState> = {}): string {
    const s = { ...state, ...patch };
    const base = `${lang === "pt" ? "" : `/${lang}`}/indices/fipezap/cidades`;
    const path = s.cidade && s.cidade !== FIPEZAP_NATIONAL_SLUG ? `${base}/${s.cidade}` : base;
    const q = new URLSearchParams();
    if (s.tipo !== DEFAULT_STATE.tipo) q.set("tipo", s.tipo);
    if (s.dorm !== DEFAULT_STATE.dorm) q.set("dorm", s.dorm);
    const comparar = s.comparar.filter(c => c !== s.cidade).slice(0, MAX_COMPARE);
    if (comparar.length) q.set("comparar", comparar.join(","));
    if (s.periodo === "custom" && s.de && s.ate) { q.set("periodo", "custom"); q.set("de", s.de); q.set("ate", s.ate); }
    else if (s.periodo !== DEFAULT_STATE.periodo && s.periodo !== "custom") q.set("periodo", s.periodo);
    const qs = q.toString();
    return qs ? `${path}?${qs}` : path;
}

/** First month (`YYYY-MM-01`) the history chart shows, given the newest month published; null = everything stored. */
export function periodStart(state: Pick<FipezapCitiesState, "periodo" | "de">, latestMonth: string): string | null {
    const [y, m] = latestMonth.split("-").map(Number);
    const back = (months: number) => { const d = new Date(Date.UTC(y, m - 1 - months, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; };
    switch (state.periodo) {
        case "ytd": return `${y}-01-01`;
        case "1y": return back(11);
        case "2y": return back(23);
        case "3y": return back(35);
        case "5y": return back(59);
        case "10y": return back(119);
        case "custom": return state.de ? `${state.de}-01` : null;
        default: return null;
    }
}
