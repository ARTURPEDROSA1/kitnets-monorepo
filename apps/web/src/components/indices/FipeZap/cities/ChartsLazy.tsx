"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { RankingBars } from "./RankingBars";
import type { FipezapBedroomBars } from "./FipezapBedroomBars";
import type { FipezapHistoryChart } from "./FipezapHistoryChart";
import type { CitySparkline } from "./CitySparkline";
import type { FipezapBrazilMap } from "./FipezapBrazilMap";

const skeleton = (h: number) => {
    const ChartSkeleton = () => <div className="w-full rounded-lg bg-muted/30 animate-pulse" style={{ height: h }} aria-busy="true" />;
    ChartSkeleton.displayName = "ChartSkeleton";
    return ChartSkeleton;
};

/** The recharts components load on the client only (no SSR of SVG charts), each with a skeleton of its own height. */
export const RankingBarsLazy = dynamic(() => import("./RankingBars").then(m => m.RankingBars), { ssr: false, loading: skeleton(480) }) as typeof RankingBars;
export const BedroomBarsLazy = dynamic(() => import("./FipezapBedroomBars").then(m => m.FipezapBedroomBars), { ssr: false, loading: skeleton(200) }) as typeof FipezapBedroomBars;
export const HistoryChartLazy = dynamic(() => import("./FipezapHistoryChart").then(m => m.FipezapHistoryChart), { ssr: false, loading: skeleton(360) }) as typeof FipezapHistoryChart;
export const CitySparklineLazy = dynamic(() => import("./CitySparkline").then(m => m.CitySparkline), { ssr: false, loading: skeleton(120) }) as typeof CitySparkline;
export const BrazilMapLazy = dynamic(() => import("./FipezapBrazilMap").then(m => m.FipezapBrazilMap), { ssr: false, loading: skeleton(520) }) as typeof FipezapBrazilMap;

export type RankingBarsProps = ComponentProps<typeof RankingBars>;
