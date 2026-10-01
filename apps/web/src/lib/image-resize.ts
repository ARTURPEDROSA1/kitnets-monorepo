/**
 * Photos are shrunk in the browser before they reach storage. A phone photo is 3–6 MB and 4000 px
 * wide; the property pages show it at 200–1600 px, so the original only costs storage egress on
 * every view (Supabase's free plan allows 5 GB a month). 1600 px on the long side at JPEG/WebP
 * quality 0.82 is ~300 KB and indistinguishable on screen.
 *
 * The pure helpers (`fitWithin`, `outputTypeFor`, `renameForType`) are tested; `resizeImageForUpload`
 * needs a browser and gives the original file back whenever the browser cannot decode or encode it
 * (HEIC without support, a corrupt file…), so an upload never fails because of the resize.
 */

export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.82;
/** A file already this small and within the size limit goes up untouched. */
export const PHOTO_SKIP_BELOW_BYTES = 400 * 1024;

export interface ResizeOptions {
    maxSide?: number;
    quality?: number;
    skipBelowBytes?: number;
}

/** Width and height scaled so the long side is at most `maxSide`; never upscales. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number; scale: number } {
    const longest = Math.max(width, height);
    if (longest <= maxSide || longest === 0) return { width, height, scale: 1 };
    const scale = maxSide / longest;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/** JPEG stays JPEG; everything else (PNG screenshots, WebP, BMP…) becomes WebP, far smaller than PNG. */
export function outputTypeFor(inputType: string): "image/jpeg" | "image/webp" {
    return inputType === "image/jpeg" || inputType === "image/jpg" ? "image/jpeg" : "image/webp";
}

/** "IMG_0001.HEIC" + image/jpeg → "IMG_0001.jpg": the stored name says what the bytes are. */
export function renameForType(name: string, type: "image/jpeg" | "image/webp"): string {
    const ext = type === "image/jpeg" ? "jpg" : "webp";
    const base = name.replace(/\.[^.]+$/, "") || "foto";
    return `${base}.${ext}`;
}

/** Formats the browser can decode and we want to re-encode; GIFs keep their animation and go up as they are. */
export function shouldResize(file: Pick<File, "type">): boolean {
    return file.type.startsWith("image/") && file.type !== "image/gif" && file.type !== "image/svg+xml";
}

async function decode(file: File): Promise<ImageBitmap> {
    try {
        // from-image: honour the EXIF orientation, so a portrait phone photo stays upright
        return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        return await createImageBitmap(file);
    }
}

async function encode(bitmap: ImageBitmap, width: number, height: number, type: "image/jpeg" | "image/webp", quality: number): Promise<Blob | null> {
    if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, width, height);
        return canvas.convertToBlob({ type, quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/**
 * The photo shrunk for upload, or the file itself when it is already small, is not a photo we
 * re-encode, or the browser cannot process it.
 */
export async function resizeImageForUpload(file: File, options: ResizeOptions = {}): Promise<File> {
    const maxSide = options.maxSide ?? PHOTO_MAX_SIDE;
    const quality = options.quality ?? PHOTO_QUALITY;
    const skipBelow = options.skipBelowBytes ?? PHOTO_SKIP_BELOW_BYTES;
    if (!shouldResize(file) || typeof createImageBitmap !== "function") return file;

    let bitmap: ImageBitmap | null = null;
    try {
        bitmap = await decode(file);
        const { width, height, scale } = fitWithin(bitmap.width, bitmap.height, maxSide);
        if (scale === 1 && file.size <= skipBelow) return file;
        const type = outputTypeFor(file.type);
        const blob = await encode(bitmap, width, height, type, quality);
        if (!blob || blob.size === 0 || (scale === 1 && blob.size >= file.size)) return file;
        return new File([blob], renameForType(file.name, type), { type, lastModified: file.lastModified });
    } catch (err) {
        console.warn("[image-resize] keeping the original:", (err as Error).message);
        return file;
    } finally {
        bitmap?.close();
    }
}
