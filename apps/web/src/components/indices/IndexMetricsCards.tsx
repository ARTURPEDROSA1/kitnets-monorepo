import { getNextReleaseLabel } from '@/lib/release-calendars';

interface IndexValue {
    month: number;
    year: number;
    value_percent: number | null;
    accumulated_12m?: number | null;
    accumulated_year?: number | null;
}

interface IndexMetricsLabels {
    today: string;
    referentTo: string;
    accumulated12m: string;
    last12m: string;
    accumulatedYear: string;
    until: string;
    nextRelease: string;
}

interface IndexMetricsCardsProps {
    code: string;
    lang: string;
    latest: IndexValue | null;
    today: Date;
    labels: IndexMetricsLabels;
}

export function IndexMetricsCards({ code, lang, latest, today, labels }: IndexMetricsCardsProps) {
    const monthRef = latest ? `${latest.month.toString().padStart(2, '0')}/${latest.year}` : '--';
    const dateTime = latest ? `${latest.year}-${String(latest.month).padStart(2, '0')}` : '';

    return (
        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            {/* Card 1: Variação Mensal */}
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm" role="region" aria-label={`${code} variação mensal`}>
                <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                    <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">{code} {labels.today}</h3>
                </div>
                <div className="p-3 md:p-6 pt-0">
                    <div className="text-2xl md:text-3xl font-bold text-primary">
                        {latest ? `${latest.value_percent}%` : '--'}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {labels.referentTo} <time dateTime={dateTime}>{monthRef}</time>
                    </p>
                </div>
            </div>

            {/* Card 2: Acumulado 12m */}
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm" role="region" aria-label={`${code} acumulado 12 meses`}>
                <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                    <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">{code} {labels.accumulated12m}</h3>
                </div>
                <div className="p-3 md:p-6 pt-0">
                    <div className="text-2xl md:text-3xl font-bold text-primary">
                        {latest?.accumulated_12m ? `${latest.accumulated_12m}%` : '--'}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {labels.last12m}
                    </p>
                </div>
            </div>

            {/* Card 3: Acumulado Ano (YTD) */}
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm" role="region" aria-label={`${code} acumulado no ano`}>
                <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                    <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                        {code} {labels.accumulatedYear.replace('{year}', String(latest?.year ?? ''))}
                    </h3>
                </div>
                <div className="p-3 md:p-6 pt-0">
                    <div className="text-2xl md:text-3xl font-bold text-primary">
                        {latest?.accumulated_year ? `${latest.accumulated_year}%` : '--'}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {labels.until} {monthRef}
                    </p>
                </div>
            </div>

            {/* Card 4: Next Release Date */}
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                    <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">{labels.nextRelease}</h3>
                </div>
                <div className="p-3 md:p-6 pt-0">
                    <div className="text-2xl md:text-3xl font-bold text-primary">
                        <span className="text-sm md:text-xl">
                            {getNextReleaseLabel(code, lang, latest, today)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
