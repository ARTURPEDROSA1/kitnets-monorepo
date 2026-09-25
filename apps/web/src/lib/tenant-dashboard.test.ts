import { describe, expect, it } from "vitest";
import type { TenantWithDetails } from "@/types/tenant";
import type { TenantLeaseSummary } from "@/lib/tenant-views";
import { ageOn, inTenantView, livingLabel, monthsElapsed, monthsLabel, nextBirthday, tenantAttention, tenantHubTotals, tenantRows } from "@/lib/tenant-dashboard";

const TODAY = "2026-09-25";

function tenant(over: Partial<TenantWithDetails> & { id: string }): TenantWithDetails {
    return {
        user_id: "u1", full_name: "Luiz Otavyo Torres", cpf: "12345678901", main_phone: "+5535999990000", email: "luiz@example.com",
        date_of_birth: "1990-10-02", rg: null, additional_phone: null, occupation: "Enfermeiro", instagram: null, linkedin: null, photo_path: null,
        postal_code: null, street: null, street_number: null, address_complement: null, neighborhood: null, city: null, state: null,
        property_id: "p1", use_property_address: true, management_type: "AGENCY", agency_id: "a1", agent_id: null,
        move_in_date: null, move_out_date: null, status: "ACTIVE", emergency_contact_name: null, emergency_contact_phone: null, notes: null,
        created_at: "2025-01-06T12:00:00Z", updated_at: "2025-01-06T12:00:00Z", deleted_at: null,
        property_name: "SANTO ANTONIO", agency_name: "MR Imóveis", agent_name: null, photo_url: null,
        ...over,
    };
}

function lease(over: Partial<TenantLeaseSummary> & { id: string; tenant_id: string }): TenantLeaseSummary {
    return {
        role: "PRIMARY", reference_name: null, property_id: "p1", property_name: "SANTO ANTONIO", unit_id: "u35a", unit_name: "Kitnet 35A",
        start_date: "2025-01-06", end_date: "2027-07-06", termination_date: null, status: "ACTIVE", monthly_rent: 1300, rent_due_day: 6,
        security_deposit: 2600, adjustment_index: "IPCA", management_type: "AGENCY", agency_name: "MR Imóveis", document_count: 1,
        ...over,
    };
}

describe("dates", () => {
    it("counts whole months elapsed", () => {
        expect(monthsElapsed("2025-01-06", "2026-09-25")).toBe(20);
        expect(monthsElapsed("2025-01-06", "2025-01-20")).toBe(0);
        expect(monthsElapsed("2025-01-31", "2025-02-28")).toBe(1);   // the anniversary clamps to the month's last day
        expect(monthsElapsed("2025-01-31", "2025-03-31")).toBe(2);
        expect(monthsElapsed("2026-10-01", "2026-09-25")).toBe(0);
    });
    it("spells months out", () => {
        expect(monthsLabel(0)).toBe("menos de um mês");
        expect(monthsLabel(1)).toBe("1 mês");
        expect(monthsLabel(8)).toBe("8 meses");
        expect(monthsLabel(12)).toBe("1 ano");
        expect(monthsLabel(38)).toBe("3 anos e 2 meses");
    });
    it("knows the age and the next birthday", () => {
        expect(ageOn("1990-10-02", TODAY)).toBe(35);
        expect(ageOn("1990-09-25", TODAY)).toBe(36);
        expect(ageOn(null, TODAY)).toBeNull();
        expect(nextBirthday("1990-10-02", TODAY)).toEqual({ date: "2026-10-02", days: 7, turning: 36 });
        expect(nextBirthday("1990-09-25", TODAY)).toEqual({ date: "2026-09-25", days: 0, turning: 36 });
        expect(nextBirthday("1990-01-10", TODAY)).toEqual({ date: "2027-01-10", days: 107, turning: 37 });
        expect(nextBirthday("1992-02-29", "2027-02-01")).toEqual({ date: "2027-02-28", days: 27, turning: 35 });
    });
});

describe("views", () => {
    it("filters by status", () => {
        expect(inTenantView("ACTIVE", "atuais")).toBe(true);
        expect(inTenantView("FORMER", "atuais")).toBe(false);
        expect(inTenantView("FORMER", "antigos")).toBe(true);
        expect(inTenantView("FUTURE", "futuros")).toBe(true);
        expect(inTenantView("FUTURE", "todos")).toBe(true);
    });
});

describe("tenantRows", () => {
    const tenants = [
        tenant({ id: "t1" }),
        tenant({ id: "t2", full_name: "Maria Souza", status: "FORMER", move_out_date: null, date_of_birth: "1985-09-26", main_phone: null }),
        tenant({ id: "t3", full_name: "Bruno Alves", status: "FUTURE", move_in_date: "2026-10-21", date_of_birth: null, email: null }),
        tenant({ id: "t4", full_name: "Joana Prado", status: "ACTIVE", property_name: "VALE DO SOL", property_id: "p2", main_phone: null, date_of_birth: null }),
    ];
    const leases = [
        lease({ id: "l1", tenant_id: "t1" }),
        lease({ id: "l0", tenant_id: "t1", start_date: "2023-01-06", end_date: "2024-12-31", status: "EXPIRED", monthly_rent: 1100 }),
        lease({ id: "l2", tenant_id: "t2", start_date: "2024-03-16", end_date: "2026-09-15", status: "EXPIRED", unit_id: "u35c", unit_name: "Kitnet 35C", monthly_rent: 1100 }),
        lease({ id: "l3", tenant_id: "t3", start_date: "2026-10-21", end_date: "2029-04-20", status: "DRAFT", unit_id: "u35", unit_name: "Kitnet 35", monthly_rent: 1550 }),
        lease({ id: "l4", tenant_id: "t4", role: "CO_TENANT", property_id: "p2", property_name: "VALE DO SOL", unit_id: null, unit_name: null, start_date: "2023-02-05", end_date: "2024-08-04", status: "ACTIVE", monthly_rent: 900 }),
    ];
    const rows = tenantRows(tenants, leases, TODAY);
    const byId = Object.fromEntries(rows.map(r => [r.tenant.id, r]));

    it("finds the contract in force, the place, the rent and how long they have lived there", () => {
        const r = byId.t1;
        expect(r.current?.id).toBe("l1");
        expect(r.last?.id).toBe("l1");
        expect(r.leases.map(l => l.id)).toEqual(["l1", "l0"]);
        expect(r.place).toBe("SANTO ANTONIO · Kitnet 35A");
        expect(r.rent).toBe(1300);
        expect(r.since).toBe("2025-01-06");
        expect(r.monthsLiving).toBe(20);
        expect(r.leaseEnd).toBe("2027-07-06");
        expect(r.daysToLeaseEnd).toBe(284);
        expect(r.age).toBe(35);
        expect(r.birthday?.days).toBe(7);
        expect(livingLabel(r)).toBe("Desde jan/2025 · há 1 ano e 8 meses");
    });
    it("closes a former tenant's stay at the end of their last contract", () => {
        const r = byId.t2;
        expect(r.current).toBeNull();
        expect(r.last?.id).toBe("l2");
        expect(r.until).toBe("2026-09-15");
        expect(r.monthsLiving).toBe(29);
        expect(r.birthday).toBeNull();
        expect(r.place).toBe("SANTO ANTONIO");
        expect(livingLabel(r)).toBe("Morou 2 anos e 5 meses");
    });
    it("reads a future tenant's arrival and a co-tenant's contract", () => {
        expect(byId.t3.since).toBe("2026-10-21");
        expect(byId.t3.monthsLiving).toBeNull();
        expect(livingLabel(byId.t3)).toBe("Entra em out/2026");
        expect(byId.t4.current?.role).toBe("CO_TENANT");
        expect(byId.t4.daysToLeaseEnd).toBeLessThan(0);
        expect(byId.t4.haystack).toContain("vale do sol");
    });

    it("adds the hub up", () => {
        const t = tenantHubTotals(rows);
        expect(t).toMatchObject({ total: 4, active: 2, future: 1, former: 1, rentTotal: 2200, rentCount: 2, withoutLease: 0, withoutPhone: 1, birthdays30: 1, ending90: 0 });
        expect(t.avgMonths).toBe(32);   // (20 + 43) / 2, rounded
        expect(t.longest?.row.tenant.id).toBe("t4");
    });

    it("lists what deserves a look, most pressing first", () => {
        const items = tenantAttention(rows, TODAY);
        expect(items.map(i => `${i.kind}:${i.row.tenant.id}`)).toEqual([
            "lease_over:t4",
            "arriving:t3",
            "birthday:t1",
            "no_phone:t4",
        ]);
        expect(items[1].text).toBe("Chega em 26 dias.");
        expect(items[2].text).toBe("Faz 36 anos em 7 dias.");
    });
});
