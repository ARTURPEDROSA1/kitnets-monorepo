import { describe, expect, it } from "vitest";
import { PHOTO_MAX_SIDE, fitWithin, outputTypeFor, renameForType, resizeImageForUpload, shouldResize } from "./image-resize";

describe("fitWithin", () => {
    it("shrinks the long side to the limit and keeps the ratio", () => {
        expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200, scale: 0.4 });
        expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600, scale: 0.4 });
    });

    it("never upscales", () => {
        expect(fitWithin(800, 600, PHOTO_MAX_SIDE)).toEqual({ width: 800, height: 600, scale: 1 });
        expect(fitWithin(0, 0, PHOTO_MAX_SIDE)).toEqual({ width: 0, height: 0, scale: 1 });
    });
});

describe("outputTypeFor / renameForType", () => {
    it("keeps JPEG and turns the rest into WebP", () => {
        expect(outputTypeFor("image/jpeg")).toBe("image/jpeg");
        expect(outputTypeFor("image/png")).toBe("image/webp");
        expect(outputTypeFor("image/heic")).toBe("image/webp");
    });

    it("renames the file after its new bytes", () => {
        expect(renameForType("IMG_0001.HEIC", "image/jpeg")).toBe("IMG_0001.jpg");
        expect(renameForType("planta.png", "image/webp")).toBe("planta.webp");
        expect(renameForType("semextensao", "image/jpeg")).toBe("semextensao.jpg");
        expect(renameForType(".jpg", "image/webp")).toBe("foto.webp");
    });
});

describe("shouldResize", () => {
    it("re-encodes photos, leaves GIFs, SVGs and non-images alone", () => {
        expect(shouldResize({ type: "image/jpeg" })).toBe(true);
        expect(shouldResize({ type: "image/png" })).toBe(true);
        expect(shouldResize({ type: "image/gif" })).toBe(false);
        expect(shouldResize({ type: "image/svg+xml" })).toBe(false);
        expect(shouldResize({ type: "video/mp4" })).toBe(false);
        expect(shouldResize({ type: "application/pdf" })).toBe(false);
    });
});

describe("resizeImageForUpload outside a browser", () => {
    it("gives the file back untouched when nothing can decode it", async () => {
        const file = new File([new Uint8Array(10)], "video.mp4", { type: "video/mp4" });
        expect(await resizeImageForUpload(file)).toBe(file);
        const photo = new File([new Uint8Array(10)], "foto.jpg", { type: "image/jpeg" });
        expect(await resizeImageForUpload(photo)).toBe(photo);   // no createImageBitmap in node
    });
});
