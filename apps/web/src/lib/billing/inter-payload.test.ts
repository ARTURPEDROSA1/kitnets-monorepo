import { describe, expect, it } from "vitest";
import { buildChargePayload, chargeStatusOf, issueBlockers, parseCallbackEntry, parseChargeState, seuNumeroFor, termsToAdopt, type ChargeInvoice } from "./inter-payload";

const TODAY = "2026-10-02";

const invoice = (over: Partial<ChargeInvoice> = {}): ChargeInvoice => ({
    number: 12, amount: 1150.5, due_date: "2026-10-20", reference_month: "2026-10-01",
    payer_name: "Ana Souza", payer_cpf: "52998224725", payer_email: "ana@example.com",
    payer_address: { cep: "34000123", street: "Rua Santo Antônio, 35", number: "", complement: "Kitnet 35C", neighborhood: "", city: "Nova Lima", state: "MG" },
    fine_pct: 10, interest_pct_month: 1, days_payable_after_due: 30,
    items: [{ description: "Aluguel", amount: 1000 }, { description: "Condomínio", amount: 150.5 }],
    unit_name: "Kitnet 35C", property_name: "SANTO ANTONIO", ...over,
});

describe("seuNumeroFor", () => {
    it("names the charge after the invoice, with a suffix when issued again, never over 15 characters", () => {
        expect(seuNumeroFor(12)).toBe("F12");
        expect(seuNumeroFor(12, 2)).toBe("F12-2");
        expect(seuNumeroFor(123456789012345, 3)).toHaveLength(15);
    });
});

describe("chargeStatusOf", () => {
    it("reads the bank's states into the module's", () => {
        expect(chargeStatusOf("EM_PROCESSAMENTO")).toBe("REQUESTED");
        expect(chargeStatusOf("A_RECEBER")).toBe("OPEN");
        expect(chargeStatusOf("ATRASADO")).toBe("OPEN");
        expect(chargeStatusOf("RECEBIDO")).toBe("PAID");
        expect(chargeStatusOf("MARCADO_RECEBIDO")).toBe("PAID");
        expect(chargeStatusOf("CANCELADO")).toBe("CANCELLED");
        expect(chargeStatusOf("EXPIRADO")).toBe("EXPIRED");
        expect(chargeStatusOf("FALHA_EMISSAO")).toBe("FAILED");
        expect(chargeStatusOf("whatever")).toBe("REQUESTED");
    });
});

describe("issueBlockers", () => {
    it("lets a complete invoice through", () => {
        expect(issueBlockers(invoice(), TODAY)).toEqual([]);
    });

    it("names everything the bank would refuse, and the owner's undecided terms", () => {
        expect(issueBlockers(invoice({ payer_cpf: "123", payer_address: { cep: "", street: "", number: "", complement: "", neighborhood: "", city: "Nova Lima", state: "MG" }, amount: 2, due_date: "2026-10-01", fine_pct: null }), TODAY))
            .toEqual(["NO_CPF", "NO_ADDRESS", "AMOUNT_TOO_LOW", "DUE_DATE_PASSED", "TERMS_UNDECIDED"]);
        expect(issueBlockers(invoice({ due_date: TODAY }), TODAY)).toEqual([]);
        expect(issueBlockers(invoice({ fine_pct: 0, interest_pct_month: 0, days_payable_after_due: 0 }), TODAY)).toEqual([]);
    });
});

describe("buildChargePayload", () => {
    it("builds the bank's body: payer, terms, message lines, boleto and Pix", () => {
        const p = buildChargePayload(invoice(), "F12");
        expect(p).toMatchObject({ seuNumero: "F12", valorNominal: 1150.5, dataVencimento: "2026-10-20", numDiasAgenda: 30, formasRecebimento: ["BOLETO", "PIX"] });
        expect(p.pagador).toEqual({ cpfCnpj: "52998224725", tipoPessoa: "FISICA", nome: "Ana Souza", endereco: "Rua Santo Antonio, 35", cidade: "Nova Lima", uf: "MG", cep: "34000123", complemento: "Kitnet 35C", email: "ana@example.com" });
        expect(p.multa).toEqual({ codigo: "PERCENTUAL", taxa: 10 });
        expect(p.mora).toEqual({ codigo: "TAXAMENSAL", taxa: 1 });
        expect(p.mensagem).toEqual({ linha1: "Fatura n. 12 - referencia outubro/2026", linha2: "Aluguel: R$ 1000,00", linha3: "Condominio: R$ 150,50", linha4: "Imovel: SANTO ANTONIO - Kitnet 35C" });
    });

    it("leaves out a fee or interest of zero, a company payer is JURIDICA, and a moved due date is used", () => {
        const p = buildChargePayload(invoice({ fine_pct: 0, interest_pct_month: 0, payer_cpf: "11222333000181", days_payable_after_due: 90 }), "F12-2", "2026-11-05");
        expect(p.multa).toBeUndefined();
        expect(p.mora).toBeUndefined();
        expect(p.pagador.tipoPessoa).toBe("JURIDICA");
        expect(p.dataVencimento).toBe("2026-11-05");
        expect(p.numDiasAgenda).toBe(60);
    });

    it("keeps the message lines plain and short", () => {
        const p = buildChargePayload(invoice({ items: [{ description: "Taxa de condomínio do edifício com nome bastante comprido para caber numa linha só do boleto", amount: 1 }] }), "F12");
        expect(p.mensagem.linha2.length).toBeLessThanOrEqual(78);
        expect(p.mensagem.linha2).not.toMatch(/[^\x20-\x7E]/);
    });
});

describe("parseChargeState", () => {
    it("reads the bank's answer, paid by Pix", () => {
        const s = parseChargeState({
            cobranca: { situacao: "RECEBIDO", dataSituacao: "2026-10-19", valorTotalRecebido: "1150.50", origemRecebimento: "PIX" },
            boleto: { nossoNumero: "12345678", codigoBarras: "0".repeat(44), linhaDigitavel: "1".repeat(47) },
            pix: { txid: "abc", pixCopiaECola: "00020101…" },
        });
        expect(s).toEqual({ situacao: "RECEBIDO", status: "PAID", stateDate: "2026-10-19", receivedAmount: 1150.5, receivedVia: "PIX", nossoNumero: "12345678", barcode: "0".repeat(44), digitableLine: "1".repeat(47), pixTxid: "abc", pixCopyPaste: "00020101…" });
    });

    it("copes with a charge still being made", () => {
        expect(parseChargeState({ cobranca: { situacao: "EM_PROCESSAMENTO" } })).toMatchObject({ status: "REQUESTED", stateDate: null, receivedAmount: null, receivedVia: null, digitableLine: null, pixCopyPaste: null });
        expect(parseChargeState({})).toMatchObject({ situacao: "", status: "REQUESTED" });
    });
});

describe("parseCallbackEntry", () => {
    it("takes only the charge's reference and the state the bank claims", () => {
        expect(parseCallbackEntry({ codigoSolicitacao: "183e982a", situacao: "RECEBIDO", dataHoraSituacao: "2026-10-19T14:15:22Z", valorTotalRecebido: "999" })).toEqual({ codigoSolicitacao: "183e982a", situacao: "RECEBIDO", at: "2026-10-19T14:15:22Z" });
        expect(parseCallbackEntry({ situacao: "RECEBIDO" })).toBeNull();
        expect(parseCallbackEntry("junk")).toBeNull();
    });
});

describe("termsToAdopt", () => {
    const undecided = { fine_pct: null, interest_pct_month: null, days_payable_after_due: null };
    const decided = { fine_pct: 10, interest_pct_month: 1, days_payable_after_due: 5 };

    it("an invoice created before the decisions takes them when issued", () => {
        expect(termsToAdopt(undecided, decided)).toEqual(decided);
        expect(termsToAdopt({ ...undecided, fine_pct: 2 }, decided)).toEqual({ interest_pct_month: 1, days_payable_after_due: 5 });
    });

    it("what the invoice already states is kept; what is still undecided stays empty", () => {
        expect(termsToAdopt({ fine_pct: 2, interest_pct_month: 0.5, days_payable_after_due: 30 }, decided)).toEqual({});
        expect(termsToAdopt(undecided, { ...decided, interest_pct_month: null })).toEqual({ fine_pct: 10, days_payable_after_due: 5 });
        expect(termsToAdopt(undecided, null)).toEqual({});
        // zero is a decision
        expect(termsToAdopt(undecided, { fine_pct: 0, interest_pct_month: 0, days_payable_after_due: 0 })).toEqual({ fine_pct: 0, interest_pct_month: 0, days_payable_after_due: 0 });
    });
});
