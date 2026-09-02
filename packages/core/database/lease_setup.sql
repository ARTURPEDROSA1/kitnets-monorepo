-- =============================================================================
-- Contratos de Locação (Leases) Setup
-- =============================================================================
-- Creates the `leases`, `lease_tenants`, `lease_charges`, and `lease_documents`
-- tables for managing rental/lease contracts.
--
-- Run this AFTER: agency_setup.sql, agent_setup.sql, tenant_setup.sql,
--                 phase1_dashboard_setup.sql (properties table).
-- =============================================================================

-- ── Table: leases ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Owner (the user/account who registered this lease)
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Identification
    reference_name TEXT,                            -- e.g. "Kitnet 03 - João - 2026"

    -- Property (required, one per lease)
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,

    -- Primary tenant (required)
    primary_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

    -- Management
    management_type TEXT NOT NULL
        CHECK (management_type IN ('SELF_MANAGED', 'AGENCY', 'AGENT')),
    agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,

    -- Lease terms
    start_date DATE NOT NULL,
    end_date DATE,                                  -- NULL = open-ended lease
    monthly_rent NUMERIC(12, 2) NOT NULL
        CHECK (monthly_rent > 0),
    rent_due_day INT NOT NULL
        CHECK (rent_due_day >= 1 AND rent_due_day <= 31),
    security_deposit NUMERIC(12, 2),
    deposit_months INT,

    -- Rent adjustment
    adjustment_index TEXT
        CHECK (adjustment_index IS NULL OR adjustment_index IN (
            'IPCA', 'IGP_M', 'INPC', 'IVAR', 'CUSTOM', 'NONE'
        )),
    adjustment_frequency INT DEFAULT 12,            -- Months between adjustments
    next_adjustment_date DATE,

    -- Status
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED', 'CANCELLED')),

    -- Termination
    termination_date DATE,
    termination_reason TEXT,

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.profiles(id),

    -- Constraint: end_date must be after start_date
    CONSTRAINT chk_lease_dates CHECK (end_date IS NULL OR end_date > start_date)
);

-- ── Table: lease_tenants (additional tenants per lease) ─────────────────────

CREATE TABLE IF NOT EXISTS public.lease_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    role TEXT NOT NULL DEFAULT 'CO_TENANT'
        CHECK (role IN ('CO_TENANT', 'OCCUPANT')),

    UNIQUE(lease_id, tenant_id)
);

-- ── Table: lease_charges (additional charges per lease) ─────────────────────

CREATE TABLE IF NOT EXISTS public.lease_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    charge_type TEXT NOT NULL
        CHECK (charge_type IN (
            'CONDOMINIUM', 'IPTU', 'WATER', 'ELECTRICITY', 'GAS', 'INTERNET', 'OTHER'
        )),
    label TEXT,                                     -- Custom label for 'OTHER' type
    responsibility TEXT NOT NULL DEFAULT 'TENANT'
        CHECK (responsibility IN ('TENANT', 'LANDLORD', 'INCLUDED')),
    amount NUMERIC(12, 2)                           -- Optional fixed amount
);

-- ── Table: lease_documents ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lease_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL DEFAULT 'OTHER'
        CHECK (document_type IN (
            'CONTRACT', 'ADDENDUM', 'INSPECTION', 'TENANT_DOC', 'DEPOSIT_RECEIPT', 'OTHER'
        )),
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INT,
    mime_type TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── Indexes: leases ─────────────────────────────────────────────────────────

-- Fast lookup by owner
CREATE INDEX IF NOT EXISTS idx_leases_user_id
    ON public.leases (user_id);

-- Fast lookup by property
CREATE INDEX IF NOT EXISTS idx_leases_property_id
    ON public.leases (property_id);

-- Fast lookup by primary tenant
CREATE INDEX IF NOT EXISTS idx_leases_primary_tenant_id
    ON public.leases (primary_tenant_id);

-- Status filter on active (non-deleted) leases
CREATE INDEX IF NOT EXISTS idx_leases_status
    ON public.leases (status)
    WHERE deleted_at IS NULL;

-- Active lease per property check (warn on duplicate active leases)
CREATE INDEX IF NOT EXISTS idx_leases_property_active
    ON public.leases (property_id, status)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- Partial index for non-deleted leases
CREATE INDEX IF NOT EXISTS idx_leases_deleted_at
    ON public.leases (deleted_at)
    WHERE deleted_at IS NULL;

-- ── Indexes: lease_tenants ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lease_tenants_lease_id
    ON public.lease_tenants (lease_id);

CREATE INDEX IF NOT EXISTS idx_lease_tenants_tenant_id
    ON public.lease_tenants (tenant_id);

-- ── Indexes: lease_charges ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lease_charges_lease_id
    ON public.lease_charges (lease_id);

-- ── Indexes: lease_documents ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lease_documents_lease_id
    ON public.lease_documents (lease_id);

-- ── Trigger: auto-update updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_leases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leases_updated_at ON public.leases;
CREATE TRIGGER trg_leases_updated_at
    BEFORE UPDATE ON public.leases
    FOR EACH ROW
    EXECUTE FUNCTION public.update_leases_updated_at();

-- ── RLS Policies ────────────────────────────────────────────────────────────

ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_documents ENABLE ROW LEVEL SECURITY;

-- Users can read their own leases
CREATE POLICY leases_select_own ON public.leases
    FOR SELECT USING (user_id = auth.uid());

-- Users can read lease_tenants for their own leases
CREATE POLICY lease_tenants_select_own ON public.lease_tenants
    FOR SELECT USING (
        lease_id IN (SELECT id FROM public.leases WHERE user_id = auth.uid())
    );

-- Users can read lease_charges for their own leases
CREATE POLICY lease_charges_select_own ON public.lease_charges
    FOR SELECT USING (
        lease_id IN (SELECT id FROM public.leases WHERE user_id = auth.uid())
    );

-- Users can read lease_documents for their own leases
CREATE POLICY lease_documents_select_own ON public.lease_documents
    FOR SELECT USING (
        lease_id IN (SELECT id FROM public.leases WHERE user_id = auth.uid())
    );

-- Service role bypasses RLS for INSERT/UPDATE/DELETE (API routes use service key)

-- ── Supabase Storage Bucket ─────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('lease-documents', 'lease-documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload lease documents"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'lease-documents' AND auth.role() = 'authenticated' );

CREATE POLICY "Authenticated users can view lease documents"
ON storage.objects FOR SELECT
USING ( bucket_id = 'lease-documents' AND auth.role() = 'authenticated' );

CREATE POLICY "Authenticated users can delete lease documents"
ON storage.objects FOR DELETE
USING ( bucket_id = 'lease-documents' AND auth.role() = 'authenticated' );

-- ── Comments ────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.leases IS 'Rental/lease contracts connecting properties, tenants, and management.';
COMMENT ON COLUMN public.leases.reference_name IS 'User-friendly reference like "Kitnet 03 - João - 2026".';
COMMENT ON COLUMN public.leases.management_type IS 'SELF_MANAGED = owner manages, AGENCY = managed by agency, AGENT = managed by independent agent.';
COMMENT ON COLUMN public.leases.monthly_rent IS 'Monthly rent in BRL. Must be greater than zero.';
COMMENT ON COLUMN public.leases.rent_due_day IS 'Day of month (1-31) when rent is due.';
COMMENT ON COLUMN public.leases.adjustment_index IS 'Economic index used for rent adjustments: IPCA, IGP_M, INPC, IVAR, CUSTOM, or NONE.';
COMMENT ON COLUMN public.leases.status IS 'DRAFT, ACTIVE, EXPIRING_SOON, EXPIRED, TERMINATED, CANCELLED.';
COMMENT ON TABLE public.lease_tenants IS 'Additional tenants (co-tenants/occupants) associated with a lease. Primary tenant is on the leases table.';
COMMENT ON TABLE public.lease_charges IS 'Additional charges (condominium, IPTU, utilities) and their responsibility assignment per lease.';
COMMENT ON TABLE public.lease_documents IS 'Documents uploaded for a lease: contracts, addenda, inspection reports, etc.';
