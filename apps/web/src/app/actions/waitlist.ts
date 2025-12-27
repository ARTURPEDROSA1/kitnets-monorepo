"use server";

import { createClient } from "@/utils/supabase/server";
import { WaitlistData } from "@/components/waitlist/types";

export interface WaitlistResult {
    success: boolean;
    error?: string;
}

export async function submitWaitlist(data: WaitlistData): Promise<WaitlistResult> {
    const supabase = await createClient();

    const {
        profile,
        identity,
        portfolioSize,
        location,
        contact
    } = data;

    const payload = {
        profile_type: profile,
        cpf: identity.cpf || null,
        cnpj: identity.cnpj || null,
        business_name: identity.businessName || null,
        trade_name: identity.tradeName || null,
        portfolio_size: portfolioSize,
        city: location.city,
        state: location.state,
        zip_code: location.zip || null,
        street: location.street || null,
        number: location.number || null,
        complement: location.complement || null,
        neighborhood: location.neighborhood || null,
        partners_json: identity.partners ? JSON.stringify(identity.partners) : null,
        name: contact.name,
        email: contact.email,
        whatsapp: contact.whatsapp,
        status: 'pending'
    };

    try {
        const { error } = await supabase
            .from('waitlist_leads')
            .insert(payload);

        if (error) {
            console.error("Waitlist insert error:", error);
            return { success: false, error: "Erro ao salvar dados." };
        }

        return { success: true };
    } catch (err) {
        console.error("Unexpected error:", err);
        return { success: false, error: "Erro inesperado." };
    }
}
