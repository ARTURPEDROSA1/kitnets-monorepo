import { NextResponse } from "next/server";
import { requireUserWithLimit, validateUpload } from "@/lib/session";
import { HOUR } from "@/lib/rate-limit";
import { extractText, getDocumentProxy } from "unpdf";
import { extractionWarnings } from "@/lib/energy-bill-checks";
import { AI_MODELS, reportAiFallback } from "@/lib/ai-models";
import { geminiBillJson, openAiBillJson, parseExtraction } from "@/lib/energy-bill-extract";

export const dynamic = "force-dynamic";

const MAX_PDF_TEXT = 60_000;

/** The PDF's text layer: sent by the browser (it uploads page 1 as an image), or read here from a PDF upload. */
async function pdfTextOf(formData: FormData, buffer: Buffer, mediaType: string): Promise<string | null> {
    const sent = formData.get("pdfText");
    if (typeof sent === "string" && sent.trim()) return sent.slice(0, MAX_PDF_TEXT);
    if (mediaType !== "application/pdf") return null;
    try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        const t = String(text ?? "");
        return t.trim() ? t.slice(0, MAX_PDF_TEXT) : null;
    } catch {
        return null;   // a scanned PDF: the vision model alone reads it
    }
}

export async function POST(request: Request) {
    const gate = await requireUserWithLimit("ai:energy-extract", 30, HOUR);
    if ("response" in gate) return gate.response;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        const uploadError = validateUpload(file, 12 * 1024 * 1024);
        if (uploadError) {
            return NextResponse.json({ error: uploadError }, { status: 400 });
        }

        // Process in-memory buffer — ZERO PERSISTENCE TO STORAGE
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        let mediaType = file.type;
        if (mediaType === "image/jpg") mediaType = "image/jpeg";
        const base64 = buffer.toString("base64");
        // the bill's own printed lines (digital PDFs): they correct what the model reads (lib/energy-bill-extract.ts)
        const pdfText = await pdfTextOf(formData, buffer, mediaType);

        // 1. Try Gemini Vision (Fast & Free)
        try {
            console.log("[extract-energy-bill] Attempting Gemini Vision extraction...");
            const extracted = parseExtraction(await geminiBillJson(base64, mediaType, AI_MODELS.gemini), pdfText);
            console.log(`[extract-energy-bill] ✅ Gemini Vision succeeded. Month: ${extracted.referenceMonth}${pdfText ? " (text layer applied)" : ""}`);
            return NextResponse.json({
                success: true,
                data: extracted,
                warnings: extractionWarnings(extracted),
                method: "gemini-vision",
            });
        } catch (geminiError) {
            console.warn("[extract-energy-bill] Gemini Vision failed, attempting OpenAI fallback:", geminiError);
            reportAiFallback("extract-energy-bill vision", geminiError);
        }

        // 2. Try OpenAI GPT-4o Vision (Fallback)
        try {
            console.log("[extract-energy-bill] Attempting OpenAI Vision fallback...");
            const extracted = parseExtraction(await openAiBillJson(base64, mediaType, AI_MODELS.openai), pdfText);
            console.log("[extract-energy-bill] ✅ OpenAI Vision succeeded.");
            return NextResponse.json({
                success: true,
                data: extracted,
                warnings: extractionWarnings(extracted),
                method: "gpt-4o-vision",
            });
        } catch (openaiError) {
            console.error("[extract-energy-bill] OpenAI Vision also failed:", openaiError);
            const message = openaiError instanceof Error ? openaiError.message : "Erro desconhecido";
            return NextResponse.json(
                { error: `Falha na extração por IA. Erro: ${message}` },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("[extract-energy-bill] Critical error:", error);
        const message = error instanceof Error ? error.message : "Erro interno";
        return NextResponse.json({ error: `Erro no processamento da fatura: ${message}` }, { status: 500 });
    }
}
