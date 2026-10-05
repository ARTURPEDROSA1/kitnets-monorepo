// ── Lease (Contrato de Locação) Types ─────────────────────────────────

export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'TERMINATED' | 'CANCELLED';
export type LeaseManagementType = 'SELF_MANAGED' | 'AGENCY' | 'AGENT';
export type AdjustmentIndex = 'IPCA' | 'IGP_M' | 'INPC' | 'IVAR' | 'CUSTOM' | 'NONE';
export type ChargeType = 'CONDOMINIUM' | 'IPTU' | 'WATER' | 'ELECTRICITY' | 'GAS' | 'INTERNET' | 'OTHER';
/** Who pays a charge: the tenant, the owner, nobody apart (it is in the rent, or in the condominium fee) */
export type ChargeResponsibility = 'TENANT' | 'LANDLORD' | 'INCLUDED' | 'INCLUDED_IN_CONDO';
/** Who bills the tenant for the rent or a charge (lib/invoice-collection.ts) */
export type ChargeCollector = 'OWNER' | 'AGENCY' | 'THIRD_PARTY';
/** NOTICE: the tenant's notice of leaving (aviso de desocupação); TERMINATION: the closing term (termo de encerramento) */
export type DocumentType = 'CONTRACT' | 'ADDENDUM' | 'INSPECTION' | 'TENANT_DOC' | 'DEPOSIT_RECEIPT' | 'NOTICE' | 'TERMINATION' | 'OTHER';
export type LeaseTenantRole = 'CO_TENANT' | 'OCCUPANT';

// ── Database row interfaces ──────────────────────────────────────────

export interface Lease {
    id: string;
    user_id: string;

    reference_name: string | null;

    // Property & tenant
    property_id: string;
    /** Unit of a multi-unit property (id in the owner's profile JSON); null = the whole property */
    unit_id: string | null;
    /** The unit's name when the lease was last saved */
    unit_name: string | null;
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
    /** when the tenant gave notice of leaving; with the lease in force, termination_date is the planned move-out day */
    notice_date?: string | null;

    // Notes
    notes: string | null;

    // Invoicing (Fatura): who collects the rent (null = follows the management) and how this lease is billed
    rent_collected_by?: ChargeCollector | null;
    billing_due_day?: number | null;
    billing_email?: string | null;
    billing_paused?: boolean;

    // Timestamps
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

/** Lease returned by GET /api/leases — includes joined names */
export interface LeaseWithDetails extends Lease {
    /** files attached to the lease (list endpoint only) */
    document_count?: number;
    property_name: string | null;
    primary_tenant_name: string | null;
    agency_name: string | null;
    agent_name: string | null;
    additional_tenants: LeaseTenantWithName[];
    charges: LeaseCharge[];
    documents: LeaseDocument[];
    /** what each adjustment took and left (list endpoint only): the totals over the term follow them */
    adjustments?: LeaseAdjustmentBrief[];
    /** the months the property's ledger confirmed for the lease (list endpoint only): the "executado" of the totals */
    realized?: LeaseRealizedMonth[];
}

/** One month the property's income ledger confirmed for a lease, as the contract's totals count it (lib/lease-term.ts). */
export interface LeaseRealizedMonth {
    /** `YYYY-MM` */
    month: string;
    /** the rent before the agency's cut */
    rent: number;
    /** the condominium and the energy the tenant paid */
    condo: number;
    energy: number;
}

/** One row of the lease's adjustment history, cut to its amounts (lib/lease-adjustments.ts). */
export interface LeaseAdjustmentBrief {
    effective_date: string;
    previous_rent: number;
    new_rent: number;
    previous_condo: number | null;
    new_condo: number | null;
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
    /** Index that readjusts the amount (same values as the rent's), when the lease says. */
    adjustment_index: string | null;
    adjustment_notes: string | null;
    /** "Reajusta com o aluguel": the condominium follows the rent's index and adjustment date. */
    adjusts_with_rent?: boolean;
    /** Who bills the tenant for it ("Emissor da fatura"); null = not answered. Only for a charge the tenant pays. */
    collected_by?: ChargeCollector | null;
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
    unit_id: string;                // '' = the whole property
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
    adjustment_index: string;
    adjustment_notes: string;
    /** "Reajusta com o aluguel" (the condominium only); absent on a charge an import prefilled */
    adjusts_with_rent?: boolean;
    /** "Emissor da fatura": OWNER, AGENCY, THIRD_PARTY or '' (not answered); absent on a charge an import prefilled */
    collected_by?: string;
}

// ── Dropdown option types ────────────────────────────────────────────

export interface LeasePropertyOption {
    id: string;
    name: string;
    /** Rentable units of a multi-unit property; empty for a single-unit one */
    units?: { id: string; name: string }[];
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
