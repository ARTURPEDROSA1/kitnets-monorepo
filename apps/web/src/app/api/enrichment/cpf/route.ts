import { NextRequest, NextResponse } from 'next/server';
import { validateCPF } from '@/lib/validators';
import { requireUserWithLimit } from '@/lib/session';
import { HOUR } from '@/lib/rate-limit';

/**
 * POST /api/enrichment/cpf
 * body: { cpf: string }
 *
 * Looks up birth date / phone for a CPF via BigDataCorp to pre-fill the
 * profile form. Signed-in users only, rate limited, CPF in the body (never in
 * the URL / server logs). Without BIGDATACORP_TOKEN it returns no data.
 */
export async function POST(request: NextRequest) {
    const gate = await requireUserWithLimit('enrichment:cpf', 10, HOUR);
    if ('response' in gate) return gate.response;

    const body = await request.json().catch(() => ({}));
    const cpf = typeof body?.cpf === 'string' ? body.cpf.replace(/\D/g, '') : '';

    if (cpf.length !== 11 || !validateCPF(cpf)) {
        return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 });
    }

    const token = process.env.BIGDATACORP_TOKEN;
    if (!token) {
        return NextResponse.json({ success: false, source: 'DISABLED', data: null });
    }

    try {
        const response = await fetch('https://plataforma.bigdatacorp.com.br/pessoas', {
            method: 'POST',
            headers: {
                AccessToken: token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: `doc{${cpf}}`, Datasets: 'basic_data,phones' }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            console.error('[enrichment/cpf] provider error:', response.status);
            return NextResponse.json({ success: false, source: 'BIGDATACORP', data: null });
        }

        const payload = await response.json();
        const result = Array.isArray(payload?.Result) ? payload.Result[0] : payload;
        const basicData = result?.BasicData || {};
        const phones: Array<{ Type?: string; AreaCode?: string; Number?: string }> = result?.Phones || [];
        const mobile = phones.find((p) => p.Type === 'Mobile') || phones[0];

        return NextResponse.json({
            success: true,
            source: 'BIGDATACORP',
            data: {
                birthDate: basicData.BirthDate ? String(basicData.BirthDate).split('T')[0] : null,
                name: basicData.Name ?? null,
                phone: mobile?.AreaCode && mobile?.Number ? `(${mobile.AreaCode}) ${mobile.Number}` : null,
            },
        });
    } catch (error) {
        console.error('[enrichment/cpf] request failed:', error instanceof Error ? error.message : error);
        return NextResponse.json({ success: false, source: 'BIGDATACORP', data: null });
    }
}
