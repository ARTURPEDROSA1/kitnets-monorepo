import sharp from "sharp";
import { extractImages, getDocumentProxy } from "unpdf";

/**
 * The pages of a scanned PDF as JPEGs, for a vision model that takes images but not PDFs.
 *
 * A scan is one picture per page, so the page is its largest embedded image: no rendering (and no
 * canvas) needed. Pages without a picture are skipped, so a PDF that is not a scan gives few or none.
 */
export async function scannedPdfPageImages(
    pdfBytes: Uint8Array,
    opts: { maxPages?: number; maxWidth?: number } = {}
): Promise<string[]> {
    const { maxPages = 12, maxWidth = 1600 } = opts;
    // pdf.js takes ownership of the buffer it is given: hand it a copy
    const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));
    const pages: string[] = [];

    for (let page = 1; page <= Math.min(pdf.numPages, maxPages); page++) {
        const images = await extractImages(pdf, page);
        const scan = images.sort((a, b) => b.width * b.height - a.width * a.height)[0];
        // Logos and stamps are small: a page scan is at least ~A4 at 100 dpi
        if (!scan || scan.width < 800 || scan.height < 800) continue;
        const jpeg = await sharp(Buffer.from(scan.data), { raw: { width: scan.width, height: scan.height, channels: scan.channels } })
            .resize({ width: maxWidth, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
        pages.push(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
    }
    return pages;
}
