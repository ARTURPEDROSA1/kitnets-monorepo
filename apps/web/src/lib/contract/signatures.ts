/**
 * What a signed PDF says about its signatures, read from the bytes without a PDF library.
 *
 * Each digital signature (gov.br, ICP-Brasil) is a signature dictionary with a `/ByteRange` — the
 * parts of the file it covers — and a `/Contents` hex string holding the PKCS#7 envelope, which carries
 * the signer's certificate. Signature dictionaries are never compressed (the byte range must point at
 * them), so counting `/ByteRange` counts the signatures. The names are a best effort: the certificate's
 * common name ("FULANO DE TAL:12345678900" on ICP-Brasil and gov.br certificates) read from the
 * envelope, or the dictionary's `/Name`. A PDF without a signature answers 0.
 */

export interface PdfSignatures {
    count: number;
    /** the signers found, without repeats: name and, when the certificate has it, the CPF (digits) */
    signers: { name: string; cpf: string | null }[];
}

/** Is this a PDF at all (the "%PDF-" header within the first bytes)? */
export function looksLikePdf(bytes: Uint8Array): boolean {
    const head = latin1(bytes.subarray(0, 1024));
    return head.includes("%PDF-");
}

function latin1(bytes: Uint8Array): string {
    let s = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return s;
}

function hexToLatin1(hex: string): string {
    let s = "";
    for (let i = 0; i + 1 < hex.length; i += 2) {
        const code = parseInt(hex.slice(i, i + 2), 16);
        s += Number.isNaN(code) ? "" : String.fromCharCode(code);
    }
    return s;
}

/** UTF-8 bytes held in a latin1 string, decoded; the original when they are not valid UTF-8. */
function utf8(s: string): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(s, c => c.charCodeAt(0)));
    } catch {
        return s;
    }
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// OID 2.5.4.3 (commonName), DER-encoded: 06 03 55 04 03
const CN_OID = "\x06\x03\x55\x04\x03";

/** Every commonName value in a DER blob (held in a latin1 string): the tag and length after the OID say how to read it. */
function commonNames(der: string): string[] {
    const out: string[] = [];
    for (let i = der.indexOf(CN_OID); i >= 0; i = der.indexOf(CN_OID, i + CN_OID.length)) {
        const tag = der.charCodeAt(i + 5);
        const len = der.charCodeAt(i + 6);
        if (Number.isNaN(len) || len >= 0x80) continue;
        const raw = der.slice(i + 7, i + 7 + len);
        if (raw.length !== len) continue;
        if (tag === 0x0c) out.push(utf8(raw)); // UTF8String
        else if (tag === 0x13 || tag === 0x14 || tag === 0x16) out.push(raw); // Printable, T61, IA5
        else if (tag === 0x1e) { // BMPString: UTF-16BE
            let s = "";
            for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode((raw.charCodeAt(k) << 8) | raw.charCodeAt(k + 1));
            out.push(s);
        }
    }
    return out;
}

export function readPdfSignatures(bytes: Uint8Array): PdfSignatures {
    const text = latin1(bytes);
    const count = (text.match(/\/ByteRange\s*\[/g) ?? []).length;
    const signers: PdfSignatures["signers"] = [];
    const seen = new Set<string>();
    const add = (name: string, cpf: string | null) => {
        const n = clean(name);
        if (n.length < 3) return;
        const key = cpf ?? n.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        signers.push({ name: n, cpf });
    };

    // the certificates inside each signature's envelope: a person's common name is "NAME:CPF"
    // (the CAs of the chain have common names too, without a CPF: they are left out)
    for (const m of text.matchAll(/\/Contents\s*<([0-9A-Fa-f\s]+)>/g)) {
        const der = hexToLatin1(m[1].replace(/\s+/g, ""));
        for (const cn of commonNames(der)) {
            const person = /^(.{3,120}):(\d{11})$/.exec(cn);
            if (person) add(person[1], person[2]);
        }
    }
    // a signature dictionary may also name its signer
    for (const m of text.matchAll(/\/Type\s*\/Sig\b[^>]*?\/Name\s*\(([^)]{3,120})\)/g)) add(utf8(m[1]), null);

    return { count, signers };
}
