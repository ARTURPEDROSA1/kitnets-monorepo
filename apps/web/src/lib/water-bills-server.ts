/**
 * Server-side pieces of the water-bills routes and the Água hub: the private bucket that keeps
 * one PDF per property (the current bill) and the water utility's logo beside it — the cover of
 * the property's card — with the logo pulled from the header of a digital PDF.
 */
import { getDocumentProxy } from "unpdf";
import type { AdminSupabase } from "@/lib/api-auth";
import { extractLogoFromPdf } from "@/lib/agency-logo";
import { signStorageUrl } from "@/lib/storage";

export const WATER_BILLS_BUCKET = "water-bills";
export const CURRENT_BILL_FILE = "current_bill.pdf";
export const UTILITY_LOGO_PREFIX = "utility_logo.";

export interface WaterFiles {
    /** object path of the current bill's PDF, or null */
    pdfPath: string | null;
    /** object path of the utility's logo, or null */
    logoPath: string | null;
}

/** What the property's folder in the bucket holds. */
export async function listWaterFiles(supabase: AdminSupabase, propertyId: string): Promise<WaterFiles> {
    try {
        const { data: files } = await supabase.storage.from(WATER_BILLS_BUCKET).list(propertyId, { limit: 20 });
        const names = (files ?? []).map(f => f.name);
        const logo = names.find(n => n.startsWith(UTILITY_LOGO_PREFIX)) ?? null;
        return {
            pdfPath: names.includes(CURRENT_BILL_FILE) ? `${propertyId}/${CURRENT_BILL_FILE}` : null,
            logoPath: logo ? `${propertyId}/${logo}` : null,
        };
    } catch (err) {
        console.warn("[water-bills] storage listing failed:", err);
        return { pdfPath: null, logoPath: null };
    }
}

export interface WaterFileUrls {
    currentPdfUrl: string | null;
    logoUrl: string | null;
}

/** Short-lived signed URLs for the property's current bill and logo. */
export async function signWaterFiles(supabase: AdminSupabase, propertyId: string, files?: WaterFiles): Promise<WaterFileUrls> {
    const f = files ?? (await listWaterFiles(supabase, propertyId));
    const [currentPdfUrl, logoUrl] = await Promise.all([
        f.pdfPath ? signStorageUrl(supabase, WATER_BILLS_BUCKET, f.pdfPath) : Promise.resolve(null),
        f.logoPath ? signStorageUrl(supabase, WATER_BILLS_BUCKET, f.logoPath) : Promise.resolve(null),
    ]);
    return { currentPdfUrl: currentPdfUrl ?? null, logoUrl: logoUrl ?? null };
}

/** Stores the bill as the property's current PDF (replacing the previous one). */
export async function saveCurrentBillPdf(supabase: AdminSupabase, propertyId: string, buffer: Buffer, contentType: string): Promise<string | null> {
    const path = `${propertyId}/${CURRENT_BILL_FILE}`;
    const { error } = await supabase.storage.from(WATER_BILLS_BUCKET).upload(path, buffer, { contentType, upsert: true });
    if (error) {
        console.error("[water-bills] PDF upload failed:", error);
        return null;
    }
    return path;
}

/** Stores the utility's logo (any previous one is removed first). */
export async function saveUtilityLogo(supabase: AdminSupabase, propertyId: string, buffer: Buffer, contentType: string, ext: string): Promise<string | null> {
    await removeUtilityLogo(supabase, propertyId);
    const path = `${propertyId}/${UTILITY_LOGO_PREFIX}${ext}`;
    const { error } = await supabase.storage.from(WATER_BILLS_BUCKET).upload(path, buffer, { contentType, upsert: true });
    if (error) {
        console.error("[water-bills] logo upload failed:", error);
        return null;
    }
    return path;
}

export async function removeUtilityLogo(supabase: AdminSupabase, propertyId: string): Promise<void> {
    const { logoPath } = await listWaterFiles(supabase, propertyId);
    if (logoPath) await supabase.storage.from(WATER_BILLS_BUCKET).remove([logoPath]);
}

export async function removeCurrentBillPdf(supabase: AdminSupabase, propertyId: string): Promise<void> {
    await supabase.storage.from(WATER_BILLS_BUCKET).remove([`${propertyId}/${CURRENT_BILL_FILE}`]);
}

/** Everything the property keeps in the bucket (the property deletion cascade). */
export async function removeWaterFiles(supabase: AdminSupabase, propertyId: string): Promise<void> {
    const { data: files } = await supabase.storage.from(WATER_BILLS_BUCKET).list(propertyId);
    if (files && files.length > 0) {
        await supabase.storage.from(WATER_BILLS_BUCKET).remove(files.map(f => `${propertyId}/${f.name}`));
    }
}

/**
 * The utility's logo out of the header of a digital bill PDF (COPASA, SABESP… print it top-left),
 * as a PNG buffer; null for scans and PDFs without an embedded header image.
 */
export async function logoFromBillPdf(buffer: Buffer): Promise<Buffer | null> {
    try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const dataUrl = await extractLogoFromPdf(pdf, null);
        if (!dataUrl) return null;
        const comma = dataUrl.indexOf(",");
        return comma === -1 ? null : Buffer.from(dataUrl.slice(comma + 1), "base64");
    } catch (err) {
        console.warn("[water-bills] logo extraction failed:", err);
        return null;
    }
}
