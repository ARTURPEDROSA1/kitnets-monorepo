import { describe, expect, it } from "vitest";
import { mimeTypeOfStagedPath, newStagedPath, ownStagedPath } from "./lease-uploads-server";

const me = "0b0c6a52-3f6e-4a3b-9a57-2f6f6f0d1c11";
const other = "11111111-2222-3333-4444-555555555555";

describe("staged lease uploads", () => {
    it("stages under the account's own folder, with the extension of the type", () => {
        const path = newStagedPath(me, "application/pdf");
        expect(path).toMatch(new RegExp(`^imports/${me}/[0-9a-f-]{36}\.pdf$`));
        expect(ownStagedPath(me, path)).toBe(path);
        expect(mimeTypeOfStagedPath(path)).toBe("application/pdf");
        expect(mimeTypeOfStagedPath(newStagedPath(me, "image/jpg"))).toBe("image/jpeg");
        expect(mimeTypeOfStagedPath(newStagedPath(me, "image/webp"))).toBe("image/webp");
    });

    it("refuses anything that is not one of the account's staged files", () => {
        const foreign = newStagedPath(other, "application/pdf");
        expect(ownStagedPath(me, foreign)).toBeNull();
        expect(ownStagedPath(me, `imports/${me}/../${other}/x.pdf`)).toBeNull();
        expect(ownStagedPath(me, `lease-id/1789781453643.pdf`)).toBeNull();
        expect(ownStagedPath(me, `imports/${me}/not-a-uuid.pdf`)).toBeNull();
        expect(ownStagedPath(me, `https://x.supabase.co/storage/v1/object/lease-documents/imports/${me}/a.pdf`)).toBeNull();
        expect(ownStagedPath(me, undefined)).toBeNull();
        expect(ownStagedPath(me, 42)).toBeNull();
    });
});
