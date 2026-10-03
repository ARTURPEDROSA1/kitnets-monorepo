/**
 * Reads a document with AI and returns the JSON its prompt asks for — the engine behind the lease
 * import (`POST /api/leases/extract`) and the addendum import (`POST /api/leases/[id]/reajustes/extrair`).
 *
 * Gemini on the text (or on the file when it is a scan), OpenAI as the fallback. A scanned PDF reaches
 * OpenAI as its page images: handed the PDF itself, gpt-4o got the names right and made up the address
 * and the dates (checked against a real signed lease, 2026-09-18).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { AI_MODELS, reportAiFallback } from "@/lib/ai-models";
import { scannedPdfPageImages } from "@/lib/pdf-page-images";

// Gemini overloaded tends to hang before answering 503: leave the fallback time to run
const GEMINI_TIMEOUT_MS = 90_000;
// Leases run long and the clauses that matter (reajuste, garantia) sit near the end.
const MAX_TEXT_CHARS = 60000;

export const aiAvailable = (): boolean => Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

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

/** The text layer of a PDF ("" for a scan, an image, or a file that cannot be parsed). */
export async function pdfTextOf(buffer: Buffer, mimeType: string, tag: string): Promise<string> {
    if (mimeType !== "application/pdf") return "";
    try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        return (await extractText(pdf, { mergePages: true })).text || "";
    } catch (err) {
        console.warn(`[${tag}] PDF text extraction failed:`, err);
        return "";
    }
}

export interface DocumentExtraction {
    prompt: string;
    /** what introduces the document's text after the prompt: "Conteúdo do contrato" */
    contentLabel: string;
    /** the PDF's text layer; under 100 characters the file itself is read (a scan) */
    textContent: string;
    buffer: Buffer;
    mimeType: string;
    tag: string;
}

/** The parsed JSON, or null when no model could read the file. Throws what the fallback throws. */
export async function extractJsonFromDocument({ prompt, contentLabel, textContent, buffer, mimeType, tag }: DocumentExtraction): Promise<unknown | null> {
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
                    ? [{ text: `${prompt}\n\n${contentLabel}:\n\n${textContent.substring(0, MAX_TEXT_CHARS)}` }]
                    : [{ text: prompt }, { inlineData: { mimeType, data: base64 } }]
            );
            return parseJsonResponse(result.response.text());
        } catch (err) {
            console.warn(`[${tag}] Gemini failed:`, err);
            reportAiFallback(tag, err);
        }
    }

    if (!process.env.OPENAI_API_KEY) return null;
    // Chat completions read images, not scans inside a PDF: send the pages as pictures
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
