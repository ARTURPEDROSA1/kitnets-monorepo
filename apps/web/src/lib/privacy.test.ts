import { describe, expect, it } from "vitest";
import { PRIVACY_DEFAULT, parsePrivacy, serializePrivacy } from "./privacy";

describe("privacy preference (sidebar eye and dollar toggles)", () => {
    it("everything is visible by default, including for unknown or empty stored values", () => {
        expect(parsePrivacy(null)).toBe(PRIVACY_DEFAULT);
        expect(parsePrivacy("")).toBe(PRIVACY_DEFAULT);
        expect(parsePrivacy("garbage")).toBe(PRIVACY_DEFAULT);
        expect(PRIVACY_DEFAULT).toEqual({ hideSensitive: false, hideMoney: false });
    });

    it("reads the space-separated word list the inline <head> script also understands", () => {
        expect(parsePrivacy("sensitive")).toEqual({ hideSensitive: true, hideMoney: false });
        expect(parsePrivacy("money")).toEqual({ hideSensitive: false, hideMoney: true });
        expect(parsePrivacy("sensitive money")).toEqual({ hideSensitive: true, hideMoney: true });
        expect(parsePrivacy("money  sensitive")).toEqual({ hideSensitive: true, hideMoney: true });
    });

    it("round-trips through serialize", () => {
        for (const state of [
            { hideSensitive: false, hideMoney: false },
            { hideSensitive: true, hideMoney: false },
            { hideSensitive: false, hideMoney: true },
            { hideSensitive: true, hideMoney: true },
        ]) {
            expect(parsePrivacy(serializePrivacy(state))).toEqual(state);
        }
        expect(serializePrivacy({ hideSensitive: false, hideMoney: false })).toBe("");
    });
});
