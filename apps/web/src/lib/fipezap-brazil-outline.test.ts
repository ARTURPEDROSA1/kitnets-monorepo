import { describe, expect, it } from "vitest";
import { BRAZIL_OUTLINE_PATH, BRAZIL_VIEWBOX, projectBrazil } from "./fipezap-brazil-outline";
import { FIPEZAP_CITY_LIST } from "./fipezap-cities";

describe("Brazil outline", () => {
    it("is a closed path whose vertices all fall inside the viewBox", () => {
        expect(BRAZIL_OUTLINE_PATH.startsWith("M")).toBe(true);
        expect(BRAZIL_OUTLINE_PATH.endsWith("Z")).toBe(true);
        const nums = BRAZIL_OUTLINE_PATH.slice(1, -1).split("L").map(p => p.split(" ").map(Number));
        expect(nums.length).toBeGreaterThan(150);
        for (const [x, y] of nums) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(BRAZIL_VIEWBOX.width); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(BRAZIL_VIEWBOX.height); }
    });
    it("projects every catalogued city inside the viewBox, north above south and west left of east", () => {
        for (const c of FIPEZAP_CITY_LIST) {
            const { x, y } = projectBrazil(c.lat as number, c.lng as number);
            expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(BRAZIL_VIEWBOX.width);
            expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(BRAZIL_VIEWBOX.height);
        }
        const manaus = projectBrazil(-3.119, -60.0217), portoAlegre = projectBrazil(-30.0346, -51.2177), recife = projectBrazil(-8.0476, -34.877);
        expect(manaus.y).toBeLessThan(portoAlegre.y);
        expect(manaus.x).toBeLessThan(recife.x);
    });
});
