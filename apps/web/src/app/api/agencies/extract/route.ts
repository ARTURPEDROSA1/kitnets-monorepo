import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import { extractText, getDocumentProxy } from "unpdf";
import sharp from 'sharp';

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
4. Se o documento contiver dados de contrato de administração ou locação, extraia também a taxa de administração em porcentagem (ex: 10.0, 8.5) e as datas de início e término/vigência se existirem.

Retorne SOMENTE um JSON válido (sem markdown, sem tags de código, sem explicações) com estas chaves:
{
    "name": "Razão social completa da imobiliária (ex: MR IMÓVEIS LTDA-ME, BASTOS IMOBILIARIA LTDA)",
    "trade_name": "Nome fantasia da imobiliária se houver (ex: MR Imóveis, Bastos Imobiliária)",
    "cnpj": "CNPJ da imobiliária (ex: 21.951.040/0001-99 ou somente dígitos)",
    "creci_number": "Número de registro no CRECI (ex: 5358, 6013)",
    "creci_state": "Sigla do estado do CRECI em 2 letras maiúsculas (ex: MG, SP, RJ)",
    "creci_type": "PJ para pessoa jurídica ou PF para pessoa física/autônomo",
    "owner_name": "Nome do responsável legal, sócio administrador ou representante da imobiliária citado no contrato",
    "main_phone": "Telefone principal de contato da imobiliária com DDD se houver (ex: (31) 3541-1207 ou (31) 98888-8888)",
    "additional_phone": "Telefone secundário se houver",
    "email": "E-mail de contato da imobiliária se houver no documento",
    "website": "Site da imobiliária se houver",
    "postal_code": "CEP comercial da imobiliária (ex: 34007-718 ou 35450-000)",
    "street": "Logradouro (ex: Av. Alaska, Rua Primo Cavalieri)",
    "street_number": "Número do imóvel (ex: 220, 65D)",
    "address_complement": "Complemento se houver (ex: Sala 101, Loja A)",
    "neighborhood": "Bairro (ex: Jardim Canadá, Centro)",
    "city": "Cidade (ex: Nova Lima, Itabirito)",
    "state": "Sigla do Estado em 2 letras maiúsculas (ex: MG, SP)",
    "management_fee": "Taxa de administração em % (número como 10.0, 8.0) ou null se não constar",
    "agreement_start_date": "Data de início da prestação/vigência no formato YYYY-MM-DD ou null",
    "agreement_end_date": "Data de término ou vigência no formato YYYY-MM-DD ou null",
    "contract_notes": "Resumo breve de cláusulas contratuais relevantes, regras de repasse ou observações ou null",
    "logo_box_2d": [ymin, xmin, ymax, xmax] ou null,
    "confidence": 0.0 a 1.0
}

Regras:
- Se um campo não constar no documento, defina seu valor como null.
- Não invente informações inexistentes.
- O campo confidence deve refletir a certeza da identificação da imobiliária.`;

function inferDDD(city?: string | null, state?: string | null): string {
    const s = (state || '').toUpperCase().trim();
    const c = (city || '').toLowerCase().trim();

    if (s === 'MG') {
        if (
            c.includes('belo horizonte') || c.includes('nova lima') || c.includes('itabirito') || 
            c.includes('betim') || c.includes('contagem') || c.includes('sabará') || c.includes('sabara') ||
            c.includes('ouro preto') || c.includes('mariana') || c.includes('brumadinho') || c.includes('lagoa santa') ||
            c.includes('vespasiano') || c.includes('santa luzia') || c.includes('sete lagoas') || c.includes('neves')
        ) {
            return '31';
        }
        if (c.includes('juiz de fora') || c.includes('ubá') || c.includes('muriaé') || c.includes('viçosa') || c.includes('barbacena')) return '32';
        if (c.includes('governador valadares') || c.includes('ipatinga') || c.includes('coronel fabriciano') || c.includes('timóteo') || c.includes('teófilo otoni')) return '33';
        if (c.includes('uberlândia') || c.includes('uberaba') || c.includes('araguari') || c.includes('patos de minas')) return '34';
        if (c.includes('poços de caldas') || c.includes('pouso alegre') || c.includes('varginha') || c.includes('itaju')) return '35';
        if (c.includes('montes claros')) return '38';
        if (c.includes('divinópolis') || c.includes('itaúna') || c.includes('formiga')) return '37';
        return '31';
    }
    if (s === 'SP') {
        if (c.includes('são paulo') || c.includes('guarulhos') || c.includes('osasco') || c.includes('santo andré') || c.includes('são bernardo')) return '11';
        if (c.includes('campinas')) return '19';
        if (c.includes('santos')) return '13';
        if (c.includes('são josé dos campos') || c.includes('taubaté')) return '12';
        if (c.includes('sorocaba')) return '15';
        if (c.includes('ribeirão preto')) return '16';
        if (c.includes('são josé do rio preto')) return '17';
        if (c.includes('presidente prudente')) return '18';
        if (c.includes('bauru')) return '14';
        return '11';
    }
    if (s === 'RJ') {
        if (c.includes('rio de janeiro') || c.includes('niterói') || c.includes('duque de caxias') || c.includes('nova iguaçu')) return '21';
        return '22';
    }
    if (s === 'ES') return '27';
    if (s === 'PR') return c.includes('curitiba') ? '41' : '44';
    if (s === 'SC') return c.includes('florianópolis') ? '48' : '47';
    if (s === 'RS') return c.includes('porto alegre') ? '51' : '54';
    if (s === 'BA') return c.includes('salvador') ? '71' : '75';
    if (s === 'DF' || c.includes('brasília')) return '61';
    if (s === 'GO') return c.includes('goiânia') ? '62' : '64';
    if (s === 'PE') return '81';
    if (s === 'CE') return '85';
    return '31';
}

function normalizePhoneWithDDD(phone: string | null | undefined, city?: string | null, state?: string | null): string | null {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 8) {
        const ddd = inferDDD(city, state);
        return `(${ddd}) ${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
    if (digits.length === 9) {
        const ddd = inferDDD(city, state);
        return `(${ddd}) ${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
    return phone;
}

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

        // Strategy 1: If we have extracted text from PDF, use Gemini or OpenAI
        if (textContent.trim().length >= 100) {
            const gemini = getGeminiClient();
            if (gemini) {
                const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"];
                for (const m of models) {
                    try {
                        const model = gemini.getGenerativeModel({ model: m });
                        const result = await model.generateContent([
                            { text: EXTRACTION_PROMPT + "\n\nConteúdo do contrato:\n\n" + textContent.substring(0, 18000) }
                        ]);
                        extracted = parseJsonResponse(result.response.text());
                        if (extracted) break;
                    } catch (err) {
                        console.warn(`[Agency Extract] Gemini text model ${m} failed:`, err);
                    }
                }
            }
        }

        // Strategy 2: Gemini Vision (for images or scanned PDFs)
        if (!extracted && base64ForVision) {
            const gemini = getGeminiClient();
            if (gemini) {
                const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"];
                for (const m of models) {
                    try {
                        const model = gemini.getGenerativeModel({ model: m });
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
                        if (extracted) break;
                    } catch (err) {
                        console.warn(`[Agency Extract] Gemini vision model ${m} failed:`, err);
                    }
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

        // ── Normalizations & Post-Processing ─────────────────────────

        // Auto-infer DDD and format phone numbers if needed
        if (extracted.main_phone) {
            extracted.main_phone = normalizePhoneWithDDD(extracted.main_phone, extracted.city, extracted.state);
        }
        if (extracted.additional_phone) {
            extracted.additional_phone = normalizePhoneWithDDD(extracted.additional_phone, extracted.city, extracted.state);
        }

        // Crop logo using sharp if the uploaded file is an image and logo_box_2d is present
        if (
            file.type.startsWith("image/") &&
            extracted.logo_box_2d &&
            Array.isArray(extracted.logo_box_2d) &&
            extracted.logo_box_2d.length === 4
        ) {
            try {
                const metadata = await sharp(buffer).metadata();
                if (metadata.width && metadata.height) {
                    const [ymin, xmin, ymax, xmax] = extracted.logo_box_2d;
                    const left = Math.max(0, Math.floor((xmin / 1000) * metadata.width));
                    const top = Math.max(0, Math.floor((ymin / 1000) * metadata.height));
                    const width = Math.min(metadata.width - left, Math.ceil(((xmax - xmin) / 1000) * metadata.width));
                    const height = Math.min(metadata.height - top, Math.ceil(((ymax - ymin) / 1000) * metadata.height));

                    if (width > 20 && height > 20) {
                        const padX = Math.round(width * 0.05);
                        const padY = Math.round(height * 0.05);
                        const cropLeft = Math.max(0, left - padX);
                        const cropTop = Math.max(0, top - padY);
                        const cropWidth = Math.min(metadata.width - cropLeft, width + (padX * 2));
                        const cropHeight = Math.min(metadata.height - cropTop, height + (padY * 2));

                        const croppedBuffer = await sharp(buffer)
                            .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
                            .png()
                            .toBuffer();

                        extracted.logo_base64 = `data:image/png;base64,${croppedBuffer.toString("base64")}`;
                    }
                }
            } catch (cropErr) {
                console.warn("[Agency Extract] Server sharp logo crop failed:", cropErr);
            }
        }

        return NextResponse.json({ success: true, data: extracted });
    } catch (err) {
        console.error('[Agency Extract] Error:', err);
        return NextResponse.json({ error: 'Erro interno ao processar o contrato.' }, { status: 500 });
    }
}
