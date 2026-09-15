import { describe, expect, it } from "vitest";
import { availabilityKwhForClass, resolveAvailabilityKwh } from "./energy-availability";

describe("availabilityKwhForClass", () => {
    it("maps the three connection types, accents or not", () => {
        expect(availabilityKwhForClass("Residencial Monofásico")).toBe(30);
        expect(availabilityKwhForClass("RESIDENCIAL BIFASICO")).toBe(50);
        expect(availabilityKwhForClass("Comercial Trifásico")).toBe(100);
    });

    it("returns null when the class says nothing about phases", () => {
        expect(availabilityKwhForClass("Residencial")).toBeNull();
        expect(availabilityKwhForClass(null)).toBeNull();
    });
});

describe("resolveAvailabilityKwh", () => {
    it("prefers the value stated on the bill", () => {
        expect(resolveAvailabilityKwh(50, "Residencial Trifásico")).toBe(50);
        expect(resolveAvailabilityKwh("100", null)).toBe(100);
    });

    it("falls back to the connection type, then to single-phase", () => {
        expect(resolveAvailabilityKwh(null, "Residencial Trifásico")).toBe(100);
        expect(resolveAvailabilityKwh(0, "Residencial Bifásico")).toBe(50);
        expect(resolveAvailabilityKwh(null, null)).toBe(30);
    });
});
