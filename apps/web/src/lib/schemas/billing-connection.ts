import { z } from "zod";

/**
 * Input schema of PUT /api/faturas/conexoes/inter: the credentials of the owner's Banco Inter
 * integration. Every secret is optional here because a later save may bring only what changed (a
 * renewed certificate keeps its client id and secret); the server decides what is still missing
 * (lib/billing/connections-server.ts). Messages match the connection screen.
 */

/** A PEM file is a few kilobytes; anything much larger is not one. */
const MAX_PEM = 20_000;

const optionalSecret = (max: number, tooLong: string) =>
    z.preprocess((v) => (typeof v === "string" ? v.trim() : v ?? null), z.string().max(max, tooLong).nullable().optional()).transform((v) => (v ? v : null));

export const interConnectionSchema = z.object({
    client_id: optionalSecret(200, "Client ID inválido."),
    client_secret: optionalSecret(500, "Client Secret inválido."),
    certificate: optionalSecret(MAX_PEM, "O arquivo do certificado é grande demais.")
        .refine((v) => v == null || /-----BEGIN CERTIFICATE-----/.test(v), "Envie o arquivo .crt da integração (certificado em formato PEM)."),
    private_key: optionalSecret(MAX_PEM, "O arquivo da chave é grande demais.")
        .refine((v) => v == null || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v), "Envie o arquivo .key da integração (chave privada em formato PEM)."),
    /** the checking account, as typed: only its digits are kept */
    account: z.preprocess((v) => (typeof v === "string" ? v.replace(/\D/g, "") : v ?? ""), z.string().max(20, "Conta corrente inválida."))
        .transform((v) => (v ? v : null)),
    environment: z.preprocess((v) => (v == null || v === "" ? "PRODUCTION" : v), z.enum(["PRODUCTION", "SANDBOX"], { errorMap: () => ({ message: "Ambiente inválido." }) })),
});

export type InterConnectionInput = z.output<typeof interConnectionSchema>;
