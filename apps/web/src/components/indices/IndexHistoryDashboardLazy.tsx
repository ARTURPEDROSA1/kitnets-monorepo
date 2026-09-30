"use client";

import dynamic from "next/dynamic";
import type { IndexValue } from "@/lib/indexes";
import type { HistoryLabels } from "./IndexHistoryDashboard";

const Skeleton = () => (
    <>
        {[340, 300, 320].map((h, i) => (
            <div key={i} className="md:col-span-3 min-w-0">
                <div className="rounded-xl border bg-card shadow-sm p-3 md:p-6 space-y-4">
                    <div className="h-6 w-64 rounded bg-muted/40 animate-pulse" />
                    <div className="h-4 w-80 max-w-full rounded bg-muted/30 animate-pulse" />
                    <div className="w-full rounded-lg bg-muted/20 animate-pulse" style={{ height: h }} />
                </div>
            </div>
        ))}
    </>
);

// recharts and the tables are browser-only chunks; the server sends the skeleton
const IndexHistoryDashboard = dynamic(() => import("./IndexHistoryDashboard").then((mod) => mod.IndexHistoryDashboard), {
    loading: () => <Skeleton />,
    ssr: false,
});

interface Props {
    data: IndexValue[];
    indexCode: string;
    labels: HistoryLabels;
    leadGate?: boolean;
}

export function IndexHistoryDashboardLazy(props: Props) {
    return <IndexHistoryDashboard {...props} />;
}
