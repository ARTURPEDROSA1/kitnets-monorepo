import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
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

const EXTRACTION_PROMPT = `Você é um especialista em análise de documentos imobiliários brasileiros (contratos de locação residencial/comercial e contratos de prestação de serviços de administração de imóveis).

Sua tarefa é identificar e extrair com precisão os dados cadastrais da IMOBILIÁRIA / ADMINISTRADORA / EMPRESA DE GESTÃO IMOBILIÁRIA que intermedia ou administra a locação.

ATENÇÃO CRÍTICA:
1. Em "Contrato de Locação":
   - A imobiliária geralmente aparece qualificada como "ADMINISTRADORA", "INTERMEDIADORA", "IMOBILIÁRIA", "PROCURADORA" ou no cabeçalho/timbre do documento.
   - NÃO CONFUNDA a imobiliária com o LOCADOR (proprietário do imóvel) ou com o LOCATÁRIO (inquilino)! Extraia APENAS os dados da imobiliária/administradora.
2. Em "Contrato de Prestação de Serviços" para locação/administração:
   - A imobiliária geralmente é a "CONTRATADA". Extraia os dados da CONTRATADA (não do Contratante).
3. Se o documento for uma imagem e houver logotipo ou marca da imobiliária no cabeçalho/topo, forneça a bounding box estimada do logotipo em coordenadas normalizadas [ymin, xmin, ymax, xmax] (valores inteiros de 0 a 1000). Caso contrário, use null.

Retorne SOMENTE um JSON válido (sem markdown, sem tags de código, sem explicações) com estas chaves:
{
    "name": "Razão social completa da imobiliária (ex: MR IMÓVEIS LTDA-ME)",
    "trade_name": "Nome fantasia da imobiliária se houver (ex: MR Imóveis, Bastos Imobiliária)",
    "cnpj": "CNPJ da imobiliária (ex: 21.951.040/0001-99 ou somente dígitos)",
    "creci_number": "Número de registro no CRECI (ex: 5358, 6013)",
    "creci_state": "Sigla do estado do CRECI em 2 letras maiúsculas (ex: MG, SP, RJ)",
    "creci_type": "PJ para pessoa jurídica ou PF para pessoa física/autônomo",
    "owner_name": "Nome do responsável legal, sócio administrador ou representante da imobiliária citado no contrato",
    "main_phone": "Telefone principal de contato da imobiliária (ex: (31) 3541-1207 ou (31) 98888-8888)",
    "additional_phone": "Telefone secundário se houver",
    "email": "E-mail de contato da imobiliária se houver no documento",
    "website": "Site da imobiliária se houver",
    "postal_code": "CEP comercial da imobiliária (ex: 34007-718)",
    "street": "Logradouro (ex: Av. Alaska, Rua Primo Cavalieri)",
    "street_number": "Número do imóvel (ex: 220, 65D)",
    "address_complement": "Complemento se houver (ex: Sala 101, Loja A)",
    "neighborhood": "Bairro (ex: Jardim Canadá, Centro)",
    "city": "Cidade (ex: Nova Lima, Itabirito)",
    "state": "Sigla do Estado em 2 letras maiúsculas (ex: MG, SP)",
    "logo_box_2d": [ymin, xmin, ymax, xmax] ou null,
    "confidence": 0.0 a 1.0
}

Regras:
- Se um campo não constar no documento, defina seu valor como null.
- Não invente informações inexistentes.
- O campo confidence deve refletir a certeza da identificação da imobiliária.`;

function parseJsonResponse(text: string) {
    let clean = text.trim();
    if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
        clean = clean.substring(jsonStart, jsonEnd + 1);
    }
    return JSON.parse(clean);
}

export async function POST(request: NextRequest) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
        }

        const allowedTypes = [
            "image/jpeg", "image/jpg", "image/png", "image/webp",
            "application/pdf"
        ];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: `Tipo de arquivo não suportado: ${file.type}. Use PDF, JPG, PNG ou WebP.` },
                { status: 400 }
            );
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'Arquivo muito grande. Máximo permitido: 10MB.' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        let textContent = "";
        let base64ForVision = "";
        let mimeType = file.type;

        if (file.type === "application/pdf") {
            try {
                const pdf = await getDocumentProxy(new Uint8Array(buffer));
                const result = await extractText(pdf, { mergePages: true });
                textContent = result.text || "";
            } catch (pdfError) {
                console.warn("[Agency Extract] PDF text extraction failed:", pdfError);
            }

            // If text extraction yielded very little, fall back to vision on the PDF
            if (textContent.trim().length < 100) {
                base64ForVision = buffer.toString("base64");
                mimeType = "application/pdf";
            }
        } else {
            // Image file → use vision
            if (mimeType === "image/jpg") mimeType = "image/jpeg";
            base64ForVision = buffer.toString("base64");
        }

        let extracted: any = null;

        // Strategy 1: If we have extracted text from PDF, use Gemini text
        if (textContent.trim().length >= 100) {
            const gemini = getGeminiClient();
            if (gemini) {
                try {
                    const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
                    const result = await model.generateContent([
                        { text: EXTRACTION_PROMPT + "\n\nConteúdo do contrato:\n\n" + textContent.substring(0, 18000) }
                    ]);
                    extracted = parseJsonResponse(result.response.text());
                } catch (err) {
                    console.warn("[Agency Extract] Gemini text model failed:", err);
                }
            }
        }

        // Strategy 2: Gemini Vision (for images or scanned PDFs)
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
                    console.warn("[Agency Extract] Gemini vision model failed:", err);
                }
            }
        }

        // Strategy 3: Fallback to OpenAI GPT-4o
        if (!extracted) {
            const openai = getOpenAIClient();
            if (!openai) {
                return NextResponse.json({ error: 'Serviço de inteligência artificial temporariamente indisponível.' }, { status: 503 });
            }

            if (base64ForVision && mimeType.startsWith("image/")) {
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
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: EXTRACTION_PROMPT },
                        { role: 'user', content: textContent.substring(0, 18000) },
                    ],
                    max_tokens: 2000,
                    temperature: 0,
                });
                const content = completion.choices[0]?.message?.content;
                if (content) extracted = parseJsonResponse(content);
            }
        }

        if (!extracted) {
            return NextResponse.json({ error: 'Não foi possível identificar os dados da imobiliária no documento enviado.' }, { status: 422 });
        }

        return NextResponse.json({ success: true, data: extracted });
    } catch (err) {
        console.error('[Agency Extract] Error:', err);
        return NextResponse.json({ error: 'Erro interno ao processar o contrato.' }, { status: 500 });
    }
}
