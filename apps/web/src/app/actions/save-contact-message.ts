"use server";

import { createClient } from "@/utils/supabase/server";

export interface SaveContactMessageResponse {
    success: boolean;
    error?: string;
}

export async function saveContactMessage(data: {
    name: string;
    email: string;
    subject: string;
    message: string
}): Promise<SaveContactMessageResponse> {
    const { name, email, subject, message } = data;

    if (!email || !message || !name) {
        return { success: false, error: "Missing required fields" };
    }

    const supabase = await createClient();

    try {
        const { error } = await supabase
            .from("contact_messages")
            .insert({
                name,
                email,
                subject: subject || "No Subject",
                message,
            });

        if (error) {
            console.error("Error saving contact message:", error);
            return { success: false, error: "Could not save message" };
        }

        return { success: true };
    } catch (err) {
        console.error("Unexpected error:", err);
        return { success: false, error: "An unexpected error occurred" };
    }
}
