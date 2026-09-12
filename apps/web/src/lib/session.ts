import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Requires a signed-in Clerk user (no profile row needed) and applies a
 * per-user rate limit. For endpoints that call paid third parties (LLM vision,
 * data brokers) and must never be reachable anonymously.
 *
 *   const gate = await requireUserWithLimit("ai:identity", 30, HOUR);
 *   if ("response" in gate) return gate.response;
 *   const { userId } = gate;
 */
export async function requireUserWithLimit(
    scope: string,
    limit: number,
    windowMs: number
): Promise<{ userId: string } | { response: NextResponse }> {
    const { userId } = await auth();
    if (!userId) {
        return { response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
    }
    const result = rateLimit(`${scope}:${userId}`, limit, windowMs);
    if (!result.ok) {
        return { response: rateLimitResponse(result) };
    }
    return { userId };
}

export const UPLOAD_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
];

/** Validates an uploaded file's declared MIME type and size. Returns an error message or null. */
export function validateUpload(file: File, maxBytes: number, allowed: string[] = UPLOAD_MIME_TYPES): string | null {
    if (!allowed.includes(file.type)) {
        return "Tipo de arquivo não suportado. Use JPG, PNG, WebP ou PDF.";
    }
    if (file.size <= 0) {
        return "Arquivo vazio.";
    }
    if (file.size > maxBytes) {
        return `Arquivo muito grande. Máximo: ${Math.round(maxBytes / (1024 * 1024))}MB.`;
    }
    return null;
}
