
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
    accumulated_year: number | null;
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

    // Process data to add accumulated fields
    const enrichedData = data.map((item, index, arr) => {
        // --- Accumulated 12m Calculation ---
        let accumulated12m: number | null = null;
        if (index + 12 <= arr.length) {
            const window12m = arr.slice(index, index + 12);
            const accDecimal12m = window12m.reduce((acc, curr) => {
                return acc * (1 + (curr.value_percent / 100));
            }, 1);
            accumulated12m = parseFloat(((accDecimal12m - 1) * 100).toFixed(2));
        }

        // --- Accumulated Year (YTD) Calculation ---
        // Sum from Jan of the item's year up to the item's month
        // Since list is DESC, we look ahead for same year until we hit Jan or end of same year data
        const currentYear = item.year;
        let accumulatedYear: number | null = null;

        // Find all records belonging to the same year that are "older or equal" to current item
        // In a DESC list, these are items at current index and subsequent indices that match year
        const yearRecords = [];
        for (let i = index; i < arr.length; i++) {
            if (arr[i].year === currentYear) {
                yearRecords.push(arr[i]);
                // If we hit January, we have the full set for YTD up to this month
                if (arr[i].month === 1) break;
            } else {
                // Entered a different year, stop
                break;
            }
        }

        // Only calculate if we found records
        if (yearRecords.length > 0) {
            // Check if we actually reached January or if it's the oldest available data for that year ???
            // For strict YTD, ideally we want to know we have data back to Jan. 
            // But if data starts in Feb, YTD is just Feb...Current. 
            // Let's assume we sum whatever we found for that year up to the current month.
            // Reverse because reduce (1+m1)... works typically in time order, but multiplication is commutative so order doesn't matter for simple compound.
            // product(1+r)

            const accDecimalYear = yearRecords.reduce((acc, curr) => {
                return acc * (1 + (curr.value_percent / 100));
            }, 1);
            accumulatedYear = parseFloat(((accDecimalYear - 1) * 100).toFixed(2));
        }

        return {
            ...item,
            accumulated_12m: accumulated12m ?? item.accumulated_12m,
            accumulated_year: accumulatedYear ?? item.accumulated_year
        };
    });


    // Return only the requested amount
    return enrichedData.slice(0, limit);
}

export async function getIndexValuesByDateRange(indexId: string, startDate?: string, endDate?: string): Promise<IndexValue[]> {
    const supabase = createStaticClient();

    // Base query
    let query = supabase
        .from("economic_index_values")
        .select("*")
        .eq("index_id", indexId)
        .order("reference_date", { ascending: false });

    // Apply date filters if provided
    // IMPORTANT: To calculate YTD and 12m correctly, we need extra data BEFORE the startDate.
    // 12m needs 1 year back.
    // YTD needs back to January of the year of the startDate.



    if (startDate) {
        const start = new Date(startDate);
        // Go back 12 months for 12m calc
        const priorMsg = new Date(start);
        priorMsg.setMonth(start.getMonth() - 12);

        // Also ensure we cover Jan of the start year for YTD
        // If priorMsg is later than Jan 1 of start year, we're fine (Jan 1 is covered). 
        // If priorMsg is earlier, that's also fine (we have even more data).
        // Actually, if startDate is e.g. Feb 2024, Jan 1st 2024 is < Feb 2024.
        // 12 months prior to Feb 2024 is Feb 2023. This covers Jan 2024. 
        // So fetching 12 months prior is usually enough for YTD unless startDate is very old and we only fetched 12 months? 
        // No, we fetch GTE priorDate.

        const priorDateStr = priorMsg.toISOString().split('T')[0];

        query = query.gte("reference_date", priorDateStr);
    }

    if (endDate) {
        query = query.lte("reference_date", endDate);
    }

    // Default limit if no dates (fallback)
    if (!startDate && !endDate) {
        query = query.limit(72); // 60 + 12 buffer
    }

    const { data, error } = await query;

    if (error) {
        console.error(`Error fetching index values for ${indexId}:`, error);
        return [];
    }

    // Calculate accumulated values
    const enrichedData = data.map((item, index, arr) => {
        // --- Accumulated 12m ---
        let accumulated12m: number | null = null;
        if (index + 12 <= arr.length) {
            const window = arr.slice(index, index + 12);
            const accumulatedDecimal = window.reduce((acc, curr) => {
                return acc * (1 + (curr.value_percent / 100));
            }, 1);
            accumulated12m = parseFloat(((accumulatedDecimal - 1) * 100).toFixed(2));
        }

        // --- Accumulated Year (YTD) ---
        const currentYear = item.year;
        let accumulatedYear: number | null = null;

        const yearRecords = [];
        for (let i = index; i < arr.length; i++) {
            if (arr[i].year === currentYear) {
                yearRecords.push(arr[i]);
                if (arr[i].month === 1) break;
            } else {
                break;
            }
        }

        if (yearRecords.length > 0) {
            const accDecimalYear = yearRecords.reduce((acc, curr) => {
                return acc * (1 + (curr.value_percent / 100));
            }, 1);
            accumulatedYear = parseFloat(((accDecimalYear - 1) * 100).toFixed(2));
        }

        return {
            ...item,
            accumulated_12m: accumulated12m ?? item.accumulated_12m,
            accumulated_year: accumulatedYear ?? item.accumulated_year
        };
    });

    // Filter out the buffer months if we fetched extra
    if (startDate) {
        return enrichedData.filter(item => item.reference_date >= startDate);
    }

    if (!startDate && !endDate) {
        return enrichedData.slice(0, 60);
    }

    return enrichedData;
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
