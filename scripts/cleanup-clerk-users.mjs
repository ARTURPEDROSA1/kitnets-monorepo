/**
 * Clerk Cleanup Script
 * 
 * Lists and deletes all Clerk users matching pedrosa.ac@gmail.com.
 * 
 * Usage:
 *   1. First run in DRY-RUN mode (default): node scripts/cleanup-clerk-users.mjs
 *   2. Then run with --delete flag to actually delete:  node scripts/cleanup-clerk-users.mjs --delete
 * 
 * Prerequisites:
 *   - CLERK_SECRET_KEY in apps/web/.env.local
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from apps/web/.env.local
config({ path: resolve(__dirname, '..', 'apps', 'web', '.env.local') });

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const TARGET_EMAIL = 'pedrosa.ac@gmail.com';
const DELETE_MODE = process.argv.includes('--delete');

if (!CLERK_SECRET_KEY) {
    console.error('❌ CLERK_SECRET_KEY not found in env. Check apps/web/.env.local');
    process.exit(1);
}

const clerkFetch = async (path, options = {}) => {
    const res = await fetch(`https://api.clerk.com/v1${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Clerk API error ${res.status}: ${text}`);
    }
    return res.json();
};

async function main() {
    console.log('🔍 Searching for Clerk users with email:', TARGET_EMAIL);
    console.log('Mode:', DELETE_MODE ? '🔴 DELETE' : '🟢 DRY-RUN (use --delete to actually delete)');
    console.log('---');

    // Search by email
    const users = await clerkFetch(`/users?email_address=${encodeURIComponent(TARGET_EMAIL)}&limit=100`);

    console.log(`Found ${users.length} Clerk user(s) for ${TARGET_EMAIL}:\n`);

    for (const user of users) {
        const emails = user.email_addresses?.map(e => e.email_address).join(', ') || 'N/A';
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'N/A';
        const created = new Date(user.created_at).toISOString();
        const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).toISOString() : 'Never';

        console.log(`  User ID:       ${user.id}`);
        console.log(`  Name:          ${name}`);
        console.log(`  Email(s):      ${emails}`);
        console.log(`  Created:       ${created}`);
        console.log(`  Last Sign In:  ${lastSignIn}`);
        console.log(`  ---`);
    }

    if (!DELETE_MODE) {
        console.log('\n✅ Dry run complete. Run with --delete to remove all users above.');
        return;
    }

    // DELETE MODE
    console.log(`\n⚠️  Deleting ${users.length} user(s)...`);

    for (const user of users) {
        try {
            await clerkFetch(`/users/${user.id}`, { method: 'DELETE' });
            console.log(`  ✅ Deleted user ${user.id} (${user.first_name} ${user.last_name})`);
        } catch (err) {
            console.error(`  ❌ Failed to delete ${user.id}:`, err.message);
        }
    }

    console.log('\n🎉 Clerk cleanup complete!');
    console.log('Next steps:');
    console.log('  1. Run the Supabase cleanup SQL (nuke_artur_profiles.sql)');
    console.log('  2. Sign up fresh at https://kitnets.com with your LLC company');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
