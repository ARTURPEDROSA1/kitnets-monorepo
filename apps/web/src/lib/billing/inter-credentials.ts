/**
 * The credentials of an owner's Banco Inter integration, as the owner gets them from the Internet
 * Banking PJ (Integrar → Minhas integrações → Download chave e certificado): a client id, a client
 * secret, a certificate (.crt) and its private key (.key), plus the checking account they belong to.
 *
 * Before anything is stored, the certificate and the key are checked against each other — a pair that
 * does not match would only fail later, at the bank, with a TLS error nobody can read. Server only
 * (node:crypto); nothing here talks to the bank.
 */
import { X509Certificate, createPrivateKey } from "node:crypto";

/** What the module needs from the integration: issue and cancel charges (write), read them and their PDF (read). */
export const INTER_REQUIRED_SCOPES = ["boleto-cobranca.read", "boleto-cobranca.write"] as const;

export type InterEnvironment = "PRODUCTION" | "SANDBOX";

/** The bank's API hosts (developers.inter.co → Token). */
export const INTER_BASE_URLS: Record<InterEnvironment, string> = {
    PRODUCTION: "https://cdpj.partners.bancointer.com.br",
    SANDBOX: "https://cdpj-sandbox.partners.uatinter.co",
};

export interface InterCredentials {
    client_id: string;
    client_secret: string;
    /** PEM */
    certificate: string;
    /** PEM */
    private_key: string;
    /** the checking account the integration is tied to, digits only (sent as x-conta-corrente) */
    account: string;
}

/** A PEM as a file gives it: no BOM, Unix line endings, one trailing newline. */
export function normalizePem(raw: string): string {
    const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
    return text ? `${text}\n` : "";
}

export interface CertificateInfo {
    /** the certificate's common name (the integration, as the bank named it) */
    subject: string;
    /** ISO timestamp */
    expiresAt: string;
    /** ISO timestamp */
    validFrom: string;
}

export type CertificateProblem = "BAD_CERTIFICATE" | "BAD_KEY" | "MISMATCH" | "EXPIRED" | "NOT_YET_VALID";

export const CERTIFICATE_PROBLEMS: Record<CertificateProblem, { field: "certificate" | "private_key"; message: string }> = {
    BAD_CERTIFICATE: { field: "certificate", message: "O arquivo não é um certificado válido. Envie o .crt baixado no Internet Banking." },
    BAD_KEY: { field: "private_key", message: "O arquivo não é uma chave privada válida. Envie o .key baixado no Internet Banking." },
    MISMATCH: { field: "private_key", message: "A chave não pertence a este certificado. Envie o .crt e o .key do mesmo download." },
    EXPIRED: { field: "certificate", message: "Este certificado já venceu. Renove a integração no Internet Banking e envie os novos arquivos." },
    NOT_YET_VALID: { field: "certificate", message: "Este certificado ainda não está válido." },
};

const commonName = (subject: string): string => {
    const cn = subject.split(/\r?\n/).map(l => l.trim()).find(l => /^CN=/i.test(l));
    return (cn ? cn.slice(3) : subject.replace(/\s+/g, " ")).trim().slice(0, 200);
};

/** Reads the certificate, checks the key is its own and that it is within its validity on `now`. */
export function inspectCertificate(certificatePem: string, privateKeyPem: string, now: Date = new Date()): { info: CertificateInfo } | { problem: CertificateProblem } {
    let certificate: X509Certificate;
    try {
        certificate = new X509Certificate(normalizePem(certificatePem));
    } catch {
        return { problem: "BAD_CERTIFICATE" };
    }
    let matches: boolean;
    try {
        matches = certificate.checkPrivateKey(createPrivateKey(normalizePem(privateKeyPem)));
    } catch {
        return { problem: "BAD_KEY" };
    }
    if (!matches) return { problem: "MISMATCH" };

    const validFrom = new Date(certificate.validFrom), expiresAt = new Date(certificate.validTo);
    if (expiresAt.getTime() <= now.getTime()) return { problem: "EXPIRED" };
    if (validFrom.getTime() > now.getTime()) return { problem: "NOT_YET_VALID" };
    return { info: { subject: commonName(certificate.subject), expiresAt: expiresAt.toISOString(), validFrom: validFrom.toISOString() } };
}

/** "boleto-cobranca.read boleto-cobranca.write extrato.read" → the scopes, in a stable order. */
export const parseScopes = (scope: string | null | undefined): string[] => [...new Set((scope ?? "").split(/[\s,]+/).filter(Boolean))].sort();

/** The scopes the module needs that the bank did not grant. */
export const missingScopes = (granted: readonly string[], required: readonly string[] = INTER_REQUIRED_SCOPES): string[] => required.filter(s => !granted.includes(s));

/** "…a1b2": enough of the client id for the owner to recognise it, never the whole. */
export const tail = (value: string, keep = 4): string => (value.length <= keep ? "…" : `…${value.slice(-keep)}`);
