"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export interface SaveFaqQuestionResponse {
    success: boolean;
    error?: string;
}

export async function saveFaqQuestion(data: { name?: string; email: string; question: string }): Promise<SaveFaqQuestionResponse> {
    const { name, email, question } = data;

    if (!email || !question) {
        return { success: false, error: "Email and question are required" };
    }

    const supabase = await createClient();

    try {
        const { error } = await supabase
            .from("faq_questions")
            .insert({
                name: name || null,
                email,
                question,
            });

        if (error) {
            console.error("Error saving faq question:", error);
            return { success: false, error: "Could not save question" };
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
