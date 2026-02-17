import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import { extractText, getDocumentProxy } from "unpdf";

const getGeminiClient = () => {
    if (!process.env.GEMINI_API_KEY) return null;
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

const getOpenAIClient = () => {
    if (!process.env.OPENAI_API_KEY) return null;
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const EXTRACTION_PROMPT = `Você é um especialista em análise de contratos de aluguel brasileiros.
Analise o conteúdo deste contrato de aluguel e extraia os seguintes dados da unidade locada.

Retorne SOMENTE um JSON válido (sem markdown, sem explicação) com estas chaves:

{
    "name": "Nome/identificação da unidade (ex: Kitnet 1, Apt 302, Sala 5)",
    "unitType": "tipo da unidade: kitnet, studio, apartment, house, bedroom, commercial_room, garage, other",
    "sqMeters": "área em m² (número como string)",
    "rooms": "número de cômodos (string)",
    "bedrooms": "número de quartos (string)",
    "bathrooms": "número de banheiros (string)",
    "garage": true/false,
    "rentValue": "valor do aluguel mensal (string, apenas números, ex: 1500.00)",
    "condominiumValue": "valor do condomínio se mencionado (string, ex: 350.00)",
    "condominium": true/false se há condomínio mencionado,
    "condominiumIncludes": {
        "energy": true/false,
        "water": true/false,
        "internet": true/false,
        "iptu": true/false,
        "gas": true/false
    },
    "description": "breve descrição extraída do contrato sobre a unidade",
    "tenantName": "nome do inquilino/locatário",
    "tenantCpf": "CPF do inquilino",
    "startDate": "data de início do contrato (YYYY-MM-DD)",
    "endDate": "data de término do contrato (YYYY-MM-DD)",
    "confidence": 0.0-1.0
}

Regras:
- Extraia valores EXATOS do documento
- Se um campo não for encontrado, use null para strings e false para booleanos
- Converta decimais brasileiros: "1.500,00" → "1500.00"
- Converta datas: "01/03/2026" → "2026-03-01"
- NÃO invente dados que não estão no documento
- O campo confidence deve refletir a qualidade da extração`;

function parseJsonResponse(text: string) {
    let clean = text.trim();
    if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(clean);
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
        }

        const allowedTypes = [
            "image/jpeg", "image/jpg", "image/png", "image/webp",
            "application/pdf"
        ];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: `Tipo de arquivo não suportado: ${file.type}. Use JPG, PNG, WebP ou PDF.` },
                { status: 400 }
            );
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'Arquivo muito grande. Máximo: 10MB.' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // For PDFs: extract text first, then use AI on the text
        let textContent = "";
        let base64ForVision = "";
        let mimeType = file.type;

        if (file.type === "application/pdf") {
            try {
                const pdf = await getDocumentProxy(new Uint8Array(buffer));
                const result = await extractText(pdf, { mergePages: true });
                textContent = result.text || "";
            } catch (pdfError) {
                console.warn("[Contract Extract] PDF text extraction failed:", pdfError);
            }

            // If text extraction yielded very little, we'll use vision on the PDF as image
            if (textContent.trim().length < 100) {
                // Convert PDF to base64 for vision API
                base64ForVision = buffer.toString("base64");
                mimeType = "application/pdf";
            }
        } else {
            // Image file → use vision
            if (mimeType === "image/jpg") mimeType = "image/jpeg";
            base64ForVision = buffer.toString("base64");
        }

        let extracted = null;

        // Strategy 1: If we have good text, use Gemini text model (free)
        if (textContent.trim().length >= 100) {
            const gemini = getGeminiClient();
            if (gemini) {
                try {
                    const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
                    const result = await model.generateContent([
                        { text: EXTRACTION_PROMPT + "\n\nConteúdo do contrato:\n\n" + textContent.substring(0, 15000) }
                    ]);
                    extracted = parseJsonResponse(result.response.text());
                } catch (err) {
                    console.warn("[Contract Extract] Gemini text failed:", err);
                }
            }
        }

        // Strategy 2: Vision with Gemini (free, for images or PDFs with little text)
        if (!extracted && base64ForVision) {
            const gemini = getGeminiClient();
            if (gemini) {
                try {
                    const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
                    const result = await model.generateContent([
                        { text: EXTRACTION_PROMPT },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64ForVision,
                            },
                        },
                    ]);
                    extracted = parseJsonResponse(result.response.text());
                } catch (err) {
                    console.warn("[Contract Extract] Gemini vision failed:", err);
                }
            }
        }

        // Strategy 3: Fallback to OpenAI GPT-4o Vision
        if (!extracted) {
            const openai = getOpenAIClient();
            if (!openai) {
                return NextResponse.json({ error: 'Serviço de IA indisponível' }, { status: 503 });
            }

            if (base64ForVision) {
                // Vision with image
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: EXTRACTION_PROMPT },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${mimeType};base64,${base64ForVision}`,
                                        detail: 'high',
                                    },
                                },
                            ],
                        },
                    ],
                    max_tokens: 2000,
                    temperature: 0,
                });
                const content = completion.choices[0]?.message?.content;
                if (content) extracted = parseJsonResponse(content);
            } else if (textContent) {
                // Text-based extraction with OpenAI
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: EXTRACTION_PROMPT },
                        { role: 'user', content: textContent.substring(0, 15000) },
                    ],
                    max_tokens: 2000,
                    temperature: 0,
                });
                const content = completion.choices[0]?.message?.content;
                if (content) extracted = parseJsonResponse(content);
            }
        }

        if (!extracted) {
            return NextResponse.json({ error: 'Não foi possível extrair dados do contrato.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: extracted });
    } catch (err) {
        console.error('[Contract Extract] Error:', err);
        return NextResponse.json({ error: 'Erro interno ao processar contrato' }, { status: 500 });
    }
}
