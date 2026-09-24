/**
 * Sentences for the FipeZap city dashboard: the "destaques do mês" bullets and the one-line insight
 * that titles each card. Pure: takes the snapshot figures and the dictionary templates, returns text.
 * Templates use {placeholders} (see dictionaries/*.json → fipezapCitiesPage.insights).
 */
import type { CitySnapshot } from "@/lib/fipezap-cities-server";
import { fill, fmtBRL, fmtPct, monthLong, rankBy, rankPosition } from "@/lib/fipezap-compare";
import type { FipezapTipo } from "@/lib/fipezap-cities-params";

export type InsightTemplates = Record<string, string>;

export interface Benchmark { varMensal: number | null; ytd: number | null; acc12m: number | null }

export interface InsightInput {
    lang: string;
    tipo: FipezapTipo;
    latest: string;
    national: CitySnapshot | null;
    /** the selected city, when one is selected */
    city: CitySnapshot | null;
    cities: CitySnapshot[];
    ipca: Benchmark | null;
    igpm: Benchmark | null;
    /** CDI accumulated over 12 months, % */
    cdi12m: number | null;
}

/** "acima do" / "abaixo do" / "em linha com o", from the templates. */
export function compareWord(a: number | null, b: number | null, t: InsightTemplates, tolerance = 0.05): string {
    if (a === null || b === null) return t.vsUnknown ?? "";
    if (a - b > tolerance) return t.vsAbove;
    if (b - a > tolerance) return t.vsBelow;
    return t.vsInline;
}

const tipoName = (tipo: FipezapTipo, t: InsightTemplates) => (tipo === "venda" ? t.tipoVenda : tipo === "locacao" ? t.tipoLocacao : t.tipoYield);

/**
 * How a place is written into a sentence: "no Brasil" / "em São Paulo" (pt), "in Brazil" (en),
 * "en Brasil" (es); `Place` capitalised for sentence starts; `subject` for "o Brasil acumula…".
 */
export function placeWords(lang: string, name: string, isNational: boolean): { place: string; Place: string; subject: string } {
    const nat = lang === "en" ? "Brazil" : "Brasil";
    const prep = lang === "pt" ? (isNational ? "no" : "em") : lang === "es" ? "en" : "in";
    const place = `${prep} ${isNational ? nat : name}`;
    return { place, Place: place.charAt(0).toUpperCase() + place.slice(1), subject: isNational ? (lang === "pt" ? "o Brasil" : nat) : name };
}

/** The metric each ranking reads for a tipo: monthly variation for prices, annual yield for rentabilidade. */
export const monthlyMetric = (s: CitySnapshot, tipo: FipezapTipo) => (tipo === "yield" ? s.yieldAnual : s.varMensal);
export const twelveMonthMetric = (s: CitySnapshot, tipo: FipezapTipo) => (tipo === "yield" ? s.yield12m : s.var12m);

/** The "Destaques do mês" bullets, in the order FIPE uses: national, breadth, extremes, prices, yield, selected city. */
export function buildHighlights(input: InsightInput, t: InsightTemplates): string[] {
    const { lang, tipo, latest, national, city, cities, ipca, igpm } = input;
    const out: string[] = [];
    const mes = monthLong(latest, lang);
    const tipoTxt = tipoName(tipo, t);
    const pct = (v: number | null | undefined, digits = 2) => fmtPct(v, { lang, digits });
    /** yields and interest rates are levels, not changes: no plus sign */
    const rate = (v: number | null | undefined) => fmtPct(v, { lang, digits: 2, sign: false });
    const brl = (v: number | null | undefined) => fmtBRL(v, { lang });

    if (national && tipo !== "yield") {
        out.push(fill(t.nationalMonth, { tipo: tipoTxt, var: pct(national.varMensal), mes, vs: compareWord(national.varMensal, ipca?.varMensal ?? null, t), ipca: pct(ipca?.varMensal) }));
        out.push(fill(t.nationalYear, { ytd: pct(national.ytd), var12: pct(national.var12m), ipca12: pct(ipca?.acc12m), igpm12: pct(igpm?.acc12m) }));
    }
    const withMonth = cities.filter(c => monthlyMetric(c, tipo) !== null);
    if (withMonth.length && tipo !== "yield") {
        const up = withMonth.filter(c => (c.varMensal ?? 0) > 0).length;
        out.push(fill(t.breadth, { up, n: withMonth.length, mes, down: withMonth.length - up }));
        const ranked = rankBy(withMonth, c => c.varMensal);
        const top = ranked[0], bottom = ranked[ranked.length - 1];
        if (top && bottom && top !== bottom) out.push(fill(t.topBottom, { top: top.city.name, topVar: pct(top.varMensal), bottom: bottom.city.name, bottomVar: pct(bottom.varMensal) }));
    }
    const priced = cities.filter(c => c.precoM2 !== null);
    if (priced.length && tipo !== "yield") {
        const ranked = rankBy(priced, c => c.precoM2);
        out.push(fill(t.price, { tipo: tipoTxt, preco: brl(national?.precoM2), maxCity: ranked[0].city.name, maxPreco: brl(ranked[0].precoM2), minCity: ranked[ranked.length - 1].city.name, minPreco: brl(ranked[ranked.length - 1].precoM2) }));
    }
    const yielding = cities.filter(c => c.yieldAnual !== null);
    if (yielding.length && tipo !== "venda") {
        const ranked = rankBy(yielding, c => c.yieldAnual);
        out.push(fill(t.yieldNational, { yield: rate(national?.yieldAnual), topCity: ranked[0].city.name, topYield: rate(ranked[0].yieldAnual), cdi: rate(input.cdi12m) }));
    }
    if (city) {
        out.push(tipo === "yield"
            ? fill(t.cityFocusYield, { cidade: city.city.name, yield: rate(city.yieldAnual), yield12: rate(city.yield12m), precoVenda: brl(city.precoM2) })
            : fill(t.cityFocus, { cidade: city.city.name, var: pct(city.varMensal), mes, ytd: pct(city.ytd), var12: pct(city.var12m), preco: brl(city.precoM2) }));
        const ranked = rankBy(priced, c => c.precoM2);
        const pos = rankPosition(ranked.map(c => ({ slug: c.city.slug })), city.city.slug);
        if (pos && tipo !== "yield") out.push(fill(t.cityRank, { cidade: city.city.name, n: pos, total: ranked.length }));
    }
    return out;
}

export interface CardTitles {
    results: string; price: string; bedrooms: string | null; history: string; yearly: string; capitals: string; yield: string;
}

/** One insight sentence per card. `bedroomsBest` is the bucket with the highest 12-month variation, if the city publishes buckets. */
export function buildCardTitles(input: InsightInput, t: InsightTemplates, extra: { bedroomsBest: { label: string; var12m: number } | null; yearsAboveIpca: { above: number; total: number; currentYear: number; currentYtd: number | null } | null; capitalsAboveNational: { k: number; total: number } | null }): CardTitles {
    const { lang, tipo, latest, national, city, cities, ipca } = input;
    const focus = city ?? national;
    const mes = monthLong(latest, lang);
    const tipoTxt = tipoName(tipo, t);
    const pct = (v: number | null | undefined, digits = 2) => fmtPct(v, { lang, digits });
    const rate = (v: number | null | undefined) => fmtPct(v, { lang, digits: 2, sign: false });
    const brl = (v: number | null | undefined) => fmtBRL(v, { lang });
    const withMonth = cities.filter(c => monthlyMetric(c, tipo) !== null);
    const up = withMonth.filter(c => (c.varMensal ?? 0) > 0).length;
    const priced = rankBy(cities.filter(c => c.precoM2 !== null), c => c.precoM2);
    const pos = city ? rankPosition(priced.map(c => ({ slug: c.city.slug })), city.city.slug) : null;
    const yieldRanked = rankBy(cities.filter(c => c.yieldAnual !== null), c => c.yieldAnual);
    const words = placeWords(lang, focus?.city.name ?? "", !city);
    return {
        results: tipo === "yield"
            ? fill(t.resultsTitleYield, { mes, top: yieldRanked[0]?.city.name ?? "–", topYield: rate(yieldRanked[0]?.yieldAnual), n: yieldRanked.length })
            : fill(t.resultsTitle, { mes, up, n: withMonth.length, tipo: tipoTxt }),
        price: city && pos
            ? fill(t.priceTitleCity, { cidade: city.city.name, n: pos, total: priced.length, preco: brl(city.precoM2), nat: brl(national?.precoM2), tipo: tipoTxt })
            : fill(t.priceTitle, { tipo: tipoTxt, preco: brl(national?.precoM2), maxCity: priced[0]?.city.name ?? "–", maxPreco: brl(priced[0]?.precoM2) }),
        bedrooms: extra.bedroomsBest ? fill(t.bedroomsTitle, { dorm: extra.bedroomsBest.label, var: pct(extra.bedroomsBest.var12m), ...words }) : null,
        history: tipo === "yield"
            ? fill(t.historyTitleYield, { ...words, yield: rate(focus?.yieldAnual), vs: compareWord(focus?.yieldAnual ?? null, input.cdi12m, t), cdi: rate(input.cdi12m) })
            : fill(t.historyTitle, { ...words, var12: pct(focus?.var12m), vs: compareWord(focus?.var12m ?? null, ipca?.acc12m ?? null, t), ipca12: pct(ipca?.acc12m) }),
        yearly: extra.yearsAboveIpca
            ? fill(t.yearlyTitle, { year: extra.yearsAboveIpca.currentYear, ytd: pct(extra.yearsAboveIpca.currentYtd), above: extra.yearsAboveIpca.above, n: extra.yearsAboveIpca.total, ...words })
            : t.sectionYearly,
        capitals: extra.capitalsAboveNational
            ? fill(t.capitalsTitle, { k: extra.capitalsAboveNational.k, total: extra.capitalsAboveNational.total, tipo: tipoTxt })
            : t.sectionCapitals,
        yield: fill(t.yieldTitle, { ...words, yield: rate(focus?.yieldAnual), vs: compareWord(focus?.yieldAnual ?? null, input.cdi12m, t), cdi: rate(input.cdi12m) }),
    };
}
