
export type OwnershipDecision = 'APPROVED' | 'NEEDS_MORE_DOCS' | 'MANUAL_REVIEW' | 'REJECTED' | 'APPROVED_PENDING_PAID_VERIFICATION';

export type VerificationBadge = 'NONE' | 'PROPERTY_VERIFIED' | 'USER_VERIFIED';

export type DocumentType =
    | 'MATRICULA'
    | 'ESCRITURA'
    | 'CONTRATO_COMPRA_VENDA'
    | 'IPTU'
    | 'CONTRATO_LOCACAO'
    | 'CONTA_AGUA'
    | 'CONTA_LUZ'
    | 'CONTA_GAS'
    | 'OUTRO';

export interface OwnershipDocument {
    id: string;
    file_name: string;
    file_size: number;
    url: string; // mocking url
    uploaded_at: string;
    type: DocumentType;
    confidence: number;
}

export interface ExtractedData {
    owner_name?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    address?: {
        street?: string | null;
        number?: string | null;
        city?: string | null;
        state?: string | null;
        cep?: string | null;
    };
    registry?: {
        matricula_number?: string | null;
        cartorio_name?: string | null;
    };
    dates?: {
        issue_date?: string | null;
        registration_date?: string | null;
    };
}

export interface DocumentExtractionResult {
    document_id: string;
    success: boolean;
    classified_type: DocumentType;
    type_confidence: number;
    extracted_data: ExtractedData;
    field_confidence: Record<string, number>; // key: value (0-1)
}

export interface OwnershipClaim {
    id: string; // claim_id
    property_id?: string;
    claimant_id?: string;

    // The simplified consolidated view presented to user
    consolidated_data: ExtractedData;

    documents: OwnershipDocument[];
    extractions: DocumentExtractionResult[]; // Per document details

    scores: {
        document_confidence: number;
        identity_match: number;
        address_match: number;
        cross_doc_consistency: number;
        overall: number;
    };

    decision: OwnershipDecision;
    decision_reasons: string[];

    status: 'draft' | 'submitted' | 'verified';
}
