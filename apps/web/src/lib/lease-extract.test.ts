import { describe, expect, it } from "vitest";
import {
    companyKey,
    endDateFromDuration,
    isEmptyExtraction,
    matchAgency,
    matchProperty,
    matchTenant,
    normalizeLeaseExtraction,
    streetKey,
} from "./lease-extract";

const VALID_CPF = "52998224725";
const OTHER_VALID_CPF = "11144477735";
const VALID_CNPJ = "11222333000181";

describe("normalizeLeaseExtraction", () => {
    it("normalises a typical model answer", () => {
        const out = normalizeLeaseExtraction({
            lease: {
                start_date: "01/03/2026",
                end_date: null,
                duration_months: 30,
                monthly_rent: "1.500,00",
                rent_due_day: "10",
                security_deposit: null,
                deposit_months: 2,
                guarantee_type: "caucao",
                adjustment_index: "igp-m",
                adjustment_frequency: 12,
                purpose: "residencial",
                notes: "Multa de 3 aluguéis.",
            },
            charges: [
                { charge_type: "IPTU", responsibility: "LANDLORD", amount: null },
                { charge_type: "iptu", responsibility: "TENANT" },
                { charge_type: "CONDOMINIUM", responsibility: "??", amount: "350.00" },
                { charge_type: "LIXO" },
                { charge_type: "OTHER", label: "Taxa de energia elétrica", responsibility: "locatário", amount: "300,00" },
                { charge_type: "OTHER", label: "Taxa de lixo", responsibility: "INCLUSO" },
            ],
            tenants: [
                { full_name: "Maria Souza", cpf: "111.444.777-35", role: "CO_TENANT" },
                { full_name: "João da Silva", cpf: "529.982.247-25", role: "PRIMARY", main_phone: "(31) 99999-0000" },
                { full_name: "João da Silva", cpf: "52998224725", role: "CO_TENANT" },
                { full_name: "", cpf: "123" },
            ],
            property: { name: "Apartamento 302", street: "Rua das Flores", street_number: "120", state: "mg", postal_code: "30.000-000" },
            landlord: { name: "Carlos Dono" },
            agency: { name: "MR IMÓVEIS LTDA", cnpj: "11.222.333/0001-81", management_fee: "10%" },
            confidence: 0.9,
        });

        expect(out.lease.start_date).toBe("2026-03-01");
        expect(out.lease.end_date).toBe("2028-08-31");
        expect(out.lease.monthly_rent).toBe(1500);
        expect(out.lease.rent_due_day).toBe(10);
        expect(out.lease.security_deposit).toBe(3000);
        expect(out.lease.adjustment_index).toBe("IGP_M");
        expect(out.lease.notes).toContain("Locador: Carlos Dono.");
        expect(out.lease.notes).toContain("Garantia: Caução.");
        expect(out.lease.notes).toContain("Multa de 3 aluguéis.");

        expect(out.charges).toEqual([
            { charge_type: "IPTU", label: "", responsibility: "LANDLORD", amount: null },
            { charge_type: "CONDOMINIUM", label: "", responsibility: "TENANT", amount: 350 },
            { charge_type: "ELECTRICITY", label: "", responsibility: "TENANT", amount: 300 },
            { charge_type: "OTHER", label: "Taxa de lixo", responsibility: "INCLUDED", amount: null },
        ]);

        // The primary comes first, the duplicate CPF and the nameless entry are dropped.
        expect(out.tenants.map((t) => [t.full_name, t.role, t.cpf])).toEqual([
            ["João da Silva", "PRIMARY", VALID_CPF],
            ["Maria Souza", "CO_TENANT", OTHER_VALID_CPF],
        ]);

        expect(out.property).toMatchObject({ name: "Apartamento 302", state: "MG", postal_code: "30000000" });
        expect(out.agency).toMatchObject({ name: "MR IMÓVEIS LTDA", cnpj: VALID_CNPJ, management_fee: 10 });
        expect(isEmptyExtraction(out)).toBe(false);
    });

    it("reads the adjustment index the way contracts spell it", () => {
        const index = (v: unknown) => normalizeLeaseExtraction({ lease: { adjustment_index: v } }).lease.adjustment_index;
        expect(index("IGPM")).toBe("IGP_M");
        expect(index("IGP-M/FGV")).toBe("IGP_M");
        expect(index("IPCA (IBGE)")).toBe("IPCA");
        expect(index("IPC-FIPE")).toBe("CUSTOM");
        expect(index("NONE")).toBe("NONE");
        expect(index(null)).toBeNull();
    });

    it("survives garbage", () => {
        for (const raw of [null, "texto", [], { lease: "x", tenants: "y", charges: {}, property: [], agency: "não consta" }]) {
            const out = normalizeLeaseExtraction(raw);
            expect(isEmptyExtraction(out)).toBe(true);
            expect(out.agency).toBeNull();
            expect(out.property).toBeNull();
        }
    });

    it("drops impossible dates, non-positive money and an end before the start", () => {
        const out = normalizeLeaseExtraction({
            lease: { start_date: "2026-02-31", end_date: "2026-01-01", monthly_rent: "0", rent_due_day: 45 },
        });
        expect(out.lease.start_date).toBeNull();
        expect(out.lease.monthly_rent).toBeNull();
        expect(out.lease.rent_due_day).toBeNull();

        const reversed = normalizeLeaseExtraction({ lease: { start_date: "2026-05-01", end_date: "2026-01-01" } });
        expect(reversed.lease.end_date).toBeNull();
    });

    it("treats the literal string null as missing and makes the first tenant primary", () => {
        const out = normalizeLeaseExtraction({
            tenants: [{ full_name: "Ana Lima", cpf: "null", email: "null", role: "CO_TENANT" }],
        });
        expect(out.tenants).toHaveLength(1);
        expect(out.tenants[0]).toMatchObject({ role: "PRIMARY", cpf: "", email: null });
    });
});

describe("endDateFromDuration", () => {
    it("ends the day before the anniversary", () => {
        expect(endDateFromDuration("2026-03-01", 12)).toBe("2027-02-28");
        expect(endDateFromDuration("2026-03-15", 30)).toBe("2028-09-14");
    });

    it("clamps a start on the 31st", () => {
        expect(endDateFromDuration("2026-01-31", 1)).toBe("2026-02-28");
    });
});

describe("matchProperty", () => {
    const candidates = [
        { id: "p1", name: "Kitnets Centro", address: "Av. Dr. João Pinheiro, 120 - Centro", city: "Belo Horizonte" },
        { id: "p2", name: "Casa da Praia", address: null, street: "Rua do Sol", street_number: "45-A", city: "Guarapari" },
        { id: "p3", name: "Apartamento 302", address: "Rua Z, 9 - Bairro", city: "Contagem" },
    ];
    const property = (p: Record<string, string | null>) => normalizeLeaseExtraction({ property: p }).property;

    it("matches on street and number, whatever the contract calls the unit", () => {
        const hit = matchProperty(property({ name: "Kitnet 03", street: "Avenida Doutor João Pinheiro", street_number: "120", city: "Belo Horizonte" }), candidates);
        expect(hit).toEqual({ id: "p1", name: "Kitnets Centro", by: "address" });
    });

    it("uses the structured address from the profile", () => {
        expect(matchProperty(property({ street: "R. do Sol", street_number: "45A" }), candidates)?.id).toBe("p2");
    });

    it("does not match a different number or a different city", () => {
        expect(matchProperty(property({ street: "Av. Dr. João Pinheiro", street_number: "122" }), candidates)).toBeNull();
        expect(matchProperty(property({ street: "Av. Dr. João Pinheiro", street_number: "120", city: "Uberlândia" }), candidates)).toBeNull();
    });

    it("falls back to an exact name", () => {
        expect(matchProperty(property({ name: "apartamento 302" }), candidates)).toEqual({ id: "p3", name: "Apartamento 302", by: "name" });
        expect(matchProperty(property({ name: "Apartamento" }), candidates)).toBeNull();
    });

    it("refuses to guess between two properties at the same address", () => {
        const twins = [
            { id: "a", name: "Apto 101", address: "Rua X, 10 - Centro" },
            { id: "b", name: "Apto 102", address: "Rua X, 10 - Centro" },
        ];
        expect(matchProperty(property({ street: "Rua X", street_number: "10" }), twins)).toBeNull();
        expect(matchProperty(property({ name: "Apto 102", street: "Rua X", street_number: "10" }), twins)?.id).toBe("b");
    });
});

describe("matchAgency", () => {
    const candidates = [
        { id: "a1", name: "MR Imóveis Ltda - ME", trade_name: "MR Imóveis", cnpj: VALID_CNPJ },
        { id: "a2", name: "Bastos Imobiliária Ltda", trade_name: null, cnpj: null },
    ];
    const agency = (a: Record<string, string | null>) => normalizeLeaseExtraction({ agency: a }).agency;

    it("matches on CNPJ first", () => {
        expect(matchAgency(agency({ name: "Outro Nome", cnpj: "11.222.333/0001-81" }), candidates)).toEqual({ id: "a1", name: "MR Imóveis Ltda - ME", by: "cnpj" });
    });

    it("matches on the company name without its legal suffixes", () => {
        expect(matchAgency(agency({ name: "BASTOS IMOBILIARIA LTDA-ME" }), candidates)?.id).toBe("a2");
        expect(matchAgency(agency({ name: "X", trade_name: "MR Imoveis" }), candidates)?.id).toBe("a1");
    });

    it("never matches by name across two different CNPJs", () => {
        expect(matchAgency(agency({ name: "MR Imóveis Ltda", cnpj: "11.444.777/0001-61" }), candidates)).toBeNull();
    });

    it("helpers", () => {
        expect(companyKey("MR IMÓVEIS LTDA-ME")).toBe("mr imoveis");
        expect(streetKey("Av. Dr. João da Silva")).toBe("doutor joao silva");
    });
});

describe("matchTenant", () => {
    const candidates = [
        { id: "t1", full_name: "João da Silva", cpf: VALID_CPF },
        { id: "t2", full_name: "Maria Souza", cpf: OTHER_VALID_CPF },
    ];
    const tenant = (t: Record<string, string>) => normalizeLeaseExtraction({ tenants: [t] }).tenants[0];

    it("matches on CPF", () => {
        expect(matchTenant(tenant({ full_name: "J. Silva", cpf: "529.982.247-25" }), candidates)).toEqual({ id: "t1", name: "João da Silva", by: "cpf" });
    });

    it("a valid unknown CPF is a new person even with a known name", () => {
        expect(matchTenant(tenant({ full_name: "Maria Souza", cpf: "390.533.447-05" }), candidates)).toBeNull();
    });

    it("falls back to the name when the CPF is missing or misread", () => {
        expect(matchTenant(tenant({ full_name: "maria souza" }), candidates)?.id).toBe("t2");
        expect(matchTenant(tenant({ full_name: "Maria Souza", cpf: "111.444.777-36" }), candidates)?.id).toBe("t2");
    });
});
