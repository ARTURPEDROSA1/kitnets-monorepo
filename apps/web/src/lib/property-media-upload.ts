"use client";

/**
 * Photos and videos of a property (and of its units) into the public `property-media` bucket.
 *
 * One place for what every upload site used to repeat: the object name (a timestamp and a random
 * suffix, so an object is never overwritten and can be cached for a year), the browser-side resize
 * of photos (lib/image-resize.ts) and the public URL stored in the profile. Egress is the reason:
 * a 4 MB original served on every view ate the Supabase quota; a 300 KB copy with a one-year
 * Cache-Control is fetched once by Vercel's image optimizer and served from its cache after that.
 */
import { resizeImageForUpload } from "@/lib/image-resize";

export const PROPERTY_MEDIA_BUCKET = "property-media";
/** Objects are never rewritten (unique names), so browsers and the optimizer may keep them a year. */
export const PROPERTY_MEDIA_CACHE_CONTROL = String(60 * 60 * 24 * 365);

/** The slice of the Supabase client the uploads need (the profile page builds its own client). */
export interface MediaStorageClient {
    storage: {
        from(bucket: string): {
            upload(path: string, body: File, options?: { cacheControl?: string; contentType?: string; upsert?: boolean }): Promise<{ error: { message: string } | null }>;
            getPublicUrl(path: string): { data: { publicUrl: string } };
        };
    };
}

/**
 * The bucket's policies accept `photos/`, `videos/` and `listings/` as the first folder and the
 * owner's profile id as the second (migration 20260912125620_baseline.sql).
 */
export type PropertyMediaFolder = "photos" | "videos" | "listings";

/** `photos/<prefix>/1696000000000-ab12cd.jpg` — `prefix` is the profile id, `<profile>/prop-2` or `<profile>/unit-1`. */
export function propertyMediaPath(folder: PropertyMediaFolder, prefix: string, fileName: string): string {
    const ext = (fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    return `${folder}/${prefix}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
}

async function uploadMedia(sb: MediaStorageClient, kind: PropertyMediaFolder, prefix: string, file: File): Promise<string | null> {
    const path = propertyMediaPath(kind, prefix, file.name);
    const bucket = sb.storage.from(PROPERTY_MEDIA_BUCKET);
    const { error } = await bucket.upload(path, file, { cacheControl: PROPERTY_MEDIA_CACHE_CONTROL, contentType: file.type || undefined, upsert: false });
    if (error) {
        console.error(`[property-media] ${kind} upload failed:`, error.message);
        return null;
    }
    return bucket.getPublicUrl(path).data.publicUrl;
}

/**
 * The photo, shrunk for the web, in the bucket; its public URL, or null when the upload failed.
 * `folder` is `photos` for a property's own pictures, `listings` for the anúncio wizard's.
 */
export async function uploadPropertyPhoto(sb: MediaStorageClient, prefix: string, file: File, folder: "photos" | "listings" = "photos"): Promise<string | null> {
    return uploadMedia(sb, folder, prefix, await resizeImageForUpload(file));
}

/** The video as it is (the browser cannot transcode); its public URL, or null when the upload failed. */
export async function uploadPropertyVideo(sb: MediaStorageClient, prefix: string, file: File): Promise<string | null> {
    return uploadMedia(sb, "videos", prefix, file);
}
