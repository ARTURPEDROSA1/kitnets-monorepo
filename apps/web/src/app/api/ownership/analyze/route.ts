
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { DocumentExtractionResult } from '@/types/ownership';

// --- CONFIGURATION ---
const SYSTEM_PROMPT = `
You are an expert real estate document analyst. Your task is to extract structured ownership information from documents uploaded by landlords.

Identify the document type from: 'MATRICULA', 'ESCRITURA', 'CONTRATO_COMPRA_VENDA', 'IPTU', 'CONTRATO_LOCACAO', 'CONTA_AGUA', 'CONTA_LUZ', 'CONTA_GAS', 'OUTRO'.

Extract the following fields if present:
- owner_name (Full name of the owner/landlord)
- cpf (Owner's CPF)
- address (street, number, city, state, cep)
- registry (matricula_number, cartorio_name) needed if type is MATRICULA/ESCRITURA
- dates (issue_date, registration_date)

Return ONLY valid JSON matching this structure:
{
    "classified_type": "string",
    "type_confidence": number (0-1),
    "extracted_data": {
        "owner_name": "string",
        "cpf": "string",
        "address": { 
             "street": "string (Extract full street name, e.g. RUA JOSE GOIS)", 
             "number": "string (e.g. 45)", 
             "neighborhood": "string (e.g. SANTO ANTONIO)", 
             "city": "string (e.g. ITABIRITO)", 
             "state": "string (e.g. MG)", 
             "cep": "string (e.g. 35450-264)" 
        },
        "registry": { "matricula_number": "...", "cartorio_name": "..." },
        "dates": { "issue_date": "YYYY-MM-DD" }
    },
    "instructions": "EXTRACT THE PROPERTY ADDRESS LISTED ON THE BILL/DOCUMENT. IGNORE IF NAME MATCHES OR NOT. FOCUS ON THE SERVICE ADDRESS.",
    "field_confidence": { "field_name": number }
}

If a field is not found, exclude it or set to null.
`;

// --- PDF text extraction (no AI needed) ---
async function extractPdfText(buffer: Buffer): Promise<string | null> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        const text = data.text?.trim();
        // If text is too short, the PDF is likely image-based (scanned)
        if (!text || text.length < 50) return null;
        return text;
    } catch (err) {
        console.warn('[Ownership] PDF text extraction failed:', err);
        return null;
    }
}

// --- Helper: Clients ---
const getOpenAIClient = () => {
    if (!process.env.OPENAI_API_KEY) return null;
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const getGeminiClient = () => {
    if (!process.env.GEMINI_API_KEY) return null;
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

function parseJsonResponse(text: string): any {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
}

// --- TEXT-BASED ANALYSIS (for PDFs with selectable text) ---

async function analyzeTextWithGemini(text: string): Promise<any> {
    const client = getGeminiClient();
    if (!client) throw new Error("Gemini API Key missing");

    const model = client.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent([
        SYSTEM_PROMPT,
        `Here is the full text extracted from the document:\n\n${text}`
    ]);

    const response = await result.response;
    return parseJsonResponse(response.text());
}

async function analyzeTextWithOpenAI(text: string): Promise<any> {
    const client = getOpenAIClient();
    if (!client) throw new Error("OpenAI API Key missing");

    const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Here is the full text extracted from the document:\n\n${text}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content from OpenAI");
    return parseJsonResponse(content);
}

// --- VISION-BASED ANALYSIS (for images / scanned PDFs) ---

async function analyzeVisionWithGemini(base64Image: string, mimeType: string): Promise<any> {
    const client = getGeminiClient();
    if (!client) throw new Error("Gemini API Key missing");

    const model = client.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent([
        SYSTEM_PROMPT,
        {
            inlineData: {
                data: base64Image,
                mimeType: mimeType
            }
        }
    ]);

    const response = await result.response;
    return parseJsonResponse(response.text());
}

async function analyzeVisionWithOpenAI(base64Image: string, mimeType: string): Promise<any> {
    const client = getOpenAIClient();
    if (!client) throw new Error("OpenAI API Key missing");

    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: [
                    { type: "text", text: "Analyze this document." },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:${mimeType};base64,${base64Image}`,
                            detail: "high"
                        },
                    },
                ],
            },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content from OpenAI");
    return parseJsonResponse(content);
}

// --- Combined helpers: try Gemini first, fallback to OpenAI ---

async function analyzeText(text: string): Promise<{ result: any; provider: string }> {
    // 1. Try Gemini
    try {
        console.log('[Ownership] Trying Gemini Text...');
        const result = await analyzeTextWithGemini(text);
        return { result, provider: 'gemini' };
    } catch (err) {
        console.warn('[Ownership] Gemini Text failed:', err);
    }

    // 2. Fallback to OpenAI
    console.log('[Ownership] Falling back to OpenAI Text...');
    const result = await analyzeTextWithOpenAI(text);
    return { result, provider: 'openai' };
}

async function analyzeVision(base64: string, mimeType: string): Promise<{ result: any; provider: string }> {
    // 1. Try Gemini
    try {
        console.log('[Ownership] Trying Gemini Vision...');
        const result = await analyzeVisionWithGemini(base64, mimeType);
        return { result, provider: 'gemini' };
    } catch (err) {
        console.warn('[Ownership] Gemini Vision failed:', err);
    }

    // 2. Fallback to OpenAI
    console.log('[Ownership] Falling back to OpenAI Vision...');
    const result = await analyzeVisionWithOpenAI(base64, mimeType);
    return { result, provider: 'openai' };
}

// --- MAIN HANDLER ---

export async function POST(request: NextRequest) {
    console.log("[API] /api/ownership/analyze called");
    try {
        const formData = await request.formData();
        const files = formData.getAll('file') as File[];

        if (!files || files.length === 0) {
            console.warn("[API] No files provided in request");
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        console.log(`[API] Processing ${files.length} files`);
        const results: DocumentExtractionResult[] = [];

        for (const file of files) {
            console.log(`[API] Processing file: ${file.name} (${file.type})`);
            const methods_tried: string[] = [];

            try {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64 = buffer.toString('base64');
                const mimeType = file.type || 'application/octet-stream';
                const isPdf = mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

                let resultRaw: any = null;
                let extractionMethod = 'unknown';

                // ===== STRATEGY 1: PDF Text Extraction + AI =====
                if (isPdf) {
                    console.log('[Ownership] PDF detected — trying text extraction first...');
                    methods_tried.push('pdf_text_extract');

                    const pdfText = await extractPdfText(buffer);

                    if (pdfText) {
                        console.log(`[Ownership] PDF text extracted: ${pdfText.length} chars`);
                        methods_tried.push('pdf_text_ai');

                        try {
                            const { result, provider } = await analyzeText(pdfText);
                            resultRaw = result;
                            extractionMethod = `pdf_text_ai_${provider}`;
                            console.log(`[Ownership] ✅ Text AI analysis successful (${provider})`);
                        } catch (textAiErr) {
                            console.warn('[Ownership] Text AI analysis failed:', textAiErr);
                            methods_tried.push('pdf_text_ai_failed');
                        }
                    } else {
                        console.log('[Ownership] No selectable text found in PDF (likely scanned/image)');
                        methods_tried.push('pdf_no_text');
                    }
                }

                // ===== STRATEGY 2: Vision AI (fallback for images / scanned PDFs) =====
                if (!resultRaw) {
                    console.log('[Ownership] Trying Vision AI analysis...');
                    methods_tried.push('vision_ai');

                    try {
                        const { result, provider } = await analyzeVision(base64, mimeType);
                        resultRaw = result;
                        extractionMethod = `vision_${provider}`;
                        console.log(`[Ownership] ✅ Vision analysis successful (${provider})`);
                    } catch (visionErr) {
                        console.error('[Ownership] Vision AI also failed:', visionErr);
                        methods_tried.push('vision_ai_failed');
                    }
                }

                // ===== Result =====
                if (resultRaw) {
                    console.log(`[Ownership] ✅ Final result for ${file.name}: method=${extractionMethod}, type=${resultRaw.classified_type}`);
                    results.push({
                        document_id: crypto.randomUUID(),
                        success: true,
                        classified_type: resultRaw.classified_type || 'OUTRO',
                        type_confidence: resultRaw.type_confidence || 0.8,
                        extracted_data: resultRaw.extracted_data || {},
                        field_confidence: resultRaw.field_confidence || {},
                        extraction_method: extractionMethod,
                        methods_tried
                    });
                } else {
                    console.error(`[Ownership] ❌ All methods failed for ${file.name}. Tried: ${methods_tried.join(' → ')}`);
                    results.push({
                        document_id: crypto.randomUUID(),
                        success: false,
                        classified_type: 'OUTRO',
                        type_confidence: 0,
                        extracted_data: {},
                        field_confidence: {},
                        extraction_method: 'none',
                        methods_tried
                    });
                }
            } catch (fileProcessingError) {
                console.error(`[API] Error processing file ${file.name}:`, fileProcessingError);
                results.push({
                    document_id: crypto.randomUUID(),
                    success: false,
                    classified_type: 'OUTRO',
                    type_confidence: 0,
                    extracted_data: {},
                    field_confidence: {},
                    extraction_method: 'error',
                    methods_tried
                });
            }
        }

        return NextResponse.json({ results });

    } catch (error) {
        console.error('[API] Critical Error processing ownership documents:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
