"use client";

import dynamic from 'next/dynamic';

const IndexDateFilter = dynamic(
    () => import('./IndexDateFilter').then(mod => mod.IndexDateFilter),
    {
        loading: () => (
            <div className="bg-card border rounded-xl p-4 shadow-sm mb-6">
                <div className="flex flex-col md:flex-row items-end gap-4">
                    <div className="w-full md:w-auto flex-1 space-y-1.5">
                        <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                        <div className="h-10 w-full bg-muted/20 rounded-lg animate-pulse" />
                    </div>
                    <div className="w-full md:w-auto flex-1 space-y-1.5">
                        <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                        <div className="h-10 w-full bg-muted/20 rounded-lg animate-pulse" />
                    </div>
                    <div className="h-10 w-24 bg-primary/20 rounded-lg animate-pulse" />
                </div>
            </div>
        ),
        ssr: false,
    }
);

interface Props {
    defaultStartDate?: string;
    defaultEndDate?: string;
}

export function IndexDateFilterLazy({ defaultStartDate, defaultEndDate }: Props) {
    return (
        <IndexDateFilter
            defaultStartDate={defaultStartDate}
            defaultEndDate={defaultEndDate}
        />
    );
}
