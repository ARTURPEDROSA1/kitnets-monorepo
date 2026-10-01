/**
 * Which pictures may go through next/image's optimizer. Vercel fetches the original once per size and
 * serves the resized copy from its own cache (`images.minimumCacheTTL` in next.config.ts), so a public
 * storage object costs Supabase egress once a month instead of on every view. A signed URL cannot: its
 * token changes every hour and would defeat the cache (and expire inside it); blob: and data: URLs
 * are local. `img.clerk.com` is the other host next.config.ts allows.
 */
const OPTIMIZABLE_HOSTS = [/\.supabase\.co$/i, /^img\.clerk\.com$/i];

/** True for an https URL of a public object on an allowed host, without a query string. */
export function canOptimizeImage(url: string | null | undefined): boolean {
    if (!url) return false;
    let u: URL;
    try {
        u = new URL(url);
    } catch {
        return false;
    }
    if (u.protocol !== "https:" || u.search) return false;
    if (!OPTIMIZABLE_HOSTS.some(h => h.test(u.hostname))) return false;
    if (/\.supabase\.co$/i.test(u.hostname) && !u.pathname.startsWith("/storage/v1/object/public/")) return false;
    return true;
}
