-- =============================================================================
-- Inquilinos (Tenants) Setup
-- =============================================================================
-- Creates the `tenants` table for managing tenants (inquilinos).
-- Each tenant belongs to a user, links to a property, and optionally
-- links to an agency and agent for management.
--
-- Run this AFTER agency_setup.sql, agent_setup.sql, and phase1_dashboard_setup.sql.
-- =============================================================================

-- ── Table: tenants ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Owner (the user/account who registered this tenant)
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Personal info (required)
    full_name TEXT NOT NULL,
    cpf TEXT NOT NULL,                              -- Digits only: "12345678901"
    main_phone TEXT NOT NULL,                       -- E.164: "+5531999999999"
    email TEXT NOT NULL,

    -- Personal info (optional)
    date_of_birth DATE,
    rg TEXT,                                        -- RG / ID number
    additional_phone TEXT,                          -- E.164

    -- Address (optional — tenant's current address)
    postal_code TEXT,                               -- Digits only: "30000000"
    street TEXT,
    street_number TEXT,
    address_complement TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,                                     -- UF: "MG", "SP"

    -- Property association (required)
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
    use_property_address BOOLEAN NOT NULL DEFAULT FALSE,

    -- Management association (required)
    management_type TEXT NOT NULL
        CHECK (management_type IN ('SELF_MANAGED', 'AGENCY')),
    agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,

    -- Rental info (basic occupancy — detailed info belongs in future lease record)
    move_in_date DATE,
    move_out_date DATE,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'FUTURE', 'FORMER')),

    -- Additional
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,                   -- E.164
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.profiles(id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- CPF uniqueness per user account (only for non-deleted tenants)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_cpf_per_user
    ON public.tenants (user_id, cpf)
    WHERE deleted_at IS NULL;

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_tenants_user_id
    ON public.tenants (user_id);

-- Fast lookup by property
CREATE INDEX IF NOT EXISTS idx_tenants_property_id
    ON public.tenants (property_id);

-- Fast lookup by agency
CREATE INDEX IF NOT EXISTS idx_tenants_agency_id
    ON public.tenants (agency_id)
    WHERE agency_id IS NOT NULL;

-- Partial index for active (non-deleted) tenants
CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at
    ON public.tenants (deleted_at)
    WHERE deleted_at IS NULL;

-- Status filter
CREATE INDEX IF NOT EXISTS idx_tenants_status
    ON public.tenants (status)
    WHERE deleted_at IS NULL;

-- ── Triggers ─────────────────────────────────────────────────────────────────

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.update_tenants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_tenants_updated_at();

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Users can read their own tenants
CREATE POLICY tenants_select_own ON public.tenants
    FOR SELECT USING (user_id = auth.uid());

-- Service role bypasses RLS for INSERT/UPDATE/DELETE (API routes use service key)

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.tenants IS 'Tenants (inquilinos) managed by property owners';
COMMENT ON COLUMN public.tenants.cpf IS 'Brazilian CPF, digits only (11 chars). Unique per user account.';
COMMENT ON COLUMN public.tenants.main_phone IS 'Phone stored in E.164 international format (+5531999999999).';
COMMENT ON COLUMN public.tenants.management_type IS 'SELF_MANAGED = owner manages directly, AGENCY = managed by a real estate agency';
COMMENT ON COLUMN public.tenants.agency_id IS 'FK to agencies. Required when management_type = AGENCY. SET NULL on agency deletion.';
COMMENT ON COLUMN public.tenants.agent_id IS 'FK to agents. Optional agent within the selected agency. SET NULL on agent deletion.';
COMMENT ON COLUMN public.tenants.property_id IS 'FK to properties. RESTRICT deletion if tenant references it.';
COMMENT ON COLUMN public.tenants.use_property_address IS 'If true, the tenant current address is the same as the rented property address.';
COMMENT ON COLUMN public.tenants.status IS 'ACTIVE = currently occupying, FUTURE = future tenant, FORMER = ex-tenant';
