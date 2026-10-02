import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INTER_BASE_URLS, INTER_REQUIRED_SCOPES, inspectCertificate, missingScopes, normalizePem, parseScopes, tail } from "./inter-credentials";
import { makeTestCertificates, type TestCertificates } from "./inter-test-certs";

let certs: TestCertificates | null = null;
beforeAll(() => { certs = makeTestCertificates(); });
afterAll(() => certs?.cleanup());

describe("normalizePem", () => {
    it("strips the BOM and Windows line endings and ends with one newline", () => {
        expect(normalizePem("﻿-----BEGIN X-----\r\nabc\r\n-----END X-----\r\n\r\n")).toBe("-----BEGIN X-----\nabc\n-----END X-----\n");
        expect(normalizePem("  ")).toBe("");
    });
});

describe("inspectCertificate", () => {
    it("has the throwaway certificates wherever openssl is (always in CI)", () => {
        if (process.env.CI) expect(certs).not.toBeNull();
    });

    it("accepts the pair the bank gave out and reads its subject and dates", () => {
        if (!certs) return;
        const out = inspectCertificate(certs.client.cert, certs.client.key);
        if (!("info" in out)) throw new Error(`unexpected problem ${out.problem}`);
        expect(out.info.subject).toBe(certs.client.subject);
        expect(Date.parse(out.info.expiresAt)).toBeGreaterThan(Date.now());
        expect(Date.parse(out.info.validFrom)).toBeLessThanOrEqual(Date.now());
    });

    it("refuses a key that is not the certificate's, and files that are not a certificate or a key", () => {
        if (!certs) return;
        expect(inspectCertificate(certs.client.cert, certs.stranger.key)).toEqual({ problem: "MISMATCH" });
        expect(inspectCertificate("not a certificate", certs.client.key)).toEqual({ problem: "BAD_CERTIFICATE" });
        expect(inspectCertificate(certs.client.cert, "not a key")).toEqual({ problem: "BAD_KEY" });
        // the key file sent as the certificate, a common slip
        expect(inspectCertificate(certs.client.key, certs.client.cert)).toEqual({ problem: "BAD_CERTIFICATE" });
    });

    it("knows an expired certificate and one not yet valid", () => {
        if (!certs) return;
        const tenYears = 10 * 365 * 86_400_000;
        expect(inspectCertificate(certs.client.cert, certs.client.key, new Date(Date.now() + tenYears))).toEqual({ problem: "EXPIRED" });
        expect(inspectCertificate(certs.client.cert, certs.client.key, new Date(Date.now() - tenYears))).toEqual({ problem: "NOT_YET_VALID" });
    });
});

describe("scopes", () => {
    it("parses what the bank returns and names what is missing", () => {
        expect(parseScopes("boleto-cobranca.write boleto-cobranca.read")).toEqual(["boleto-cobranca.read", "boleto-cobranca.write"]);
        expect(parseScopes(" extrato.read,boleto-cobranca.read ")).toEqual(["boleto-cobranca.read", "extrato.read"]);
        expect(parseScopes(null)).toEqual([]);
        expect(missingScopes(["boleto-cobranca.read", "extrato.read"])).toEqual(["boleto-cobranca.write"]);
        expect(missingScopes([...INTER_REQUIRED_SCOPES])).toEqual([]);
    });

    it("knows the bank's hosts", () => {
        expect(INTER_BASE_URLS.PRODUCTION).toBe("https://cdpj.partners.bancointer.com.br");
        expect(INTER_BASE_URLS.SANDBOX).toBe("https://cdpj-sandbox.partners.uatinter.co");
    });
});

describe("tail", () => {
    it("shows the end of an identifier only", () => {
        expect(tail("3f2a9c1b-7d4e-4a2b-9c1d-0f8e7a6b5c4d")).toBe("…5c4d");
        expect(tail("ab")).toBe("…");
    });
});
