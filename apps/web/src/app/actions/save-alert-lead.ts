"use server";

import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";

export interface SaveAlertLeadResponse {
    success: boolean;
    error?: string;
}

export interface AlertLeadData {
    name: string;
    email?: string;
    whatsapp?: string;
    index_type: string;
    locale: string;
    source_page: string;
    consent: boolean;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
}

export async function saveAlertLead(data: AlertLeadData): Promise<SaveAlertLeadResponse> {
    const { name, email, whatsapp, index_type, locale, source_page, consent, utm_source, utm_medium, utm_campaign } = data;

    // Validation
    if (!name || name.trim().length < 2) {
        return { success: false, error: "Informe seu nome (mínimo 2 caracteres)." };
    }

    if (!email && !whatsapp) {
        return { success: false, error: "Informe pelo menos e-mail ou WhatsApp." };
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, error: "E-mail inválido." };
    }

    if (whatsapp && whatsapp.replace(/\D/g, "").length < 10) {
        return { success: false, error: "WhatsApp inválido. Informe o número com DDD." };
    }

    if (!consent) {
        return { success: false, error: "Você precisa concordar com o recebimento de alertas." };
    }

    const supabase = await createClient();
    const timestamp = new Date().toISOString();
    const lowerEmail = email?.toLowerCase() || null;

    // Clean whatsapp to digits only with +55 prefix
    const cleanWhatsapp = whatsapp ? whatsapp.replace(/\D/g, "") : null;
    const formattedWhatsapp = cleanWhatsapp
        ? (cleanWhatsapp.startsWith("55") ? `+${cleanWhatsapp}` : `+55${cleanWhatsapp}`)
        : null;

    try {
        // Get IP-based location from headers
        const headerStore = await headers();
        const ipCountry = headerStore.get("x-vercel-ip-country") || headerStore.get("cf-ipcountry");
        const ipCity = headerStore.get("x-vercel-ip-city");
        const ipRegion = headerStore.get("x-vercel-ip-region");
        const userAgent = headerStore.get("user-agent") || "";

        const locationField = {
            country: ipCountry || undefined,
            city: ipCity || undefined,
            state: ipRegion || undefined,
            location_source: ipCountry ? "ip_header" : "unknown",
        };

        // Check if lead already exists by email
        let existingLead = null;
        if (lowerEmail) {
            const { data: existing } = await supabase
                .from("leads")
                .select("id, source")
                .eq("email", lowerEmail)
                .limit(1);
            existingLead = existing && existing.length > 0 ? existing[0] : null;
        }

        if (existingLead) {
            // Update existing lead
            const updatePayload: Record<string, unknown> = {
                last_seen_at: timestamp,
                page_url: source_page,
                user_agent: userAgent,
                location: locationField,
                consent_newsletter: true,
            };
            if (formattedWhatsapp) {
                updatePayload.whatsapp = formattedWhatsapp;
            }
            if (utm_source) updatePayload.utm_source = utm_source;
            if (utm_medium) updatePayload.utm_medium = utm_medium;
            if (utm_campaign) updatePayload.utm_campaign = utm_campaign;

            const { error } = await supabase
                .from("leads")
                .update(updatePayload)
                .eq("email", lowerEmail);

            if (error) {
                console.error("Error updating alert lead:", error);
                return { success: false, error: "Erro ao salvar. Tente novamente." };
            }
        } else {
            // Insert new lead
            const insertPayload: Record<string, unknown> = {
                name: name.trim(),
                email: lowerEmail,
                whatsapp: formattedWhatsapp,
                source: `${index_type.toLowerCase()}_alert`,
                lead_type: "index_alert",
                page_url: source_page,
                user_agent: userAgent,
                locale,
                consent_newsletter: consent,
                first_seen_at: timestamp,
                location: locationField,
            };
            if (utm_source) insertPayload.utm_source = utm_source;
            if (utm_medium) insertPayload.utm_medium = utm_medium;
            if (utm_campaign) insertPayload.utm_campaign = utm_campaign;

            const { error } = await supabase
                .from("leads")
                .insert(insertPayload);

            if (error) {
                console.error("Error inserting alert lead:", error);
                return { success: false, error: "Erro ao salvar. Tente novamente." };
            }
        }

        return { success: true };
    } catch (err) {
        console.error("Unexpected error in saveAlertLead:", err);
        return { success: false, error: "Erro inesperado. Tente novamente." };
    }
}
