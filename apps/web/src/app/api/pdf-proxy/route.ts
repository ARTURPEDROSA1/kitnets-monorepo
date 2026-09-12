import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/pdf-proxy?url=<supabase storage url>
 *
 * Streams a document from THIS project's Supabase Storage to the in-app PDF
 * viewer (same-origin blob, inline disposition). It used to accept any URL
 * with no auth, `Access-Control-Allow-Origin: *` and public edge caching,
 * which made it an open proxy / SSRF vector. Now:
 *   - caller must be signed in
 *   - only `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/…` is allowed
 *   - responses are private and never cached at the edge
 */
const MAX_BYTES = 25 * 1024 * 1024;

function allowedOrigin(): string | null {
    try {
        return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const raw = req.nextUrl.searchParams.get("url");
    if (!raw) {
        return new NextResponse("URL is required", { status: 400 });
    }

    let target: URL;
    try {
        target = new URL(raw);
    } catch {
        return new NextResponse("Invalid URL", { status: 400 });
    }

    const origin = allowedOrigin();
    if (
        !origin ||
        target.protocol !== "https:" ||
        target.origin !== origin ||
        !target.pathname.startsWith("/storage/v1/object/")
    ) {
        return new NextResponse("URL not allowed", { status: 403 });
    }

    try {
        const response = await fetch(target.toString(), {
            headers: { Accept: "application/pdf,application/octet-stream,*/*" },
            redirect: "error",
            signal: AbortSignal.timeout(20_000),
        });

        if (!response.ok) {
            return new NextResponse("Failed to fetch document", { status: response.status === 404 ? 404 : 502 });
        }

        const length = Number(response.headers.get("content-length") ?? 0);
        if (length > MAX_BYTES) {
            return new NextResponse("Document too large", { status: 413 });
        }

        const contentType = response.headers.get("content-type") || "application/pdf";
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_BYTES) {
            return new NextResponse("Document too large", { status: 413 });
        }

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": contentType.includes("pdf") ? "application/pdf" : contentType,
                "Content-Disposition": 'inline; filename="documento.pdf"',
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (err) {
        console.error("[PDF Proxy] fetch failed:", err instanceof Error ? err.message : err);
        return new NextResponse("Error fetching document", { status: 502 });
    }
}
