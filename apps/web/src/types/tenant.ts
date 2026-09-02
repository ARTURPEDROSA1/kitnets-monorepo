// ── Tenant (Inquilino) Types ──────────────────────────────────────────

export type TenantStatus = 'ACTIVE' | 'FUTURE' | 'FORMER';
export type TenantManagementType = 'SELF_MANAGED' | 'AGENCY';

export interface Tenant {
    id: string;
    user_id: string;

    // Personal (required)
    full_name: string;
    cpf: string;                          // Digits only: "12345678901"
    main_phone: string;                   // E.164
    email: string | null;

    // Personal (optional)
    date_of_birth: string | null;         // ISO date
    rg: string | null;
    additional_phone: string | null;      // E.164

    // Address (optional)
    postal_code: string | null;
    street: string | null;
    street_number: string | null;
    address_complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;

    // Property association
    property_id: string;
    use_property_address: boolean;

    // Management
    management_type: TenantManagementType;
    agency_id: string | null;
    agent_id: string | null;

    // Rental
    move_in_date: string | null;          // ISO date
    move_out_date: string | null;         // ISO date
    status: TenantStatus;

    // Additional
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null; // E.164
    notes: string | null;

    // Timestamps
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

/** Tenant returned by GET /api/tenants — includes joined names */
export interface TenantWithDetails extends Tenant {
    property_name: string | null;
    agency_name: string | null;
    agent_name: string | null;
}

/** Form data for creating/editing a tenant (excludes server-managed fields) */
export interface TenantFormData {
    // Personal (required)
    full_name: string;
    cpf: string;
    main_phone: string;
    email: string;

    // Personal (optional)
    date_of_birth: string;
    rg: string;
    additional_phone: string;

    // Address (optional)
    postal_code: string;
    street: string;
    street_number: string;
    address_complement: string;
    neighborhood: string;
    city: string;
    state: string;

    // Property
    property_id: string;
    use_property_address: boolean;

    // Management
    management_type: TenantManagementType;
    agency_id: string;
    agent_id: string;

    // Rental
    move_in_date: string;
    move_out_date: string;
    status: TenantStatus;

    // Additional
    emergency_contact_name: string;
    emergency_contact_phone: string;
    notes: string;
}

/** Simplified property for dropdown */
export interface PropertyOption {
    id: string;
    name: string;
}

/** Simplified agency for dropdown */
export interface AgencyOption {
    id: string;
    name: string;
}

/** Simplified agent for dropdown */
export interface AgentOption {
    id: string;
    full_name: string;
    agency_id: string | null;
}
