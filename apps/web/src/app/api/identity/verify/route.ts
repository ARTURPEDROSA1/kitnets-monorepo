import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Type for the extraction result
interface ExtractionResult {
    document_type: string;
    success: boolean;
    extraction_method?: string;
    extracted_data: Record<string, unknown>;
    [key: string]: unknown;
}

// --- Helpers ---
function parseJsonResponse(text: string): ExtractionResult {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
}

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
        console.warn('[Identity] PDF text extraction failed:', err);
        return null;
    }
}

// --- CNPJ Comprovante (PJ) prompt ---
const CNPJ_PROMPT = `
You are an expert at reading Brazilian government documents.
You will receive the FULL TEXT extracted from a "Comprovante de Inscrição e de Situação Cadastral" (CNPJ registration document) from the Receita Federal do Brasil.

Extract the following fields and return ONLY valid JSON:
{
    "document_type": "COMPROVANTE_CNPJ",
    "success": true,
    "extracted_data": {
        "cnpj": "string (formatted: 00.000.000/0000-00)",
        "razao_social": "string",
        "nome_fantasia": "string or null",
        "data_abertura": "YYYY-MM-DD or null",
        "situacao_cadastral": "string (e.g. ATIVA)",
        "data_situacao_cadastral": "YYYY-MM-DD or null",
        "natureza_juridica": "string or null",
        "atividade_principal": "string or null",
        "endereco": {
            "logradouro": "string",
            "numero": "string",
            "complemento": "string or null",
            "bairro": "string",
            "municipio": "string",
            "uf": "string",
            "cep": "string"
        },
        "telefone": "string or null",
        "email": "string or null"
    }
}
If a field is not found, set to null.
`;

// --- Person ID (PF) prompt for CNH / RG ---
const PF_ID_PROMPT = `
You are an expert at reading Brazilian identity documents (CNH - Carteira Nacional de Habilitação, and RG - Registro Geral).
Analyze the uploaded document image and extract the following data. Return ONLY valid JSON:

{
    "document_type": "CNH" or "RG",
    "success": true,
    "extracted_data": {
        "nome": "string (full name)",
        "cpf": "string (formatted: 000.000.000-00)",
        "rg": "string or null",
        "data_nascimento": "YYYY-MM-DD or null",
        "nome_mae": "string or null",
        "nome_pai": "string or null",
        "nacionalidade": "string or null",
        "naturalidade": "string or null",
        "data_emissao": "YYYY-MM-DD or null",
        "data_validade": "YYYY-MM-DD or null",
        "orgao_emissor": "string or null",
        "categoria_cnh": "string or null (only for CNH, e.g. AB, B)"
    }
}
If a field is not found, set to null.
`;

// ============================================================
// AI STRATEGIES: Gemini (primary) → OpenAI (fallback)
// ============================================================

// --- Gemini Vision ---
async function analyzeWithGeminiVision(base64: string, mimeType: string, prompt: string): Promise<ExtractionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: base64,
                mimeType: mimeType,
            },
        },
    ]);

    const response = await result.response;
    return parseJsonResponse(response.text());
}

// --- Gemini Text ---
async function analyzeWithGeminiText(text: string, prompt: string): Promise<ExtractionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent([
        prompt,
        `Here is the document text:\n\n${text}`,
    ]);

    const response = await result.response;
    return parseJsonResponse(response.text());
}

// --- OpenAI Vision (fallback) ---
async function analyzeWithOpenAIVision(base64: string, mimeType: string, prompt: string): Promise<ExtractionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: prompt },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze this document and extract the required data.' },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mimeType};base64,${base64}`,
                            detail: 'high',
                        },
                    },
                ],
            },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('No content from OpenAI Vision');
    return parseJsonResponse(content);
}

// --- OpenAI Text (fallback) ---
async function analyzeWithOpenAIText(text: string, prompt: string): Promise<ExtractionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Here is the document text:\n\n${text}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('No content from OpenAI');
    return parseJsonResponse(content);
}

// --- Combined: Try Gemini first, then OpenAI ---
async function analyzeVision(base64: string, mimeType: string, prompt: string): Promise<ExtractionResult & { _provider: string }> {
    // 1. Try Gemini (primary — free/cheaper)
    try {
        console.log('[Identity] Trying Gemini Vision...');
        const result = await analyzeWithGeminiVision(base64, mimeType, prompt);
        return { ...result, _provider: 'gemini' };
    } catch (geminiErr) {
        console.warn('[Identity] Gemini Vision failed:', geminiErr);
    }

    // 2. Fallback to OpenAI
    console.log('[Identity] Falling back to OpenAI Vision...');
    const result = await analyzeWithOpenAIVision(base64, mimeType, prompt);
    return { ...result, _provider: 'openai' };
}

async function analyzeText(text: string, prompt: string): Promise<ExtractionResult & { _provider: string }> {
    // 1. Try Gemini (primary)
    try {
        console.log('[Identity] Trying Gemini Text...');
        const result = await analyzeWithGeminiText(text, prompt);
        return { ...result, _provider: 'gemini' };
    } catch (geminiErr) {
        console.warn('[Identity] Gemini Text failed:', geminiErr);
    }

    // 2. Fallback to OpenAI
    console.log('[Identity] Falling back to OpenAI Text...');
    const result = await analyzeWithOpenAIText(text, prompt);
    return { ...result, _provider: 'openai' };
}

// --- Parse CNPJ text without AI (regex-based) ---
function parseCnpjComprovante(text: string): ExtractionResult | null {
    try {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const fullText = lines.join(' ');

        // Check if this looks like a CNPJ comprovante
        if (!fullText.includes('CADASTRO NACIONAL') && !fullText.includes('CNPJ') && !fullText.includes('COMPROVANTE')) {
            return null;
        }

        const extract = (label: string, nextLabel?: string): string | null => {
            const pattern = new RegExp(
                label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:\\s]*([^\\n]+)',
                'i'
            );
            const match = fullText.match(pattern);
            if (match) return match[1].trim();

            // Try line-by-line approach
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toUpperCase().includes(label.toUpperCase())) {
                    // Sometimes the value is on the next line
                    if (lines[i].toUpperCase().replace(label.toUpperCase(), '').trim().length > 2) {
                        return lines[i].replace(new RegExp(label, 'i'), '').replace(/^[:\s]+/, '').trim();
                    }
                    if (i + 1 < lines.length && (!nextLabel || !lines[i + 1].toUpperCase().includes(nextLabel.toUpperCase()))) {
                        return lines[i + 1].trim();
                    }
                }
            }
            return null;
        };

        const cnpj = extract('NÚMERO DE INSCRIÇÃO') || extract('CNPJ');
        const razaoSocial = extract('NOME EMPRESARIAL') || extract('RAZÃO SOCIAL') || extract('RAZAO SOCIAL');
        const nomeFantasia = extract('NOME FANTASIA') || extract('TÍTULO DO ESTABELECIMENTO');
        const dataAbertura = extract('DATA DE ABERTURA');
        const situacao = extract('SITUAÇÃO CADASTRAL') || extract('SITUACAO CADASTRAL');
        const dataSituacao = extract('DATA DA SITUAÇÃO CADASTRAL') || extract('DATA DA SITUACAO CADASTRAL');
        const natureza = extract('CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA') || extract('NATUREZA JURÍDICA') || extract('NATUREZA JURIDICA');
        const atividade = extract('CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL') || extract('ATIVIDADE ECONÔMICA PRINCIPAL');
        const logradouro = extract('LOGRADOURO');
        const numero = extract('NÚMERO', 'COMPLEMENTO') || extract('NUMERO', 'COMPLEMENTO');
        const complemento = extract('COMPLEMENTO', 'CEP');
        const bairro = extract('BAIRRO') || extract('BAIRRO/DISTRITO');
        const municipio = extract('MUNICÍPIO') || extract('MUNICIPIO');
        const uf = extract('UF');
        const cep = extract('CEP');
        const telefone = extract('TELEFONE');
        const email = extract('ENDEREÇO ELETRÔNICO') || extract('CORREIO ELETRÔNICO') || extract('E-MAIL');

        // Format date from dd/mm/yyyy to yyyy-mm-dd
        const formatDate = (d: string | null): string | null => {
            if (!d) return null;
            const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
        };

        // Clean CNPJ value (might have extra text after it)
        const cleanCnpj = (v: string | null): string | null => {
            if (!v) return null;
            const m = v.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
            return m ? m[0] : v.replace(/[^\d./-]/g, '');
        };

        // Clean situação (may contain date mixed in)
        const cleanSituacao = (v: string | null): string | null => {
            if (!v) return null;
            return v.replace(/\d{2}\/\d{2}\/\d{4}/, '').trim();
        };

        return {
            document_type: 'COMPROVANTE_CNPJ',
            success: true,
            extraction_method: 'pdf_text_parse',
            extracted_data: {
                cnpj: cleanCnpj(cnpj),
                razao_social: razaoSocial,
                nome_fantasia: nomeFantasia,
                data_abertura: formatDate(dataAbertura),
                situacao_cadastral: cleanSituacao(situacao),
                data_situacao_cadastral: formatDate(dataSituacao),
                natureza_juridica: natureza,
                atividade_principal: atividade,
                endereco: {
                    logradouro: logradouro,
                    numero: numero,
                    complemento: complemento,
                    bairro: bairro,
                    municipio: municipio,
                    uf: uf,
                    cep: cep,
                },
                telefone: telefone,
                email: email,
            },
        };
    } catch (err) {
        console.error('[Identity] Regex parse failed:', err);
        return null;
    }
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(request: NextRequest) {
    console.log('[API] /api/identity/verify called');
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const documentCategory = formData.get('category') as string | null; // 'pf' or 'pj'

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        console.log(`[Identity] File: ${file.name} (${file.type}), category: ${documentCategory}`);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = file.type || 'application/octet-stream';
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        // -------------------------------------------------------
        // STRATEGY 1: PDF with extractable text (no AI needed)
        // -------------------------------------------------------
        if (isPdf) {
            console.log('[Identity] PDF detected — attempting text extraction...');
            const pdfText = await extractPdfText(buffer);

            if (pdfText) {
                console.log(`[Identity] PDF text extracted: ${pdfText.length} chars`);

                if (documentCategory === 'pj') {
                    // Try regex-based parsing first (free, fast)
                    const regexResult = parseCnpjComprovante(pdfText);
                    if (regexResult && regexResult.extracted_data.cnpj) {
                        console.log('[Identity] CNPJ parsed via regex — no AI needed');
                        return NextResponse.json(regexResult);
                    }

                    // Regex didn't work well — use AI on the text
                    console.log('[Identity] Regex incomplete, using AI on extracted text...');
                    try {
                        const aiResult = await analyzeText(pdfText, CNPJ_PROMPT);
                        return NextResponse.json({
                            ...aiResult,
                            extraction_method: `pdf_text_ai_${aiResult._provider}`,
                        });
                    } catch (aiErr) {
                        console.warn('[Identity] AI text analysis failed:', aiErr);
                    }
                }

                // PF PDF (rare, but handle it) or failed PJ AI
                // Fall through to vision below
            }

            // PDF has no extractable text (scanned/image-based) — use Vision
            console.log('[Identity] PDF is image-based — falling back to Vision API...');
        }

        // -------------------------------------------------------
        // STRATEGY 2: Image or image-based PDF → GPT Vision
        // -------------------------------------------------------
        const prompt = documentCategory === 'pj' ? CNPJ_PROMPT : PF_ID_PROMPT;
        console.log(`[Identity] Using GPT Vision for ${documentCategory === 'pj' ? 'CNPJ' : 'CNH/RG'}...`);

        try {
            const visionResult = await analyzeVision(base64, mimeType, prompt);
            return NextResponse.json({
                ...visionResult,
                extraction_method: `vision_${visionResult._provider}`,
            });
        } catch (visionErr) {
            console.error('[Identity] Vision API failed:', visionErr);
            return NextResponse.json({
                success: false,
                error: 'Failed to analyze document',
                details: visionErr instanceof Error ? visionErr.message : String(visionErr),
            }, { status: 500 });
        }

    } catch (error) {
        console.error('[Identity] Critical error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
    }
}
