'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Deletes the signed-in user's account: the `profiles` row first (every
 * dependent table cascades or nulls out at the DB level, see the
 * profile_delete_cascades migration), then the Clerk user.
 *
 * Order matters. If the database delete fails we stop and throw, leaving the
 * Clerk user intact so the person stays signed in and can retry. A previous
 * version only logged the database error and went on to delete the Clerk
 * user, which stranded the profile: the e-mail re-linked it on the next
 * signup and all data silently "came back" under a new Clerk id.
 */
export async function deleteAccount() {
    const { userId } = await auth()

    if (!userId) {
        throw new Error('Unauthorized')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[deleteAccount] Missing Supabase service credentials; refusing to delete the Clerk user without removing the profile.')
        throw new Error('Account deletion is not available right now.')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Database. `.select('id')` tells us whether a row was actually removed.
    const { data: deletedRows, error } = await supabase
        .from('profiles')
        .delete()
        .eq('clerk_id', userId)
        .select('id')

    if (error) {
        console.error('[deleteAccount] Supabase deletion error:', error.message, error.code)
        throw new Error('Failed to delete account data.')
    }

    if (!deletedRows || deletedRows.length === 0) {
        // No profile for this Clerk id (never onboarded, or already deleted) — nothing
        // to strand, so removing the auth record is safe.
        console.warn('[deleteAccount] No profile row found for Clerk user; deleting auth record only.')
    }

    // 2. Authentication.
    try {
        const client = await clerkClient()
        await client.users.deleteUser(userId)
    } catch (err) {
        console.error('[deleteAccount] Clerk user deletion error:', err)
        throw new Error('Failed to delete authentication record.')
    }

    return { success: true }
}
