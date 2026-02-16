
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { DocumentExtractionResult } from '@/types/ownership';

// ============================================================
// STRATEGY 1: PDF text extraction + regex parsing (FREE, instant)
// ============================================================

async function extractPdfText(buffer: Buffer): Promise<string | null> {
    try {
        // pdf-parse v2 uses a class-based API
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        const text = result.text?.trim();
        console.log(`[Ownership] pdf-parse getText returned ${text?.length ?? 0} chars`);
        if (!text || text.length < 50) {
            console.log('[Ownership] Text too short, treating as image-based PDF');
            await parser.destroy();
            return null;
        }
        await parser.destroy();
        return text;
    } catch (err) {
        console.error('[Ownership] PDF text extraction error:', err);
        return null;
    }
}

/**
 * Classify document type based on keywords found in the text.
 */
function classifyDocumentFromText(text: string): string {
    const t = text.toUpperCase();
    if (t.includes('IPTU') || t.includes('IMPOSTO PREDIAL') || t.includes('IPTU/TSU')) return 'IPTU';
    if (t.includes('MATRÍCULA') || t.includes('MATRICULA') || t.includes('REGISTRO DE IMÓVEIS')) return 'MATRICULA';
    if (t.includes('ESCRITURA PÚBLICA') || t.includes('ESCRITURA PUBLICA')) return 'ESCRITURA';
    if (t.includes('CONTRATO DE COMPRA E VENDA') || t.includes('COMPRA E VENDA')) return 'CONTRATO_COMPRA_VENDA';
    if (t.includes('CONTRATO DE LOCAÇÃO') || t.includes('CONTRATO DE LOCACAO')) return 'CONTRATO_LOCACAO';
    if (t.includes('CONTA DE ÁGUA') || t.includes('CONTA DE AGUA') || t.includes('COMPANHIA DE SANEAMENTO') || t.includes('COPASA') || t.includes('SABESP')) return 'CONTA_AGUA';
    if (t.includes('CONTA DE LUZ') || t.includes('CONTA DE ENERGIA') || t.includes('CEMIG') || t.includes('CPFL') || t.includes('ENEL') || t.includes('ENERGISA')) return 'CONTA_LUZ';
    if (t.includes('CONTA DE GÁS') || t.includes('CONTA DE GAS') || t.includes('COMGÁS') || t.includes('COMGAS')) return 'CONTA_GAS';
    return 'OUTRO';
}

/**
 * Extract structured address data from raw PDF text using regex patterns.
 * Handles common Brazilian document formats: IPTU, utility bills, contracts, etc.
 */
function extractDataFromText(text: string): {
    owner_name: string | null;
    cpf: string | null;
    address: {
        street: string | null;
        number: string | null;
        neighborhood: string | null;
        city: string | null;
        state: string | null;
        cep: string | null;
    };
} {
    // Normalize: collapse multiple spaces/newlines, keep structure
    const t = text.replace(/\r\n/g, '\n');

    // ---- STREET + NUMBER ----
    // Patterns like:
    //   "Endereço:Rua CLAUDIONOR IDELFONSO BRAGA, 000035"
    //   "Endereço do Imóvel: Rua CLAUDIONOR IDELFONSO BRAGA , 000035"
    //   "Endereço: RUA JOSE GOIS, 45"
    //   "End.: Av. Brasil, 1200"
    let street: string | null = null;
    let number: string | null = null;

    // Try "Endereço" patterns (most common)
    const addrPatterns = [
        /Endere[çc]o\s*(?:do\s*Im[oó]vel)?\s*[:.]?\s*(.+?)(?:\n|$)/i,
        /End\.?\s*[:.]?\s*(.+?)(?:\n|$)/i,
        /Logradouro\s*[:.]?\s*(.+?)(?:\n|$)/i,
    ];

    for (const pattern of addrPatterns) {
        const match = t.match(pattern);
        if (match) {
            const raw = match[1].trim();
            // Try to split "Rua X, 123" or "Rua X , 000035" or "Rua X 123"
            const streetNumMatch = raw.match(/^(.+?)\s*[,]\s*(\d+)\s*$/);
            if (streetNumMatch) {
                street = streetNumMatch[1].trim();
                number = streetNumMatch[2].replace(/^0+/, '') || streetNumMatch[2]; // remove leading zeros
            } else {
                // Try "Rua X Nº 123" or "Rua X nro 123" or "Rua X Número 123"
                const nroMatch = raw.match(/^(.+?)\s*(?:N[ºo°]\.?|nro\.?|N[uú]mero)\s*(\d+)/i);
                if (nroMatch) {
                    street = nroMatch[1].trim();
                    number = nroMatch[2].replace(/^0+/, '') || nroMatch[2];
                } else {
                    // Try splitting last word if it's a number
                    const lastNumMatch = raw.match(/^(.+?)\s+(\d{1,6})\s*$/);
                    if (lastNumMatch) {
                        street = lastNumMatch[1].trim();
                        number = lastNumMatch[2].replace(/^0+/, '') || lastNumMatch[2];
                    } else {
                        street = raw;
                    }
                }
            }
            break;
        }
    }

    // ---- NEIGHBORHOOD ----
    let neighborhood: string | null = null;
    const bairroPatterns = [
        /Bairro\s*[:.]?\s*([^\n,]+)/i,
        /Setor\s*[:.]?\s*([^\n,]+)/i,
    ];
    for (const pattern of bairroPatterns) {
        const match = t.match(pattern);
        if (match) {
            neighborhood = match[1].trim();
            break;
        }
    }

    // ---- CITY ----
    let city: string | null = null;
    const cityPatterns = [
        /Cidade\s*[:.]?\s*([^\n,]+)/i,
        /Munic[ií]pio\s*(?:de\s+)?[:.]?\s*([^\n,\-]+)/i,
        /PREFEITURA\s+MUNICIPAL\s+DE\s+([^\n,]+)/i,
    ];
    for (const pattern of cityPatterns) {
        const match = t.match(pattern);
        if (match) {
            city = match[1].trim()
                .replace(/\s*[-–]\s*CNPJ.*$/i, '') // remove "- CNPJ ..." suffix
                .replace(/\s*[-–]\s*$/, '')
                .trim();
            break;
        }
    }

    // ---- STATE ----
    let state: string | null = null;
    const statePatterns = [
        /Estado\s*[:.]?\s*([^\n,]+)/i,
        /UF\s*[:.]?\s*([A-Z]{2})/i,
        // Try extracting from CEP pattern region
    ];
    for (const pattern of statePatterns) {
        const match = t.match(pattern);
        if (match) {
            state = match[1].trim().substring(0, 2).toUpperCase();
            break;
        }
    }

    // ---- CEP ----
    let cep: string | null = null;
    const cepPatterns = [
        /CEP\s*[:.]?\s*(\d{2}\.?\d{3}[-.]?\d{3})/i,
        /Cep\s*[:.]?\s*(\d{2}\.?\d{3}[-.]?\d{3})/i,
        /C\.?E\.?P\.?\s*[:.]?\s*(\d{2}\.?\d{3}[-.]?\d{3})/i,
    ];
    for (const pattern of cepPatterns) {
        const match = t.match(pattern);
        if (match) {
            // Normalize to XXXXX-XXX
            cep = match[1].replace(/\./g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
            break;
        }
    }

    // ---- OWNER NAME ----
    let owner_name: string | null = null;
    const ownerPatterns = [
        /Sacado\s*[:.]?\s*\d*\s*[-–]?\s*([^\n]+?)(?:\s+CPF|$)/i,
        /Contribuinte\s*[:.]?\s*([^\n]+)/i,
        /Propriet[aá]rio\s*[:.]?\s*([^\n]+)/i,
        /Nome\s*[:.]?\s*([^\n]+)/i,
        /Titular\s*[:.]?\s*([^\n]+)/i,
    ];
    for (const pattern of ownerPatterns) {
        const match = t.match(pattern);
        if (match) {
            owner_name = match[1].trim().replace(/\s+/g, ' ');
            break;
        }
    }

    // ---- CPF / CNPJ ----
    let cpf: string | null = null;
    const cpfPatterns = [
        /CPF\s*[/]?\s*CNPJ\s*[:.]?\s*([\d.\-\/]+)/i,
        /CNPJ\s*[:.]?\s*([\d.\-\/]+)/i,
        /CPF\s*[:.]?\s*([\d.\-]+)/i,
    ];
    for (const pattern of cpfPatterns) {
        const match = t.match(pattern);
        if (match) {
            cpf = match[1].trim();
            break;
        }
    }

    return {
        owner_name,
        cpf,
        address: { street, number, neighborhood, city, state, cep }
    };
}

/**
 * Check if the regex extraction was good enough (at least street + one more field).
 */
function isExtractionSufficient(data: ReturnType<typeof extractDataFromText>): boolean {
    const addr = data.address;
    const hasStreet = !!addr.street && addr.street.length > 3;
    const extraFields = [addr.neighborhood, addr.city, addr.cep].filter(Boolean).length;
    return hasStreet && extraFields >= 1;
}

// ============================================================
// STRATEGY 2 & 3: AI Vision (Gemini free → OpenAI paid)
// ============================================================

const VISION_PROMPT = `
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
    "instructions": "EXTRACT THE PROPERTY ADDRESS LISTED ON THE BILL/DOCUMENT. FOCUS ON THE SERVICE ADDRESS.",
    "field_confidence": { "field_name": number }
}

If a field is not found, exclude it or set to null.
`;

const getOpenAIClient = () => {
    if (!process.env.OPENAI_API_KEY) return null;
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const getGeminiClient = () => {
    if (!process.env.GEMINI_API_KEY) return null;
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

function parseJsonResponse(text: string) {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
}

async function analyzeVisionWithGemini(base64: string, mimeType: string) {
    const client = getGeminiClient();
    if (!client) throw new Error("Gemini API Key missing");

    const model = client.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent([
        VISION_PROMPT,
        { inlineData: { data: base64, mimeType } }
    ]);

    return parseJsonResponse((await result.response).text());
}

async function analyzeVisionWithOpenAI(base64: string, mimeType: string) {
    const client = getOpenAIClient();
    if (!client) throw new Error("OpenAI API Key missing");

    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: VISION_PROMPT },
            {
                role: "user",
                content: [
                    { type: "text", text: "Analyze this document." },
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
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

// ============================================================
// MAIN HANDLER — 3-tier pipeline
// ============================================================

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

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let resultRaw: any = null;
                let extractionMethod = 'unknown';

                // ===== STRATEGY 1: PDF Text → Regex (FREE, instant, no AI) =====
                if (isPdf) {
                    console.log('[Ownership] PDF detected — trying text extraction + regex...');
                    methods_tried.push('pdf_text_extract');

                    const pdfText = await extractPdfText(buffer);

                    if (pdfText) {
                        console.log(`[Ownership] PDF text extracted: ${pdfText.length} chars`);
                        console.log(`[Ownership] First 500 chars: ${pdfText.substring(0, 500)}`);
                        methods_tried.push('regex_parse');

                        const extracted = extractDataFromText(pdfText);
                        const docType = classifyDocumentFromText(pdfText);

                        if (isExtractionSufficient(extracted)) {
                            console.log(`[Ownership] ✅ Regex extraction sufficient! Type: ${docType}`);
                            console.log(`[Ownership] Extracted:`, JSON.stringify(extracted, null, 2));

                            resultRaw = {
                                classified_type: docType,
                                type_confidence: 0.95,
                                extracted_data: extracted,
                                field_confidence: {
                                    street: extracted.address.street ? 0.95 : 0,
                                    number: extracted.address.number ? 0.95 : 0,
                                    neighborhood: extracted.address.neighborhood ? 0.95 : 0,
                                    city: extracted.address.city ? 0.95 : 0,
                                    cep: extracted.address.cep ? 0.95 : 0,
                                }
                            };
                            extractionMethod = 'pdf_regex';
                        } else {
                            console.log('[Ownership] Regex extraction insufficient — will fall through to Vision AI');
                            console.log('[Ownership] Partial extraction:', JSON.stringify(extracted, null, 2));
                            methods_tried.push('regex_insufficient');
                        }
                    } else {
                        console.log('[Ownership] No selectable text in PDF (scanned/image)');
                        methods_tried.push('pdf_no_text');
                    }
                }

                // ===== STRATEGY 2: Gemini Vision (FREE) =====
                if (!resultRaw) {
                    console.log('[Ownership] Trying Gemini Vision (free)...');
                    methods_tried.push('gemini_vision');

                    try {
                        resultRaw = await analyzeVisionWithGemini(base64, mimeType);
                        extractionMethod = 'vision_gemini';
                        console.log(`[Ownership] ✅ Gemini Vision successful`);
                    } catch (geminiErr) {
                        console.warn('[Ownership] Gemini Vision failed:', geminiErr);
                        methods_tried.push('gemini_vision_failed');
                    }
                }

                // ===== STRATEGY 3: OpenAI Vision (PAID — last resort) =====
                if (!resultRaw) {
                    console.log('[Ownership] Trying OpenAI Vision (paid, last resort)...');
                    methods_tried.push('openai_vision');

                    try {
                        resultRaw = await analyzeVisionWithOpenAI(base64, mimeType);
                        extractionMethod = 'vision_openai';
                        console.log(`[Ownership] ✅ OpenAI Vision successful`);
                    } catch (openaiErr) {
                        console.error('[Ownership] OpenAI Vision also failed:', openaiErr);
                        methods_tried.push('openai_vision_failed');
                    }
                }

                // ===== Build result =====
                if (resultRaw) {
                    console.log(`[Ownership] ✅ Final: ${file.name} → method=${extractionMethod}, type=${resultRaw.classified_type}`);
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
                    console.error(`[Ownership] ❌ ALL methods failed for ${file.name}. Tried: ${methods_tried.join(' → ')}`);
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
