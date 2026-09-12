import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * POST /api/profiles/create
 *
 * Ensures a `profiles` row exists for the signed-in Clerk user and returns it.
 *
 * Identity comes ONLY from the Clerk session: the Clerk id and the verified
 * e-mail are read server-side. The request body may carry `fullName` and
 * nothing else is trusted (a previous version accepted `clerkId`/`email`/`role`
 * from the body, which allowed re-binding any account by e-mail).
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const fullName =
            typeof body?.fullName === 'string' && body.fullName.trim()
                ? body.fullName.trim().slice(0, 200)
                : `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();

        // Prefer the primary address when verified, otherwise any verified address.
        const verifiedEmail =
            user.emailAddresses.find(
                (e) => e.id === user.primaryEmailAddressId && e.verification?.status === 'verified'
            )?.emailAddress ??
            user.emailAddresses.find((e) => e.verification?.status === 'verified')?.emailAddress ??
            null;
        const anyEmail = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
        const cleanEmail = (verifiedEmail ?? anyEmail)?.trim().toLowerCase() ?? null;

        if (!cleanEmail) {
            return NextResponse.json({ error: 'Conta sem e-mail' }, { status: 400 });
        }

        const supabase = createAdminClient();

        // 1. Profile already linked to this Clerk user
        const { data: existingByClerk } = await supabase
            .from('profiles')
            .select('*')
            .eq('clerk_id', userId)
            .maybeSingle();

        if (existingByClerk) {
            return NextResponse.json({ success: true, profile: existingByClerk, existing: true });
        }

        // 2. Re-link an orphaned profile (re-signup / OAuth / changed Clerk id).
        //    Only allowed when Clerk has verified that this user owns the e-mail.
        if (verifiedEmail) {
            const { data: existingByEmail } = await supabase
                .from('profiles')
                .select('*')
                .ilike('email', cleanEmail)
                .maybeSingle();

            if (existingByEmail) {
                const updatePayload: Record<string, unknown> = {
                    clerk_id: userId,
                    email: cleanEmail,
                    updated_at: new Date().toISOString(),
                };
                if (fullName && (!existingByEmail.full_name || existingByEmail.full_name === 'EMPTY')) {
                    updatePayload.full_name = fullName;
                }
                // Clean up unconfigured legacy default 'single'
                if (
                    existingByEmail.property_type === 'single' &&
                    (!existingByEmail.property_address || Object.keys(existingByEmail.property_address).length === 0) &&
                    (!existingByEmail.property_details || Object.keys(existingByEmail.property_details).length === 0)
                ) {
                    updatePayload.property_type = null;
                    updatePayload.property_address = null;
                    updatePayload.property_details = null;
                }

                const { data: updated, error: updateError } = await supabase
                    .from('profiles')
                    .update(updatePayload)
                    .eq('id', existingByEmail.id)
                    .select()
                    .single();

                if (updateError) {
                    console.error('[Profile Create] Update error linking clerk_id:', updateError.message);
                    return NextResponse.json({ error: 'Erro ao vincular perfil' }, { status: 500 });
                }

                return NextResponse.json({ success: true, profile: updated, linked: true });
            }
        }

        // 3. Create a new profile. Role is fixed server-side.
        const { data: profile, error } = await supabase
            .from('profiles')
            .insert({
                id: crypto.randomUUID(),
                clerk_id: userId,
                role: 'landlord',
                full_name: fullName || '',
                email: cleanEmail,
                property_type: null,
                property_address: null,
                property_details: null,
                additional_properties: [],
            })
            .select()
            .single();

        if (error) {
            console.error('[Profile Create] Insert error:', error.message, error.code);
            return NextResponse.json({ error: 'Erro ao criar perfil' }, { status: 500 });
        }

        return NextResponse.json({ success: true, profile });
    } catch (err) {
        console.error('[Profile Create] Unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
