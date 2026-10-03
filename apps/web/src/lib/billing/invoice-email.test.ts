import { describe, expect, it } from "vitest";
import { buildInvoiceEmail, buildReceiptEmail, senderAddress, withCopyNote, type InvoiceEmailInput } from "./invoice-email";

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

describe("the overdue notice", () => {
    it("says it is late, what it costs today and until when it still pays", () => {
        const { subject, text, html } = buildInvoiceEmail(input({ kind: "OVERDUE", overdue: { daysLate: 7, extra: 5.58, total: 255.48, payableUntil: "2026-11-19" } }));
        expect(subject).toBe("Fatura nº 12 vencida em 20/10/2026 — SANTO ANTONIO · Kitnet 35C");
        expect(text).toContain("venceu em 20/10/2026 e ainda não consta como paga.");
        expect(text).toContain("Com 7 dias de atraso, multa e juros somam R$ 5,58: o valor hoje é R$ 255,48.");
        expect(text).toContain("aceitam o pagamento até 19/11/2026");
        expect(text).toContain("Se já pagou, desconsidere este aviso.");
        expect(html).toContain("Fatura vencida");
        expect(html).toContain("Multa e juros até hoje");
    });

    it("without late terms it only says it is late", () => {
        const { text, html } = buildInvoiceEmail(input({ kind: "OVERDUE", overdue: { daysLate: 7, extra: 0, total: 249.9, payableUntil: null } }));
        expect(text).not.toContain("multa e juros somam");
        expect(text).not.toContain("aceitam o pagamento até");
        expect(html).not.toContain("Multa e juros até hoje");
    });

    it("mentions the card when the page offers it", () => {
        const { text, html } = buildInvoiceEmail(input({ cardAvailable: true }));
        expect(text).toContain("Cartão de crédito: na página da fatura.");
        expect(html).toContain("cartão de crédito na página da fatura");
        expect(buildInvoiceEmail(input({ cardAvailable: false })).text).not.toContain("Cartão de crédito");
    });
});

describe("buildReceiptEmail", () => {
    const receipt = {
        number: 12, place: "SANTO ANTONIO · Kitnet 35C", tenantName: "Ana Paula Souza", items: [{ description: "Condomínio", amount: 150 }, { description: "Internet", amount: 99.9 }],
        amount: 249.9, referenceMonth: "2026-10-01", paidOn: "2026-10-27", paidAmount: 255.48, paidVia: "CARD" as const, lateFee: 5.58, surcharge: 11.03,
        pageUrl: "https://kitnets.com/pt/pagar/abc123", senderName: "Holding Pedrosa",
    };

    it("says it was paid, when, how and how much, line by line", () => {
        const { subject, text, html } = buildReceiptEmail(receipt);
        expect(subject).toBe("Recibo: fatura nº 12 paga — outubro de 2026 — SANTO ANTONIO · Kitnet 35C");
        expect(text).toContain("em 27/10/2026 por cartão de crédito. Obrigado!");
        expect(text).toContain("Multa e juros por atraso: R$ 5,58");
        expect(text).toContain("Taxa de processamento do cartão: R$ 11,03");
        expect(text).toContain("Total pago: R$ 266,51");
        expect(text).toContain("Este e-mail comprova o recebimento.");
        expect(html).toContain("Recibo");
        expect(html).toContain("R$ 266,51");
    });

    it("a plain payment has no extra lines", () => {
        const { text } = buildReceiptEmail({ ...receipt, paidAmount: 249.9, paidVia: "PIX", lateFee: 0, surcharge: 0 });
        expect(text).toContain("por PIX. Obrigado!");
        expect(text).not.toContain("Multa e juros");
        expect(text).not.toContain("Taxa de processamento");
        expect(text).toContain("Total pago: R$ 249,90");
        expect(buildReceiptEmail({ ...receipt, paidVia: null, lateFee: 0, surcharge: 0 }).text).toContain("em 27/10/2026. Obrigado!");
    });
});

describe("withCopyNote", () => {
    it("marks the subject, the text and the HTML, and leaves the rest as the tenant gets it", () => {
        const original = buildInvoiceEmail(input());
        const copy = withCopyNote(original, "Cópia do e-mail da fatura que o inquilino recebe (ana@example.com).");
        expect(copy.subject).toBe(`[Cópia] ${original.subject}`);
        expect(copy.text.startsWith("Cópia do e-mail da fatura que o inquilino recebe (ana@example.com).\n\nOlá, Ana,")).toBe(true);
        expect(copy.html).toContain("Cópia do e-mail da fatura que o inquilino recebe (ana@example.com).");
        expect(copy.html.length).toBeGreaterThan(original.html.length);
        expect(copy.html).toContain("Ver fatura e pagar");
        // the note is escaped like everything else
        expect(withCopyNote(original, "a <b> & c").html).toContain("a &lt;b&gt; &amp; c");
    });
});
