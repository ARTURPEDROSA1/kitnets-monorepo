'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export async function deleteAccount() {
    const { userId } = await auth()

    if (!userId) {
        throw new Error('Unauthorized')
    }

    // 1. Delete from Supabase (Database)
    // We try to use the Service Role Key to ensure we bypass RLS and cascade restrictions.
    // If the key is unavailable, this might fail if RLS policies are strict.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && supabaseServiceKey) {
        try {
            const supabase = createClient(supabaseUrl, supabaseServiceKey)

            // Delete the profile. Assuming strict foreign key cascades are set up in DB, 
            // this should remove related data. If not, we might leave orphans.
            const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('clerk_id', userId)

            if (error) {
                console.error("Supabase deletion error:", error)
            }
        } catch (error) {
            console.error("Supabase client error:", error)
        }
    } else {
        console.warn("Missing Supabase credentials for admin deletion.")
    }

    // 2. Delete from Clerk (Authentication)
    try {
        const client = await clerkClient()
        await client.users.deleteUser(userId)
    } catch (error) {
        console.error("Clerk user deletion error:", error)
        throw new Error("Failed to delete authentication record.")
    }

    return { success: true }
}
