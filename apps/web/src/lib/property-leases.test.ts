import { describe, expect, it } from "vitest";
import { pickPropertyLeases } from "./property-leases";

const lease = (id: string, unit_id: string | null, status: string, start_date: string) => ({ id, unit_id, status, start_date });

describe("pickPropertyLeases", () => {
    it("shows the lease in force of a property rented as a whole, else the latest", () => {
        const rows = [lease("new-expired", null, "EXPIRED", "2026-01-01"), lease("active", null, "ACTIVE", "2025-01-01"), lease("old", null, "TERMINATED", "2020-01-01")];
        expect(pickPropertyLeases(rows, [])).toEqual({ shown: [rows[1]], others: 2 });
        expect(pickPropertyLeases([rows[0], rows[2]], []).shown).toEqual([rows[0]]);
    });

    it("shows one lease per unit, in the order of the units", () => {
        const rows = [
            lease("b-active", "unit-b", "ACTIVE", "2026-05-01"),
            lease("a-expiring", "unit-a", "EXPIRING_SOON", "2026-03-01"),
            lease("gone", "unit-removed", "ACTIVE", "2026-02-01"),
            lease("a-old", "unit-a", "EXPIRED", "2024-03-01"),
        ];
        const { shown, others } = pickPropertyLeases(rows, ["unit-a", "unit-b"]);
        expect(shown.map(l => l.id)).toEqual(["a-expiring", "b-active", "gone"]);
        expect(others).toBe(1);
    });

    it("lists a whole-property lease beside the units only while it is in force", () => {
        const unit = lease("u", "unit-a", "ACTIVE", "2026-05-01");
        expect(pickPropertyLeases([unit, lease("w", null, "ACTIVE", "2025-01-01")], ["unit-a"]).shown.map(l => l.id)).toEqual(["w", "u"]);
        expect(pickPropertyLeases([unit, lease("w", null, "EXPIRED", "2025-01-01")], ["unit-a"])).toMatchObject({ shown: [unit], others: 1 });
    });

    it("has nothing to show without leases", () => {
        expect(pickPropertyLeases([], ["unit-a"])).toEqual({ shown: [], others: 0 });
    });
});
