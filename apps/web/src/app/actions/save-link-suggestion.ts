"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export interface SaveLinkSuggestionResponse {
    success: boolean;
    error?: string;
}

export async function saveLinkSuggestion(data: { name: string; email: string; url: string; description?: string }): Promise<SaveLinkSuggestionResponse> {
    const { name, email, url, description } = data;

    if (!email || !url || !name) {
        return { success: false, error: "Missing required fields" };
    }

    const supabase = await createClient();

    try {
        const { error } = await supabase
            .from("useful_link_suggestions")
            .insert({
                name,
                email,
                url,
                description: description || null,
            });

        if (error) {
            console.error("Error saving link suggestion:", error);
            return { success: false, error: "Could not save suggestion" };
        }

        (await cookies()).set("kitnets_user_identified", "true", {
            maxAge: 60 * 60 * 24 * 365, // 1 year
            path: "/",
            httpOnly: false,
        });

        return { success: true };
    } catch (err) {
        console.error("Unexpected error:", err);
        return { success: false, error: "An unexpected error occurred" };
    }
}
