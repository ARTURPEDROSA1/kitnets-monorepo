import { NextResponse, type NextRequest } from "next/server";
import { rateLimitByIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/utils/supabase/admin";
import { currentPdfPath, referenceOf, rowByShareToken, signedDownload } from "@/lib/contract/document-server";
import { contractFileName } from "@/lib/contract/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/assinar/[token]/pdf — the PDF to sign now (the latest signed copy, else the accepted one),
 * through a short-lived storage link. No login: the signing link's token is the key.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const limit = await rateLimitByIp("assinar-pdf", 30, 60_000);
    if (!limit.ok) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
    const supabase = createAdminClient();
    const row = await rowByShareToken(supabase, token);
    const path = row ? currentPdfPath(row) : null;
    if (!row || !path) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
    const reference = await referenceOf(supabase, row.lease_id);
    const url = await signedDownload(supabase, path, contractFileName(reference, row.status === "SIGNED" ? "assinado" : row.signature_count ? `${row.signature_count} assinatura${row.signature_count === 1 ? "" : "s"}` : "para assinatura"));
    if (!url) return NextResponse.json({ error: "Arquivo indisponível. Tente novamente." }, { status: 502 });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
