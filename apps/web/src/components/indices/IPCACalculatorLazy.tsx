"use client";

import dynamic from "next/dynamic";
import { IndexValueForCalc } from "@/lib/indexes";
import { useState, useEffect } from "react";

const IPCACalculator = dynamic(
    () => import("./IPCACalculator").then((mod) => mod.IPCACalculator),
    {
        loading: () => (
            <div className="rounded-xl border bg-card shadow-sm p-6 md:p-8">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-5 w-64 bg-muted/40 rounded animate-pulse" />
                        <div className="h-3 w-48 bg-muted/30 rounded animate-pulse" />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-11 bg-muted/20 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        ),
        ssr: false,
    }
);

interface Props {
    indexCode: string;
}

export function IPCACalculatorLazy({ indexCode }: Props) {
    const [data, setData] = useState<IndexValueForCalc[] | null>(null);

    useEffect(() => {
        fetch(`/api/indices/${indexCode.toLowerCase()}/calculator-data`)
            .then(res => res.json())
            .then(setData)
            .catch(() => setData([]));
    }, [indexCode]);

    if (!data) {
        return (
            <div className="rounded-xl border bg-card shadow-sm p-6 md:p-8">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-5 w-64 bg-muted/40 rounded animate-pulse" />
                        <div className="h-3 w-48 bg-muted/30 rounded animate-pulse" />
                    </div>
                </div>
            </div>
        );
    }

    if (data.length === 0) return null;

    return <IPCACalculator data={data} />;
}
