import { NextResponse } from 'next/server';
import { getIndexMetadata, getAllIndexValuesForCalculator } from '@/lib/indexes';

export const dynamic = 'force-static';
export const revalidate = 3600; // 1 hour

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ code: string }> }
) {
    const { code } = await params;
    const upperCode = code.toUpperCase();

    // Only allow IPCA and INPC
    if (upperCode !== 'IPCA' && upperCode !== 'INPC') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const metadata = await getIndexMetadata(upperCode);
    if (!metadata) {
        return NextResponse.json({ error: 'Index not found' }, { status: 404 });
    }

    const data = await getAllIndexValuesForCalculator(metadata.id);

    return NextResponse.json(data, {
        headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}
