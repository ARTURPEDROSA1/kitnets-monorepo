import { describe, expect, it } from "vitest";
import { EMPTY_REGISTRY, type CompanyRegistry } from "./cnpj-card-extract";
import { addressLine, holdingFromRow, registryToProfileColumns, sanitizeHoldingPatch } from "./profile-holding";

const registry: CompanyRegistry = {
    ...EMPTY_REGISTRY,
    cnpj: "11.222.333/0001-81",
    razao_social: "PEDROSA PARTICIPACOES LTDA",
    data_situacao_cadastral: "2021-07-15",
    telefone: "(41) 3333-4444 / (41) 99999-0000",
    endereco: { logradouro: "R DAS FLORES", numero: "100", complemento: "SALA 2", bairro: "CENTRO", municipio: "CURITIBA", uf: "PR", cep: "80000-000" },
    cnae_principal: { codigo: "68.10-2-02", descricao: "Aluguel de imóveis próprios" },
};

describe("registryToProfileColumns", () => {
    it("mirrors the card into the scalar columns and keeps the whole card with who read it", () => {
        const cols = registryToProfileColumns(registry, { read_at: "2026-09-30T12:00:00.000Z", read_by: { provider: "gemini", model: "g" }, source_path: "p/company/cnpj_card/1.pdf" });
        expect(cols.cnpj).toBe("11.222.333/0001-81");
        expect(cols.business_name).toBe("PEDROSA PARTICIPACOES LTDA");
        expect(cols.registration_status_date).toBe("2021-07-15");
        expect(cols.phone).toBe("(41) 3333-4444");
        expect(cols.address).toEqual({ cep: "80000-000", street: "R DAS FLORES", number: "100", complement: "SALA 2", neighborhood: "CENTRO", city: "CURITIBA", state: "PR" });
        expect(cols.person_type).toBe("pj");
        expect(cols.updated_at).toBe("2026-09-30T12:00:00.000Z");
        expect((cols.company_registry as { read_at: string }).read_at).toBe("2026-09-30T12:00:00.000Z");
        expect((cols.company_registry as { cnae_principal: unknown }).cnae_principal).toEqual(registry.cnae_principal);
    });

    it("leaves alone what the card does not show", () => {
        const cols = registryToProfileColumns({ ...EMPTY_REGISTRY, cnpj: "11.222.333/0001-81" }, { read_at: "x", read_by: null, source_path: null });
        expect(cols).not.toHaveProperty("trade_name");
        expect(cols).not.toHaveProperty("business_name");
        expect(cols).not.toHaveProperty("address");
        expect(cols).not.toHaveProperty("phone");
    });
});

describe("sanitizeHoldingPatch", () => {
    it("keeps the known fields, formats the CNPJ and the phone, and stamps the row", () => {
        const r = sanitizeHoldingPatch({ full_name: " Artur ", cnpj: "11222333000181", phone: "41999990000", business_name: "X", role: "admin" });
        expect("columns" in r).toBe(true);
        if (!("columns" in r)) return;
        expect(r.columns.full_name).toBe("Artur");
        expect(r.columns.cnpj).toBe("11.222.333/0001-81");
        expect(r.columns.phone).toBe("(41) 99999-0000");
        expect(r.columns.person_type).toBe("pj");
        expect(r.columns).not.toHaveProperty("role");
        expect(typeof r.columns.updated_at).toBe("string");
    });

    it("refuses a wrong CNPJ, a wrong date and a wrong admin e-mail, and an empty patch", () => {
        expect(sanitizeHoldingPatch({ cnpj: "11.222.333/0001-82" })).toEqual({ error: "CNPJ inválido." });
        expect(sanitizeHoldingPatch({ registration_status_date: "15/07/2021" })).toEqual({ error: "Data da situação cadastral inválida." });
        expect(sanitizeHoldingPatch({ admin: { name: "A", email: "nope" } })).toEqual({ error: "E-mail do administrador inválido." });
        expect(sanitizeHoldingPatch({})).toEqual({ error: "Nada para salvar." });
        expect(sanitizeHoldingPatch([])).toEqual({ error: "Corpo da requisição inválido." });
    });

    it("clears with an empty string and sanitizes the nested address and admin", () => {
        const r = sanitizeHoldingPatch({ cnpj: "", registration_status_date: "", address: { cep: "80000000", state: "pr", street: "R", junk: 1 }, admin: { name: "Ana", email: "ANA@X.COM", address: { cep: "1" } } });
        if (!("columns" in r)) throw new Error(r.error);
        expect(r.columns.cnpj).toBe("");
        expect(r.columns.registration_status_date).toBeNull();
        expect(r.columns.address).toEqual({ cep: "80000-000", street: "R", number: "", complement: "", neighborhood: "", city: "", state: "PR" });
        expect(r.columns.admin_data).toEqual({ name: "Ana", email: "ana@x.com", phone: "", address: { cep: "1", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" } });
    });
});

describe("holdingFromRow / addressLine", () => {
    it("reads a profiles row, registry included, with every key present", () => {
        const h = holdingFromRow({ id: "p1", full_name: "Artur", email: "a@x.com", cnpj: "11.222.333/0001-81", address: null, admin_data: { name: "Ana" }, company_registry: { cnpj: "11.222.333/0001-81", read_at: "2026-09-30T12:00:00.000Z" }, updated_at: "2026-09-30T12:00:00.000Z" });
        expect(h.address.cep).toBe("");
        expect(h.admin.name).toBe("Ana");
        expect(h.admin.address.city).toBe("");
        expect(h.registry?.cnaes_secundarios).toEqual([]);
        expect(h.registry_read_at).toBe("2026-09-30T12:00:00.000Z");
        expect(holdingFromRow({ id: "p2" }).registry).toBeNull();
    });

    it("writes the address on one line", () => {
        expect(addressLine({ cep: "80000-000", street: "R das Flores", number: "100", complement: "Sala 2", neighborhood: "Centro", city: "Curitiba", state: "PR" })).toBe("R das Flores, 100 · Sala 2 · Centro · Curitiba/PR · CEP 80000-000");
        expect(addressLine({ cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" })).toBe("");
        expect(addressLine(null)).toBe("");
    });
});
