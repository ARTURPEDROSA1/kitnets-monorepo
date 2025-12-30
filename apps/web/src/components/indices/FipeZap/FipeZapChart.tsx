"use client";

import { FipeZapDataPoint } from "@/lib/fipezap";
import { IndexChart } from "@/components/indices/IndexChart";
// "Dynamic title", "Type - Bedrooms". 
// X-axis: time. Y-axis: % variation (loc/venda) OR % yield.
// Let's assume IndexChart is flexible enough or wrap it. 

// Actually, IndexChart takes { year, month, value_percent } which maps perfectly.
// We just need to transform FipeZapDataPoint to the format IndexChart expects if it differs.
// FipeZapDataPoint has matching fields.

import { Card } from "@/components/ui/card";

interface FipeZapChartProps {
    data: FipeZapDataPoint[];
    type: string;
    bedrooms: string;
}

export function FipeZapChart({ data, type, bedrooms }: FipeZapChartProps) {
    const bedroomsLabel = bedrooms === 'todos' ? 'Dormitórios (Geral)' : `${bedrooms} dormitório(s)`;
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

    return (
        <Card className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                <h3 className="text-lg md:text-xl font-semibold">
                    FIPEZAP {typeLabel} – {bedroomsLabel}
                </h3>
                <p className="text-sm text-muted-foreground">Evolução histórica</p>
            </div>
            {/* We can cast simply if compatible or map */}
            <IndexChart data={data as any} indexCode={`FIPEZAP ${typeLabel}`} />
        </Card>
    );
}
