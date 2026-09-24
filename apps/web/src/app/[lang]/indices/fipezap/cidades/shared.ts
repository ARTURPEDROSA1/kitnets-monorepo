import type { Metadata } from "next";
import { getDictionary } from "@/dictionaries";
import { buildFipezapCitiesHref, type FipezapCitiesState } from "@/lib/fipezap-cities-params";
import { fipezapCityBySlug } from "@/lib/fipezap-cities";

export const revalidate = 3600;

/** SEO metadata of the city dashboard: title and canonical depend on the city and the series only. */
export function fipezapCitiesMetadata(lang: string, state: FipezapCitiesState): Metadata {
    const t = getDictionary(lang).fipezapCitiesPage;
    const city = state.cidade !== "brasil" ? fipezapCityBySlug(state.cidade) : undefined;
    const tipo = state.tipo === "venda" ? t.controls.venda : state.tipo === "locacao" ? t.controls.locacao : t.controls.yield;
    const title = city ? `FipeZAP ${city.name} (${city.uf}): ${tipo} — ${t.h1}` : t.title;
    const canonicalState: FipezapCitiesState = { ...state, comparar: [], periodo: "5y", de: null, ate: null, dorm: "total" };
    const path = (l: string) => buildFipezapCitiesHref(l, canonicalState).replace(/^\/(en|es)/, "");
    return {
        title,
        description: city ? `${city.name}: ${t.description}` : t.description,
        keywords: ["FipeZAP", "preço m²", "índice FipeZAP por cidade", ...(city ? [city.name, `imóveis ${city.name}`, `aluguel ${city.name}`] : ["capitais", "cidades"])],
        alternates: { canonical: `/${lang}${path(lang)}`, languages: { pt: `/pt${path("pt")}`, en: `/en${path("en")}`, es: `/es${path("es")}` } },
        robots: { index: true, follow: true },
        openGraph: { title, description: t.description, type: "article", siteName: "Kitnets", locale: lang },
    };
}
