"use server";

import { createClient } from "@/utils/supabase/server";

export interface SaveLeadResponse {
    success: boolean;
    error?: string;
}

export async function saveLead(data: { name: string; email: string; source: string }): Promise<SaveLeadResponse> {
    const { name, email, source } = data;

    if (!email) {
        return { success: false, error: "Email is required" };
    }

    const supabase = await createClient();

    try {
        const { error } = await supabase
            .from("leads")
            .insert({
                name,
                email,
                source: source || "unknown",
            });

        if (error) {
            console.error("Error capturing lead:", error);
            return { success: false, error: "Could not save lead" };
        }

        return { success: true };
    } catch (err) {
        console.error("Unexpected error:", err);
        return { success: false, error: "An unexpected error occurred" };
    }
}
