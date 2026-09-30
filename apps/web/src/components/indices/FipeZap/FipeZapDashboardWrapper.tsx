import { FipeZapKPIs } from "@/components/indices/FipeZap/FipeZapKPIs";
import { FipeZapHistoryDashboard } from "@/components/indices/FipeZap/FipeZapHistoryDashboard";
import { FipeZapContext } from "@/lib/fipezap";
import { FipezapCitiesCta } from "@/components/indices/FipeZap/cities/FipezapCitiesCta";
import type { ReactNode } from "react";

interface Props {
    /** the series from the URL (?type=), the chart's initial one */
    type: string;
    /** the bedroom bucket from the URL (?bedrooms=) */
    bedrooms: string;
    /** every series of that bucket, the whole history */
    data: FipeZapContext;
    /** correction calculator, rendered between the cards and the history */
    calculator?: ReactNode;
    /** locale, for the link to the city dashboard */
    lang?: string;
}

export function FipeZapDashboardWrapper({ type, bedrooms, data, calculator, lang = "pt" }: Props) {
    if (!data) {
        return <div className="p-10 text-center text-muted-foreground">Dados indísponíveis no momento.</div>;
    }

    // Determine current year for KPIs
    const currentYear = new Date().getFullYear();

    return (
        <div className="space-y-6">
            {/* Same order as every index page: cards, calculator, then the history with its period buttons */}
            <FipeZapKPIs data={data} currentYear={currentYear} />

            {/* the same series for 36 cities, on the city dashboard */}
            <FipezapCitiesCta lang={lang} tipo={type} dorm={bedrooms === 'todos' ? 'total' : bedrooms} />

            {calculator}

            <FipeZapHistoryDashboard data={data} initialType={type} bedrooms={bedrooms} />
        </div>
    );
}
