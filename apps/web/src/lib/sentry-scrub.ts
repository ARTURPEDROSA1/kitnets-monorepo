import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Removes Brazilian personal identifiers and contact details from anything
 * that could reach Sentry. The app handles CPF/CNPJ, e-mails and phone numbers
 * of tenants, guarantors and brokers; none of that belongs in an error tracker
 * (LGPD). Applied as `beforeSend` in every runtime.
 */
const PATTERNS: Array<[RegExp, string]> = [
    [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]"],
    [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj]"],
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
    [/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, "[phone]"],
    [/\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, "[jwt]"],
];

export function scrubText(value: string): string {
    let out = value;
    for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
    return out;
}

function scrubDeep<T>(value: T, depth = 0): T {
    if (depth > 6 || value === null || value === undefined) return value;
    if (typeof value === "string") return scrubText(value) as T;
    if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as T;
    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = scrubDeep(v, depth + 1);
        }
        return out as T;
    }
    return value;
}

const DROP_HEADERS = new Set(["cookie", "authorization", "x-clerk-auth-token", "set-cookie"]);

export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
    if (event.message) event.message = scrubText(event.message);

    for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = scrubText(ex.value);
    }

    if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
            for (const h of Object.keys(event.request.headers)) {
                if (DROP_HEADERS.has(h.toLowerCase())) delete event.request.headers[h];
            }
        }
        if (event.request.query_string) {
            event.request.query_string = scrubDeep(event.request.query_string);
        }
        if (event.request.url) event.request.url = scrubText(event.request.url);
    }

    if (event.user) {
        // Keep only the opaque Clerk id for correlation
        event.user = event.user.id ? { id: event.user.id } : undefined;
    }

    if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => ({
            ...b,
            message: b.message ? scrubText(b.message) : b.message,
            data: b.data ? scrubDeep(b.data) : b.data,
        }));
    }

    if (event.extra) event.extra = scrubDeep(event.extra);
    if (event.contexts) event.contexts = scrubDeep(event.contexts);

    return event;
}
