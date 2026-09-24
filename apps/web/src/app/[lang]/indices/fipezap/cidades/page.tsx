import type { Metadata } from "next";
import { FipezapCitiesPage } from "@/components/indices/FipeZap/cities/FipezapCitiesPage";
import { parseFipezapCitiesParams } from "@/lib/fipezap-cities-params";
import { fipezapCitiesMetadata } from "./shared";

// route segment config must be a literal here (Next parses it statically)
export const revalidate = 3600;

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
    const { lang } = await params;
    return fipezapCitiesMetadata(lang, parseFipezapCitiesParams(await searchParams));
}

/** /indices/fipezap/cidades — the national index selected, every city in the tables and rankings. */
export default async function Page({ params, searchParams }: Props) {
    const { lang } = await params;
    return <FipezapCitiesPage lang={lang} state={parseFipezapCitiesParams(await searchParams)} />;
}
