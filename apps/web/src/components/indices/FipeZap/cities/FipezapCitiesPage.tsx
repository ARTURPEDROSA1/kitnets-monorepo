import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDictionary } from "@/dictionaries";
import { FipezapCitiesControls } from "./FipezapCitiesControls";
import { FipezapHighlights } from "./FipezapHighlights";
import { FipezapKpiStrip } from "./FipezapKpiStrip";
import { FipezapResultsTable } from "./FipezapResultsTable";
import { FipezapYearlyTable } from "./FipezapYearlyTable";
import { FipezapCityProfile } from "./FipezapCityProfile";
import { ReportCard } from "./ReportCard";
import { BedroomBarsLazy, HistoryChartLazy, RankingBarsLazy } from "./ChartsLazy";
import { seriesColor } from "./palette";
import { getBenchmarkSeries, getFipezapBuckets, getFipezapHistory, getFipezapSnapshot, getFipezapYearly, type BenchmarkPoint, type CitySnapshot } from "@/lib/fipezap-cities-server";
import { buildCardTitles, buildHighlights, twelveMonthMetric, type Benchmark } from "@/lib/fipezap-insights";
import { fill, monthLong, monthShort, yearOf } from "@/lib/fipezap-compare";
import { buildFipezapCitiesHref, periodStart, type FipezapCitiesState } from "@/lib/fipezap-cities-params";
import { FIPEZAP_CITIES, FIPEZAP_NATIONAL_SLUG, fipezapCityBySlug } from "@/lib/fipezap-cities";
import type { FipezapDorm } from "@/lib/fipezap-import";

const BENCH_FROM = "2011-01-01";

const benchmarkAt = (series: BenchmarkPoint[], month: string): Benchmark | null => {
    const p = series.filter(x => x.month <= month).at(-1);
    return p ? { varMensal: p.varMensal, ytd: p.ytd, acc12m: p.acc12m } : null;
};

/**
 * The whole "FipeZAP por cidade" report, server-rendered from the cached reads. Sections follow FIPE's
 * monthly deck: destaques, resumo, últimos resultados, preço por cidade, dormitórios, evolução,
 * variação anual, capitais, rentabilidade, resumo da cidade.
 */
export async function FipezapCitiesPage({ lang, state }: { lang: string; state: FipezapCitiesState }) {
    const t = getDictionary(lang).fipezapCitiesPage;
    const isYield = state.tipo === "yield";
    const indexType = state.tipo === "venda" ? "venda" : "locacao";
    const slugs = [...new Set([FIPEZAP_NATIONAL_SLUG, state.cidade, ...state.comparar])];

    const [snapshot, history, yearly, bucketsNat, bucketsCity, ipcaS, igpmS, cdiS] = await Promise.all([
        getFipezapSnapshot(indexType, state.dorm),
        getFipezapHistory(slugs, indexType, state.dorm),
        getFipezapYearly(indexType, state.dorm),
        getFipezapBuckets(FIPEZAP_NATIONAL_SLUG, indexType),
        state.cidade !== FIPEZAP_NATIONAL_SLUG ? getFipezapBuckets(state.cidade, indexType) : Promise.resolve(null),
        getBenchmarkSeries("IPCA", BENCH_FROM),
        getBenchmarkSeries("IGPM", BENCH_FROM),
        getBenchmarkSeries("CDI", BENCH_FROM),
    ]);

    const header = (
        <div className="space-y-3 mb-5">
            <Link href={`${lang === "pt" ? "" : `/${lang}`}/indices/fipezap`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors"><ArrowLeft className="mr-1 h-3 w-3" />{t.back}</Link>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight">{t.h1}</h1>
            <p className="max-w-3xl text-muted-foreground">{t.subtitle}</p>
        </div>
    );

    if (!snapshot.latest || !snapshot.national) {
        return <div className="container mx-auto py-4 md:py-10 px-4 max-w-6xl">{header}<div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">{t.labels.noData}</div></div>;
    }

    const latest = snapshot.latest;
    const national = snapshot.national;
    const city = state.cidade === FIPEZAP_NATIONAL_SLUG ? null : snapshot.cities.find(c => c.city.slug === state.cidade) ?? null;
    const focus: CitySnapshot = city ?? national;
    const ipca = benchmarkAt(ipcaS, latest), igpm = benchmarkAt(igpmS, latest);
    const cdi12m = benchmarkAt(cdiS, latest)?.acc12m ?? null;
    const tipoLabel = isYield ? t.insights.tipoYield : state.tipo === "venda" ? t.insights.tipoVenda : t.insights.tipoLocacao;
    const sourceLine = `${t.source} · ${monthShort(latest, lang)}`;
    const input = { lang, tipo: state.tipo, latest, national, city, cities: snapshot.cities, ipca, igpm, cdi12m };

    // bedrooms: the selected city's buckets when it publishes them, else Brazil's
    const buckets = bucketsCity && bucketsCity.length > 1 ? bucketsCity : bucketsNat;
    const bucketsPlace = bucketsCity && bucketsCity.length > 1 ? focus.city.name : t.labels.national;
    const dormLabel = (d: FipezapDorm) => (d === "total" ? t.controls.dormTotal : t.controls[`dorm${d}` as "dorm1"]);
    const best = buckets.filter(b => b.dorm !== "total" && b.var12m !== null).sort((a, b) => (b.var12m ?? 0) - (a.var12m ?? 0))[0];
    const availableDorms = (bucketsCity && bucketsCity.length ? bucketsCity : bucketsNat).map(b => b.dorm);

    // yearly table: inflation per year from the benchmark series' December accumulations
    const decValue = (s: BenchmarkPoint[], y: number) => s.find(p => p.month === `${y}-12-01`)?.acc12m ?? null;
    const inflation = {
        ipca: Object.fromEntries(yearly.years.map(y => [y, decValue(ipcaS, y)])) as Record<number, number | null>,
        igpm: Object.fromEntries(yearly.years.map(y => [y, decValue(igpmS, y)])) as Record<number, number | null>,
        ipcaLatest: ipca?.acc12m ?? null, igpmLatest: igpm?.acc12m ?? null,
    };
    const yearlyNational = yearly.rows.find(r => r.city.slug === FIPEZAP_NATIONAL_SLUG) ?? null;
    const yearlyFocus = yearly.rows.find(r => r.city.slug === focus.city.slug) ?? null;
    const yearsAbove = yearlyFocus ? yearly.years.filter(y => yearlyFocus.byYear[y] !== null && inflation.ipca[y] !== null && (yearlyFocus.byYear[y] as number) > (inflation.ipca[y] as number)).length : 0;
    const yearsCounted = yearlyFocus ? yearly.years.filter(y => yearlyFocus.byYear[y] !== null && inflation.ipca[y] !== null).length : 0;

    // capitals against the national index over 12 months (or by annual yield)
    const capitals = snapshot.cities.filter(c => c.city.isCapital);
    const natMetric = twelveMonthMetric(national, state.tipo);
    const capitalsAbove = natMetric === null ? null : { k: capitals.filter(c => (twelveMonthMetric(c, state.tipo) ?? -Infinity) > natMetric).length, total: capitals.length };

    const titles = buildCardTitles(input, t.insights, {
        bedroomsBest: best ? { label: dormLabel(best.dorm), var12m: best.var12m as number } : null,
        yearsAboveIpca: yearlyFocus && yearsCounted ? { above: yearsAbove, total: yearsCounted, currentYear: yearOf(latest), currentYtd: isYield ? focus.yield12m : focus.var12m } : null,
        capitalsAboveNational: capitalsAbove,
    });
    const highlights = buildHighlights(input, t.insights);

    const series = slugs.map(slug => ({ slug, name: slug === FIPEZAP_NATIONAL_SLUG ? t.labels.national : fipezapCityBySlug(slug)?.name ?? slug, color: seriesColor(slug, state.cidade, state.comparar), points: history[slug] ?? [] }));
    const rankingRows = (value: (c: CitySnapshot) => number | null) => snapshot.cities.map(c => ({ slug: c.city.slug, name: c.city.name, uf: c.city.uf, isCapital: c.city.isCapital, value: value(c) }));
    const rankingLabels = { national: t.labels.national, showAll: t.labels.showAll, showLess: t.labels.showLess };
    const historyLabels = { mensal: t.sections.historyMensal, m12: t.sections.history12m, indice: t.sections.historyIndice, yield: t.sections.yield, ipca: t.labels.ipca, igpm: t.labels.igpm, cdi: t.labels.cdi, national: t.labels.national, rebasedNote: t.labels.rebasedNote, viewData: t.labels.viewData, hideData: t.labels.hideData, month: t.columns.month };
    const sparkFrom = periodStart({ periodo: "5y", de: null }, latest) as string;

    const base = `https://kitnets.com${buildFipezapCitiesHref(lang, { ...state, comparar: [], periodo: "5y", de: null, ate: null, tipo: "venda", dorm: "total" })}`;
    const jsonLd = [
        { "@context": "https://schema.org", "@type": "Dataset", name: `${t.h1} — ${focus.city.name}`, description: t.description, url: base, temporalCoverage: `${(history[state.cidade]?.[0]?.month ?? latest).slice(0, 7)}/${latest.slice(0, 7)}`, creator: { "@type": "Organization", name: "FIPE" }, provider: { "@type": "Organization", name: "Kitnets.com", url: "https://kitnets.com" }, variableMeasured: ["Preço médio R$/m²", "Variação mensal", "Variação em 12 meses", "Rentabilidade do aluguel"] },
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `https://kitnets.com/${lang}` },
            { "@type": "ListItem", position: 2, name: "Índices", item: `https://kitnets.com/${lang}/indices/panorama` },
            { "@type": "ListItem", position: 3, name: "FipeZAP", item: `https://kitnets.com/${lang}/indices/fipezap` },
            { "@type": "ListItem", position: 4, name: t.h1, item: `https://kitnets.com/${lang}/indices/fipezap/cidades` },
            ...(city ? [{ "@type": "ListItem", position: 5, name: city.city.name, item: base }] : []),
        ] },
    ];

    return (
        <div className="container mx-auto py-4 md:py-10 px-4 max-w-6xl">
            {header}
            <p className="mb-4 text-xs text-muted-foreground">{fill(t.asOf, { mes: monthLong(latest, lang) })} · {t.source}</p>
            <FipezapCitiesControls state={state} lang={lang} t={t.controls} availableDorms={availableDorms} />

            <div className="mt-6 space-y-6">
                <FipezapHighlights title={t.sections.highlights} items={highlights} source={sourceLine} />

                <section aria-label={t.sections.kpis}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.sections.kpis} · {focus.city.name} · {monthShort(focus.month, lang)}</p>
                    <FipezapKpiStrip focus={focus} tipo={state.tipo} tipoLabel={tipoLabel} ipca={ipca} igpm={igpm} cdi12m={cdi12m} lang={lang} t={t.kpi} />
                </section>

                <ReportCard id="resultados" eyebrow={t.sections.results} title={titles.results} definition={isYield ? t.labels.definitionYield : t.labels.definitionVar} source={sourceLine}>
                    <FipezapResultsTable state={state} lang={lang} national={national} cities={snapshot.cities} ipca={ipca} igpm={igpm} t={t} />
                </ReportCard>

                <ReportCard id="preco" eyebrow={isYield ? t.sections.yieldRanking : t.sections.price} title={isYield ? titles.yield : titles.price} definition={isYield ? t.labels.definitionYield : t.labels.definitionPrice} source={sourceLine}>
                    <RankingBarsLazy rows={rankingRows(c => (isYield ? c.yieldAnual : c.precoM2))} selected={state.cidade} compare={state.comparar} nationalValue={isYield ? national.yieldAnual : national.precoM2} unit={isYield ? "pct" : "brl"} lang={lang} labels={rankingLabels} />
                </ReportCard>

                {buckets.length > 1 ? (
                    <ReportCard id="dormitorios" eyebrow={t.sections.bedrooms} title={titles.bedrooms ?? `${t.sections.bedrooms} · ${bucketsPlace}`} definition={bucketsCity && bucketsCity.length <= 1 && city ? t.labels.noBuckets : t.labels.definitionVar} source={sourceLine}>
                        <BedroomBarsLazy national={bucketsNat} city={bucketsCity && bucketsCity.length > 1 ? bucketsCity : null} cityName={city?.city.name ?? null} isYield={isYield} lang={lang}
                            labels={{ total: t.controls.dormTotal, d1: t.controls.dorm1, d2: t.controls.dorm2, d3: t.controls.dorm3, d4: t.controls.dorm4, national: t.labels.national, month: t.columns.month, ytd: t.columns.ytd, m12: t.columns.m12, price: t.columns.priceM2, yield: t.columns.yieldAnnual }} />
                    </ReportCard>
                ) : null}

                <ReportCard id="evolucao" eyebrow={t.sections.history} title={titles.history} definition={isYield ? t.labels.definitionYield : t.labels.definitionVar} source={sourceLine}>
                    <HistoryChartLazy series={series} state={state} latest={latest} ipca={ipcaS} igpm={igpmS} cdi={cdiS} lang={lang} labels={historyLabels} />
                </ReportCard>

                {!isYield && yearly.years.length > 0 && (
                    <ReportCard id="anual" eyebrow={t.sections.yearly} title={titles.yearly} definition={t.labels.definitionYearly} source={sourceLine}>
                        <FipezapYearlyTable years={yearly.years} rows={yearly.rows.filter(r => r.city.slug !== FIPEZAP_NATIONAL_SLUG)} national={yearlyNational} inflation={inflation} state={state} lang={lang}
                            labels={{ year: t.columns.year, city: t.columns.city, ipca: t.labels.ipca, igpm: t.labels.igpm, national: t.labels.national, capitals: t.controls.capitals, otherCities: t.controls.otherCities, showAll: t.labels.showAll, showLess: t.labels.showLess, ytdNote: t.labels.ytdNote, swipeHint: t.labels.swipeHint, realGain: t.labels.realGain, realLoss: t.labels.realLoss }} />
                    </ReportCard>
                )}

                <ReportCard id="capitais" eyebrow={t.sections.capitals} title={titles.capitals} definition={isYield ? t.columns.yieldM12 : `${t.columns.m12} · ${t.labels.definitionVar}`} source={sourceLine}>
                    <RankingBarsLazy rows={rankingRows(c => (c.city.isCapital ? twelveMonthMetric(c, state.tipo) : null))} selected={state.cidade} compare={state.comparar} nationalValue={natMetric} unit="pct" lang={lang} labels={rankingLabels} collapsedAt={30} />
                </ReportCard>

                {!isYield && state.tipo === "locacao" && (
                    <ReportCard id="rentabilidade" eyebrow={t.sections.yieldRanking} title={titles.yield} definition={t.labels.definitionYield} source={sourceLine}>
                        <RankingBarsLazy rows={rankingRows(c => c.yieldAnual)} selected={state.cidade} compare={state.comparar} nationalValue={national.yieldAnual} unit="pct" lang={lang} labels={rankingLabels} />
                    </ReportCard>
                )}

                {city && (
                    <ReportCard id="cidade" eyebrow={t.sections.cityProfile} title={`${city.city.name} · ${city.city.uf}`} source={sourceLine}>
                        <FipezapCityProfile snapshot={city} national={national} history={history[city.city.slug] ?? []} nationalHistory={history[FIPEZAP_NATIONAL_SLUG] ?? []} state={state} lang={lang} t={t} from={sparkFrom} />
                    </ReportCard>
                )}

                <section className="rounded-xl border border-dashed bg-muted/20 p-4 md:p-6 space-y-2 text-sm text-muted-foreground" aria-label={t.sections.methodology}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider">{t.sections.methodology}</p>
                    {t.methodology.map((p, i) => <p key={i}>{p}</p>)}
                    <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                        <Link href={`${lang === "pt" ? "" : `/${lang}`}/indices/fipezap`} className="underline-offset-2 hover:underline">FipeZAP</Link>
                        <Link href={`${lang === "pt" ? "" : `/${lang}`}/indices/ipca`} className="underline-offset-2 hover:underline">IPCA</Link>
                        <Link href={`${lang === "pt" ? "" : `/${lang}`}/indices/igpm`} className="underline-offset-2 hover:underline">IGP-M</Link>
                        <Link href={`${lang === "pt" ? "" : `/${lang}`}/indices/cdi`} className="underline-offset-2 hover:underline">CDI</Link>
                        {FIPEZAP_CITIES.filter(c => c.isCapital).slice(0, 6).map(c => <Link key={c.slug} href={buildFipezapCitiesHref(lang, state, { cidade: c.slug, comparar: [] })} className="underline-offset-2 hover:underline">{c.name}</Link>)}
                    </p>
                </section>
            </div>
            {jsonLd.map((o, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />)}
        </div>
    );
}
