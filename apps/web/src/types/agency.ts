// ── Agency (Imobiliária) Types ────────────────────────────────────────

export interface Agency {
    id: string;
    name: string;
    trade_name: string | null;
    cnpj: string | null;
    creci_number: string | null;
    creci_state: string | null;
    creci_type: 'PJ' | 'PF' | null;
    owner_name: string | null;

    main_phone: string;
    additional_phone: string | null;
    main_phone_whatsapp: boolean;
    email: string | null;
    website: string | null;

    postal_code: string;
    street: string;
    street_number: string;
    address_complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    country: string;

    logo_url: string | null;
    description: string | null;

    status: AgencyStatus;
    verified_at: string | null;
    created_at: string;
    updated_at: string;
}

export type AgencyStatus = 'DRAFT' | 'ACTIVE' | 'VERIFIED' | 'SUSPENDED';

export interface AgencyMember {
    id: string;
    agency_id: string;
    user_id: string;
    role: AgencyRole;
    created_at: string;
}

export type AgencyRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';

/** Form data for creating/editing an agency (excludes server-managed fields) */
export interface AgencyFormData {
    name: string;
    trade_name: string;
    cnpj: string;
    creci_number: string;
    creci_state: string;
    creci_type: string;
    owner_name: string;

    main_phone: string;
    additional_phone: string;
    main_phone_whatsapp: boolean;
    email: string;
    website: string;

    postal_code: string;
    street: string;
    street_number: string;
    address_complement: string;
    neighborhood: string;
    city: string;
    state: string;
    country: string;
}

/** Data returned by the API when querying the user's agency with membership info */
export interface AgencyWithRole extends Agency {
    role: AgencyRole;
}
