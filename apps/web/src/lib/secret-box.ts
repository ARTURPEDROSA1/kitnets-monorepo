/**
 * Sealing secrets the app has to keep for an owner — the credentials of the owner's own bank integration
 * (lib/billing/connections-server.ts).
 *
 * AES-256-GCM with a master key that lives only in the server's environment (`BILLING_ENCRYPTION_KEY`,
 * 32 random bytes in base64 or hex). The database stores the sealed text, so the table — or a backup of
 * it — opens nothing without the key, and the key opens nothing without the table.
 *
 * Every sealed text is bound to a context (`aad`: the owner and the provider): a ciphertext copied onto
 * another owner's row fails to open. It also names the key that sealed it, so the master key can be
 * rotated: put the new key in `BILLING_ENCRYPTION_KEY` and the old one in
 * `BILLING_ENCRYPTION_KEY_PREVIOUS`; old secrets still open and are sealed with the new key the next
 * time they are saved.
 *
 *   sealed = "v1.<key id>.<iv>.<auth tag>.<data>"     (base64url parts)
 *
 * Server only (node:crypto). Nothing here logs or returns a secret in an error message.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface SecretKey {
    /** first 8 hex digits of the key's SHA-256: names the key without revealing it */
    id: string;
    key: Buffer;
}

export class SecretBoxError extends Error {
    constructor(public readonly code: "NO_KEY" | "BAD_KEY" | "MALFORMED" | "UNKNOWN_KEY" | "TAMPERED", message: string) {
        super(message);
    }
}

/** 32 bytes from base64 (44 chars), base64url or hex (64 chars); anything else is refused. */
export function parseSecretKey(raw: string): SecretKey {
    const text = raw.trim();
    const key = /^[0-9a-fA-F]{64}$/.test(text) ? Buffer.from(text, "hex") : Buffer.from(text, "base64");
    if (key.length !== 32) throw new SecretBoxError("BAD_KEY", "A chave de criptografia deve ter 32 bytes (base64 ou hexadecimal).");
    return { id: createHash("sha256").update(key).digest("hex").slice(0, 8), key };
}

/** The keys in use: the current one first, then the previous one while a rotation is under way. */
export function secretKeyring(env: Record<string, string | undefined> = process.env): SecretKey[] {
    return [env.BILLING_ENCRYPTION_KEY, env.BILLING_ENCRYPTION_KEY_PREVIOUS]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map(parseSecretKey);
}

/** Whether secrets can be sealed at all on this server (the connection screens say so instead of failing). */
export function secretBoxAvailable(env: Record<string, string | undefined> = process.env): boolean {
    try {
        return secretKeyring(env).length > 0;
    } catch {
        return false;
    }
}

/** Seals `plaintext` for `aad` with the current key. */
export function sealSecret(plaintext: string, aad: string, keyring: SecretKey[] = secretKeyring()): { sealed: string; keyId: string } {
    const current = keyring[0];
    if (!current) throw new SecretBoxError("NO_KEY", "Chave de criptografia não configurada no servidor.");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, current.key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const parts = [VERSION, current.id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")];
    return { sealed: parts.join("."), keyId: current.id };
}

/** Opens what `sealSecret` produced for the same `aad`; throws when the key is gone, the context differs or the text was touched. */
export function openSecret(sealed: string, aad: string, keyring: SecretKey[] = secretKeyring()): string {
    const parts = sealed.split(".");
    if (parts.length !== 5 || parts[0] !== VERSION) throw new SecretBoxError("MALFORMED", "Segredo armazenado em formato desconhecido.");
    const [, keyId, iv, tag, data] = parts;
    const entry = keyring.find(k => k.id === keyId);
    if (!entry) throw new SecretBoxError("UNKNOWN_KEY", "O segredo foi cifrado com uma chave que este servidor não tem mais.");
    try {
        const decipher = createDecipheriv(ALGORITHM, entry.key, Buffer.from(iv, "base64url"));
        decipher.setAAD(Buffer.from(aad, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    } catch {
        throw new SecretBoxError("TAMPERED", "O segredo armazenado não confere (foi alterado ou pertence a outro registro).");
    }
}

/** The key that sealed a text, without opening it; null when it is not one of ours. */
export const sealedKeyId = (sealed: string): string | null => {
    const parts = sealed.split(".");
    return parts.length === 5 && parts[0] === VERSION ? parts[1] : null;
};

/** A stable, one-way name for a provider's public identifier (a client id): tells two registrations of the same integration apart from two different ones. */
export const fingerprint = (scope: string, value: string): string => createHash("sha256").update(`${scope}:${value.trim()}`).digest("hex");
