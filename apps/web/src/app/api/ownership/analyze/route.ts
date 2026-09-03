
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
    iptu_data: {
        cadastro_imobiliario: string | null;
        inscricao_imobiliaria: string | null;
        matricula: string | null;
        area_lote: string | null;
        area_edificada: string | null;
    } | null;
} {
    // Normalize: collapse multiple spaces/newlines, keep structure
    const t = text.replace(/\r\n/g, '\n');

    let street: string | null = null;
    let number: string | null = null;
    let neighborhood: string | null = null;
    let city: string | null = null;
    let state: string | null = null;
    let cep: string | null = null;
    let matricula: string | null = null;

    // ---- PRIORITY 1: OBJETO DE TRIBUTAÇÃO (IPTU PROPERTY ADDRESS) ----
    // In Brazilian IPTU bills, "Objeto de Tributação" / "Localização do Imóvel" contains the
    // ACTUAL physical property address. "Contribuinte" is only the taxpayer's mailing address.
    const objetoMatch = t.match(/Objeto\s*d[ea]\s*Tributa[çc][aã]o\s*[:.]?\s*([\s\S]+?)(?=(?:Descri[çc][aã]o|Parcela|Informa[çc][õo]es|Valor|Base|Demonstrativo|Contribuinte|Receita|$))/i);
    if (objetoMatch) {
        const objetoBlock = objetoMatch[1].trim();

        // 1. Street and number from Objeto de Tributação
        // e.g. "RUA CLAUDIONOR IDELF BRAGA, 000035 CASA MATRICULA 8021"
        const streetNumMatch = objetoBlock.match(/([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s*,\s*(\d{1,6})/);
        if (streetNumMatch) {
            street = streetNumMatch[1].trim();
            number = streetNumMatch[2].replace(/^0+/, '') || streetNumMatch[2];
        }

        // Matrícula in Objeto de Tributação (e.g. "MATRICULA 8021" or "MATRÍCULA: 8021")
        const matInObjeto = objetoBlock.match(/MATR[IÍ]CULA\s*[:.]?\s*(\d+)/i);
        if (matInObjeto) {
            matricula = matInObjeto[1].trim();
        }

        // 2. Neighborhood from Objeto de Tributação
        // e.g. "SANTO ANTONIO - CÓD. LOTEAMENTO: 0013..." or "Bairro: SANTO ANTONIO"
        const bairroMatch = objetoBlock.match(/\n\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]+?)\s*(?:[-–]\s*(?:C[ÓO]D|LOTE|QUADRA|ITABIRITO|\d)|\n|$)/i)
            || objetoBlock.match(/Bairro\s*[:.]?\s*([^\n,]+)/i);
        if (bairroMatch) {
            neighborhood = bairroMatch[1].trim();
        }

        // 3. City and State from Objeto de Tributação
        // e.g. "ITABIRITO/MG" or "ITABIRITO - MG"
        const cityStateMatch = objetoBlock.match(/([A-Za-zÀ-ÖØ-öø-ÿ\s]+?)\s*[/]\s*([A-Z]{2})/);
        if (cityStateMatch) {
            city = cityStateMatch[1].trim();
            state = cityStateMatch[2].trim().toUpperCase();
        }

        // 4. CEP from Objeto de Tributação
        // e.g. "35.450-272"
        const cepInObjeto = objetoBlock.match(/(\d{2}\.?\d{3}[-.]?\d{3})/);
        if (cepInObjeto) {
            cep = cepInObjeto[1].replace(/\./g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
        }
    }

    // ---- FALLBACK: GENERAL STREET + NUMBER ----
    if (!street) {
        // Patterns like:
        //   "Endereço: Rua X, 123"
        //   "Endereço do Imóvel: Rua X, 123"
        const addrPatterns = [
            /Endere[çc]o\s*(?:do\s*Im[oó]vel)?\s*[:.]?\s*(.+?)(?:\n|$)/i,
            /End\.?\s*[:.]?\s*(.+?)(?:\n|$)/i,
            /Logradouro\s*[:.]?\s*(.+?)(?:\n|$)/i,
        ];

        for (const pattern of addrPatterns) {
            const match = t.match(pattern);
            if (match) {
                const raw = match[1].trim();
                const streetNumMatch = raw.match(/^(.+?)\s*[,]\s*(\d+)\s*$/);
                if (streetNumMatch) {
                    street = streetNumMatch[1].trim();
                    number = streetNumMatch[2].replace(/^0+/, '') || streetNumMatch[2];
                } else {
                    const nroMatch = raw.match(/^(.+?)\s*(?:N[ºo°]\.?|nro\.?|N[uú]mero)\s*(\d+)/i);
                    if (nroMatch) {
                        street = nroMatch[1].trim();
                        number = nroMatch[2].replace(/^0+/, '') || nroMatch[2];
                    } else {
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
    }

    // ---- FALLBACK: NEIGHBORHOOD ----
    if (!neighborhood) {
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
    }

    // ---- FALLBACK: CITY ----
    if (!city) {
        const cityPatterns = [
            /Cidade\s*[:.]?\s*([^\n,]+)/i,
            /Munic[ií]pio\s*(?:de\s+)?[:.]?\s*([^\n,\-]+)/i,
            /PREFEITURA\s+MUNICIPAL\s+DE\s+([^\n,]+)/i,
        ];
        for (const pattern of cityPatterns) {
            const match = t.match(pattern);
            if (match) {
                city = match[1].trim()
                    .replace(/\s*[-–]\s*CNPJ.*$/i, '')
                    .replace(/\s*[-–]\s*$/, '')
                    .trim();
                break;
            }
        }
    }

    // ---- FALLBACK: STATE ----
    if (!state) {
        const statePatterns = [
            /Estado\s*[:.]?\s*([^\n,]+)/i,
            /UF\s*[:.]?\s*([A-Z]{2})/i,
        ];
        for (const pattern of statePatterns) {
            const match = t.match(pattern);
            if (match) {
                state = match[1].trim().substring(0, 2).toUpperCase();
                break;
            }
        }
    }

    // ---- FALLBACK: CEP ----
    if (!cep) {
        const cepPatterns = [
            /CEP\s*[:.]?\s*(\d{2}\.?\d{3}[-.]?\d{3})/i,
            /Cep\s*[:.]?\s*(\d{2}\.?\d{3}[-.]?\d{3})/i,
            /C\.?E\.?P\.?\s*[:.]?\s*(\d{2}\.?\d{3}[-.]?\d{3})/i,
        ];
        for (const pattern of cepPatterns) {
            const match = t.match(pattern);
            if (match) {
                cep = match[1].replace(/\./g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
                break;
            }
        }
    }

    // ---- OWNER NAME ----
    let owner_name: string | null = null;
    const ownerPatterns = [
        /Contribuinte\s*[:.]?\s*([^\n]+)/i,
        /Sacado\s*[:.]?\s*\d*\s*[-–]?\s*([^\n]+?)(?:\s+CPF|$)/i,
        /Propriet[aá]rio\s*[:.]?\s*([^\n]+)/i,
        /Nome\s*[:.]?\s*([^\n]+)/i,
        /Titular\s*[:.]?\s*([^\n]+)/i,
    ];
    for (const pattern of ownerPatterns) {
        const match = t.match(pattern);
        if (match) {
            owner_name = match[1].trim().replace(/\s*CPF.*$/i, '').replace(/\s*CNPJ.*$/i, '').replace(/\s+/g, ' ');
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

    // ---- IPTU-SPECIFIC DATA ----
    let cadastro_imobiliario: string | null = null;
    let inscricao_imobiliaria: string | null = null;
    let area_lote: string | null = null;
    let area_edificada: string | null = null;

    // Cadastro Imobiliário
    const cadastroPatterns = [
        /N[°º.]?\s*(?:do\s+)?cadastro\s*[-–\s]*DV\s*[:.]?\s*([A-Za-z0-9.\-\/]+)/i,
        /Cadastro\s*Imobili[aá]rio\s*[:.]?\s*([A-Za-z0-9.\-\/]+)/i,
        /N[°º.]?\s*(?:do\s+)?cadastro\s*[:.]?\s*([A-Za-z0-9.\-\/]+)/i,
        /Se[çc][aã]o\s*[:.]?\s*([A-Za-z0-9]+)/i,
    ];
    for (const pattern of cadastroPatterns) {
        const match = t.match(pattern);
        if (match) { cadastro_imobiliario = match[1].trim(); break; }
    }

    // Inscrição Imobiliária / C.M.C. / Inscrição Cadastral
    const inscricaoPatterns = [
        /Inscri[çc][aã]o\s*Cadastral\s*[:.]?\s*([\d\/.\-]+)/i,
        /Inscri[çc][aã]o\s*(?:\/\s*C\.?M\.?C\.?)?\s*[:.]?\s*([\d\/.\-]+)/i,
        /C\.?M\.?C\.?\s*[:.]?\s*([\d\/.\-]+)/i,
        /Inscri[çc][aã]o\s*Imobili[aá]ria\s*[:.]?\s*([\d\/.\-]+)/i,
        /Inscri[çc][aã]o\s*Anterior\s*[:.]?\s*([\d\/.\-]+)/i,
    ];
    for (const pattern of inscricaoPatterns) {
        const match = t.match(pattern);
        if (match) { inscricao_imobiliaria = match[1].trim(); break; }
    }

    // Matrícula (if not already extracted from Objeto de Tributação)
    if (!matricula) {
        const matriculaPatterns = [
            /Matr[ií]cula\s*[:.]?\s*([\d.\-\/]+)/i,
        ];
        for (const pattern of matriculaPatterns) {
            const match = t.match(pattern);
            if (match) { matricula = match[1].trim(); break; }
        }
    }

    // Área Terreno / Lote
    const areaLotePatterns = [
        /[Áá]rea\s*(?:do\s+)?Terreno\s*(?:\(m[²2]\))?\s*[:.]?\s*([\d.,]+)/i,
        /[Áá]rea\s*(?:do\s+)?Lote\s*[:.]?\s*([\d.,]+)/i,
        /Fra[çc][aã]o\s*(?:do\s+)?Terreno\s*(?:\(m[²2]\))?\s*[:.]?\s*([\d.,]+)/i,
    ];
    for (const pattern of areaLotePatterns) {
        const match = t.match(pattern);
        if (match) { area_lote = match[1].trim().replace(',', '.'); break; }
    }

    // Área Edificada / Construída
    const areaEdifPatterns = [
        /[Áá]rea\s*Edificada\s*(?:\(m[²2]\))?\s*[:.]?\s*([\d.,]+)/i,
        /[Áá]rea\s*Constru[ií]da\s*[:.]?\s*([\d.,]+)/i,
        /[Áá]rea\s*(?:da\s+)?Edifica[çc][aã]o\s*[:.]?\s*([\d.,]+)/i,
        /[Áá]rea\s*Edif(?:icada)?\.?\s*[:.]?\s*([\d.,]+)/i,
    ];
    for (const pattern of areaEdifPatterns) {
        const match = t.match(pattern);
        if (match) { area_edificada = match[1].trim().replace(',', '.'); break; }
    }

    const iptu_data = (cadastro_imobiliario || inscricao_imobiliaria || matricula || area_lote || area_edificada)
        ? { cadastro_imobiliario, inscricao_imobiliaria, matricula, area_lote, area_edificada }
        : null;

    return {
        owner_name,
        cpf,
        address: { street, number, neighborhood, city, state, cep },
        iptu_data
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

======================================================================
CRITICAL RULE FOR BRAZILIAN IPTU DOCUMENTS (READ CAREFULLY!):
======================================================================
1. ADDRESS DISAMBIGUATION (MANDATORY):
   In Brazilian IPTU bills/documents, there are almost ALWAYS TWO different addresses:
   a) "CONTRIBUINTE" / "ENDEREÇO DE NOTIFICAÇÃO" / "ENDEREÇO DE CORRESPONDÊNCIA":
      - This is the TAXPAYER's mailing address (e.g. corporate headquarters or landlord's personal residence).
      - NEVER use the "Contribuinte" address for the property "address" field!
   b) "OBJETO DE TRIBUTAÇÃO" / "OBJETO DA TRIBUTAÇÃO" / "LOCALIZAÇÃO DO IMÓVEL" / "ENDEREÇO DO IMÓVEL":
      - This is the ACTUAL PHYSICAL PROPERTY being taxed and listed for rent!
      - You MUST EXTRACT the "address" field EXCLUSIVELY from "OBJETO DE TRIBUTAÇÃO" / "LOCALIZAÇÃO DO IMÓVEL"!

   EXAMPLE:
   If document contains:
     Contribuinte: AP DIGITAL LTDA, CPF/CNPJ: 44496170000184
     RUA JOSE GOIS, 45 - SANTO ANTONIO - ITABIRITO - 35.450-264
     Objeto de Tributação: RUA CLAUDIONOR IDELF BRAGA, 000035 CASA MATRICULA 8021
     SANTO ANTONIO - CÓD. LOTEAMENTO: 0013 - QUADRA: Q LOTE: 6 -
     ITABIRITO/MG - 35.450-272
   YOU MUST EXTRACT:
     "address": {
       "street": "RUA CLAUDIONOR IDELF BRAGA",
       "number": "35",
       "neighborhood": "SANTO ANTONIO",
       "city": "ITABIRITO",
       "state": "MG",
       "cep": "35.450-272"
     }
     "owner_name": "AP DIGITAL LTDA"
     "cpf": "44496170000184"
     "iptu_data": {
       "matricula": "8021",
       ...
     }
   DO NOT extract "RUA JOSE GOIS" or "35.450-264" as the property address!

2. NUMBER EXTRACTION:
   - Strip leading zeros from street numbers (e.g., "000035" -> "35", "000050" -> "50").

3. IPTU CADASTRAL & AREA FIELDS:
   - cadastro_imobiliario: "Cadastro Imobiliário" or "N.º do Cadastro - DV" (e.g. "00180D")
   - inscricao_imobiliaria: "Inscrição Cadastral" / "Inscrição Imobiliária" / "C.M.C." (e.g. "01/03/044/0081-001")
   - matricula: Matrícula number if present anywhere in the document (e.g. from "MATRICULA 8021" -> "8021")
   - area_lote: "Área do Terreno (m²)" or "Área do Lote" (e.g. "300.00")
   - area_edificada: "Área Edificada (m²)" or "Área Construída" (e.g. "66.12")
======================================================================

Extract the following fields if present:
- owner_name (Full name of the owner/landlord or "Contribuinte")
- cpf (Owner's CPF or CNPJ)
- address (PHYSICAL PROPERTY ADDRESS: street, number, neighborhood, city, state, cep - MUST be from Objeto de Tributação on IPTU)
- registry (matricula_number, cartorio_name) needed if type is MATRICULA/ESCRITURA
- dates (issue_date, registration_date)
- iptu_data: for IPTU documents (cadastro_imobiliario, inscricao_imobiliaria, matricula, area_lote, area_edificada)

Return ONLY valid JSON matching this structure:
{
    "classified_type": "string",
    "type_confidence": number (0-1),
    "extracted_data": {
        "owner_name": "string",
        "cpf": "string",
        "address": { 
             "street": "string", 
             "number": "string", 
             "neighborhood": "string", 
             "city": "string", 
             "state": "string", 
             "cep": "string" 
        },
        "iptu_data": {
             "cadastro_imobiliario": "string",
             "inscricao_imobiliaria": "string",
             "matricula": "string",
             "area_lote": "string",
             "area_edificada": "string"
        },
        "registry": { "matricula_number": "...", "cartorio_name": "..." },
        "dates": { "issue_date": "YYYY-MM-DD" }
    },
    "instructions": "FOR IPTU: Extract property address strictly from 'Objeto de Tributação' / 'Localização do Imóvel'. NEVER use the 'Contribuinte' address. Strip leading zeros from street number.",
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
