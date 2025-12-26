
import { createStaticClient } from "@/utils/supabase/static";

export type IndexMetadata = {
    id: string;
    code: string;
    name: string;
    source: string;
    frequency: string;
    category: string;
    is_official: boolean;
};

export type IndexValue = {
    id: string;
    year: number;
    month: number;
    reference_date: string;
    value_percent: number;
    accumulated_12m: number | null;
    is_projection: boolean;
    source_url: string | null;
};

export async function getIndexMetadata(code: string): Promise<IndexMetadata | null> {
    const supabase = createStaticClient();
    const { data, error } = await supabase
        .from("economic_indexes")
        .select("*")
        .eq("code", code.toUpperCase())
        .single();

    if (error) {
        console.error(`Error fetching index metadata for ${code}:`, error);
        return null;
    }
    return data;
}

export async function getIndexValues(indexId: string, limit = 36): Promise<IndexValue[]> {
    const supabase = createStaticClient();
    // Fetch extra months to calculate 12-month accumulated for the oldest requested records
    const fetchLimit = limit + 12;

    const { data, error } = await supabase
        .from("economic_index_values")
        .select("*")
        .eq("index_id", indexId)
        .order("reference_date", { ascending: false })
        .limit(fetchLimit);

    if (error) {
        console.error(`Error fetching index values for ${indexId}:`, error);
        return [];
    }

    // Calculate accumulated 12m on the fly
    const enrichedData = data.map((item, index, arr) => {
        // We need current month + 11 previous months (total 12)
        // Since array is sorted DESC, we look ahead.
        if (index + 12 > arr.length) {
            // Not enough data for 12m accumulation
            return item;
        }

        const window = arr.slice(index, index + 12);

        // Accumulate: (1 + m1) * (1 + m2) ... - 1
        const accumulatedDecimal = window.reduce((acc, curr) => {
            return acc * (1 + (curr.value_percent / 100));
        }, 1);

        const accumulated12m = (accumulatedDecimal - 1) * 100;

        return {
            ...item,
            accumulated_12m: parseFloat(accumulated12m.toFixed(2))
        };
    });

    // Return only the requested amount
    return enrichedData.slice(0, limit);
}

export async function getAllIndexes(): Promise<IndexMetadata[]> {
    const supabase = createStaticClient();
    const { data, error } = await supabase
        .from("economic_indexes")
        .select("*")
        .order("code");

    if (error) {
        return [];
    }
    return data;
}
