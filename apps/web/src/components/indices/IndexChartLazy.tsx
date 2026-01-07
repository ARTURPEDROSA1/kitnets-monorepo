"use client";

import dynamic from 'next/dynamic';
import { IndexValue } from "@/lib/indexes";

const IndexChart = dynamic(() => import('./IndexChart').then(mod => mod.IndexChart), {
    loading: () => <div className="h-[300px] w-full bg-muted/20 animate-pulse rounded-lg" />,
    ssr: false
});

interface Props {
    data: IndexValue[];
    indexCode: string;
}

export function IndexChartLazy({ data, indexCode }: Props) {
    return <IndexChart data={data} indexCode={indexCode} />;
}
