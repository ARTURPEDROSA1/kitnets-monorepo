import { describe, expect, it } from "vitest";
import { canOptimizeImage } from "./image-url";

describe("canOptimizeImage", () => {
    it("accepts public storage objects and Clerk avatars", () => {
        expect(canOptimizeImage("https://kqhfzcxqmjkqekozhlng.supabase.co/storage/v1/object/public/property-media/photos/p1/1.jpg")).toBe(true);
        expect(canOptimizeImage("https://img.clerk.com/abc")).toBe(true);
    });

    it("refuses signed URLs, private objects, local URLs and other hosts", () => {
        expect(canOptimizeImage("https://kqhfzcxqmjkqekozhlng.supabase.co/storage/v1/object/sign/tenant-photos/t1.jpg?token=abc")).toBe(false);
        expect(canOptimizeImage("https://kqhfzcxqmjkqekozhlng.supabase.co/storage/v1/object/public/property-media/a.jpg?v=2")).toBe(false);
        expect(canOptimizeImage("https://kqhfzcxqmjkqekozhlng.supabase.co/storage/v1/object/authenticated/documents/a.jpg")).toBe(false);
        expect(canOptimizeImage("blob:https://kitnets.com/123")).toBe(false);
        expect(canOptimizeImage("data:image/png;base64,AAAA")).toBe(false);
        expect(canOptimizeImage("http://kqhfzcxqmjkqekozhlng.supabase.co/storage/v1/object/public/property-media/a.jpg")).toBe(false);
        expect(canOptimizeImage("https://example.com/a.jpg")).toBe(false);
        expect(canOptimizeImage("")).toBe(false);
        expect(canOptimizeImage(null)).toBe(false);
        expect(canOptimizeImage("not a url")).toBe(false);
    });
});
