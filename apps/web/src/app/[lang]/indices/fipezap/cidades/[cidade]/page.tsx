import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FipezapCitiesPage } from "@/components/indices/FipeZap/cities/FipezapCitiesPage";
import { parseFipezapCitiesParams } from "@/lib/fipezap-cities-params";
import { FIPEZAP_CITY_LIST, fipezapCityBySlug } from "@/lib/fipezap-cities";
import { fipezapCitiesMetadata } from "../shared";

export { revalidate } from "../shared";

type Props = { params: Promise<{ lang: string; cidade: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export function generateStaticParams() {
    return FIPEZAP_CITY_LIST.map(c => ({ cidade: c.slug }));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
    const { lang, cidade } = await params;
    if (!fipezapCityBySlug(cidade)) return { title: "FipeZAP" };
    return fipezapCitiesMetadata(lang, parseFipezapCitiesParams(await searchParams, cidade));
}

/** /indices/fipezap/cidades/<cidade> — one of the 36 cities selected. */
export default async function Page({ params, searchParams }: Props) {
    const { lang, cidade } = await params;
    if (!fipezapCityBySlug(cidade) || cidade === "brasil") notFound();
    return <FipezapCitiesPage lang={lang} state={parseFipezapCitiesParams(await searchParams, cidade)} />;
}
