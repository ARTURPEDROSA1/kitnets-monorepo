import type { AdminSupabase } from "@/lib/api-auth";
import { conflict } from "@/lib/api-route";
import type { PropertyInput } from "@/lib/schemas/property";
import { formatCEP } from "@/lib/validators";

/**
 * Registers a rental property outside the Imóveis wizard.
 *
 * A property lives in two places that must agree: a `properties` row (what
 * leases, tenants, bills and ledgers point to) and the profile JSON the
 * Imóveis page renders (`property_details`/`property_address` for the first
 * one, `additional_properties[]` for the rest). Writing only the row would
 * leave a property that contracts can use but the user cannot see or edit.
 */

/** Same defaults as `emptyPropertyDetails('single')` in ProfileContent. */
const emptyPropertyDetails = (propertyName: string) => ({
    propertyName, cadastroImobiliario: "", inscricaoImobiliaria: "", matricula: "",
    areaLote: "", areaEdificada: "", numberOfUnits: 0, totalSqMeters: "",
    solarEnergy: false, solarKwp: "", mainMeters: { water: false, energy: false, gas: false }, internetBill: false,
    rooms: "", bedrooms: "", bathrooms: "", parkingSpaces: "1",
    kitchenCabinets: false, laundry: "none", ac: "none", cooktop: "none",
});

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

export async function createRentalProperty(
    supabase: AdminSupabase,
    profileId: string,
    input: PropertyInput
): Promise<{ id: string; name: string }> {
    const [{ data: existing }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from("properties").select("id, name, electronic_id").eq("owner_id", profileId),
        supabase.from("profiles").select("property_details, property_address, additional_properties").eq("id", profileId).single(),
    ]);
    if (profileError || !profile) throw new Error(`profile lookup failed: ${profileError?.message}`);

    // The Imóveis page pairs rows and profile entries by name, so names must stay unique.
    const wanted = input.name.toLowerCase();
    if ((existing || []).some((p) => !isStandaloneUc(p.electronic_id) && (p.name as string).trim().toLowerCase() === wanted)) {
        throw conflict({ name: "Já existe um imóvel com este nome." });
    }

    const addressLine = input.street
        ? `${input.street}, ${input.street_number || ""} - ${input.neighborhood || ""}`.trim()
        : null;
    const { data: row, error } = await supabase
        .from("properties")
        .insert({
            owner_id: profileId,
            name: input.name,
            address: addressLine,
            city: input.city,
            state: input.state,
            zip: input.postal_code ? formatCEP(input.postal_code) : null,
        })
        .select("id, name")
        .single();
    if (error || !row) throw new Error(`property insert failed: ${error?.message}`);

    const address = {
        cep: input.postal_code ? formatCEP(input.postal_code) : "",
        street: input.street ?? "",
        number: input.street_number ?? "",
        city: input.city ?? "",
        state: input.state ?? "",
        neighborhood: input.neighborhood ?? "",
        complement: input.address_complement ?? "",
        description: "",
    };

    const primaryDetails = profile.property_details as Record<string, unknown> | null;
    const primaryAddress = profile.property_address as Record<string, unknown> | null;
    const primaryTaken =
        (typeof primaryDetails?.propertyName === "string" && primaryDetails.propertyName.trim() !== "") ||
        (typeof primaryAddress?.street === "string" && primaryAddress.street.trim() !== "");

    const update = primaryTaken
        ? {
              additional_properties: [
                  ...(Array.isArray(profile.additional_properties) ? profile.additional_properties : []),
                  {
                      id: row.id,
                      propertyType: "single",
                      details: emptyPropertyDetails(input.name),
                      subUnits: [],
                      address,
                      savedPhotos: [],
                      savedVideos: [],
                      savedProofs: [],
                      profilePhotoUrl: null,
                      isSavedProperty: true,
                  },
              ],
          }
        : {
              property_type: "single",
              property_details: { ...emptyPropertyDetails(input.name), isSavedProperty: true },
              property_address: address,
          };

    const { error: updateError } = await supabase.from("profiles").update(update).eq("id", profileId);
    if (updateError) {
        // Never leave a row the Imóveis page cannot show.
        await supabase.from("properties").delete().eq("id", row.id).eq("owner_id", profileId);
        throw new Error(`profile property update failed: ${updateError.message}`);
    }

    return { id: row.id as string, name: row.name as string };
}
