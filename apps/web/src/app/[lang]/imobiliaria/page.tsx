import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { getDictionary } from "../../../dictionaries";
import ImobiliariaContent from "./ImobiliariaContent";
import { unpackAgencyMetadata } from "@/lib/agency-metadata";
import { withSignedAgreement } from '@/lib/agency-agreement';
import type { AgencyWithRole } from "@/types/agency";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: 'Imobiliária',
        description: 'Cadastre e gerencie sua imobiliária no Kitnets.com.',
    };
}

async function getInitialAgencies(): Promise<AgencyWithRole[]> {
    try {
        const { userId } = await auth();
        if (!userId) return [];

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return [];
        const supabase = createClient(url, key);

        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('clerk_id', userId)
            .maybeSingle();

        if (!profile) return [];

        const { data: memberships, error } = await supabase
            .from('agency_members')
            .select(`
                role,
                agencies!inner(*)
            `)
            .eq('user_id', profile.id)
            .is('agencies.deleted_at', null);

        if (error || !memberships || memberships.length === 0) return [];

        type MembershipRow = {
            role?: string | null;
            agencies?: (Record<string, unknown> & { service_agreement_url?: string | null }) | null;
        };
        return (await Promise.all(
            (memberships as unknown as MembershipRow[])
                .filter((m) => m.agencies)
                .map((m) =>
                    // Agreements live in a private bucket: hand out a signed URL
                    withSignedAgreement(
                        supabase,
                        unpackAgencyMetadata({
                            ...m.agencies,
                            role: m.role || 'VIEWER',
                        })
                    )
                )
        )) as AgencyWithRole[];
    } catch (e) {
        console.error('[ImobiliariaPage] Error fetching initial agencies:', e);
        return [];
    }
}

export default async function ImobiliariaPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const initialAgencies = await getInitialAgencies();

    return <ImobiliariaContent lang={lang} initialAgencies={initialAgencies} />;
}
