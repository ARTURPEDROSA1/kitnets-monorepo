"use client";

import { FipeZapDataPoint } from "@/lib/fipezap";
import { IndexHeatmap } from "@/components/indices/IndexHeatmap";

interface FipeZapHeatmapProps {
    data: FipeZapDataPoint[];
}

export function FipeZapHeatmap({ data }: FipeZapHeatmapProps) {
    return (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-3 md:p-6">
            <div className="mb-4">
                <h3 className="text-lg md:text-xl font-semibold">Mapa de Calor (Sazonalidade)</h3>
                <p className="text-sm text-muted-foreground">Visualize ciclos de alta e baixa</p>
            </div>
            <IndexHeatmap data={data as any} />
        </div>
    );
}
