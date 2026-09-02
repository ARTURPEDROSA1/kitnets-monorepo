-- =============================================================================
-- Corretores (Real Estate Agents) Setup
-- =============================================================================
-- Creates the `agents` table for managing real estate agents (corretores).
-- Each agent belongs to a user and optionally links to an agency (imobiliária).
--
-- Run this AFTER agency_setup.sql and agency_soft_delete.sql.
-- =============================================================================

-- ── Table: agents ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Owner (the user who registered this agent)
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Personal info
    full_name TEXT NOT NULL,
    cpf TEXT,                                        -- Digits only: "12345678901"
    photo_url TEXT,

    -- Professional registration
    creci_number TEXT NOT NULL,
    creci_state TEXT NOT NULL,                       -- UF: "MG", "SP"

    -- Type of work
    agent_type TEXT NOT NULL DEFAULT 'AUTONOMO'
        CHECK (agent_type IN ('AUTONOMO', 'IMOBILIARIA')),

    -- Link to agency (nullable — autonomous agents have no agency)
    -- ON DELETE SET NULL: deleting an agency orphans agents, making them autonomous
    agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,

    -- Contact
    main_phone TEXT NOT NULL,                        -- E.164: "+5531999999999"
    additional_phone TEXT,
    whatsapp_phone TEXT,                             -- E.164 (separate from main phone)
    email TEXT,
    website TEXT,                                    -- Normalized: "https://..."

    -- Extra
    notes TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.profiles(id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- CRECI uniqueness per state (only for non-deleted agents)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_creci_unique
    ON public.agents (creci_number, creci_state)
    WHERE deleted_at IS NULL;

-- CPF uniqueness (only for non-deleted agents with non-null CPF)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_cpf_unique
    ON public.agents (cpf)
    WHERE deleted_at IS NULL AND cpf IS NOT NULL;

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_agents_user_id
    ON public.agents (user_id);

-- Fast lookup by agency
CREATE INDEX IF NOT EXISTS idx_agents_agency_id
    ON public.agents (agency_id)
    WHERE agency_id IS NOT NULL;

-- Partial index for active (non-deleted) agents
CREATE INDEX IF NOT EXISTS idx_agents_deleted_at
    ON public.agents (deleted_at)
    WHERE deleted_at IS NULL;

-- ── Triggers ─────────────────────────────────────────────────────────────────

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.update_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_updated_at ON public.agents;
CREATE TRIGGER trg_agents_updated_at
    BEFORE UPDATE ON public.agents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_agents_updated_at();

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Users can read their own agents
CREATE POLICY agents_select_own ON public.agents
    FOR SELECT USING (user_id = auth.uid());

-- Service role bypasses RLS for INSERT/UPDATE/DELETE (API routes use service key)

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.agents IS 'Real estate agents (corretores) managed by users';
COMMENT ON COLUMN public.agents.agent_type IS 'AUTONOMO = independent, IMOBILIARIA = works at an agency';
COMMENT ON COLUMN public.agents.agency_id IS 'FK to agencies. SET NULL on agency deletion (agent becomes autonomous)';
COMMENT ON COLUMN public.agents.cpf IS 'Brazilian CPF, digits only (11 chars)';
COMMENT ON COLUMN public.agents.creci_number IS 'CRECI registration number';
COMMENT ON COLUMN public.agents.creci_state IS 'State (UF) of CRECI registration';
