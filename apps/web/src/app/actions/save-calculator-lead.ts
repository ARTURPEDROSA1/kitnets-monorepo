"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export interface SaveCalculatorLeadResponse {
    success: boolean;
    error?: string;
}

export async function saveCalculatorLead(data: {
    name: string;
    email: string;
    calculatorType: string;
    location?: any;
}): Promise<SaveCalculatorLeadResponse> {
    const { name, email, calculatorType, location } = data;

    if (!email || !name) {
        return { success: false, error: "Name and Email are required" };
    }

    const supabase = await createClient();

    try {
        const { error } = await supabase
            .from("leads")
            .insert({
                name,
                email,
                source: calculatorType,
                location: location || {},
            });

        if (error) {
            console.error("Error saving calculator lead:", error);
            // Don't expose DB errors to client
            return { success: false, error: "Could not save your information. Please try again." };
        }

        // Set a persistent cookie to identify the user and avoid asking again
        (await cookies()).set("kitnets_lead_captured", "true", {
            maxAge: 60 * 60 * 24 * 365, // 1 year
            path: "/",
            httpOnly: false, // Accessible to clientJS if needed
        });

        return { success: true };
    } catch (err) {
        console.error("Unexpected error in saveCalculatorLead:", err);
        return { success: false, error: "An unexpected error occurred." };
    }
}
