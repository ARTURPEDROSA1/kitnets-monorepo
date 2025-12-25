"use server";

import { createStaticClient } from "@/utils/supabase/static";
import { IndexValue } from "@/lib/indexes";

export async function getEconomicData(indexCode: string, startDate?: string) {
    const supabase = createStaticClient();

    // 1. Get Index ID
    const { data: indexMeta } = await supabase
        .from("economic_indexes")
        .select("id")
        .eq("code", indexCode.toUpperCase())
        .single();

    if (!indexMeta) {
        throw new Error(`Index not found: ${indexCode}`);
    }

    // 2. Query values
    // We get all values since Jan 2023 (or earlier if needed) to ensure we cover the range.
    // The user mentioned data starts Jan 2023.
    let query = supabase
        .from("economic_index_values")
        .select("*")
        .eq("index_id", indexMeta.id)
        .order("reference_date", { ascending: true });

    if (startDate) {
        // Fetch slightly before start date to ensure we have context if needed, 
        // though usually we need data *after* start date for readjustment.
        // Actually, for a contract starting Jan 2023, the first adjustment is Jan 2024.
        // The index accumulation for Jan 2024 usually uses Jan 2023-Dec 2023 data.
        query = query.gte("reference_date", "2023-01-01");
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(error.message);
    }

    return data as IndexValue[];
}
