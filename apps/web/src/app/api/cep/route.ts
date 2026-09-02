import { NextResponse } from 'next/server';

/**
 * GET /api/cep?code=01310100
 * Proxy for ViaCEP API to auto-fill address fields from a Brazilian CEP.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code')?.replace(/\D/g, '');

    if (!code || code.length !== 8) {
        return NextResponse.json(
            { error: 'CEP inválido. Informe 8 dígitos.' },
            { status: 400 }
        );
    }

    try {
        const res = await fetch(`https://viacep.com.br/ws/${code}/json/`, {
            next: { revalidate: 86400 }, // Cache for 24h
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: 'Erro ao consultar CEP. Tente novamente.' },
                { status: 502 }
            );
        }

        const data = await res.json();

        if (data.erro) {
            return NextResponse.json(
                { error: 'CEP não encontrado.' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            street: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: data.uf || '',
            complement: data.complemento || '',
        });
    } catch (err) {
        console.error('[CEP API] Error:', err);
        return NextResponse.json(
            { error: 'Erro ao consultar CEP. Tente novamente.' },
            { status: 500 }
        );
    }
}
