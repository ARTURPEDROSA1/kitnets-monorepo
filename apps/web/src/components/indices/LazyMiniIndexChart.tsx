"use client";

import dynamic from "next/dynamic";
import { IndexValue } from "@/lib/indexes";

interface IndexChartProps {
    data: IndexValue[];
    color?: string;
}

const MiniIndexChartInternal = dynamic(
    () => import("./MiniIndexChart").then((mod) => mod.MiniIndexChart),
    {
        ssr: false,
        loading: () => <div className="h-[100px] w-full bg-muted/20 animate-pulse rounded-lg" />,
    }
);

export function LazyMiniIndexChart(props: IndexChartProps) {
    return <MiniIndexChartInternal {...props} />;
}
