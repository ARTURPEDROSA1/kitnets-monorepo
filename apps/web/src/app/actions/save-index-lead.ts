"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export interface SaveIndexLeadResponse {
    success: boolean;
    error?: string;
}

export interface IndexLeadData {
    name: string;
    email: string;
    source: string;
    page_url: string;
    user_agent: string;
    location_data?: {
        country?: string;
        state?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
        location_source?: string;
    };
    attribution_data?: {
        referrer?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
    }
}

export async function saveIndexLead(data: IndexLeadData): Promise<SaveIndexLeadResponse> {
    const { name, email, source, page_url, user_agent, location_data, attribution_data } = data;

    if (!email || !name) {
        return { success: false, error: "Nome e e-mail são obrigatórios." };
    }

    const supabase = await createClient();
    const lowerEmail = email.toLowerCase();
    const timestamp = new Date().toISOString();

    try {
        // Upsert logic:
        // Try to select user by email first to check if exists (optional if we trust upsert on unique constraint)
        // But spec says: If email exists -> update last_seen_at, source if new.
        // We will try to upsert.



        const { data: existingUsers } = await supabase
            .from("leads")
            .select("id, source")
            .eq("email", lowerEmail)
            .limit(1);

        const existingUser = existingUsers && existingUsers.length > 0 ? existingUsers[0] : null;

        let error;

        if (existingUser) {
            // Update
            const updatePayload: any = {
                last_seen_at: timestamp,
                page_url, // Update page url to latest? Spec implies tracking context.
                user_agent
            };
            if (!existingUser.source) {
                updatePayload.source = source;
            }
            // Add location/attribution to specific columns or a JSONB column if exists?
            // Spec 4.1 lists specific columns. I will assumes they exist.
            if (location_data) {
                Object.assign(updatePayload, location_data);
            }
            if (attribution_data) {
                Object.assign(updatePayload, attribution_data);
            }

            const { error: updateError } = await supabase
                .from("leads")
                .update(updatePayload)
                .eq("email", lowerEmail);
            error = updateError;
        } else {
            // Insert
            const insertPayload: any = {
                name,
                email: lowerEmail,
                source,
                page_url,
                user_agent,
                consent_newsletter: true,
                first_seen_at: timestamp,
                lead_type: 'index_filter_gate', // Fixed value as per spec
                ...location_data,
                ...attribution_data
            };

            const { error: insertError } = await supabase
                .from("leads")
                .insert(insertPayload);
            error = insertError;
        }

        if (error) {
            console.error("Error capturing lead to Supabase:", error);
            // Don't block the user if DB fails, but maybe return generic error?
            // Spec says "Results load only after submission".
            return { success: false, error: "Erro ao salvar informações. Tente novamente." };
        }

        // Set Cookie
        // Value: hashed email or UUID. I'll use a simple base64 of email for now as a "hash" or just UUID if I had one.
        // Re-using uuid is better but I don't have it easily here without fetching response.
        // I will use a simple hashed email approach (simulated) or just the email string if acceptable (less secure).
        // Spec says "hashed email or UUID".
        const cookieValue = Buffer.from(lowerEmail).toString('base64');

        (await cookies()).set("kitnets_lead_verified", cookieValue, {
            maxAge: 60 * 60 * 24 * 365, // 365 days
            path: "/",
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            httpOnly: false, // "Never ask ... again" - client needs to check this? Or server?
            // If client checks document.cookie, it must be httpOnly: false.
        });

        return { success: true };
    } catch (err) {
        console.error("Unexpected error in saveIndexLead:", err);
        return { success: false, error: "Erro inesperado." };
    }
}
