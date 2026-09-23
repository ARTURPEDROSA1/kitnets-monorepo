import { describe, expect, it } from "vitest";
import { brToISO, isoToBR, maskBR } from "./date-input";

describe("DateInput helpers", () => {
    it("shows ISO the Brazilian way", () => {
        expect(isoToBR("2026-03-17")).toBe("17/03/2026");
        expect(isoToBR("2026-03-17T00:00:00Z")).toBe("17/03/2026");
        expect(isoToBR("2034-01", "month")).toBe("01/2034");
        expect(isoToBR("2034-01-01", "month")).toBe("01/2034");
        expect(isoToBR(null)).toBe("");
        expect(isoToBR("junk")).toBe("");
    });

    it("masks as the user types", () => {
        expect(maskBR("1")).toBe("1");
        expect(maskBR("17")).toBe("17");
        expect(maskBR("170")).toBe("17/0");
        expect(maskBR("1703")).toBe("17/03");
        expect(maskBR("17032026")).toBe("17/03/2026");
        expect(maskBR("17/03/2026extra9")).toBe("17/03/2026");
        expect(maskBR("012034", "month")).toBe("01/2034");
    });

    it("turns a complete real date back into ISO, and nothing else", () => {
        expect(brToISO("17/03/2026")).toBe("2026-03-17");
        expect(brToISO("29/02/2028")).toBe("2028-02-29");
        expect(brToISO("29/02/2027")).toBeNull();
        expect(brToISO("31/04/2026")).toBeNull();
        expect(brToISO("17/13/2026")).toBeNull();
        expect(brToISO("17/03/20")).toBeNull();
        expect(brToISO("")).toBeNull();
        expect(brToISO("01/2034", "month")).toBe("2034-01");
        expect(brToISO("13/2034", "month")).toBeNull();
    });
});
