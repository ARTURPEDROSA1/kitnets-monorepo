import { createStaticClient } from "@/utils/supabase/static";

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

export async function getMinimumWageData(startDate?: string, endDate?: string): Promise<MinimumWageData[]> {
    const supabase = createStaticClient();
    let query = supabase
        .from('minimum_wage_history')
        .select('*')
        .order('reference_date', { ascending: false });

    if (startDate) {
        query = query.gte('reference_date', startDate);
    }
    if (endDate) {
        query = query.lte('reference_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching minimum wage data:', error);
        return [];
    }

    return data as MinimumWageData[];
}
