import { describe, expect, it } from "vitest";
import { buildInvoiceEmail, senderAddress, type InvoiceEmailInput } from "./invoice-email";

const input = (over: Partial<InvoiceEmailInput> = {}): InvoiceEmailInput => ({
    number: 12,
    place: "SANTO ANTONIO · Kitnet 35C",
    tenantName: "Ana Paula Souza",
    items: [{ description: "Condomínio", amount: 150 }, { description: "Internet", amount: 99.9 }],
    amount: 249.9,
    dueDate: "2026-10-20",
    referenceMonth: "2026-10-01",
    digitableLine: "07790.00116 12345.678901 23456.789012 1 98760000024990",
    pixCopyPaste: "00020126580014br.gov.bcb.pix0136abc-def5204000053039865406249.905802BR",
    pageUrl: "https://kitnets.com/pt/pagar/abc123",
    senderName: "Holding Pedrosa",
    pdfAttached: true,
    kind: "ISSUE",
    ...over,
});

describe("buildInvoiceEmail", () => {
    it("says who, what, how much, until when and how to pay", () => {
        const { subject, text, html } = buildInvoiceEmail(input());
        expect(subject).toBe("Fatura nº 12 — outubro de 2026 — SANTO ANTONIO · Kitnet 35C");
        expect(text).toContain("Olá, Ana,");
        expect(text).toContain("Condomínio: R$ 150,00");
        expect(text).toContain("Internet: R$ 99,90");
        expect(text).toContain("Total: R$ 249,90");
        expect(text).toContain("Vencimento: 20/10/2026");
        expect(text).toContain("00020126580014br.gov.bcb.pix");
        expect(text).toContain("07790.00116 12345.678901");
        expect(text).toContain("https://kitnets.com/pt/pagar/abc123");
        expect(text).toContain("O boleto em PDF segue anexo.");
        expect(text).toContain("Enviado por Holding Pedrosa através do Kitnets");
        expect(html).toContain("Ver fatura e pagar");
        expect(html).toContain('href="https://kitnets.com/pt/pagar/abc123"');
        expect(html).toContain("R$ 249,90");
    });

    it("leaves out what the bank did not give", () => {
        const { text, html } = buildInvoiceEmail(input({ digitableLine: null, pixCopyPaste: null, pdfAttached: false }));
        expect(text).not.toContain("linha digitável");
        expect(text).not.toContain("PIX copia e cola");
        expect(text).not.toContain("anexo");
        expect(html).not.toContain("Linha digitável");
        expect(text).toContain("Página da fatura: https://kitnets.com/pt/pagar/abc123");
    });

    it("a reminder reads as one", () => {
        const { subject, text, html } = buildInvoiceEmail(input({ kind: "REMINDER" }));
        expect(subject).toBe("Lembrete: fatura nº 12 vence em 20/10/2026 — SANTO ANTONIO · Kitnet 35C");
        expect(text).toContain("Seguem de novo os dados para pagamento.");
        expect(html).toContain("Lembrete de vencimento");
    });

    it("escapes what goes into the HTML and copes with no name", () => {
        const { html, text } = buildInvoiceEmail(input({ tenantName: "", items: [{ description: "Taxa <extra> & cia", amount: 1 }], senderName: "A & B" }));
        expect(html).toContain("Taxa &lt;extra&gt; &amp; cia");
        expect(html).toContain("Enviado por A &amp; B");
        expect(text).toContain("Olá,\n");
    });
});

describe("senderAddress", () => {
    it("puts the owner's name on the platform's address", () => {
        expect(senderAddress("Holding Pedrosa", "Kitnets <faturas@kitnets.com>")).toBe("Holding Pedrosa via Kitnets <faturas@kitnets.com>");
        expect(senderAddress("Holding Pedrosa", "faturas@kitnets.com")).toBe("Holding Pedrosa via Kitnets <faturas@kitnets.com>");
    });

    it("never lets the name break the header", () => {
        expect(senderAddress('Eve "<admin@kitnets.com>"', "faturas@kitnets.com")).toBe("Eve admin@kitnets.com via Kitnets <faturas@kitnets.com>");
        expect(senderAddress("  ", "Kitnets <faturas@kitnets.com>")).toBe("Kitnets <faturas@kitnets.com>");
    });
});
