import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
        return new NextResponse("URL is required", { status: 400 });
    }

    try {
        const decodedUrl = decodeURIComponent(targetUrl);

        // Validate protocol
        if (!decodedUrl.startsWith("http://") && !decodedUrl.startsWith("https://")) {
            return new NextResponse("Invalid protocol", { status: 400 });
        }

        const response = await fetch(decodedUrl, {
            headers: {
                Accept: "application/pdf,application/octet-stream,*/*",
            },
        });

        if (!response.ok) {
            return new NextResponse(`Failed to fetch document: ${response.statusText}`, {
                status: response.status,
            });
        }

        const contentType = response.headers.get("content-type") || "application/pdf";
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": contentType.includes("pdf") ? "application/pdf" : contentType,
                "Content-Disposition": 'inline; filename="documento.pdf"',
                "Cache-Control": "public, max-age=3600, s-maxage=3600",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (err: any) {
        console.error("[PDF Proxy Error]:", err);
        return new NextResponse(`Error proxying document: ${err.message}`, { status: 500 });
    }
}
