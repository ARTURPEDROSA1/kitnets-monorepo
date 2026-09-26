import { describe, expect, it } from "vitest";
import type { InvestmentCardSummary } from "./new-investment-metrics";
import type { NewInvestment } from "./new-investments";
import { mappableProjects, projectHubTotals } from "./project-hub";

const inv = (id: string, over: Partial<NewInvestment> = {}): NewInvestment => ({ id, name: id, status: "ACTIVE", promoted_property_id: null, ...over }) as unknown as NewInvestment;
const sum = (id: string, over: Partial<InvestmentCardSummary> = {}): InvestmentCardSummary => ({
    id, paidToDate: 0, committed: 0, paidPct: 0, remaining: 0, nextDueOn: null, nextDueAmount: 0, overdueCount: 0, monthsToKeys: null, keysOn: null, netYieldPct: null, documents: 0, coverUrl: null, photoUrls: [], saleNet: null, realizedGain: null,
    ...over,
});

describe("projectHubTotals", () => {
    it("adds the slice up and finds the earliest instalment", () => {
        const investments = [inv("a"), inv("b"), inv("c", { status: "SOLD" }), inv("d", { status: "COMPLETED", promoted_property_id: "p1" })];
        const summaries = {
            a: sum("a", { paidToDate: 100_000, committed: 300_000, remaining: 200_000, overdueCount: 2, nextDueOn: "2026-10-10", nextDueAmount: 5_000 }),
            b: sum("b", { paidToDate: 50_000, committed: 100_000, remaining: 50_000, nextDueOn: "2026-10-10", nextDueAmount: 2_500 }),
            c: sum("c", { paidToDate: 80_000, committed: 80_000, saleNet: 120_000, realizedGain: 40_000, nextDueOn: "2026-10-01" }),
            d: sum("d", { paidToDate: 20_000, committed: 20_000 }),
        };
        const t = projectHubTotals(investments, summaries);
        expect(t).toMatchObject({ count: 4, active: 2, completed: 1, sold: 1, paid: 250_000, committed: 500_000, remaining: 250_000, paidPct: 50, overdue: 2, nextDueOn: "2026-10-01", nextDueAmount: 0, saleNet: 120_000, realizedGain: 40_000 });
        const live = projectHubTotals(investments.filter(i => i.status === "ACTIVE"), summaries);
        expect(live).toMatchObject({ count: 2, nextDueOn: "2026-10-10", nextDueAmount: 7_500, paidPct: 37.5 });
    });
    it("is all zeros with nothing", () => {
        expect(projectHubTotals([], {})).toMatchObject({ count: 0, paid: 0, paidPct: 0, nextDueOn: null });
    });
});

describe("mappableProjects", () => {
    it("pins live projects that are not already a property", () => {
        const list = [inv("a"), inv("b", { promoted_property_id: "p1" }), inv("c", { status: "SOLD" }), inv("d", { status: "COMPLETED", promoted_property_id: "p2" }), inv("e", { status: "ARCHIVED" })];
        expect(mappableProjects(list).map(i => i.id)).toEqual(["a"]);
    });
});
