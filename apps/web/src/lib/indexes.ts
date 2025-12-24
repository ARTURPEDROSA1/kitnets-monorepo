
import { createClient } from "@/utils/supabase/server";

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
    const supabase = await createClient();
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
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("economic_index_values")
        .select("*")
        .eq("index_id", indexId)
        .order("reference_date", { ascending: false })
        .limit(limit);

    if (error) {
        console.error(`Error fetching index values for ${indexId}:`, error);
        return [];
    }
    return data;
}

export async function getAllIndexes(): Promise<IndexMetadata[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("economic_indexes")
        .select("*")
        .order("code");

    if (error) {
        return [];
    }
    return data;
}
