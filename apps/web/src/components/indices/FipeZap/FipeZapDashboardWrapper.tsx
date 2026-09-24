import { FipeZapFilter } from "@/components/indices/FipeZapFilter";
import { FipeZapKPIs } from "@/components/indices/FipeZap/FipeZapKPIs";
import { FipeZapChart } from "@/components/indices/FipeZap/FipeZapChart";
import { FipeZapHeatmap } from "@/components/indices/FipeZap/FipeZapHeatmap";
import { FipeZapTable } from "@/components/indices/FipeZap/FipeZapTable";
import { FipeZapContext } from "@/lib/fipezap";
import { FipezapCitiesCta } from "@/components/indices/FipeZap/cities/FipezapCitiesCta";
import type { ReactNode } from "react";

interface Props {
    startDate: string;
    endDate: string;
    type: string;
    bedrooms: string;
    data: FipeZapContext;
    /** correction calculator, rendered between the cards and the filter */
    calculator?: ReactNode;
    /** locale, for the link to the city dashboard */
    lang?: string;
}

export function FipeZapDashboardWrapper({ startDate, endDate, type, bedrooms, data, calculator, lang = "pt" }: Props) {
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
            {/* Same order as every index page: cards, calculator, filter, chart, heatmap, table */}
            <FipeZapKPIs data={data} currentYear={currentYear} />

            {/* the same series for 36 cities, on the city dashboard */}
            <FipezapCitiesCta lang={lang} tipo={type} dorm={bedrooms === 'todos' ? 'total' : bedrooms} />

            {calculator}

            <FipeZapFilter
                defaultType={type}
                defaultBedrooms={bedrooms}
                defaultStartDate={startDate}
                defaultEndDate={endDate}
            />

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
