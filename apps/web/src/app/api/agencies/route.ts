import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { agencyInputSchema } from "@/lib/schemas/agency";
import { agencyUniqueViolation, assertAgencyCnpjUnique, writeAgency } from "@/lib/agencies-server";
import { withSignedAgreement } from "@/lib/agency-agreement";
import { loadAgencyList } from "@/lib/agency-views-server";

type AgencyRecord = Record<string, unknown> & { service_agreement_url?: string | null };

/**
 * GET /api/agencies
 * Every agency the account is a member of, with the caller's role and a signed URL for the
 * (private) service agreement, plus the account's leases, tenants and corretores that name one
 * of them — what the Imobiliárias hub shows (lib/agency-views-server.ts).
 */
export const GET = withAuth({ tag: "Agencies GET" }, async ({ profileId, supabase }) => {
    return NextResponse.json(await loadAgencyList(supabase, profileId));
});

/**
 * POST /api/agencies
 * Creates an agency and makes the caller its OWNER. Validation: lib/schemas/agency.ts.
 */
export const POST = withAuth({ body: agencyInputSchema, tag: "Agencies POST" }, async ({ body, profileId, supabase }) => {
    await assertAgencyCnpjUnique(supabase, profileId, body.cnpj, {
        message: "Você já possui uma imobiliária com este CNPJ cadastrada em seu painel.",
    });

    const { agency, error } = await writeAgency(supabase, { ...body, status: "ACTIVE" });
    if (error || !agency) {
        console.error("[Agencies POST] Insert error:", error);
        const dup = agencyUniqueViolation(error);
        if (dup) return NextResponse.json({ errors: dup }, { status: 409 });
        return NextResponse.json({ error: error?.message || "Erro ao criar imobiliária." }, { status: 500 });
    }

    const { error: memberError } = await supabase
        .from("agency_members")
        .insert({ agency_id: agency.id, user_id: profileId, role: "OWNER" });
    if (memberError) {
        console.error("[Agencies POST] Member insert error:", memberError);
        await supabase.from("agencies").delete().eq("id", agency.id as string);
        return NextResponse.json({ error: "Erro ao criar vínculo com a imobiliária." }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        agency: await withSignedAgreement(supabase, { ...(agency as AgencyRecord), role: "OWNER" }),
    });
});
