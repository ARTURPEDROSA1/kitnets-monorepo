import { describe, expect, it } from "vitest";
import { endedOn, tenantStatusPatch, type TenantLeaseFacts, type TenantStatusFields } from "@/lib/tenant-status";

const TODAY = "2026-10-07";

const lease = (over: Partial<TenantLeaseFacts> = {}): TenantLeaseFacts => ({
    status: "ACTIVE", start_date: "2025-01-06", end_date: "2027-07-06", termination_date: null, ...over,
});
const tenant = (over: Partial<TenantStatusFields> = {}): TenantStatusFields => ({ status: "ACTIVE", move_out_date: null, ...over });

describe("endedOn", () => {
    it("is the termination when there is one, else the term", () => {
        expect(endedOn(lease({ status: "TERMINATED", end_date: "2025-12-20", termination_date: "2025-06-02" }))).toBe("2025-06-02");
        expect(endedOn(lease({ status: "EXPIRED", end_date: "2025-12-20T00:00:00Z" }))).toBe("2025-12-20");
        expect(endedOn(lease({ status: "EXPIRED", end_date: null }))).toBeNull();
    });
});

describe("tenantStatusPatch", () => {
    it("moves a current tenant whose every contract ended to the former ones, out on the last day", () => {
        const leases = [
            lease({ status: "TERMINATED", start_date: "2024-12-20", end_date: "2025-12-20", termination_date: "2025-06-02" }),
            lease({ status: "EXPIRED", start_date: "2023-01-01", end_date: "2024-01-01" }),
        ];
        expect(tenantStatusPatch(tenant(), leases, { today: TODAY })).toEqual({ status: "FORMER", move_out_date: "2025-06-02" });
    });

    it("keeps a move-out day the owner typed", () => {
        expect(tenantStatusPatch(tenant({ move_out_date: "2025-05-30" }), [lease({ status: "EXPIRED", end_date: "2025-06-01" })], { today: TODAY }))
            .toEqual({ status: "FORMER", move_out_date: "2025-05-30" });
    });

    it("leaves a tenant with a contract in force where they are, even beside an ended one", () => {
        const leases = [lease(), lease({ status: "EXPIRED", end_date: "2024-12-31" })];
        expect(tenantStatusPatch(tenant(), leases, { today: TODAY })).toBeNull();
        expect(tenantStatusPatch(tenant(), [lease({ status: "EXPIRING_SOON" })], { today: TODAY })).toBeNull();
    });

    it("brings a former tenant back with a contract in force, or as arriving when it has not started", () => {
        expect(tenantStatusPatch(tenant({ status: "FORMER", move_out_date: "2024-12-31" }), [lease()], { today: TODAY }))
            .toEqual({ status: "ACTIVE", move_out_date: null });
        expect(tenantStatusPatch(tenant({ status: "FORMER", move_out_date: "2024-12-31" }), [lease({ start_date: "2026-11-01" })], { today: TODAY }))
            .toEqual({ status: "FUTURE", move_out_date: null });
    });

    it("does nothing without a contract that ran", () => {
        expect(tenantStatusPatch(tenant(), [], { today: TODAY })).toBeNull();
        expect(tenantStatusPatch(tenant(), [lease({ status: "CANCELLED" })], { today: TODAY })).toBeNull();
        // a new contract in the works: they may be staying
        expect(tenantStatusPatch(tenant(), [lease({ status: "DRAFT" }), lease({ status: "EXPIRED", end_date: "2025-01-01" })], { today: TODAY })).toBeNull();
    });

    it("leaves a former tenant alone, but fills a missing move-out day", () => {
        const ended = [lease({ status: "EXPIRED", end_date: "2025-06-01" })];
        expect(tenantStatusPatch(tenant({ status: "FORMER", move_out_date: "2025-05-30" }), ended, { today: TODAY })).toBeNull();
        expect(tenantStatusPatch(tenant({ status: "FORMER" }), ended, { today: TODAY })).toEqual({ status: "FORMER", move_out_date: "2025-06-01" });
    });

    it("replaces a move-out day taken from the term once the contract's closing day is recorded", () => {
        // the import creates the lease closed (the tenant goes out on its term), then records the return of the property
        const closed = [lease({ status: "TERMINATED", end_date: "2025-12-20", termination_date: "2025-06-02" })];
        const fromTerm = tenant({ status: "FORMER", move_out_date: "2025-12-20" });
        expect(tenantStatusPatch(fromTerm, closed, { today: TODAY, termOf: "2025-12-20" })).toEqual({ status: "FORMER", move_out_date: "2025-06-02" });
        // without the hint the day stays: it could be the owner's
        expect(tenantStatusPatch(fromTerm, closed, { today: TODAY })).toBeNull();
        // a later contract that also ended keeps its later day
        const later = [...closed, lease({ status: "EXPIRED", start_date: "2025-07-01", end_date: "2026-07-01" })];
        expect(tenantStatusPatch(tenant({ status: "FORMER", move_out_date: "2026-07-01" }), later, { today: TODAY, termOf: "2025-12-20" })).toBeNull();
    });
});
