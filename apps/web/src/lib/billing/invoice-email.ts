/**
 * The e-mails a tenant gets about an invoice: the subject, a plain-text body and an HTML body built from
 * the same facts. Pure; the sending lives in lib/billing/deliveries-server.ts.
 *
 * The invoice (ISSUE, and RESEND when the owner sends it again) says who is charging (the owner,
 * through Kitnets), what for, how much, until when, and the ways to pay: the Pix code, the boleto's
 * digitable line and the link to the invoice's page (where the QR code and the card are). A REMINDER
 * says the same a few days before the due date; an OVERDUE notice says it is late, what it costs now
 * and until when it still pays. The RECEIPT says it was paid, how and how much.
 */

export type InvoiceEmailKind = "ISSUE" | "RESEND" | "REMINDER" | "OVERDUE";

export interface InvoiceEmailInput {
    number: number;
    /** "SANTO ANTONIO · Kitnet 35C" */
    place: string;
    tenantName: string;
    items: Array<{ description: string; amount: number }>;
    amount: number;
    /** `YYYY-MM-DD` */
    dueDate: string;
    /** `YYYY-MM-DD` (first day) */
    referenceMonth: string;
    digitableLine: string | null;
    pixCopyPaste: string | null;
    /** the invoice's public page */
    pageUrl: string;
    /** the owner, as the tenant knows them (the holding's name, or the sender name the owner chose) */
    senderName: string;
    pdfAttached: boolean;
    kind: InvoiceEmailKind;
    /** OVERDUE: what the delay costs today and until when the invoice still pays */
    overdue?: { daysLate: number; extra: number; total: number; payableUntil: string | null };
    /** the card can be paid on the page */
    cardAvailable?: boolean;
}

export interface EmailContent {
    subject: string;
    text: string;
    html: string;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthLabel = (iso: string) => { const [y, m] = iso.split("-").map(Number); return `${MONTHS[m - 1]} de ${y}`; };
const dateBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "";
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const code = (label: string, value: string) => `
      <p style="margin:16px 0 4px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6b7280">${label}</p>
      <p style="margin:0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-all;color:#111827">${escape(value)}</p>`;

const SHELL_OPEN = `<div style="max-width:560px;margin:0 auto;padding:24px 16px">`;

function shell(subject: string, eyebrow: string, eyebrowColor: string, title: string, body: string, senderName: string): string {
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  ${SHELL_OPEN}
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${eyebrowColor}">${escape(eyebrow)}</p>
      <h1 style="margin:0 0 16px;font-size:20px">${escape(title)}</h1>
${body}
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280;text-align:center">Enviado por ${escape(senderName)} através do Kitnets.com. Dúvidas? Responda a este e-mail.</p>
  </div>
</body></html>`;
}

const itemRows = (items: Array<{ description: string; amount: number }>) =>
    items.map(i => `<tr><td style="padding:6px 0;color:#111827">${escape(i.description)}</td><td style="padding:6px 0;text-align:right;color:#111827">${brl(i.amount)}</td></tr>`).join("");

export function buildInvoiceEmail(input: InvoiceEmailInput): EmailContent {
    const name = firstName(input.tenantName);
    const month = monthLabel(input.referenceMonth);
    const overdue = input.kind === "OVERDUE" ? input.overdue ?? { daysLate: 0, extra: 0, total: input.amount, payableUntil: null } : null;

    const subject = input.kind === "REMINDER"
        ? `Lembrete: fatura nº ${input.number} vence em ${dateBR(input.dueDate)} — ${input.place}`
        : input.kind === "OVERDUE"
            ? `Fatura nº ${input.number} vencida em ${dateBR(input.dueDate)} — ${input.place}`
            : `Fatura nº ${input.number} — ${month} — ${input.place}`;

    const intro = input.kind === "REMINDER"
        ? `a fatura nº ${input.number} de ${month} vence em ${dateBR(input.dueDate)}. Seguem de novo os dados para pagamento.`
        : input.kind === "OVERDUE"
            ? `a fatura nº ${input.number} de ${month} venceu em ${dateBR(input.dueDate)} e ainda não consta como paga.${overdue && overdue.extra > 0 ? ` Com ${plural(overdue.daysLate, "dia", "dias")} de atraso, multa e juros somam ${brl(overdue.extra)}: o valor hoje é ${brl(overdue.total)}.` : ""}${overdue?.payableUntil ? ` O boleto e o PIX aceitam o pagamento até ${dateBR(overdue.payableUntil)}.` : ""} Se já pagou, desconsidere este aviso.`
            : `segue a fatura nº ${input.number}, referente a ${month}, de ${input.place}.`;

    const payWays = [
        ...(input.pixCopyPaste ? ["", "PIX copia e cola (ou leia o QR code na página da fatura):", input.pixCopyPaste] : []),
        ...(input.digitableLine ? ["", "Boleto (linha digitável):", input.digitableLine] : []),
        ...(input.cardAvailable ? ["", "Cartão de crédito: na página da fatura."] : []),
    ];
    const lines = [
        `Olá${name ? `, ${name}` : ""},`,
        "",
        intro,
        "",
        ...input.items.map(i => `  ${i.description}: ${brl(i.amount)}`),
        `  Total: ${brl(input.amount)}`,
        `  Vencimento: ${dateBR(input.dueDate)}`,
        "",
        "Como pagar:",
        ...payWays,
        "",
        `Página da fatura${input.pixCopyPaste ? ", com o QR code" : ""}: ${input.pageUrl}`,
        ...(input.pdfAttached ? ["O boleto em PDF segue anexo."] : []),
        "",
        `Enviado por ${input.senderName} através do Kitnets.com. Dúvidas? Responda a este e-mail.`,
    ];

    const eyebrow = input.kind === "REMINDER" ? "Lembrete de vencimento" : input.kind === "OVERDUE" ? "Fatura vencida" : "Fatura";
    const eyebrowColor = input.kind === "OVERDUE" ? "#be123c" : "#059669";
    const body = `      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Olá${name ? `, ${escape(name)}` : ""}, ${escape(intro)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows(input.items)}
        <tr><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;font-weight:700">Total</td><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;font-size:18px">${brl(input.amount)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Vencimento</td><td style="padding:4px 0;text-align:right;color:#6b7280">${dateBR(input.dueDate)}</td></tr>
        ${overdue && overdue.extra > 0 ? `<tr><td style="padding:4px 0;color:#be123c">Multa e juros até hoje</td><td style="padding:4px 0;text-align:right;color:#be123c">${brl(overdue.extra)}</td></tr>` : ""}
      </table>
      <p style="margin:24px 0 0;text-align:center"><a href="${escape(input.pageUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${input.kind === "OVERDUE" ? "#be123c" : "#059669"};color:#ffffff;text-decoration:none;font-weight:600">Ver fatura e pagar</a></p>
      ${input.pixCopyPaste ? code("PIX copia e cola", input.pixCopyPaste) : ""}
      ${input.digitableLine ? code("Boleto — linha digitável", input.digitableLine) : ""}
      ${input.cardAvailable ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280">Também dá para pagar com cartão de crédito na página da fatura.</p>` : ""}
      ${input.pdfAttached ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280">O boleto em PDF segue anexo.</p>` : ""}`;

    return { subject, text: lines.join("\n"), html: shell(subject, eyebrow, eyebrowColor, `Fatura nº ${input.number} — ${month}`, body, input.senderName) };
}

export interface ReceiptEmailInput {
    number: number;
    place: string;
    tenantName: string;
    items: Array<{ description: string; amount: number }>;
    amount: number;
    /** `YYYY-MM-DD` (first day) */
    referenceMonth: string;
    /** `YYYY-MM-DD` */
    paidOn: string;
    /** what the owner received: the invoice plus any late charges */
    paidAmount: number;
    paidVia: "BOLETO" | "PIX" | "CARD" | "MANUAL" | null;
    lateFee: number;
    /** the card fee passed on, charged on top */
    surcharge: number;
    pageUrl: string;
    senderName: string;
}

const VIA_LABELS: Record<string, string> = { BOLETO: "boleto", PIX: "PIX", CARD: "cartão de crédito", MANUAL: "pagamento recebido pelo proprietário" };

/** The receipt: the invoice was paid, when, how, and how much, line by line. */
export function buildReceiptEmail(input: ReceiptEmailInput): EmailContent {
    const name = firstName(input.tenantName);
    const month = monthLabel(input.referenceMonth);
    const via = input.paidVia ? VIA_LABELS[input.paidVia] ?? input.paidVia : null;
    const charged = Math.round((input.paidAmount + input.surcharge) * 100) / 100;
    const subject = `Recibo: fatura nº ${input.number} paga — ${month} — ${input.place}`;
    const intro = `recebemos o pagamento da fatura nº ${input.number}, referente a ${month}, de ${input.place}, em ${dateBR(input.paidOn)}${via ? ` por ${via}` : ""}. Obrigado!`;

    const extras = [
        ...(input.lateFee > 0 ? [{ description: "Multa e juros por atraso", amount: input.lateFee }] : []),
        ...(input.surcharge > 0 ? [{ description: "Taxa de processamento do cartão", amount: input.surcharge }] : []),
    ];
    const lines = [
        `Olá${name ? `, ${name}` : ""},`,
        "",
        intro,
        "",
        ...input.items.map(i => `  ${i.description}: ${brl(i.amount)}`),
        ...extras.map(i => `  ${i.description}: ${brl(i.amount)}`),
        `  Total pago: ${brl(charged)}`,
        `  Data do pagamento: ${dateBR(input.paidOn)}`,
        ...(via ? [`  Forma: ${via}`] : []),
        "",
        `Este e-mail comprova o recebimento. A fatura: ${input.pageUrl}`,
        "",
        `Enviado por ${input.senderName} através do Kitnets.com. Dúvidas? Responda a este e-mail.`,
    ];
    const body = `      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Olá${name ? `, ${escape(name)}` : ""}, ${escape(intro)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows([...input.items, ...extras])}
        <tr><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;font-weight:700">Total pago</td><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;font-size:18px">${brl(charged)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Data do pagamento</td><td style="padding:4px 0;text-align:right;color:#6b7280">${dateBR(input.paidOn)}</td></tr>
        ${via ? `<tr><td style="padding:4px 0;color:#6b7280">Forma</td><td style="padding:4px 0;text-align:right;color:#6b7280">${escape(via)}</td></tr>` : ""}
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#6b7280">Este e-mail comprova o recebimento. <a href="${escape(input.pageUrl)}" style="color:#059669">Ver a fatura</a>.</p>`;
    return { subject, text: lines.join("\n"), html: shell(subject, "Recibo", "#059669", `Fatura nº ${input.number} — ${month} — paga`, body, input.senderName) };
}

/** Marks an e-mail as a copy sent to the owner: the subject, a first line in the text and a band on top of the HTML. */
export function withCopyNote(content: EmailContent, note: string): EmailContent {
    const band = `<p style="margin:0 0 12px;padding:10px 12px;border:1px dashed #9ca3af;border-radius:8px;background:#ffffff;font-size:13px;color:#374151">${escape(note)}</p>`;
    return {
        subject: `[Cópia] ${content.subject}`,
        text: `${note}\n\n${content.text}`,
        html: content.html.replace(SHELL_OPEN, `${SHELL_OPEN}\n    ${band}`),
    };
}

/** The e-mail's sender as the tenant sees it: the owner's name, with the platform's address. */
export function senderAddress(ownerName: string, fromAddress: string): string {
    const match = /<([^>]+)>/.exec(fromAddress);
    const address = (match ? match[1] : fromAddress).trim();
    const name = ownerName.replace(/["<>\r\n]/g, "").trim();
    return name ? `${name} via Kitnets <${address}>` : fromAddress;
}
