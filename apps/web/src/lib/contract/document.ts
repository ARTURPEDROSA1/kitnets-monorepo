/**
 * The contract document as the screens see it (GET /api/leases/[id]/contrato), and the steps it goes
 * through: written (DRAFT) → accepted as a PDF (ACCEPTED) → signed by every party on gov.br (SIGNED).
 */
import type { ContractDoc } from "./doc";
import type { ContractData, ContractOptions } from "./template";

export type ContractDocumentStatus = "NONE" | "DRAFT" | "ACCEPTED" | "SIGNED";

export interface ContractSignedVersion {
    at: string;
    by: "OWNER" | "TENANT";
    count: number;
    /** the copy grows from the PDF accepted in Kitnets (its bytes come first) */
    fromAccepted: boolean | null;
}

export interface ContractDocumentView {
    status: ContractDocumentStatus;
    content: ContractDoc | null;
    /** the stored choices, as saved (read them with readContractOptions) */
    options: Partial<ContractOptions> | null;
    acceptedAt: string | null;
    signedAt: string | null;
    signatureCount: number;
    requiredSignatures: number;
    signers: { name: string; cpf: string | null }[];
    versions: ContractSignedVersion[];
    /** short-lived links: the accepted PDF and the latest signed copy */
    pdfUrl: string | null;
    signedUrl: string | null;
    share: { url: string; expiresAt: string; sharedAt: string | null } | null;
    updatedAt: string | null;
}

export interface ContractScreenData {
    data: ContractData;
    document: ContractDocumentView;
    support: { ok: true } | { ok: false; reason: string };
    tenant: { name: string | null; email: string | null; phone: string | null };
    /** e-mail can go out from this server (Resend configured) */
    emailAvailable: boolean;
}

export const STATUS_LABELS: Record<ContractDocumentStatus, string> = {
    NONE: "Não gerado",
    DRAFT: "Rascunho",
    ACCEPTED: "Aguardando assinaturas",
    SIGNED: "Assinado",
};

/** Where the parties sign and check a signature (gov.br / ITI). */
export const GOVBR_SIGNER_URL = "https://assinador.iti.br";
export const GOVBR_VALIDATOR_URL = "https://validar.iti.gov.br";

/** The signing link's lifetime. */
export const SHARE_DAYS = 30;

/** The signed copy a party uploads (Vercel's request body limit is 4.5 MB). */
export const MAX_SIGNED_PDF_BYTES = 4 * 1024 * 1024;

/** The tenant's message for WhatsApp, with the signing link. */
export function whatsappMessage(tenantName: string | null, reference: string, url: string): string {
    const first = tenantName?.trim().split(/\s+/)[0];
    return `${first ? `Olá, ${first}! ` : "Olá! "}Segue o contrato de locação (${reference}) para você ler e assinar pelo gov.br. Pelo link abaixo você baixa o PDF, assina no assinador.iti.br com a sua conta gov.br e envia o arquivo assinado de volta:\n${url}`;
}

/** wa.me link to the tenant's number (Brazilian numbers without the country code get 55). */
export function whatsappLink(phone: string | null, text: string): string {
    const digits = (phone ?? "").replace(/\D/g, "");
    const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
