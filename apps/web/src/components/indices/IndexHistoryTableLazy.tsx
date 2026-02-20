"use client";

import dynamic from 'next/dynamic';
import { IndexValue } from "@/lib/indexes";

const IndexHistoryTable = dynamic(() => import('./IndexHistoryTable').then(mod => mod.IndexHistoryTable), {
    loading: () => (
        <div className="w-full space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 w-full bg-muted/20 animate-pulse rounded" />
            ))}
        </div>
    ),
    ssr: false
});

interface Props {
    data: IndexValue[];
}

export function IndexHistoryTableLazy({ data }: Props) {
    return <IndexHistoryTable data={data} />;
}
