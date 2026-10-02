import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SecretBoxError, fingerprint, openSecret, parseSecretKey, sealSecret, sealedKeyId, secretBoxAvailable, secretKeyring } from "./secret-box";

const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("hex");

describe("secret keys", () => {
    it("reads 32 bytes in base64 or hex and names each key without revealing it", () => {
        const a = parseSecretKey(keyA), b = parseSecretKey(keyB);
        expect(a.key).toHaveLength(32);
        expect(b.key).toHaveLength(32);
        expect(a.id).toMatch(/^[0-9a-f]{8}$/);
        expect(a.id).not.toBe(b.id);
        expect(parseSecretKey(` ${keyA} `).id).toBe(a.id);
    });

    it("refuses anything that is not 32 bytes", () => {
        expect(() => parseSecretKey("short")).toThrow(SecretBoxError);
        expect(() => parseSecretKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    });

    it("the keyring is the current key then the previous one; blank means none", () => {
        expect(secretKeyring({ BILLING_ENCRYPTION_KEY: keyA, BILLING_ENCRYPTION_KEY_PREVIOUS: keyB }).map(k => k.id)).toEqual([parseSecretKey(keyA).id, parseSecretKey(keyB).id]);
        expect(secretKeyring({ BILLING_ENCRYPTION_KEY: keyA, BILLING_ENCRYPTION_KEY_PREVIOUS: "" })).toHaveLength(1);
        expect(secretKeyring({})).toEqual([]);
        expect(secretBoxAvailable({ BILLING_ENCRYPTION_KEY: keyA })).toBe(true);
        expect(secretBoxAvailable({})).toBe(false);
        expect(secretBoxAvailable({ BILLING_ENCRYPTION_KEY: "junk" })).toBe(false);
    });
});

describe("seal and open", () => {
    const ring = secretKeyring({ BILLING_ENCRYPTION_KEY: keyA });
    const secret = JSON.stringify({ client_id: "abc", client_secret: "s3cr3t", certificate: "-----BEGIN CERTIFICATE-----\nxx\n-----END CERTIFICATE-----\n" });

    it("round-trips for the same context and never stores the plaintext", () => {
        const { sealed, keyId } = sealSecret(secret, "owner-1:INTER", ring);
        expect(sealed.startsWith(`v1.${keyId}.`)).toBe(true);
        expect(sealed).not.toContain("s3cr3t");
        expect(sealedKeyId(sealed)).toBe(keyId);
        expect(openSecret(sealed, "owner-1:INTER", ring)).toBe(secret);
        // a fresh IV every time
        expect(sealSecret(secret, "owner-1:INTER", ring).sealed).not.toBe(sealed);
    });

    it("a text copied onto another owner's row does not open", () => {
        const { sealed } = sealSecret(secret, "owner-1:INTER", ring);
        expect(() => openSecret(sealed, "owner-2:INTER", ring)).toThrow(/não confere/);
    });

    it("a touched text does not open", () => {
        const { sealed } = sealSecret(secret, "owner-1:INTER", ring);
        const parts = sealed.split(".");
        parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith("AA") ? "BB" : "AA");
        expect(() => openSecret(parts.join("."), "owner-1:INTER", ring)).toThrow(SecretBoxError);
        expect(() => openSecret("v9.what.is.this", "owner-1:INTER", ring)).toThrow(/formato desconhecido/);
        expect(sealedKeyId("garbage")).toBeNull();
    });

    it("rotation: the previous key still opens, the current one seals", () => {
        const old = secretKeyring({ BILLING_ENCRYPTION_KEY: keyA });
        const { sealed: sealedWithA } = sealSecret(secret, "owner-1:INTER", old);
        const rotated = secretKeyring({ BILLING_ENCRYPTION_KEY: keyB, BILLING_ENCRYPTION_KEY_PREVIOUS: keyA });
        expect(openSecret(sealedWithA, "owner-1:INTER", rotated)).toBe(secret);
        const { keyId } = sealSecret(secret, "owner-1:INTER", rotated);
        expect(keyId).toBe(parseSecretKey(keyB).id);
        // the old key gone: what it sealed is lost, and says so
        expect(() => openSecret(sealedWithA, "owner-1:INTER", secretKeyring({ BILLING_ENCRYPTION_KEY: keyB }))).toThrow(/não tem mais/);
    });

    it("says when there is no key at all", () => {
        expect(() => sealSecret(secret, "owner-1:INTER", [])).toThrow(/não configurada/);
    });
});

describe("fingerprint", () => {
    it("is stable, one-way and scoped", () => {
        expect(fingerprint("inter", " abc ")).toBe(fingerprint("inter", "abc"));
        expect(fingerprint("inter", "abc")).not.toBe(fingerprint("stripe", "abc"));
        expect(fingerprint("inter", "abc")).toMatch(/^[0-9a-f]{64}$/);
        expect(fingerprint("inter", "abc")).not.toContain("abc");
    });
});
