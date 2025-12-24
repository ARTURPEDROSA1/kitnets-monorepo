"use server";

import { createClient } from "@/utils/supabase/server";

export interface SaveSuggestionResponse {
    success: boolean;
    error?: string;
}

export async function saveCalculatorSuggestion(data: { suggestion: string; email?: string; location: string }): Promise<SaveSuggestionResponse> {
    const { suggestion, email, location } = data;

    if (!suggestion) {
        return { success: false, error: "Suggestion is required" };
    }

    const supabase = await createClient();

    try {
        const { error } = await supabase
            .from("calculator_suggestions")
            .insert({
                suggestion,
                email: email || null,
                location: location || "unknown",
            });

        if (error) {
            console.error("Error saving suggestion:", error);
            return { success: false, error: "Could not save suggestion" };
        }

        return { success: true };
    } catch (err) {
        console.error("Unexpected error:", err);
        return { success: false, error: "An unexpected error occurred" };
    }
}
