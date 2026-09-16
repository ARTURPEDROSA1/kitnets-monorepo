import { NextResponse } from "next/server";
import { HttpError, notFound, withAuth } from "@/lib/api-route";
import { agencyInputSchema } from "@/lib/schemas/agency";
import {
    AGENCY_EDIT_ROLES,
    agencyUniqueViolation,
    assertAgencyCnpjUnique,
    requireAgencyRole,
    writeAgency,
} from "@/lib/agencies-server";
import { unpackAgencyMetadata } from "@/lib/agency-metadata";
import { withSignedAgreement } from "@/lib/agency-agreement";

type Params = { id: string };

/**
 * PUT /api/agencies/[id]
 * Updates an agency; OWNER or ADMIN only. Validation: lib/schemas/agency.ts.
 */
export const PUT = withAuth<typeof agencyInputSchema, Params>(
    { body: agencyInputSchema, tag: "Agencies PUT" },
    async ({ body, params, profileId, supabase }) => {
        const role = await requireAgencyRole(supabase, params.id, profileId, AGENCY_EDIT_ROLES, "Sem permissão para editar esta imobiliária.");
        await assertAgencyCnpjUnique(supabase, profileId, body.cnpj, {
            excludeAgencyId: params.id,
            message: "Você já possui outra imobiliária com este CNPJ cadastrada em seu painel.",
        });

        const { agency, error } = await writeAgency(supabase, body, params.id);
        if (error || !agency) {
            console.error("[Agencies PUT] Update error:", error);
            const dup = agencyUniqueViolation(error);
            if (dup) return NextResponse.json({ errors: dup }, { status: 409 });
            return NextResponse.json({ error: error?.message || "Erro ao atualizar imobiliária." }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            agency: await withSignedAgreement(
                supabase,
                unpackAgencyMetadata({ ...(agency as Record<string, unknown> & { service_agreement_url?: string | null }), role })
            ),
        });
    }
);

/**
 * DELETE /api/agencies/[id]
 * Soft-deletes an agency; OWNER only. Releases the CNPJ for re-registration.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Agencies DELETE" }, async ({ params, profileId, supabase }) => {
    await requireAgencyRole(supabase, params.id, profileId, ["OWNER"], "Apenas o proprietário pode excluir a imobiliária.");

    const { data: agency } = await supabase.from("agencies").select("id, deleted_at").eq("id", params.id).maybeSingle();
    if (!agency) throw notFound("Imobiliária não encontrada.");
    if (agency.deleted_at) throw new HttpError(409, { error: "Imobiliária já foi excluída." });

    const { error } = await supabase
        .from("agencies")
        .update({ deleted_at: new Date().toISOString(), deleted_by: profileId, cnpj: null })
        .eq("id", params.id);

    if (error) {
        console.error("[Agencies DELETE] Error:", error);
        return NextResponse.json({ error: "Erro ao excluir imobiliária." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
});
