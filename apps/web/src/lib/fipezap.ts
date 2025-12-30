
import { createStaticClient } from "@/utils/supabase/static";

export type FipeZapDataPoint = {
    date: string; // YYYY-MM-DD
    year: number;
    month: number;
    value_percent: number;
    accumulated_12m: number | null;
    accumulated_year: number | null;
    type: 'locacao' | 'venda' | 'yield';
    bedrooms: string; // '1', '2', '3', '4', 'todos'
};

// Database Schema Type
export type FipeZapDatabaseRow = {
    id: number;
    reference_date: string;
    index_type: 'venda' | 'locacao' | 'yield';
    metric: 'var_mensal' | 'var_12m' | 'preco_m2' | 'yield_mensal';
    dormitorios: 'total' | '1' | '2' | '3' | '4';
    value: number;
    source: string;
    created_at: string;
};

export type FipeZapContext = {
    locacao: FipeZapDataPoint[];
    venda: FipeZapDataPoint[];
    yield: FipeZapDataPoint[];
};

export async function getFipeZapData(startDate: string, endDate: string, bedrooms: string): Promise<FipeZapContext> {
    const supabase = createStaticClient();

    // 1. Determine Fetch Date Range (Need context for YTD)
    // We need data starting from Jan 1st of the startDate's year to calculate YTD correctly.
    const [sYear] = startDate.split('-').map(Number);
    const fetchStartDate = `${sYear}-01-01`;

    // 2. Map Bedroom param to DB value
    // 'todos' -> 'total', others '1','2','3','4' match
    const dbBedrooms = bedrooms === 'todos' ? 'total' : bedrooms;

    // 3. Fetch Data
    const { data: rows, error } = await supabase
        .from('fipezap_series')
        .select('*')
        .eq('dormitorios', dbBedrooms)
        .gte('reference_date', fetchStartDate)
        .lte('reference_date', endDate)
        .order('reference_date', { ascending: true }); // Ascending for easier calc

    if (error || !rows) {
        console.error("Error fetching FipeZap data:", error);
        return { locacao: [], venda: [], yield: [] };
    }

    // 4. Group by Date & Type
    // Structure: map[date][type] -> { [metric]: value }
    const grouped = new Map<string, Map<string, Record<string, number>>>();

    rows.forEach(row => {
        if (!grouped.has(row.reference_date)) {
            grouped.set(row.reference_date, new Map());
        }
        const dateMap = grouped.get(row.reference_date)!;

        if (!dateMap.has(row.index_type)) {
            dateMap.set(row.index_type, {});
        }
        const metrics = dateMap.get(row.index_type)!;
        metrics[row.metric] = row.value;
    });

    // 5. Build Series
    const result: FipeZapContext = { locacao: [], venda: [], yield: [] };

    // Helpers
    const getYTD = (series: FipeZapDataPoint[], currentYear: number, newVal: number) => {
        // Find recent items from same year
        const sameYear = series.filter(d => d.year === currentYear);
        // If this is Jan, YTD is just this val.
        // Actually we are building in order.
        // Compound interest: Prod(1 + val/100) - 1
        let acc = 1;
        sameYear.forEach(p => acc *= (1 + (p.value_percent / 100)));
        acc *= (1 + (newVal / 100)); // Add current
        return (acc - 1) * 100;
    };

    const getAverageYTD = (series: FipeZapDataPoint[], currentYear: number, newVal: number) => {
        const sameYear = series.filter(d => d.year === currentYear);
        const sum = sameYear.reduce((s, p) => s + p.value_percent, 0) + newVal;
        return sum / (sameYear.length + 1);
    };

    const getAverage12m = (series: FipeZapDataPoint[], currentVal: number) => {
        // Get last 11 items
        const last11 = series.slice(-11);
        const sum = last11.reduce((s, p) => s + p.value_percent, 0) + currentVal;
        return sum / (last11.length + 1);
    }


    // Process Ascending (Oldest -> Newest)
    // We iterate over the distinct dates we found, sorted.
    const sortedDates = Array.from(grouped.keys()).sort();

    sortedDates.forEach(dateStr => {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateMap = grouped.get(dateStr)!;

        // --- LOCACAO ---
        if (dateMap.has('locacao')) {
            const m = dateMap.get('locacao')!;
            const val = m['var_mensal'] || 0;
            const ytd = getYTD(result.locacao, year, val);

            result.locacao.push({
                date: dateStr,
                year,
                month,
                type: 'locacao',
                bedrooms,
                value_percent: val,
                accumulated_12m: m['var_12m'] ?? null,  // Use DB value if present
                accumulated_year: ytd
            });
        }

        // --- VENDA ---
        if (dateMap.has('venda')) {
            const m = dateMap.get('venda')!;
            const val = m['var_mensal'] || 0;
            const ytd = getYTD(result.venda, year, val);

            result.venda.push({
                date: dateStr,
                year,
                month,
                type: 'venda',
                bedrooms,
                value_percent: val,
                accumulated_12m: m['var_12m'] ?? null,
                accumulated_year: ytd
            });
        }

        // --- YIELD ---
        if (dateMap.has('yield')) {
            const m = dateMap.get('yield')!;
            // DB has 'yield_mensal' (e.g. 0.4% -> 0.4 usually stored).
            // Logic:
            // value_percent -> Annualized Yield of this month = ((1 + yield_mo/100)^12 - 1) * 100
            // accumulated_12m -> Average of Annualized Yields (Last 12)
            // accumulated_year -> Average of Annualized Yields (YTD)

            // Assume DB yield_mensal is like 0.4 for 0.4%.
            // So convert to decimal: 0.4 / 100 = 0.004
            // (1.004)^12 = 1.049... => 4.9%
            const yieldMo = m['yield_mensal'] || 0;
            const yieldAnnual = (Math.pow(1 + (yieldMo / 100), 12) - 1) * 100;

            const avg12 = getAverage12m(result.yield, yieldAnnual);
            const avgYtd = getAverageYTD(result.yield, year, yieldAnnual);

            result.yield.push({
                date: dateStr,
                year,
                month,
                type: 'yield',
                bedrooms,
                value_percent: yieldAnnual,
                accumulated_12m: avg12,
                accumulated_year: avgYtd
            });
        }
    });

    // 6. Filter final result by requested startDate (we fetched earlier for YTD)
    // And Reverse to Newest First
    const filterAndReverse = (list: FipeZapDataPoint[]) =>
        list.filter(d => d.date >= startDate); // Keep Oldest -> Newest for Chart

    return {
        locacao: filterAndReverse(result.locacao),
        venda: filterAndReverse(result.venda),
        yield: filterAndReverse(result.yield)
    };
}
