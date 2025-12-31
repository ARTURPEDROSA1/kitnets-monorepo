"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export interface SaveCalculatorLeadResponse {
    success: boolean;
    error?: string;
}

export interface CalculatorLeadData {
    name: string;
    email: string;
    source: string; // calculator slug
    lead_type: string; // calculator_advanced_gate, calculator_export_gate, etc.
    page_url: string;
    location?: any;
    user_agent?: string;
    attribution_data?: {
        referrer?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
    };
    metadata?: {
        trigger_type?: string;
        interaction_count?: number;
        engaged_seconds?: number;
        export_type?: string;
    };
}

export async function saveCalculatorLead(data: CalculatorLeadData): Promise<SaveCalculatorLeadResponse> {
    const {
        name,
        email,
        source,
        lead_type,
        page_url,
        location,
        user_agent,
        attribution_data,
        metadata
    } = data;

    if (!email || !name) {
        return { success: false, error: "Name and Email are required" };
    }

    const supabase = await createClient();

    try {
        // Construct the payload matching the DB schema provided in the spec
        const payload = {
            name,
            email: email.toLowerCase(),
            source,
            lead_type,
            consent_newsletter: true,
            page_url,
            user_agent,
            referrer: attribution_data?.referrer,
            utm_source: attribution_data?.utm_source,
            utm_medium: attribution_data?.utm_medium,
            utm_campaign: attribution_data?.utm_campaign,
            location: location || {},
            location_source: location ? "gps" : undefined,
            trigger_type: metadata?.trigger_type,
            interaction_count: metadata?.interaction_count,
            engaged_seconds: metadata?.engaged_seconds,
            export_type: metadata?.export_type,
            last_seen_at: new Date().toISOString(),
            // We let Supabase handle created_at and id
        };

        // Perform upsert based on email
        const { error } = await supabase
            .from("leads")
            .upsert(payload, { onConflict: "email" });

        if (error) {
            console.error("Error saving calculator lead:", error);
            return { success: false, error: "Could not save your information. Please try again." };
        }

        // Set the verified cookie
        const cookieStore = await cookies();
        cookieStore.set("kitnets_lead_verified", "true", {
            maxAge: 60 * 60 * 24 * 365, // 365 days
            path: "/",
            httpOnly: false, // Accessible to clientJS logic if needed (e.g. checking if it exists)
            secure: true,
            sameSite: "lax",
        });

        return { success: true };
    } catch (err) {
        console.error("Unexpected error in saveCalculatorLead:", err);
        return { success: false, error: "An unexpected error occurred." };
    }
}
