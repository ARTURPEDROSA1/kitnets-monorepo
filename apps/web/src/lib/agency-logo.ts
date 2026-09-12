import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import sharp from 'sharp';

export type PDFDocument = Awaited<ReturnType<typeof getDocumentProxy>>;
export type LogoBox = [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
type Matrix = [number, number, number, number, number, number];

/** Shape of a decoded image object as pdf.js hands it back from `page.objs`. */
interface PdfImageObject {
    data?: Uint8ClampedArray;
    width?: number;
    height?: number;
}

/** An image painted on a PDF page, with where it lands on the page. */
interface PlacedImage {
    key: string;
    data: Uint8ClampedArray;
    width: number;
    height: number;
    channels: 1 | 3 | 4;
    /** Distance of the image's top edge from the top of the page (0 = top, 1 = bottom). */
    topFrac: number;
    /** Fraction of the page area the painted image covers. */
    areaFrac: number;
}

const LOGO_MAX_SIZE = 512;
const HEADER_REGION = 0.25;      // images whose top edge is within the top 25% of the page
const MIN_LOGO_PX = 32;
const MAX_LOGO_AREA_FRAC = 0.3;  // anything bigger is a watermark, photo or scan
const FULL_PAGE_AREA_FRAC = 0.8; // a single image this big is a scanned page

function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
    return [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
    ];
}

function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Walks the operator list of one PDF page and returns every raster image painted on it,
 * together with its position. Position matters: the agency logo sits in the header, while
 * watermarks and photos sit in the body.
 */
async function listPageImages(pdf: PDFDocument, pageNumber: number): Promise<PlacedImage[]> {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const pageArea = viewport.width * viewport.height;
    const { OPS } = await getResolvedPDFJS();
    const ops = await page.getOperatorList();

    const images: PlacedImage[] = [];
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
        const op = ops.fnArray[i];
        const args = ops.argsArray[i];

        if (op === OPS.save) {
            stack.push(ctm);
        } else if (op === OPS.restore) {
            ctm = stack.pop() ?? ctm;
        } else if (op === OPS.transform) {
            ctm = multiplyMatrix(args as Matrix, ctm);
        } else if (op === OPS.paintImageXObject || op === OPS.paintImageXObjectRepeat) {
            const key = String(args[0]);
            const store = key.startsWith('g_') ? page.commonObjs : page.objs;
            const image = await new Promise<PdfImageObject | null>((resolve) => {
                const timer = setTimeout(() => resolve(null), 5000);
                try {
                    store.get(key, (obj: unknown) => { clearTimeout(timer); resolve(obj as PdfImageObject | null); });
                } catch {
                    clearTimeout(timer);
                    resolve(null);
                }
            });
            if (!image?.data || !image.width || !image.height) continue;

            const channels = image.data.length / (image.width * image.height);
            if (channels !== 1 && channels !== 3 && channels !== 4) continue;

            // The image is painted into the unit square under the current transform.
            const corners = [applyMatrix(ctm, 0, 0), applyMatrix(ctm, 1, 0), applyMatrix(ctm, 0, 1), applyMatrix(ctm, 1, 1)];
            const xs = corners.map(c => c[0]);
            const ys = corners.map(c => c[1]);
            const paintedWidth = Math.max(...xs) - Math.min(...xs);
            const paintedHeight = Math.max(...ys) - Math.min(...ys);

            images.push({
                key,
                data: image.data,
                width: image.width,
                height: image.height,
                channels,
                // PDF user space has its origin at the bottom-left corner.
                topFrac: 1 - Math.max(...ys) / viewport.height,
                areaFrac: pageArea > 0 ? (paintedWidth * paintedHeight) / pageArea : 0,
            });
        }
    }

    return images;
}

function rawToSharp(image: PlacedImage) {
    const buf = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    return sharp(buf, { raw: { width: image.width, height: image.height, channels: image.channels } });
}

async function toLogoDataUrl(input: ReturnType<typeof sharp>): Promise<string> {
    const png = await input
        .resize({ width: LOGO_MAX_SIZE, height: LOGO_MAX_SIZE, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
}

/** Crops the region described by a normalized [ymin, xmin, ymax, xmax] box (0-1000) out of an image. */
export async function cropLogoByBox(imageBuffer: Buffer, box: LogoBox): Promise<string | null> {
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) return null;

    const [ymin, xmin, ymax, xmax] = box;
    const left = Math.max(0, Math.floor((xmin / 1000) * metadata.width));
    const top = Math.max(0, Math.floor((ymin / 1000) * metadata.height));
    const width = Math.min(metadata.width - left, Math.ceil(((xmax - xmin) / 1000) * metadata.width));
    const height = Math.min(metadata.height - top, Math.ceil(((ymax - ymin) / 1000) * metadata.height));
    if (width <= 20 || height <= 20) return null;

    const padX = Math.round(width * 0.05);
    const padY = Math.round(height * 0.05);
    const cropLeft = Math.max(0, left - padX);
    const cropTop = Math.max(0, top - padY);
    const cropWidth = Math.min(metadata.width - cropLeft, width + padX * 2);
    const cropHeight = Math.min(metadata.height - cropTop, height + padY * 2);

    return toLogoDataUrl(
        sharp(imageBuffer).extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    );
}

export function isLogoBox(value: unknown): value is LogoBox {
    return Array.isArray(value) && value.length === 4 && value.every(n => typeof n === 'number' && Number.isFinite(n));
}

/**
 * Finds the agency logo on the first page of a PDF contract.
 *
 * Digital PDFs embed the logo as its own image in the page header, so we take it straight
 * from the file. Scanned PDFs are one big image per page; there we fall back to the
 * bounding box the vision model reported and crop it out with sharp.
 */
export async function extractLogoFromPdf(pdf: PDFDocument, logoBox: unknown): Promise<string | null> {
    const images = await listPageImages(pdf, 1);
    if (images.length === 0) return null;

    const scannedPage = images.find(img => img.areaFrac >= FULL_PAGE_AREA_FRAC);
    if (scannedPage && isLogoBox(logoBox)) {
        const pagePng = await rawToSharp(scannedPage).png().toBuffer();
        return cropLogoByBox(pagePng, logoBox);
    }

    const usable = images.filter(img =>
        img.width >= MIN_LOGO_PX && img.height >= MIN_LOGO_PX && img.areaFrac < MAX_LOGO_AREA_FRAC
    );
    if (usable.length === 0) return null;

    // Prefer the header; among candidates take the one painted largest on the page.
    const header = usable.filter(img => img.topFrac <= HEADER_REGION);
    const pool = header.length > 0 ? header : usable;
    pool.sort((a, b) => b.areaFrac - a.areaFrac);

    return toLogoDataUrl(rawToSharp(pool[0]));
}