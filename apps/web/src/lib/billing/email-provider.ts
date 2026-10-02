/**
 * Sending an e-mail through Resend (https://resend.com/docs/api-reference/emails/send-email) with
 * plain `fetch` — no SDK for one endpoint. The provider's message id comes back; the delivery row's id
 * goes up as the idempotency key, so a retry of the same delivery never produces a second message.
 *
 * Without `RESEND_API_KEY` nothing is sent: `emailAvailable()` is false and the deliveries say so.
 */

export interface EmailAttachment {
    filename: string;
    /** bytes */
    content: Buffer;
    contentType?: string;
}

export interface EmailMessage {
    from: string;
    to: string;
    replyTo?: string | null;
    subject: string;
    text: string;
    html: string;
    attachments?: EmailAttachment[];
    /** the delivery's id: the provider refuses to send the same key twice */
    idempotencyKey: string;
}

export class EmailError extends Error {
    constructor(message: string, public readonly status: number | null = null, public readonly permanent = false) {
        super(message);
    }
}

export const emailAvailable = (env: Record<string, string | undefined> = process.env): boolean => Boolean(env.RESEND_API_KEY && env.BILLING_EMAIL_FROM);

/** Sends through Resend; resolves with the provider's message id. */
export async function sendEmail(message: EmailMessage, opts: { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch } = {}): Promise<string> {
    const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
    if (!apiKey) throw new EmailError("Envio de e-mail não configurado neste servidor (RESEND_API_KEY).", null, true);
    const doFetch = opts.fetchImpl ?? fetch;
    let response: Response;
    try {
        response = await doFetch(`${opts.baseUrl ?? "https://api.resend.com"}/emails`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey },
            body: JSON.stringify({
                from: message.from,
                to: [message.to],
                ...(message.replyTo ? { reply_to: message.replyTo } : {}),
                subject: message.subject,
                text: message.text,
                html: message.html,
                ...(message.attachments?.length ? { attachments: message.attachments.map(a => ({ filename: a.filename, content: a.content.toString("base64"), ...(a.contentType ? { content_type: a.contentType } : {}) })) } : {}),
            }),
            signal: AbortSignal.timeout(20_000),
        });
    } catch (err) {
        throw new EmailError(`Não foi possível falar com o serviço de e-mail (${(err as Error).name === "TimeoutError" ? "tempo esgotado" : "falha de rede"}).`);
    }
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.ok) {
        const id = typeof json.id === "string" ? json.id : "";
        if (!id) throw new EmailError("O serviço de e-mail aceitou a mensagem mas não devolveu o seu id.", response.status);
        return id;
    }
    const detail = typeof json.message === "string" ? json.message : typeof json.error === "string" ? json.error : `HTTP ${response.status}`;
    // 4xx: the message itself (address, domain, key) will not get better on a retry
    throw new EmailError(`O serviço de e-mail recusou a mensagem: ${detail.slice(0, 200)}`, response.status, response.status >= 400 && response.status < 500 && response.status !== 429);
}
