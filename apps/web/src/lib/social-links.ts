/**
 * The tenant's ways of being reached, normalised once so the rest of the app only prints links:
 * an Instagram handle (whatever was typed: "@ana.silva", "instagram.com/ana.silva/"), a LinkedIn
 * profile URL ("linkedin.com/in/ana-silva", "ana-silva") and a WhatsApp link from an E.164 phone.
 * Pure and dependency-free; the schema uses it to store canonical values, the screens to render.
 */

const INSTAGRAM_HANDLE = /^[a-z0-9._]{1,30}$/;

/** "@ana.silva", "https://www.instagram.com/ana.silva/?hl=pt" → "ana.silva"; invalid → null. */
export function normalizeInstagram(value: string | null | undefined): string | null {
    if (!value) return null;
    let v = value.trim().toLowerCase();
    if (!v) return null;
    const url = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/.exec(v);
    if (url) v = url[1];
    v = v.replace(/^@/, "").replace(/\/+$/, "");
    return INSTAGRAM_HANDLE.test(v) && !v.startsWith(".") && !v.endsWith(".") ? v : null;
}

export const instagramUrl = (handle: string) => `https://www.instagram.com/${handle}/`;

/**
 * "linkedin.com/in/ana-silva", "https://br.linkedin.com/in/ana-silva/", "in/ana-silva", "ana-silva"
 * → "https://www.linkedin.com/in/ana-silva/"; company and school pages keep their own path;
 * anything that is not a LinkedIn path → null.
 */
export function normalizeLinkedin(value: string | null | undefined): string | null {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    const url = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(.+)$/i.exec(v);
    let path = url ? url[1] : v.replace(/^\/+/, "");
    path = path.split(/[?#]/)[0].replace(/\/+$/, "");
    if (!path) return null;
    if (!/^(in|company|school|pub)\//i.test(path)) {
        // a bare handle: a person's profile
        if (!/^[A-Za-z0-9\-_%À-ɏ]{2,100}$/.test(path)) return null;
        path = `in/${path}`;
    }
    if (!/^(in|company|school|pub)\/[A-Za-z0-9\-_%.À-ɏ]{2,100}$/i.test(path)) return null;
    return `https://www.linkedin.com/${path}/`;
}

/** "https://www.linkedin.com/in/ana-silva/" → "in/ana-silva", for the chip. */
export function linkedinLabel(url: string): string {
    const m = /linkedin\.com\/(.+?)\/?$/i.exec(url);
    return m ? m[1] : url;
}

/** `+5531999990000` → https://wa.me/5531999990000; null without enough digits. */
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits.length < 10) return null;
    const q = text ? `?text=${encodeURIComponent(text)}` : "";
    return `https://wa.me/${digits}${q}`;
}

/** `+5531999990000` → tel:+5531999990000 */
export function telUrl(phone: string | null | undefined): string | null {
    const digits = (phone ?? "").replace(/\D/g, "");
    return digits.length >= 10 ? `tel:+${digits}` : null;
}
