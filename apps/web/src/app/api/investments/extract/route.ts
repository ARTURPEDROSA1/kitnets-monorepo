import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { HOUR } from "@/lib/rate-limit";
import { validateUpload } from "@/lib/session";
import { AI_MODELS, reportAiFallback } from "@/lib/ai-models";
import { scannedPdfPageImages } from "@/lib/pdf-page-images";
import {
    STAGED_UPLOAD_MAX_SIZE,
    downloadStagedUpload,
    mimeTypeOfPath,
    ownStagedPath,
} from "@/lib/new-investments-server";
import {
    INVESTMENT_EXTRACTION_PROMPT,
    inferTotalPrice,
    isEmptyInvestmentExtraction,
    normalizeInvestmentExtraction,
} from "@/lib/new-investment-extract";

export const runtime = "nodejs";
// A long purchase contract on the OpenAI fallback takes minutes, and it only starts after Gemini times out.
export const maxDuration = 300;
// Gemini overloaded tends to hang before answering 503: leave the fallback time to run
const GEMINI_TIMEOUT_MS = 90_000;

const TAG = "Investment Extract";
// The quadro resumo is usually on page 1-3, but the payment clause can sit deep in a long contract.
const MAX_TEXT_CHARS = 60000;

function parseJsonResponse(text: string): unknown {
    let clean = text.trim();
    if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd >= jsonStart) clean = clean.substring(jsonStart, jsonEnd + 1);
    return JSON.parse(clean);
}

/**
 * Gemini on the text (or on the file when it is a scan), OpenAI as the fallback. A scanned PDF
 * reaches OpenAI as its page images: handed a PDF, the chat models invent numbers instead of
 * reading them, and a quadro resumo is nothing but numbers.
 */
async function runExtraction(textContent: string, buffer: Buffer, mimeType: string): Promise<unknown | null> {
    const base64 = buffer.toString("base64");
    const hasText = textContent.trim().length >= 100;

    if (process.env.GEMINI_API_KEY) {
        try {
            const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel(
                { model: AI_MODELS.gemini, generationConfig: { temperature: 0, responseMimeType: "application/json" } },
                { timeout: GEMINI_TIMEOUT_MS }
            );
            const result = await model.generateContent(
                hasText
                    ? [{ text: `${INVESTMENT_EXTRACTION_PROMPT}\n\nConteúdo do contrato:\n\n${textContent.substring(0, MAX_TEXT_CHARS)}` }]
                    : [{ text: INVESTMENT_EXTRACTION_PROMPT }, { inlineData: { mimeType, data: base64 } }]
            );
            return parseJsonResponse(result.response.text());
        } catch (err) {
            console.warn(`[${TAG}] Gemini failed:`, err);
            reportAiFallback(TAG, err);
        }
    }

    if (!process.env.OPENAI_API_KEY) return null;

    let images = [`data:${mimeType};base64,${base64}`];
    if (!hasText && mimeType === "application/pdf") {
        images = await scannedPdfPageImages(new Uint8Array(buffer));
        if (images.length === 0) return null;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
        model: hasText ? AI_MODELS.openaiMini : AI_MODELS.openai,
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 4000,
        messages: hasText
            ? [
                  { role: "system", content: INVESTMENT_EXTRACTION_PROMPT },
                  { role: "user", content: textContent.substring(0, MAX_TEXT_CHARS) },
              ]
            : [
                  {
                      role: "user",
                      content: [
                          { type: "text", text: INVESTMENT_EXTRACTION_PROMPT },
                          ...images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
                      ],
                  },
              ],
    });
    const content = completion.choices[0]?.message?.content;
    return content ? parseJsonResponse(content) : null;
}

/**
 * POST /api/investments/extract
 * JSON `{ storage_path }` — the contract the browser uploaded through POST
 * /api/investments/upload-url — or multipart/form-data with `file`.
 *
 * Reads the quadro resumo and the payment clause of an off-plan purchase contract. Read-only:
 * nothing is created here, the form shows what was found and the user confirms it.
 */
export const POST = withAuth(
    { tag: TAG, limit: { scope: "ai:extract-investment", limit: 30, windowMs: HOUR } },
    async ({ req, profileId, supabase }) => {
        let buffer: Buffer;
        let mimeType: string;
        if ((req.headers.get("content-type") || "").includes("application/json")) {
            const path = ownStagedPath(profileId, (await readJsonBody(req)).storage_path);
            const staged = path ? await downloadStagedUpload(supabase, path) : null;
            if (!path || !staged) {
                return NextResponse.json({ error: "Arquivo não encontrado. Envie o contrato novamente." }, { status: 400 });
            }
            buffer = staged;
            mimeType = mimeTypeOfPath(path);
        } else {
            const formData = await req.formData();
            const file = formData.get("file");
            if (!(file instanceof File)) {
                return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
            }
            const uploadError = validateUpload(file, STAGED_UPLOAD_MAX_SIZE, [
                "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp",
            ]);
            if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

            buffer = Buffer.from(await file.arrayBuffer());
            mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type;
        }

        let textContent = "";
        if (mimeType === "application/pdf") {
            try {
                const pdf = await getDocumentProxy(new Uint8Array(buffer));
                textContent = (await extractText(pdf, { mergePages: true })).text || "";
            } catch (pdfError) {
                console.warn(`[${TAG}] PDF text extraction failed:`, pdfError);
            }
        }

        if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "Serviço de IA indisponível." }, { status: 503 });
        }

        let raw: unknown | null = null;
        try {
            raw = await runExtraction(textContent, buffer, mimeType);
        } catch (err) {
            console.error(`[${TAG}] AI extraction failed:`, err);
        }
        if (!raw) {
            return NextResponse.json({ error: "Não foi possível ler o contrato. Tente outro arquivo ou preencha manualmente." }, { status: 422 });
        }

        const data = normalizeInvestmentExtraction(raw);
        if (isEmptyInvestmentExtraction(data)) {
            return NextResponse.json({ error: "Este arquivo não parece ser um contrato de compra de imóvel." }, { status: 422 });
        }

        return NextResponse.json({ success: true, data, inferred_total: inferTotalPrice(data) });
    }
);
