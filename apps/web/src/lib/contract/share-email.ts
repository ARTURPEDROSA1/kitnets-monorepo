/**
 * The e-mail that takes the contract to the tenant: what it is, the link to the signing page and the
 * three steps on gov.br. Plain text and a simple HTML version; nothing in it comes unescaped.
 */
import { GOVBR_SIGNER_URL } from "./document";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface ShareEmailInput {
    tenantName: string | null;
    ownerName: string;
    reference: string;
    url: string;
    expiresAt: string;
}

export function contractShareEmail(input: ShareEmailInput): { subject: string; text: string; html: string } {
    const first = input.tenantName?.trim().split(/\s+/)[0] ?? "";
    const hello = first ? `Olá, ${first}!` : "Olá!";
    const until = input.expiresAt.slice(0, 10).split("-").reverse().join("/");
    const steps = [
        "Abra o link e baixe o contrato em PDF.",
        `Assine no assinador do gov.br (${GOVBR_SIGNER_URL}) com a sua conta gov.br nível prata ou ouro: envie o PDF, posicione a assinatura, confirme com o código e baixe o arquivo assinado.`,
        "Volte ao link e envie o PDF assinado.",
    ];
    const subject = `Contrato de locação para assinatura – ${input.reference}`;
    const text = [
        hello,
        "",
        `${input.ownerName} enviou o contrato de locação de ${input.reference} para você ler e assinar pelo gov.br.`,
        "",
        ...steps.map((s, i) => `${i + 1}. ${s}`),
        "",
        `Link (válido até ${until}): ${input.url}`,
        "",
        "Dúvidas sobre o contrato: responda este e-mail.",
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px"><tr><td>
<p style="font-size:16px;margin:0 0 12px">${escapeHtml(hello)}</p>
<p style="font-size:14px;line-height:1.5;margin:0 0 16px"><strong>${escapeHtml(input.ownerName)}</strong> enviou o contrato de locação de <strong>${escapeHtml(input.reference)}</strong> para você ler e assinar pelo gov.br.</p>
<ol style="font-size:14px;line-height:1.5;padding-left:20px;margin:0 0 20px">${steps.map(s => `<li style="margin-bottom:6px">${escapeHtml(s)}</li>`).join("")}</ol>
<p style="margin:0 0 20px"><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px;font-size:14px">Abrir o contrato</a></p>
<p style="font-size:12px;color:#71717a;margin:0">Link válido até ${escapeHtml(until)}. Dúvidas sobre o contrato: responda este e-mail.</p>
</td></tr></table></body></html>`;
    return { subject, text, html };
}
