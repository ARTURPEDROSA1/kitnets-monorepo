"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { HOUR, RATE_LIMITED_MESSAGE, rateLimitByIp } from "@/lib/rate-limit";

/**
 * Waitlist: name + email only. Saved to `waitlist_leads` so the person can be
 * notified when the platform opens to everyone. The old seven-step wizard
 * (profile, CPF/CNPJ, portfolio, address, WhatsApp) is gone; its columns stay
 * nullable in the table and are simply left empty.
 */

export type LeadSource = "home_hero" | "home_cta" | "lista_vip";

export interface LeadInput {
    name: string;
    email: string;
    source?: LeadSource;
    lang?: string;
}

export interface WaitlistResult {
    success: boolean;
    /** the email was already on the list: nothing new was saved */
    already?: boolean;
    error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCES: LeadSource[] = ["home_hero", "home_cta", "lista_vip"];

export async function submitWaitlist(input: LeadInput): Promise<WaitlistResult> {
    const limited = await rateLimitByIp("form:waitlist", 5, HOUR);
    if (!limited.ok) return { success: false, error: RATE_LIMITED_MESSAGE };

    const name = String(input?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const email = String(input?.email ?? "").trim().toLowerCase().slice(0, 200);
    if (name.length < 2) return { success: false, error: "Informe seu nome." };
    if (!EMAIL_REGEX.test(email)) return { success: false, error: "Informe um e-mail válido." };
    const source = SOURCES.includes(input?.source as LeadSource) ? (input.source as LeadSource) : "lista_vip";
    const lang = /^(pt|en|es)$/.test(input?.lang ?? "") ? (input.lang as string) : "pt";

    const supabase = createAdminClient();
    try {
        const { data: existing, error: lookupError } = await supabase
            .from("waitlist_leads")
            .select("id")
            .eq("email", email)
            .limit(1)
            .maybeSingle();
        if (lookupError) console.warn("[Waitlist] lookup failed, inserting anyway:", lookupError.message);
        if (existing) return { success: true, already: true };

        const { error } = await supabase.from("waitlist_leads").insert({
            profile_type: "nao_informado",
            name,
            email,
            status: "pending",
            source: `${source}:${lang}`,
        });
        if (error) {
            console.error("[Waitlist] insert error:", error.message);
            return { success: false, error: "Erro ao salvar dados." };
        }
        return { success: true };
    } catch (err) {
        console.error("[Waitlist] unexpected error:", err);
        return { success: false, error: "Erro inesperado." };
    }
}
