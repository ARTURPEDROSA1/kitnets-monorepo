// ── Lease (Contrato de Locação) Types ─────────────────────────────────

export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'TERMINATED' | 'CANCELLED';
export type LeaseManagementType = 'SELF_MANAGED' | 'AGENCY' | 'AGENT';
export type AdjustmentIndex = 'IPCA' | 'IGP_M' | 'INPC' | 'IVAR' | 'CUSTOM' | 'NONE';
export type ChargeType = 'CONDOMINIUM' | 'IPTU' | 'WATER' | 'ELECTRICITY' | 'GAS' | 'INTERNET' | 'OTHER';
export type ChargeResponsibility = 'TENANT' | 'LANDLORD' | 'INCLUDED';
export type DocumentType = 'CONTRACT' | 'ADDENDUM' | 'INSPECTION' | 'TENANT_DOC' | 'DEPOSIT_RECEIPT' | 'OTHER';
export type LeaseTenantRole = 'CO_TENANT' | 'OCCUPANT';

// ── Database row interfaces ──────────────────────────────────────────

export interface Lease {
    id: string;
    user_id: string;

    reference_name: string | null;

    // Property & tenant
    property_id: string;
    primary_tenant_id: string;

    // Management
    management_type: LeaseManagementType;
    agency_id: string | null;
    agent_id: string | null;

    // Lease terms
    start_date: string;                   // ISO date
    end_date: string | null;              // ISO date or null (open-ended)
    monthly_rent: number;                 // BRL
    rent_due_day: number;                 // 1-31
    security_deposit: number | null;
    deposit_months: number | null;

    // Rent adjustment
    adjustment_index: AdjustmentIndex | null;
    adjustment_frequency: number | null;
    next_adjustment_date: string | null;  // ISO date

    // Status
    status: LeaseStatus;

    // Termination
    termination_date: string | null;
    termination_reason: string | null;

    // Notes
    notes: string | null;

    // Timestamps
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

/** Lease returned by GET /api/leases — includes joined names */
export interface LeaseWithDetails extends Lease {
    property_name: string | null;
    primary_tenant_name: string | null;
    agency_name: string | null;
    agent_name: string | null;
    additional_tenants: LeaseTenantWithName[];
    charges: LeaseCharge[];
    documents: LeaseDocument[];
}

// ── Related table interfaces ─────────────────────────────────────────

export interface LeaseTenant {
    id: string;
    lease_id: string;
    tenant_id: string;
    role: LeaseTenantRole;
}

export interface LeaseTenantWithName extends LeaseTenant {
    tenant_name: string | null;
}

export interface LeaseCharge {
    id: string;
    lease_id: string;
    charge_type: ChargeType;
    label: string | null;
    responsibility: ChargeResponsibility;
    amount: number | null;
}

export interface LeaseDocument {
    id: string;
    lease_id: string;
    document_type: DocumentType;
    file_url: string;
    file_name: string;
    file_size: number | null;
    mime_type: string | null;
    uploaded_at: string;
}

// ── Form data interfaces ─────────────────────────────────────────────

export interface LeaseFormData {
    reference_name: string;

    // Property & tenant
    property_id: string;
    primary_tenant_id: string;

    // Management
    management_type: LeaseManagementType;
    agency_id: string;
    agent_id: string;

    // Lease terms
    start_date: string;             // DD/MM/YYYY in form
    end_date: string;               // DD/MM/YYYY in form
    monthly_rent: string;           // String for currency input
    rent_due_day: string;           // String for number input
    security_deposit: string;       // String for currency input
    deposit_months: string;         // String for number input

    // Rent adjustment
    adjustment_index: string;
    adjustment_frequency: string;
    next_adjustment_date: string;   // DD/MM/YYYY in form

    // Status
    status: LeaseStatus;

    // Notes
    notes: string;
}

export interface AdditionalTenantFormItem {
    tenant_id: string;
    role: LeaseTenantRole;
}

export interface ChargeFormItem {
    charge_type: ChargeType;
    label: string;
    responsibility: ChargeResponsibility;
    amount: string;                 // String for currency input
}

// ── Dropdown option types ────────────────────────────────────────────

export interface LeasePropertyOption {
    id: string;
    name: string;
}

export interface LeaseTenantOption {
    id: string;
    full_name: string;
}

export interface LeaseAgencyOption {
    id: string;
    name: string;
}

export interface LeaseAgentOption {
    id: string;
    full_name: string;
    agency_id: string | null;
}
