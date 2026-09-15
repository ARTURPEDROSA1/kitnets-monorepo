import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { z } from "zod";
import { requireProfile, type AuthedContext } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * `withAuth` — the one place an authenticated API route handles the boring
 * parts, so a handler is only its business logic:
 *
 *   export const POST = withAuth({ body: tenantInputSchema, tag: "Tenants POST" },
 *       async ({ body, profileId, supabase }) => { … return NextResponse.json(…) });
 *
 * It resolves the signed-in user to their profile (401/403 via requireProfile),
 * applies an optional per-user rate limit, awaits route params, parses and
 * validates the JSON body against a zod schema (400 `{ errors }` keyed by
 * field, the shape every form already consumes), converts thrown `HttpError`s
 * into responses, and turns anything unexpected into a logged, Sentry-reported
 * 500 with a generic message.
 */

export type FieldErrors = Record<string, string>;

/** Throw from a handler to answer with a specific status and body. */
export class HttpError extends Error {
    constructor(public readonly status: number, public readonly body: Record<string, unknown>) {
        super(typeof body.error === "string" ? body.error : `HTTP ${status}`);
    }
}

export const notFound = (error: string) => new HttpError(404, { error });
export const forbidden = (error: string) => new HttpError(403, { error });
export const conflict = (errors: FieldErrors) => new HttpError(409, { errors });
export const badRequest = (errors: FieldErrors) => new HttpError(400, { errors });

/** First message per top-level field; issues without a path land under `_form`. */
export function fieldErrors(error: z.ZodError): FieldErrors {
    const out: FieldErrors = {};
    for (const issue of error.issues) {
        const key = issue.path.length ? String(issue.path[0]) : "_form";
        if (!(key in out)) out[key] = issue.message;
    }
    return out;
}

export interface RouteContext<TBody, TParams> extends AuthedContext {
    req: NextRequest;
    params: TParams;
    body: TBody;
}

export interface WithAuthOptions<TSchema extends z.ZodTypeAny | undefined> {
    /** zod schema for the JSON body. Omit for GET/DELETE or multipart handlers. */
    body?: TSchema;
    /** Per-user fixed-window limit (see lib/rate-limit.ts). */
    limit?: { scope: string; limit: number; windowMs: number };
    /** Log prefix, e.g. "Tenants POST". */
    tag?: string;
}

type Body<TSchema> = TSchema extends z.ZodTypeAny ? z.output<TSchema> : undefined;

export function withAuth<
    TSchema extends z.ZodTypeAny | undefined = undefined,
    TParams extends Record<string, string> = Record<string, string>,
>(
    options: WithAuthOptions<TSchema>,
    handler: (ctx: RouteContext<Body<TSchema>, TParams>) => Promise<Response> | Response
) {
    const tag = options.tag ?? "api";

    return async (req: NextRequest, route?: { params: Promise<TParams> | TParams }): Promise<Response> => {
        try {
            const authed = await requireProfile();
            if ("response" in authed) return authed.response;

            if (options.limit) {
                const { scope, limit, windowMs } = options.limit;
                const result = await rateLimit(`${scope}:${authed.ctx.userId}`, limit, windowMs);
                if (!result.ok) return rateLimitResponse(result);
            }

            const params = (route ? await route.params : {}) as TParams;

            let body: unknown = undefined;
            if (options.body) {
                let raw: unknown;
                try {
                    raw = await req.json();
                } catch {
                    return NextResponse.json({ error: "Corpo da requisição inválido (JSON esperado)." }, { status: 400 });
                }
                const parsed = options.body.safeParse(raw);
                if (!parsed.success) {
                    return NextResponse.json({ errors: fieldErrors(parsed.error) }, { status: 400 });
                }
                body = parsed.data;
            }

            return await handler({ ...authed.ctx, req, params, body: body as Body<TSchema> });
        } catch (err) {
            if (err instanceof HttpError) {
                return NextResponse.json(err.body, { status: err.status });
            }
            console.error(`[${tag}] Unexpected error:`, err);
            Sentry.captureException(err, { tags: { route: tag } });
            return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
        }
    };
}
