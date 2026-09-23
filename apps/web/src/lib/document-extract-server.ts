import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { AI_MODELS, reportAiFallback } from "@/lib/ai-models";
import { scannedPdfPageImages } from "@/lib/pdf-page-images";

/**
 * One document, one prompt, one JSON answer — the runner behind the Novos Investimentos readers
 * (the purchase contract, the payment receipts).
 *
 * Gemini on the PDF's text, or on the file itself when it is a scan or an image; OpenAI as the
 * fallback. A scanned PDF reaches OpenAI as its page images, never as the PDF: handed the file, the
 * chat models invent numbers instead of reading them, and both a quadro resumo and a receipt are
 * nothing but numbers.
 */

// Gemini overloaded tends to hang before answering 503: leave the fallback time to run
const GEMINI_TIMEOUT_MS = 90_000;
// The clauses that matter can sit deep in a long contract; a receipt is one page.
const MAX_TEXT_CHARS = 60000;

export function parseJsonResponse(text: string): unknown {
    let clean = text.trim();
    if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd >= jsonStart) clean = clean.substring(jsonStart, jsonEnd + 1);
    return JSON.parse(clean);
}

/** The PDF's text layer, or "" when there is none (a scan) or it cannot be read. */
export async function pdfText(buffer: Buffer, tag: string): Promise<string> {
    try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        return (await extractText(pdf, { mergePages: true })).text || "";
    } catch (err) {
        console.warn(`[${tag}] PDF text extraction failed:`, err);
        return "";
    }
}

export const aiConfigured = () => Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

export interface ExtractionInput {
    prompt: string;
    buffer: Buffer;
    mimeType: string;
    /** The document's text layer when it has one; the file goes as an image otherwise. */
    textContent: string;
    /** Log / Sentry tag, e.g. "Investment Extract". */
    tag: string;
}

export async function runDocumentExtraction({ prompt, buffer, mimeType, textContent, tag }: ExtractionInput): Promise<unknown | null> {
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
                    ? [{ text: `${prompt}\n\nConteúdo do documento:\n\n${textContent.substring(0, MAX_TEXT_CHARS)}` }]
                    : [{ text: prompt }, { inlineData: { mimeType, data: base64 } }]
            );
            return parseJsonResponse(result.response.text());
        } catch (err) {
            console.warn(`[${tag}] Gemini failed:`, err);
            reportAiFallback(tag, err);
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
                  { role: "system", content: prompt },
                  { role: "user", content: textContent.substring(0, MAX_TEXT_CHARS) },
              ]
            : [
                  {
                      role: "user",
                      content: [
                          { type: "text", text: prompt },
                          ...images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
                      ],
                  },
              ],
    });
    const content = completion.choices[0]?.message?.content;
    return content ? parseJsonResponse(content) : null;
}
