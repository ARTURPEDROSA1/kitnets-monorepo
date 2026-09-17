import { NextResponse } from "next/server";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { deletePropertyCascade } from "@/lib/energy-bills-server";

export const dynamic = "force-dynamic";

type PropertyRow = { id: string; name: string; electronic_id: string | null };

/**
 * POST /api/energy-bills/properties/sync-deletion
 * Called when a rental property is removed from the profile. Either deletes
 * the matching `properties` row with its cascade (`delete_all`, default) or
 * keeps it as a standalone consumer unit so energy monitoring continues
 * (`keep_energy`).
 */
export const POST = withAuth({ tag: "sync-deletion" }, async ({ req, profileId, supabase }) => {
    const body = await readJsonBody(req);
    const propertyId = typeof body.propertyId === "string" ? body.propertyId : null;
    const name = typeof body.name === "string" ? body.name : "";
    const address = typeof body.address === "string" ? body.address : "";
    const action = body.action === "keep_energy" ? "keep_energy" : "delete_all";

    let matched: PropertyRow | null = null;

    if (propertyId) {
        const { data } = await supabase
            .from("properties")
            .select("id, name, electronic_id")
            .eq("id", propertyId)
            .eq("owner_id", profileId)
            .maybeSingle();
        matched = (data as PropertyRow | null) ?? null;
    }

    if (!matched) {
        // Legacy fallback for profile properties that never got a properties-table id:
        // only an exact (case-insensitive) name or address match counts, and an
        // ambiguous match is treated as no match. Looser matching used to delete the
        // leases and tenants of an unrelated property.
        const normName = name.trim().toLowerCase();
        const normAddress = address.trim().toLowerCase();

        if (normName || normAddress) {
            const { data: ownerProps } = await supabase
                .from("properties")
                .select("id, name, address, electronic_id")
                .eq("owner_id", profileId);

            const candidates = (ownerProps ?? []).filter((p) => {
                const pName = ((p.name as string) || "").trim().toLowerCase();
                const pAddr = ((p.address as string) || "").trim().toLowerCase();
                return (normName !== "" && pName === normName) || (normAddress !== "" && pAddr === normAddress);
            });
            matched = candidates.length === 1 ? (candidates[0] as PropertyRow) : null;
        }
    }

    if (action === "keep_energy") {
        if (matched) {
            let current: Record<string, unknown> = {};
            try {
                current = matched.electronic_id ? JSON.parse(matched.electronic_id) : {};
            } catch {
                current = {};
            }

            await supabase
                .from("properties")
                .update({
                    electronic_id: JSON.stringify({
                        ...current,
                        isStandaloneUc: true,
                        category: current.category || "outro",
                        convertedFromRental: true,
                        convertedAt: new Date().toISOString(),
                        notes: current.notes || "Convertido de imóvel de aluguel removido",
                    }),
                })
                .eq("id", matched.id);

            return NextResponse.json({ success: true, action: "converted_to_standalone", propertyId: matched.id });
        }

        const { data: created, error } = await supabase
            .from("properties")
            .insert({
                owner_id: profileId,
                name: name || address || "UC Avulsa",
                address: address || null,
                electronic_id: JSON.stringify({
                    isStandaloneUc: true,
                    category: "outro",
                    convertedFromRental: true,
                    convertedAt: new Date().toISOString(),
                    notes: "Criado como UC Avulsa após remoção do imóvel de aluguel",
                }),
            })
            .select("id")
            .single();
        if (error) console.error("[sync-deletion] Error creating standalone UC:", error);

        return NextResponse.json({ success: true, action: "created_standalone", propertyId: created?.id });
    }

    if (!matched) {
        return NextResponse.json({ success: true, action: "none_needed", message: "Imóvel não constava na tabela de energia." });
    }

    const { error } = await deletePropertyCascade(supabase, matched.id, "sync-deletion");
    if (error) {
        console.error("[sync-deletion] Properties delete error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: "deleted", propertyId: matched.id });
});
