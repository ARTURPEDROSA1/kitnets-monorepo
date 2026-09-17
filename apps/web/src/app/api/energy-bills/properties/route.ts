import { NextResponse } from "next/server";
import { notFound, readJsonBody, withAuth } from "@/lib/api-route";
import {
    getOwnerPropertiesSummary,
    type OwnerPropertySummary,
    type UcCategory,
} from "@/lib/energy-properties-server";
import { deletePropertyCascade } from "@/lib/energy-bills-server";

export type { OwnerPropertySummary, UcCategory };

export const dynamic = "force-dynamic";

const trimmed = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * GET /api/energy-bills/properties
 * The account's properties and standalone consumer units with their solar
 * configuration and bill statistics.
 */
export const GET = withAuth({ tag: "Energy Properties GET" }, async ({ userId }) => {
    const properties = await getOwnerPropertiesSummary(userId);
    return NextResponse.json({ success: true, properties });
});

/**
 * POST /api/energy-bills/properties
 * Adds a standalone consumer unit (own home, a relative's house, a beneficiary unit).
 */
export const POST = withAuth({ tag: "Energy Properties POST" }, async ({ req, profileId, supabase }) => {
    const body = await readJsonBody(req);
    const name = trimmed(body.name);
    if (!name) {
        return NextResponse.json({ error: "O nome da Unidade Consumidora é obrigatório." }, { status: 400 });
    }

    const category = trimmed(body.category) ?? "residencia_propria";
    const consumerUnit = trimmed(body.consumerUnit);
    const utilityCompany = trimmed(body.utilityCompany) ?? "CEMIG";
    const notes = trimmed(body.notes);

    const { data: newProp, error } = await supabase
        .from("properties")
        .insert({
            owner_id: profileId,
            name,
            address: trimmed(body.address),
            city: trimmed(body.city),
            state: trimmed(body.state),
            zip: trimmed(body.zip),
            electronic_id: JSON.stringify({ isStandaloneUc: true, category, ucNumber: consumerUnit, utilityCompany, notes }),
        })
        .select("id, name, address, city, state, zip, electronic_id")
        .single();

    if (error || !newProp) {
        console.error("[Energy Properties POST] Insert error:", error);
        return NextResponse.json({ error: error?.message || "Erro ao cadastrar UC avulsa" }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        property: {
            id: newProp.id,
            name: newProp.name,
            address: newProp.address,
            city: newProp.city,
            state: newProp.state,
            zip: newProp.zip,
            hasSolar: true,
            solarKwp: null,
            billsCount: 0,
            consumerUnit,
            utilityCompany,
            latestMonth: null,
            isStandaloneUc: true,
            ucCategory: category,
            notes,
        },
    });
});

/**
 * DELETE /api/energy-bills/properties?id=...
 * Deletes a property the account owns, with the cascade in lib/energy-bills-server.ts
 * (bills are orphaned, not deleted).
 */
export const DELETE = withAuth({ tag: "Energy Properties DELETE" }, async ({ req, profileId, supabase }) => {
    const propertyId = new URL(req.url).searchParams.get("id");
    if (!propertyId) {
        return NextResponse.json({ error: "ID da propriedade é obrigatório" }, { status: 400 });
    }

    const { data: prop } = await supabase
        .from("properties")
        .select("id")
        .eq("id", propertyId)
        .eq("owner_id", profileId)
        .maybeSingle();
    if (!prop) throw notFound("Propriedade não encontrada ou não autorizada");

    const { error } = await deletePropertyCascade(supabase, propertyId, "Energy Properties DELETE");
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
});
