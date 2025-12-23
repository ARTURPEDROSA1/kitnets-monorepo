
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

// Helper: Clients
const getOpenAIClient = () => {
    if (!process.env.OPENAI_API_KEY) return null;
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const getGeminiClient = () => {
    if (!process.env.GEMINI_API_KEY) return null;
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

// --- STRATEGIES ---

async function analyzeWithGemini(base64Image: string, mimeType: string): Promise<any> {
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
    const text = response.text();
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Gemini JSON Parse Error:", text);
        throw e;
    }
}

async function analyzeWithOpenAI(base64Image: string, mimeType: string): Promise<any> {
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

    try {
        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("OpenAI JSON Parse Error:", content);
        throw e;
    }
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
            try {
                // Prepare inputs
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Image = buffer.toString('base64');
                const mimeType = file.type || 'application/octet-stream';

                let resultRaw: any = null;
                let providerUsed = 'unknown';

                // 1. Try Gemini (Primary)
                try {
                    console.log("[API] Attempting Gemini analysis...");
                    resultRaw = await analyzeWithGemini(base64Image, mimeType);
                    providerUsed = 'gemini';
                } catch (geminiError) {
                    console.warn(`[Analysis] Gemini failed for ${file.name}:`, geminiError);

                    // 2. Fallback to OpenAI
                    try {
                        console.log("[API] Attempting OpenAI fallback...");
                        resultRaw = await analyzeWithOpenAI(base64Image, mimeType);
                        providerUsed = 'openai';
                    } catch (openAiError) {
                        console.error(`[Analysis] OpenAI also failed for ${file.name}:`, openAiError);
                        results.push({
                            document_id: crypto.randomUUID(),
                            success: false,
                            classified_type: 'OUTRO',
                            type_confidence: 0,
                            extracted_data: {},
                            field_confidence: {}
                        });
                        continue;
                    }
                }

                // Success processing
                if (resultRaw) {
                    console.log(`[API] Analysis successful with ${providerUsed}`);
                    results.push({
                        document_id: crypto.randomUUID(),
                        success: true,
                        classified_type: resultRaw.classified_type || 'OUTRO',
                        type_confidence: resultRaw.type_confidence || 0.8,
                        extracted_data: resultRaw.extracted_data || {},
                        field_confidence: resultRaw.field_confidence || {}
                    });
                }
            } catch (fileProcessingError) {
                console.error(`[API] Error processing file ${file.name}:`, fileProcessingError);
                // Push error for this specific file, but don't crash entire batch
                results.push({
                    document_id: crypto.randomUUID(),
                    success: false,
                    classified_type: 'OUTRO',
                    type_confidence: 0,
                    extracted_data: {},
                    field_confidence: {}
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
