"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "./SegmentedControl";
import { BRAZIL_OUTLINE_PATH, BRAZIL_VIEWBOX, projectBrazil } from "@/lib/fipezap-brazil-outline";
import { buildFipezapCitiesHref, type FipezapCitiesState } from "@/lib/fipezap-cities-params";
import { fmtBRL, fmtPct } from "@/lib/fipezap-compare";
import { INK, NEGATIVE, POSITIVE, seriesColor } from "./palette";

export interface MapCity { slug: string; name: string; uf: string | null; lat: number; lng: number; isCapital: boolean }
export interface MapMetric {
    key: string;
    label: string;
    unit: "pct" | "brl";
    /** a change (sign matters: green up, red down) rather than a level */
    signed: boolean;
    values: Record<string, number | null>;
}
export interface MapLabels { hint: string; noValue: string; legendSelected: string; legendCompare: string; legendOthers: string }

const R_MIN = 3, R_MAX = 13;

/**
 * FIPE's "mapa" slide for all 36 cities at once: an inline SVG of Brazil with one circle per city,
 * sized by the chosen figure (price per m², 12-month change or rental yield). The selected city is
 * ink, compared cities keep their colours, the rest fade; a change colours by sign only. Hovering
 * shows the value, clicking opens the city's page.
 */
export function FipezapBrazilMap({ cities, metrics, initialMetric, state, lang, labels }: { cities: MapCity[]; metrics: MapMetric[]; initialMetric?: string; state: FipezapCitiesState; lang: string; labels: MapLabels }) {
    const router = useRouter();
    const [metricKey, setMetricKey] = useState(initialMetric ?? metrics[0]?.key);
    const [hover, setHover] = useState<string | null>(null);
    const metric = metrics.find(m => m.key === metricKey) ?? metrics[0];

    const dots = useMemo(() => {
        const withValue = cities.map(c => ({ ...c, value: metric?.values[c.slug] ?? null }));
        const nums = withValue.map(d => d.value).filter((v): v is number => v !== null);
        const lo = metric?.signed ? 0 : Math.min(...nums), hi = metric?.signed ? Math.max(...nums.map(Math.abs)) : Math.max(...nums);
        const scale = (v: number) => { const t = hi > lo ? ((metric?.signed ? Math.abs(v) : v) - lo) / (hi - lo) : 0.5; return R_MIN + Math.sqrt(Math.max(0, t)) * (R_MAX - R_MIN); };
        return withValue.map(d => ({ ...d, ...projectBrazil(d.lat, d.lng), r: d.value === null ? R_MIN : scale(d.value) }))
            .sort((a, b) => b.r - a.r);   // big circles first, so small ones stay clickable on top
    }, [cities, metric]);

    const fmt = (v: number | null) => (v === null ? labels.noValue : metric?.unit === "brl" ? fmtBRL(v, { lang }) : fmtPct(v, { lang, sign: metric?.signed, digits: 1 }));
    const fillOf = (slug: string, value: number | null) => {
        if (slug === state.cidade) return INK;
        if (state.comparar.includes(slug)) return seriesColor(slug, state.cidade, state.comparar);
        if (metric?.signed && value !== null) return value >= 0 ? POSITIVE : NEGATIVE;
        return "hsl(var(--muted-foreground))";
    };
    const labelled = (slug: string) => slug === state.cidade || state.comparar.includes(slug) || hover === slug;
    const hovered = dots.find(d => d.slug === hover);
    const href = (slug: string) => buildFipezapCitiesHref(lang, state, { cidade: slug, comparar: state.comparar.filter(c => c !== slug) });
    const extremes = dots.filter(d => d.value !== null);
    const legendSizes = extremes.length ? [Math.min(...extremes.map(d => d.value as number)), Math.max(...extremes.map(d => d.value as number))] : [];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 md:px-0">
                {metrics.length > 1 ? <SegmentedControl ariaLabel={metric?.label ?? ""} size="xs" value={metricKey} onChange={setMetricKey} options={metrics.map(m => ({ value: m.key, label: m.label }))} /> : <span />}
                <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: INK }} />{labels.legendSelected}</li>
                    {state.comparar.length > 0 && <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: seriesColor(state.comparar[0], state.cidade, state.comparar) }} />{labels.legendCompare}</li>}
                    {metric?.signed
                        ? <><li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: POSITIVE }} />▲</li><li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: NEGATIVE }} />▼</li></>
                        : <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground" />{labels.legendOthers}</li>}
                    {legendSizes.length === 2 && <li className="inline-flex items-center gap-1.5 tabular-nums"><span className="inline-block rounded-full border border-muted-foreground" style={{ width: 6, height: 6 }} />{fmt(legendSizes[0])}<span className="inline-block rounded-full border border-muted-foreground" style={{ width: 16, height: 16 }} />{fmt(legendSizes[1])}</li>}
                </ul>
            </div>
            <div className="relative mx-auto w-full max-w-[560px]">
                <svg viewBox={`0 0 ${BRAZIL_VIEWBOX.width} ${BRAZIL_VIEWBOX.height}`} className="w-full h-auto" role="img" aria-label={dots.map(d => `${d.name}: ${fmt(d.value)}`).join("; ")} onMouseLeave={() => setHover(null)}>
                    <path d={BRAZIL_OUTLINE_PATH} fill="hsl(var(--muted) / 0.5)" stroke="hsl(var(--border))" strokeWidth={0.8} strokeLinejoin="round" />
                    {dots.map(d => {
                        const active = d.slug === state.cidade || d.slug === hover;
                        return (
                            <a key={d.slug} href={href(d.slug)} onClick={e => { e.preventDefault(); router.push(href(d.slug)); }} onMouseEnter={() => setHover(d.slug)} onFocus={() => setHover(d.slug)} onBlur={() => setHover(null)} aria-label={`${d.name}${d.uf ? ` (${d.uf})` : ""}: ${fmt(d.value)}`} className="cursor-pointer focus:outline-none">
                                <circle cx={d.x} cy={d.y} r={d.r} fill={fillOf(d.slug, d.value)} fillOpacity={d.slug === state.cidade || state.comparar.includes(d.slug) ? 0.95 : active ? 0.85 : 0.55} stroke={active ? INK : "hsl(var(--background))"} strokeWidth={active ? 1.5 : 0.6} />
                            </a>
                        );
                    })}
                    {/* labels last, so no circle covers them */}
                    {dots.filter(d => labelled(d.slug)).map(d => (
                        <text key={`label-${d.slug}`} x={d.x + d.r + 2} y={d.y + 3} fontSize={9} fontWeight={d.slug === state.cidade ? 700 : 500} fill="hsl(var(--foreground))" pointerEvents="none" style={{ paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: 2.5 }}>
                            {d.name}
                        </text>
                    ))}
                </svg>
                {hovered && (
                    <div className="pointer-events-none absolute rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md" style={{ left: `${(hovered.x / BRAZIL_VIEWBOX.width) * 100}%`, top: `${(hovered.y / BRAZIL_VIEWBOX.height) * 100}%`, transform: "translate(12px, -50%)" }} role="status">
                        <span className="font-semibold">{hovered.name}</span>{hovered.uf && <span className="text-muted-foreground"> · {hovered.uf}</span>}
                        <span className="ml-2 tabular-nums">{fmt(hovered.value)}</span>
                    </div>
                )}
            </div>
            <p className="px-2 md:px-0 text-[11px] text-muted-foreground">{labels.hint}</p>
        </div>
    );
}
