
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const cpf = searchParams.get('cpf')?.replace(/\D/g, '');

    if (!cpf || cpf.length !== 11) {
        return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 });
    }

    // --- REAL API INTEGRATION (BigDataCorp Example) ---
    const token = process.env.BIGDATACORP_TOKEN;

    if (token) {
        try {
            // Official Endpoint for BigDataCorp "People" dataset
            // Docs: https://api.bigdatacorp.com.br/
            const response = await fetch(`https://plataforma.bigdatacorp.com.br/pessoas?cpf=${cpf}`, {
                method: 'GET',
                headers: {
                    'AccessToken': token,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();

                // Map their response format to ours
                // Note: Actual field names depend on specific dataset purchased (Basic, Contact, etc.)
                const basicData = data.BasicData || {};
                const phones = data.Phones || [];

                // Extract best phone (mobile preferred)
                const mobile = phones.find((p: any) => p.Type === 'Mobile') || phones[0];
                const phoneFormatted = mobile
                    ? `(${mobile.AreaCode}) ${mobile.Number}`
                    : null;

                return NextResponse.json({
                    success: true,
                    source: 'BIGDATACORP',
                    data: {
                        birthDate: basicData.BirthDate ? basicData.BirthDate.split('T')[0] : null,
                        name: basicData.Name,
                        phone: phoneFormatted
                    }
                });
            } else {
                console.error('BigDataCorp Error:', response.status, await response.text());
                // Fallthrough to mock if API fails? Or return error?
                // For safety, let's fallthrough to mock for dev, but in prod you might want to error.
            }

        } catch (error) {
            console.error('Enrichment API Error:', error);
        }
    }

    // --- FALLBACK MOCK (If no token or API fails) ---
    // Useful for development without spending credits

    await new Promise(resolve => setTimeout(resolve, 800));

    return NextResponse.json({
        success: true,
        source: 'MOCK',
        data: {
            birthDate: '1988-04-12',
            phone: '(31) 99876-5432',
            name: 'ARTUR DA CONCEICAO PEDROSA'
        }
    });
}
