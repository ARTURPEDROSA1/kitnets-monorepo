import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/api-route";
import { interConnectionSchema } from "./billing-connection";

const CERT = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";
const KEY = "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n";

const errorsOf = (value: unknown) => {
    const parsed = interConnectionSchema.safeParse(value);
    return parsed.success ? {} : fieldErrors(parsed.error);
};

describe("interConnectionSchema", () => {
    it("takes the integration's credentials as the owner pastes and uploads them", () => {
        expect(interConnectionSchema.parse({ client_id: " abc ", client_secret: "s3cr3t", certificate: CERT, private_key: KEY, account: "12345-6", environment: "" }))
            .toEqual({ client_id: "abc", client_secret: "s3cr3t", certificate: CERT.trim(), private_key: KEY.trim(), account: "123456", environment: "PRODUCTION" });
    });

    it("every secret may be left out (a later save brings only what changed)", () => {
        expect(interConnectionSchema.parse({})).toEqual({ client_id: null, client_secret: null, certificate: null, private_key: null, account: null, environment: "PRODUCTION" });
        expect(interConnectionSchema.parse({ certificate: "", private_key: "  ", account: "" })).toMatchObject({ certificate: null, private_key: null, account: null });
    });

    it("knows a certificate and a key by their PEM headers, and an RSA key too", () => {
        expect(errorsOf({ certificate: "junk" })).toEqual({ certificate: "Envie o arquivo .crt da integração (certificado em formato PEM)." });
        expect(errorsOf({ private_key: CERT })).toEqual({ private_key: "Envie o arquivo .key da integração (chave privada em formato PEM)." });
        expect(errorsOf({ private_key: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----" })).toEqual({});
        expect(errorsOf({ private_key: "-----BEGIN EC PRIVATE KEY-----\nabc\n-----END EC PRIVATE KEY-----" })).toEqual({});
    });

    it("refuses an environment it does not know and a file that cannot be a PEM", () => {
        expect(errorsOf({ environment: "STAGING" })).toEqual({ environment: "Ambiente inválido." });
        expect(errorsOf({ certificate: "x".repeat(30_000) })).toEqual({ certificate: "O arquivo do certificado é grande demais." });
    });
});
