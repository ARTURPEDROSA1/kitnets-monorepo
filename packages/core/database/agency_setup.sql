-- ============================================================
-- Imobiliária (Agency) Module — Database Setup
-- Run in Supabase SQL Editor
-- ============================================================

-- Reuse existing updated_at trigger function (created in SUPABASE_SETUP.sql)
-- CREATE OR REPLACE FUNCTION update_updated_at_column() ...

-- 1. Agencies Table
CREATE TABLE IF NOT EXISTS public.agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Business identity
    name TEXT NOT NULL,
    trade_name TEXT,
    cnpj TEXT UNIQUE,  -- Stored as digits only: 12345678000190
    creci_number TEXT,
    creci_state TEXT,   -- UF: SP, PR, RJ, etc.
    creci_type TEXT CHECK (creci_type IN ('PJ', 'PF')),
    owner_name TEXT,    -- Legal representative (NOT the Kitnets account owner)

    -- Contact
    main_phone TEXT NOT NULL,       -- E.164 format: +5541999999999
    additional_phone TEXT,          -- E.164 format
    main_phone_whatsapp BOOLEAN DEFAULT false,
    email TEXT,
    website TEXT,

    -- Structured address
    postal_code TEXT NOT NULL,      -- Digits only: 80000000
    street TEXT NOT NULL,
    street_number TEXT NOT NULL,    -- Allows "S/N"
    address_complement TEXT,
    neighborhood TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,            -- UF: PR, SP, etc.
    country TEXT NOT NULL DEFAULT 'BR',

    -- Media & description
    logo_url TEXT,
    description TEXT,

    -- Status & verification
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('DRAFT', 'ACTIVE', 'VERIFIED', 'SUSPENDED')),
    verified_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.agencies IS 'Real estate agencies (imobiliárias) registered on Kitnets.com.';
COMMENT ON COLUMN public.agencies.cnpj IS 'CNPJ stored as 14 digits only (no punctuation). Validated with check-digit algorithm.';
COMMENT ON COLUMN public.agencies.main_phone IS 'Phone stored in E.164 international format (+5541999999999).';
COMMENT ON COLUMN public.agencies.owner_name IS 'Legal representative name — NOT the Kitnets.com account owner. These are separate concepts.';

-- 2. Agency Members (many-to-many: users ↔ agencies)
CREATE TABLE IF NOT EXISTS public.agency_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'AGENT'
        CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT unique_agency_user UNIQUE (agency_id, user_id)
);

COMMENT ON TABLE public.agency_members IS 'Many-to-many membership between users (profiles) and agencies with role-based access.';
COMMENT ON COLUMN public.agency_members.role IS 'OWNER = registered the agency. ADMIN = full management. MANAGER = limited management. AGENT = broker. VIEWER = read-only.';

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_agencies_cnpj ON public.agencies(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agencies_status ON public.agencies(status);
CREATE INDEX IF NOT EXISTS idx_agency_members_user_id ON public.agency_members(user_id);
CREATE INDEX IF NOT EXISTS idx_agency_members_agency_id ON public.agency_members(agency_id);

-- 4. Triggers
CREATE TRIGGER update_agencies_modtime
    BEFORE UPDATE ON public.agencies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Row Level Security
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

-- Policy: Members can read their own agencies
CREATE POLICY "Members can view their agencies"
    ON public.agencies FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.agency_members am
            JOIN public.profiles p ON p.id = am.user_id
            WHERE am.agency_id = agencies.id
            AND p.clerk_id = (SELECT auth.jwt() ->> 'sub')
        )
    );

-- Policy: Owners and Admins can update their agencies
CREATE POLICY "Owners and admins can update agencies"
    ON public.agencies FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.agency_members am
            JOIN public.profiles p ON p.id = am.user_id
            WHERE am.agency_id = agencies.id
            AND p.clerk_id = (SELECT auth.jwt() ->> 'sub')
            AND am.role IN ('OWNER', 'ADMIN')
        )
    );

-- Policy: Members can view their own memberships
CREATE POLICY "Members can view own memberships"
    ON public.agency_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = agency_members.user_id
            AND p.clerk_id = (SELECT auth.jwt() ->> 'sub')
        )
    );

-- Note: INSERT policies are not needed because we use the service role key
-- from API routes (bypasses RLS) to create agencies and memberships.
-- This matches the existing pattern used by profiles/create API.
