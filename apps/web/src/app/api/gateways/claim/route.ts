import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/api-auth';

/**
 * POST /api/gateways/claim
 * body: { code: string }
 *
 * Claims an unclaimed gateway (looked up by serial number) for the signed-in
 * user. The owner is always the caller; a `userId` in the body is ignored.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) {
        // Keep the historical message the claim page maps to a friendly hint.
        if (authed.response.status === 403) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        return authed.response;
    }
    const { profileId, supabase } = authed.ctx;

    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!code || code.length > 64) {
        return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    // 1. Gateway must exist and be unclaimed
    const { data: gateway, error: fetchError } = await supabase
        .from('gateways')
        .select('*')
        .eq('serial_number', code)
        .maybeSingle();

    if (fetchError || !gateway) {
        return NextResponse.json({ error: 'Invalid gateway code' }, { status: 404 });
    }

    if (gateway.status !== 'unclaimed' || gateway.owner_id) {
        return NextResponse.json({ error: 'Gateway already claimed' }, { status: 409 });
    }

    // 2. Claim — the WHERE clause re-checks "unclaimed" so two concurrent claims can't both win
    const { data: claimed, error: updateError } = await supabase
        .from('gateways')
        .update({
            owner_id: profileId,
            status: 'online',
            label: gateway.label || 'My Gateway',
        })
        .eq('id', gateway.id)
        .eq('status', 'unclaimed')
        .is('owner_id', null)
        .select('id')
        .maybeSingle();

    if (updateError || !claimed) {
        console.error('[Claim] Gateway update failed:', updateError?.message);
        return NextResponse.json({ error: 'Gateway already claimed' }, { status: 409 });
    }

    // 3. Auto-link to one of the caller's properties (create a first one if none)
    const { data: existingProperty } = await supabase
        .from('properties')
        .select('id')
        .eq('owner_id', profileId)
        .limit(1)
        .maybeSingle();

    let propertyId = existingProperty?.id;

    if (!propertyId) {
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('property_address, full_name')
            .eq('id', profileId)
            .single();

        const addr = userProfile?.property_address as Record<string, string> | null;
        const { data: newProperty, error: propError } = await supabase
            .from('properties')
            .insert({
                owner_id: profileId,
                name: addr?.street ? `${addr.street}, ${addr.number || ''}`.trim() : (userProfile?.full_name || 'Meu Imóvel'),
                address: addr?.street ? `${addr.street}, ${addr.number || ''} - ${addr.neighborhood || ''}`.trim() : null,
                city: addr?.city || null,
                state: addr?.state || null,
                zip: addr?.cep || null,
            })
            .select('id')
            .single();

        if (propError) {
            console.warn('[Claim] Property creation failed (non-critical):', propError.message);
        } else {
            propertyId = newProperty?.id;
        }
    }

    if (propertyId) {
        const { error: linkError } = await supabase
            .from('gateways')
            .update({ property_id: propertyId })
            .eq('id', gateway.id)
            .eq('owner_id', profileId);

        if (linkError) {
            console.warn('[Claim] Gateway→Property link failed (non-critical):', linkError.message);
        }
    }

    return NextResponse.json({
        success: true,
        gateway: { ...gateway, owner_id: profileId, status: 'online', property_id: propertyId },
    });
}
