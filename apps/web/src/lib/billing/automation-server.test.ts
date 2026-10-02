import { describe, expect, it } from "vitest";
import { monthsBetween, plusDays, summarize, type RunReport } from "./automation-server";

describe("the daily run's window", () => {
    it("plusDays walks calendar days", () => {
        expect(plusDays("2026-10-15", 10)).toBe("2026-10-25");
        expect(plusDays("2026-10-25", 10)).toBe("2026-11-04");
        expect(plusDays("2026-12-31", 1)).toBe("2027-01-01");
        expect(plusDays("2026-02-20", 10)).toBe("2026-03-02");
    });

    it("monthsBetween lists every month a due date in the window can fall in", () => {
        expect(monthsBetween("2026-10-15", "2026-10-25")).toEqual(["2026-10"]);
        expect(monthsBetween("2026-10-25", "2026-11-04")).toEqual(["2026-10", "2026-11"]);
        expect(monthsBetween("2026-12-28", "2027-01-05")).toEqual(["2026-12", "2027-01"]);
    });
});

describe("summarize", () => {
    const report = (over: Partial<RunReport> = {}): RunReport => ({
        today: "2026-10-15",
        owners: [
            { owner_id: "a", reconciled: 3, generated: 1, issued: 1, sent: 1, errors: [] },
            { owner_id: "b", reconciled: 0, generated: 0, issued: 0, sent: 0, errors: ["emitir fatura nº 4: sem conexão"] },
        ],
        unreached: 0,
        ...over,
    });

    it("one line with the totals", () => {
        expect(summarize(report())).toBe("2 proprietário(s); 3 boleto(s) conciliado(s); 1 fatura(s) gerada(s); 1 emitida(s); 1 e-mail(s) enviado(s); 1 erro(s)");
    });

    it("says when the budget ran out", () => {
        expect(summarize(report({ unreached: 1 }))).toContain("tempo esgotado");
        expect(summarize(report({ owners: [{ owner_id: "a", reconciled: 1, generated: 0, issued: 0, sent: 0, errors: [], cut_short: true }] }))).toContain("tempo esgotado");
    });
});
