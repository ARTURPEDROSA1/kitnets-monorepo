/**
 * How a property is registered on Imóveis: a single-family one (a house, an apartment, a lot), a
 * multi-unit building (kitnets, each unit with its own lease) or a garage — a parking space rented on
 * its own, in a street house or in an apartment building.
 *
 * A garage is rented whole, to one tenant, so the ledgers, the lease and the property page treat it
 * like a single-family property: `multi` is the only type that changes how units, condominium and
 * IPTU are counted. What differs for a garage is what the cadastro asks and how the property is named.
 */
export type PropertyType = "single" | "multi" | "garage";

/** Whatever the profile JSON holds, as a type: anything unknown (or missing) is a single-family property. */
export const parsePropertyType = (v: unknown): PropertyType => (v === "multi" || v === "garage" ? v : "single");

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = { single: "Unifamiliar", multi: "Multifamiliar", garage: "Garagem" };

/** Baseline guesses for a garage with nothing typed yet (the cards label them "estimativa base"). */
export const GARAGE_BASELINE = { rentPerSpace: 200, iptuMonthly: 15 };

/** The garage's own fields of the property details (components/profile/PropertyDetailsCard.tsx). */
export interface GarageFields {
    /** how many spaces the garage has */
    parkingSpaces?: string;
    /** the garage of a street house, or a space in a building / condominium */
    garageLocation?: "house" | "building" | "";
    garageCover?: "covered" | "uncovered" | "";
    /** how the building identifies the space: "Vaga 23 · G2" */
    garageSpotLabel?: string;
    garageElectricGate?: boolean;
}

export const GARAGE_LOCATION_LABELS: Record<"house" | "building", string> = { house: "Casa de rua", building: "Prédio / condomínio" };

/** Spaces of a garage: what was typed, never less than one. */
export function garageSpaces(details: Pick<GarageFields, "parkingSpaces">): number {
    const n = parseInt(details.parkingSpaces || "1", 10);
    return Number.isNaN(n) || n < 1 ? 1 : n;
}

/** "2 vagas · cobertas · Prédio / condomínio · Vaga 23 G2": the garage in one line, only what was filled in. */
export function garageSummary(details: GarageFields): string {
    const spaces = garageSpaces(details);
    const one = spaces === 1;
    return [
        `${spaces} ${one ? "vaga" : "vagas"}`,
        details.garageCover === "covered" ? (one ? "coberta" : "cobertas") : details.garageCover === "uncovered" ? (one ? "descoberta" : "descobertas") : null,
        details.garageLocation ? GARAGE_LOCATION_LABELS[details.garageLocation] : null,
        details.garageSpotLabel?.trim() || null,
    ].filter(Boolean).join(" · ");
}
