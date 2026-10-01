import { createStaticClient } from "@/utils/supabase/static";
import { sliceByDateRange } from "@/lib/date-range-rows";
import { cachedRead } from "@/lib/indexes";

export type MinimumWageData = {
    id: number;
    reference_date: string;
    amount_brl: number;
    variation_percent: number | null;
    legislation: string | null;
    remarks: string | null;
    year: number;
    month: number;
    is_projection: boolean;
};

/** The whole table, newest first (a few dozen rows). Throws on failure so `cachedRead` never stores it. */
async function _allMinimumWageRows(): Promise<MinimumWageData[]> {
    const supabase = createStaticClient();
    const { data, error } = await supabase
        .from('minimum_wage_history')
        .select('*')
        .order('reference_date', { ascending: false });
    if (error) throw new Error(`minimum_wage_history: ${error.message}`);
    return data as MinimumWageData[];
}

/**
 * The salário mínimo history between two dates (each bound optional), newest first. The table is
 * read once an hour into the data cache (`indices` tag, expired by the BCB cron) and the window is
 * sliced in memory: the index page is rendered per request and used to query Supabase every view.
 */
export async function getMinimumWageData(startDate?: string, endDate?: string): Promise<MinimumWageData[]> {
    const all = await cachedRead<MinimumWageData[]>(_allMinimumWageRows, ['minimum-wage-history'], []);
    return sliceByDateRange(all, startDate, endDate);
}
