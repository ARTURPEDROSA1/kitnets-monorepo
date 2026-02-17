import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';

const getGeminiClient = () => {
    if (!process.env.GEMINI_API_KEY) return null;
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

const getOpenAIClient = () => {
    if (!process.env.OPENAI_API_KEY) return null;
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const SYSTEM_PROMPT = `Você é um especialista em marketing imobiliário brasileiro. 
Gere uma descrição atrativa e profissional em português para um imóvel ou unidade de aluguel.

Regras:
- Use linguagem persuasiva e positiva
- Destaque os diferenciais do imóvel
- Mencione a localização quando disponível
- Seja conciso (máximo 3 parágrafos curtos)
- NÃO invente informações não fornecidas
- NÃO use emojis
- Use formatação de texto simples, sem markdown
- Se for uma unidade/kitnet, foque nos detalhes específicos daquela unidade`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { propertyData, unitData, type } = body;

        if (!propertyData && !unitData) {
            return NextResponse.json({ error: 'No data provided' }, { status: 400 });
        }

        // Build context from available data
        let context = '';

        if (type === 'unit' && unitData) {
            context = `Gere uma descrição para esta UNIDADE de aluguel:\n`;
            if (unitData.name) context += `- Nome: ${unitData.name}\n`;
            if (unitData.sqMeters) context += `- Área: ${unitData.sqMeters} m²\n`;
            if (unitData.rooms) context += `- Cômodos: ${unitData.rooms}\n`;
            if (unitData.bedrooms) context += `- Quartos: ${unitData.bedrooms}\n`;
            if (unitData.bathrooms) context += `- Banheiros: ${unitData.bathrooms}\n`;
            if (unitData.garage) context += `- Garagem: Sim\n`;
            if (unitData.kitchenCabinets) context += `- Armários de cozinha: Sim\n`;
            if (unitData.laundry && unitData.laundry !== 'none') context += `- Lavanderia: ${unitData.laundry === 'individual' ? 'Individual' : 'Compartilhada'}\n`;
            if (unitData.ac && unitData.ac !== 'none') context += `- Ar-condicionado: ${unitData.ac === 'cold' ? 'Frio' : 'Quente e Frio'}\n`;
            if (unitData.cooktop && unitData.cooktop !== 'none') context += `- Cooktop: ${unitData.cooktop === 'gas' ? 'Gás' : unitData.cooktop === 'electric' ? 'Elétrico' : 'Indução'}\n`;
            if (unitData.condominium) {
                context += `- Condomínio: R$ ${unitData.condominiumValue || '(não informado)'}\n`;
                const includes = [];
                if (unitData.condominiumIncludes?.energy) includes.push('Energia');
                if (unitData.condominiumIncludes?.water) includes.push('Água');
                if (unitData.condominiumIncludes?.internet) includes.push('Internet');
                if (unitData.condominiumIncludes?.iptu) includes.push('IPTU');
                if (unitData.condominiumIncludes?.gas) includes.push('Gás');
                if (includes.length > 0) context += `- Incluso no condomínio: ${includes.join(', ')}\n`;
            }
        }

        if (propertyData) {
            if (type === 'main') {
                context = `Gere uma descrição para este IMÓVEL PRINCIPAL (área comum e fachada):\n`;
            } else {
                context += `\nDados da propriedade principal:\n`;
            }
            if (propertyData.address?.street) context += `- Endereço: ${propertyData.address.street}${propertyData.address.number ? ', ' + propertyData.address.number : ''}\n`;
            if (propertyData.address?.neighborhood) context += `- Bairro: ${propertyData.address.neighborhood}\n`;
            if (propertyData.address?.city) context += `- Cidade: ${propertyData.address.city}${propertyData.address.state ? '/' + propertyData.address.state : ''}\n`;
            if (propertyData.totalSqMeters) context += `- Área total: ${propertyData.totalSqMeters} m²\n`;
            if (propertyData.solarEnergy) context += `- Energia solar: ${propertyData.solarKwp ? propertyData.solarKwp + ' kWp' : 'Sim'}\n`;
            if (propertyData.propertyType === 'multi' && propertyData.numberOfUnits) {
                context += `- Tipo: Multi-unidades (${propertyData.numberOfUnits} unidades)\n`;
            }
        }

        if (!context.trim()) {
            return NextResponse.json({ error: 'Insufficient data to generate description' }, { status: 400 });
        }

        let description = '';

        // Try Gemini first (free)
        const gemini = getGeminiClient();
        if (gemini) {
            try {
                const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
                const result = await model.generateContent([
                    { text: SYSTEM_PROMPT + '\n\n' + context }
                ]);
                description = result.response.text().trim();
            } catch (err) {
                console.warn('[AI Description] Gemini failed:', err);
            }
        }

        // Fallback to OpenAI
        if (!description) {
            const openai = getOpenAIClient();
            if (!openai) {
                return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
            }
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: context },
                ],
                max_tokens: 500,
                temperature: 0.7,
            });
            description = completion.choices[0]?.message?.content?.trim() || '';
        }

        if (!description) {
            return NextResponse.json({ error: 'Failed to generate description' }, { status: 500 });
        }

        return NextResponse.json({ description });
    } catch (err) {
        console.error('[AI Description] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
