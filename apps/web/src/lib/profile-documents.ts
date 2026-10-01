/**
 * The owner's own files on /proprietario (profile_documents): the Cartão CNPJ, the contrato social,
 * anything else. Pure constants shared by the page and the API.
 */
export type ProfileDocCategory = "cnpj_card" | "social_contract" | "other";

export interface ProfileDocCategoryDef {
    id: ProfileDocCategory;
    label: string;
    singular: string;
    description: string;
}

export const PROFILE_DOC_CATEGORIES: ProfileDocCategoryDef[] = [
    { id: "cnpj_card", label: "Cartão CNPJ", singular: "Cartão CNPJ", description: "Comprovante de Inscrição e de Situação Cadastral da Receita Federal — a IA lê e preenche a ficha" },
    { id: "social_contract", label: "Contrato social", singular: "Contrato social", description: "Contrato social consolidado ou última alteração registrada na Junta Comercial" },
    { id: "other", label: "Outros", singular: "Documento", description: "Alvará, inscrição municipal, certidões, procurações…" },
];

export const isProfileDocCategory = (v: unknown): v is ProfileDocCategory => PROFILE_DOC_CATEGORIES.some(c => c.id === v);

/** 10 MB: the Cartão CNPJ is one page; a contrato social a few. */
export const MAX_PROFILE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface ProfileDocument {
    id: string;
    category: ProfileDocCategory;
    path: string;
    original_name: string | null;
    mime_type: string | null;
    file_size: number | null;
    created_at: string;
}
