import { FipeZapFilter } from "@/components/indices/FipeZapFilter";
import { FipeZapKPIs } from "@/components/indices/FipeZap/FipeZapKPIs";
import { FipeZapChart } from "@/components/indices/FipeZap/FipeZapChart";
import { FipeZapHeatmap } from "@/components/indices/FipeZap/FipeZapHeatmap";
import { FipeZapTable } from "@/components/indices/FipeZap/FipeZapTable";
import { FipeZapContext } from "@/lib/fipezap";

interface Props {
    startDate: string;
    endDate: string;
    type: string;
    bedrooms: string;
    data: FipeZapContext;
}

export function FipeZapDashboardWrapper({ startDate, endDate, type, bedrooms, data }: Props) {
    if (!data) {
        return <div className="p-10 text-center text-muted-foreground">Dados indísponíveis no momento.</div>;
    }

    // Determine current year for KPIs
    const currentYear = new Date().getFullYear();

    // Determine which data to show in Charts/Table based on 'type'
    const activeData = type === 'locacao' ? data.locacao
        : type === 'venda' ? data.venda
            : data.yield;

    return (
        <div className="space-y-6">
            {/* Unified Filter - Placed at the top */}
            <FipeZapFilter
                defaultType={type}
                defaultBedrooms={bedrooms}
                defaultStartDate={startDate}
                defaultEndDate={endDate}
            />

            {/* KPI Section - Dynamic based on active type */}
            <FipeZapKPIs data={data} currentYear={currentYear} />

            {/* Dynamic Content based on Type */}
            <div className="grid gap-6">
                <div id="chart" className="min-w-0">
                    <FipeZapChart data={activeData} type={type} bedrooms={bedrooms} />
                </div>

                <div id="heatmap" className="min-w-0">
                    <FipeZapHeatmap data={activeData} />
                </div>

                <div id="table" className="min-w-0">
                    <FipeZapTable data={activeData} />
                </div>

            </div>
        </div>
    );
}
