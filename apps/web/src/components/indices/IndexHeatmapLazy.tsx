"use client";

import dynamic from 'next/dynamic';
import { IndexValue } from "@/lib/indexes";

const IndexHeatmap = dynamic(() => import('./IndexHeatmap').then(mod => mod.IndexHeatmap), {
    loading: () => <div className="h-[300px] w-full bg-muted/20 animate-pulse rounded-lg" />,
    ssr: false
});

interface Props {
    data: IndexValue[];
}

export function IndexHeatmapLazy({ data }: Props) {
    return <IndexHeatmap data={data} />;
}
