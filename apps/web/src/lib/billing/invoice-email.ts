/**
 * The e-mail a tenant gets with an invoice: the subject, a plain-text body and an HTML body built from
 * the same facts. Pure; the sending lives in lib/billing/deliveries-server.ts.
 *
 * It says who is charging (the owner, through Kitnets), what for, how much, until when, and the three
 * ways to pay: the Pix code, the boleto's digitable line and the link to the invoice's page (where the
 * QR code is). The boleto's PDF travels attached when the bank has given it.
 */

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
    /** a reminder of an invoice already sent, or a resend */
    kind: "ISSUE" | "REMINDER" | "RESEND";
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

export function buildInvoiceEmail(input: InvoiceEmailInput): EmailContent {
    const name = firstName(input.tenantName);
    const month = monthLabel(input.referenceMonth);
    const subject = input.kind === "REMINDER"
        ? `Lembrete: fatura nº ${input.number} vence em ${dateBR(input.dueDate)} — ${input.place}`
        : `Fatura nº ${input.number} — ${month} — ${input.place}`;

    const intro = input.kind === "REMINDER"
        ? `a fatura nº ${input.number} de ${month} vence em ${dateBR(input.dueDate)}. Seguem de novo os dados para pagamento.`
        : `segue a fatura nº ${input.number}, referente a ${month}, de ${input.place}.`;
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
        ...(input.pixCopyPaste ? ["", "PIX copia e cola (ou leia o QR code na página da fatura):", input.pixCopyPaste] : []),
        ...(input.digitableLine ? ["", "Boleto (linha digitável):", input.digitableLine] : []),
        "",
        `Página da fatura${input.pixCopyPaste ? ", com o QR code" : ""}: ${input.pageUrl}`,
        ...(input.pdfAttached ? ["O boleto em PDF segue anexo."] : []),
        "",
        `Enviado por ${input.senderName} através do Kitnets. Dúvidas? Responda a este e-mail.`,
    ];

    const rows = input.items.map(i => `<tr><td style="padding:6px 0;color:#111827">${escape(i.description)}</td><td style="padding:6px 0;text-align:right;color:#111827">${brl(i.amount)}</td></tr>`).join("");
    const code = (label: string, value: string) => `
      <p style="margin:16px 0 4px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6b7280">${label}</p>
      <p style="margin:0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-all;color:#111827">${escape(value)}</p>`;
    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#059669">${input.kind === "REMINDER" ? "Lembrete de vencimento" : "Fatura"}</p>
      <h1 style="margin:0 0 16px;font-size:20px">Fatura nº ${input.number} — ${escape(month)}</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Olá${name ? `, ${escape(name)}` : ""}, ${escape(intro)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
        <tr><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;font-weight:700">Total</td><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;font-size:18px">${brl(input.amount)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Vencimento</td><td style="padding:4px 0;text-align:right;color:#6b7280">${dateBR(input.dueDate)}</td></tr>
      </table>
      <p style="margin:24px 0 0;text-align:center"><a href="${escape(input.pageUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#059669;color:#ffffff;text-decoration:none;font-weight:600">Ver fatura e pagar</a></p>
      ${input.pixCopyPaste ? code("PIX copia e cola", input.pixCopyPaste) : ""}
      ${input.digitableLine ? code("Boleto — linha digitável", input.digitableLine) : ""}
      ${input.pdfAttached ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280">O boleto em PDF segue anexo.</p>` : ""}
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280;text-align:center">Enviado por ${escape(input.senderName)} através do Kitnets. Dúvidas? Responda a este e-mail.</p>
  </div>
</body></html>`;

    return { subject, text: lines.join("\n"), html };
}

/** The e-mail's sender as the tenant sees it: the owner's name, with the platform's address. */
export function senderAddress(ownerName: string, fromAddress: string): string {
    const match = /<([^>]+)>/.exec(fromAddress);
    const address = (match ? match[1] : fromAddress).trim();
    const name = ownerName.replace(/["<>\r\n]/g, "").trim();
    return name ? `${name} via Kitnets <${address}>` : fromAddress;
}
