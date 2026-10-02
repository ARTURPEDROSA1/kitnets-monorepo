-- Fatura: what the owner charges the tenant directly, month by month.
--
-- A lease says who PAYS each charge (lease_charges.responsibility); nothing said who COLLECTS it. An
-- agency-managed lease can still leave one charge with the owner (the agency collects the rent, the
-- owner collects the condominium), so the collector is recorded per component:
--   leases.rent_collected_by        the rent
--   lease_charges.collected_by      each charge
-- OWNER       = the owner charges the tenant (it goes into the invoice)
-- AGENCY      = the agency collects it and forwards it in its deposit
-- THIRD_PARTY = someone else bills the tenant: the building's own condominium (a studio in a
--               building), the utility
-- NULL        = not decided: the app derives rent and condominium from leases.management_type
--               (lib/invoice-collection.ts) and leaves every other charge out of the invoice.
--
-- A utility can also be part of the condominium fee rather than of the rent: a fourth answer to
-- who pays a charge, INCLUDED_IN_CONDO, next to TENANT, LANDLORD and INCLUDED (in the rent).
--
-- An invoice is one lease's month: items are a snapshot of the components the owner collects.
-- Only four states are stored (DRAFT, ISSUED, PAID, CANCELLED); "em atraso", "enviada" and the like
-- are derived from the due date and from what was issued and delivered, so they never go stale.
-- The owner's choices (late fee, interest, days in advance…) live in billing_settings and stay NULL
-- until the owner makes them: nothing here invents a default for a business decision.
--
-- Written and read by the API with the service role.

-- ── Who collects ────────────────────────────────────────────────────
ALTER TABLE public.leases
    ADD COLUMN IF NOT EXISTS rent_collected_by TEXT,
    ADD COLUMN IF NOT EXISTS billing_due_day   INTEGER,
    ADD COLUMN IF NOT EXISTS billing_email     TEXT,
    ADD COLUMN IF NOT EXISTS billing_paused    BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.leases DROP CONSTRAINT IF EXISTS leases_rent_collected_by_check;
ALTER TABLE public.leases ADD CONSTRAINT leases_rent_collected_by_check
    CHECK (rent_collected_by IS NULL OR rent_collected_by IN ('OWNER', 'AGENCY', 'THIRD_PARTY'));
ALTER TABLE public.leases DROP CONSTRAINT IF EXISTS leases_billing_due_day_check;
ALTER TABLE public.leases ADD CONSTRAINT leases_billing_due_day_check
    CHECK (billing_due_day IS NULL OR billing_due_day BETWEEN 1 AND 31);

ALTER TABLE public.lease_charges
    ADD COLUMN IF NOT EXISTS collected_by TEXT;
ALTER TABLE public.lease_charges DROP CONSTRAINT IF EXISTS lease_charges_collected_by_check;
ALTER TABLE public.lease_charges ADD CONSTRAINT lease_charges_collected_by_check
    CHECK (collected_by IS NULL OR collected_by IN ('OWNER', 'AGENCY', 'THIRD_PARTY'));

ALTER TABLE public.lease_charges DROP CONSTRAINT IF EXISTS lease_charges_responsibility_check;
ALTER TABLE public.lease_charges ADD CONSTRAINT lease_charges_responsibility_check
    CHECK (responsibility IN ('TENANT', 'LANDLORD', 'INCLUDED', 'INCLUDED_IN_CONDO'));

COMMENT ON COLUMN public.leases.rent_collected_by IS 'Who collects the rent: OWNER (invoiced), AGENCY, THIRD_PARTY; NULL = derived from management_type.';
COMMENT ON COLUMN public.leases.billing_due_day IS 'Due day of the invoice when it differs from rent_due_day; NULL = rent_due_day.';
COMMENT ON COLUMN public.leases.billing_email IS 'Where the invoice is sent when it is not the tenant''s own e-mail; NULL = tenants.email.';
COMMENT ON COLUMN public.leases.billing_paused IS 'The owner paused invoicing for this lease.';
COMMENT ON COLUMN public.lease_charges.collected_by IS 'Who collects this charge: OWNER (invoiced), AGENCY, THIRD_PARTY; NULL = not decided.';

-- ── The owner's billing decisions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_settings (
    owner_id               UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

    days_in_advance        INTEGER CHECK (days_in_advance BETWEEN 1 AND 25),          -- how long before the due date the invoice goes out
    fine_pct               NUMERIC(5, 2) CHECK (fine_pct BETWEEN 0 AND 20),            -- multa, once, % of the amount
    interest_pct_month     NUMERIC(5, 2) CHECK (interest_pct_month BETWEEN 0 AND 20),  -- juros de mora, % a month, pro rata die
    days_payable_after_due INTEGER CHECK (days_payable_after_due BETWEEN 0 AND 60),    -- how long the boleto/PIX still takes the payment
    card_fee_pct           NUMERIC(5, 3) CHECK (card_fee_pct >= 0 AND card_fee_pct < 50),
    card_fee_fixed         NUMERIC(6, 2) CHECK (card_fee_fixed >= 0),

    sender_name            TEXT,
    reply_to_email         TEXT,
    boleto_message         TEXT,

    automation_enabled     BOOLEAN NOT NULL DEFAULT false,
    automation_from_month  DATE CHECK (automation_from_month IS NULL OR EXTRACT(day FROM automation_from_month) = 1),

    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- the automation only runs on decisions the owner has made
    CONSTRAINT billing_settings_automation_needs_decisions CHECK (
        NOT automation_enabled OR (
            days_in_advance IS NOT NULL AND fine_pct IS NOT NULL AND interest_pct_month IS NOT NULL
            AND days_payable_after_due IS NOT NULL AND automation_from_month IS NOT NULL
        )
    )
);

DROP TRIGGER IF EXISTS trg_billing_settings_updated_at ON public.billing_settings;
CREATE TRIGGER trg_billing_settings_updated_at
    BEFORE UPDATE ON public.billing_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_settings FROM anon, authenticated;

COMMENT ON TABLE public.billing_settings IS 'One row per owner: the billing decisions (advance, late fee, interest, card fee). NULL = not decided yet; the automation stays off until they are.';

-- ── Invoices ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    number                 BIGINT NOT NULL,                          -- per owner, assigned on insert

    lease_id               UUID NOT NULL REFERENCES public.leases(id),       -- a financial record: the lease cannot vanish under it
    property_id            UUID NOT NULL REFERENCES public.properties(id),
    unit_id                TEXT,
    unit_name              TEXT,
    tenant_id              UUID NOT NULL REFERENCES public.tenants(id),

    reference_month        DATE NOT NULL CHECK (EXTRACT(day FROM reference_month) = 1),   -- the month of the due date
    due_date               DATE NOT NULL,
    amount                 NUMERIC(12, 2) NOT NULL CHECK (amount > 0),                    -- sum of the items

    status                 TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED')),
    origin                 TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origin IN ('AUTO', 'MANUAL')),
    blockers               TEXT[] NOT NULL DEFAULT '{}',                                  -- what keeps it from being issued (NO_EMAIL, NO_ADDRESS…)

    -- the payer as it was when the invoice was created
    payer_name             TEXT,
    payer_cpf              TEXT,
    payer_email            TEXT,
    payer_address          JSONB,

    -- the owner's terms when it was created
    fine_pct               NUMERIC(5, 2),
    interest_pct_month     NUMERIC(5, 2),
    days_payable_after_due INTEGER,

    public_token           TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),

    issued_at              TIMESTAMPTZ,
    paid_at                TIMESTAMPTZ,
    paid_on                DATE,
    paid_amount            NUMERIC(12, 2),                            -- amount + late fee; never the card surcharge
    late_fee_amount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
    surcharge_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
    paid_via               TEXT CHECK (paid_via IN ('BOLETO', 'PIX', 'CARD', 'MANUAL')),
    paid_ref               TEXT,                                      -- the provider's reference of the payment that settled it
    cancelled_at           TIMESTAMPTZ,
    cancel_reason          TEXT,
    notes                  TEXT,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (owner_id, number),
    CONSTRAINT invoices_paid_fields CHECK (status <> 'PAID' OR (paid_on IS NOT NULL AND paid_amount IS NOT NULL AND paid_via IS NOT NULL))
);

-- one live invoice per lease and month: generating twice is a no-op, a cancelled one can be redone
CREATE UNIQUE INDEX IF NOT EXISTS invoices_lease_month_live
    ON public.invoices (lease_id, reference_month) WHERE status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_invoices_owner_status_due
    ON public.invoices (owner_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_owner_month
    ON public.invoices (owner_id, reference_month DESC);

-- "Fatura nº 12" counts within the owner's account
CREATE OR REPLACE FUNCTION public.invoices_assign_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || NEW.owner_id::text));
    SELECT COALESCE(MAX(number), 0) + 1 INTO NEW.number FROM public.invoices WHERE owner_id = NEW.owner_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_assign_number ON public.invoices;
CREATE TRIGGER trg_invoices_assign_number
    BEFORE INSERT ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.invoices_assign_number();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoices FROM anon, authenticated;

COMMENT ON TABLE public.invoices IS 'What the owner charges a tenant for one month of a lease (rent and charges the owner collects). One live invoice per lease and month.';

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('RENT', 'CONDOMINIUM', 'IPTU', 'WATER', 'ELECTRICITY', 'GAS', 'INTERNET', 'OTHER')),
    description TEXT NOT NULL,
    amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    position    INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_items_one_rent
    ON public.invoice_items (invoice_id) WHERE kind = 'RENT';
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
    ON public.invoice_items (invoice_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_items FROM anon, authenticated;

COMMENT ON TABLE public.invoice_items IS 'Lines of an invoice: a snapshot of the rent and of each charge the owner collects, as they were when it was created.';

CREATE TABLE IF NOT EXISTS public.invoice_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    actor       TEXT NOT NULL CHECK (actor IN ('SYSTEM', 'OWNER', 'TENANT', 'INTER', 'STRIPE')),
    detail      JSONB NOT NULL DEFAULT '{}',
    dedupe_key  TEXT,                                   -- a provider's event id: the same webhook twice is one event
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_events_dedupe
    ON public.invoice_events (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice
    ON public.invoice_events (invoice_id, created_at);

ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_events FROM anon, authenticated;

COMMENT ON TABLE public.invoice_events IS 'Timeline of an invoice: created, issued, sent, paid, cancelled, and what went wrong.';

-- ── Writes ──────────────────────────────────────────────────────────

-- Creates an invoice with its items in one go. NULL when the lease already has a live invoice for the
-- month (generating twice is a no-op). The amount is the sum of the items.
CREATE OR REPLACE FUNCTION public.invoice_create(p_owner UUID, p_invoice JSONB, p_items JSONB)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_lease  UUID := (p_invoice ->> 'lease_id')::UUID;
    v_amount NUMERIC(12, 2);
    v_id     UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.leases WHERE id = v_lease AND user_id = p_owner AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
    END IF;

    SELECT COALESCE(SUM((i ->> 'amount')::NUMERIC), 0) INTO v_amount FROM jsonb_array_elements(p_items) AS i;
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Fatura sem itens' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.invoices (
        owner_id, lease_id, property_id, unit_id, unit_name, tenant_id, reference_month, due_date, amount, origin, blockers,
        payer_name, payer_cpf, payer_email, payer_address, fine_pct, interest_pct_month, days_payable_after_due, notes
    )
    VALUES (
        p_owner, v_lease, (p_invoice ->> 'property_id')::UUID, p_invoice ->> 'unit_id', p_invoice ->> 'unit_name',
        (p_invoice ->> 'tenant_id')::UUID, (p_invoice ->> 'reference_month')::DATE, (p_invoice ->> 'due_date')::DATE, v_amount,
        COALESCE(p_invoice ->> 'origin', 'MANUAL'),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_invoice -> 'blockers', '[]'::jsonb))), '{}'),
        p_invoice ->> 'payer_name', p_invoice ->> 'payer_cpf', p_invoice ->> 'payer_email', p_invoice -> 'payer_address',
        (p_invoice ->> 'fine_pct')::NUMERIC, (p_invoice ->> 'interest_pct_month')::NUMERIC, (p_invoice ->> 'days_payable_after_due')::INTEGER,
        p_invoice ->> 'notes'
    )
    ON CONFLICT (lease_id, reference_month) WHERE status <> 'CANCELLED' DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.invoice_items (invoice_id, owner_id, kind, description, amount, position)
    SELECT v_id, p_owner, i ->> 'kind', i ->> 'description', (i ->> 'amount')::NUMERIC, (ord - 1)::INTEGER
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(i, ord);

    INSERT INTO public.invoice_events (invoice_id, owner_id, type, actor, detail)
    VALUES (v_id, p_owner, 'CREATED', CASE WHEN COALESCE(p_invoice ->> 'origin', 'MANUAL') = 'AUTO' THEN 'SYSTEM' ELSE 'OWNER' END,
            jsonb_build_object('amount', v_amount));

    RETURN v_id;
END;
$$;

-- The only way an invoice becomes PAID, whoever reports the payment (the owner, a webhook, the daily
-- reconciliation): 'PAID' the first time, 'ALREADY' when the same payment is reported again, 'DUPLICATE'
-- when money arrives for an invoice another payment settled (or that was cancelled) — recorded on the
-- timeline so the owner can refund it.
CREATE OR REPLACE FUNCTION public.invoice_mark_paid(
    p_owner UUID, p_invoice UUID, p_paid_on DATE, p_amount NUMERIC, p_via TEXT,
    p_late_fee NUMERIC DEFAULT 0, p_surcharge NUMERIC DEFAULT 0, p_ref TEXT DEFAULT NULL, p_actor TEXT DEFAULT 'SYSTEM'
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_ref    TEXT;
BEGIN
    UPDATE public.invoices
       SET status = 'PAID', paid_at = NOW(), paid_on = p_paid_on, paid_amount = p_amount, paid_via = p_via,
           late_fee_amount = COALESCE(p_late_fee, 0), surcharge_amount = COALESCE(p_surcharge, 0), paid_ref = p_ref
     WHERE id = p_invoice AND owner_id = p_owner AND status IN ('DRAFT', 'ISSUED');
    IF FOUND THEN
        INSERT INTO public.invoice_events (invoice_id, owner_id, type, actor, detail)
        VALUES (p_invoice, p_owner, 'PAID', p_actor, jsonb_build_object('via', p_via, 'amount', p_amount, 'paid_on', p_paid_on, 'ref', p_ref));
        RETURN 'PAID';
    END IF;

    SELECT status, paid_ref INTO v_status, v_ref FROM public.invoices WHERE id = p_invoice AND owner_id = p_owner;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fatura não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_status = 'PAID' AND v_ref IS NOT DISTINCT FROM p_ref THEN
        RETURN 'ALREADY';
    END IF;

    INSERT INTO public.invoice_events (invoice_id, owner_id, type, actor, detail)
    VALUES (p_invoice, p_owner, 'DUPLICATE_PAYMENT', p_actor,
            jsonb_build_object('via', p_via, 'amount', p_amount, 'paid_on', p_paid_on, 'ref', p_ref, 'invoice_status', v_status));
    RETURN 'DUPLICATE';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invoices_assign_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_create(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_mark_paid(UUID, UUID, DATE, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoices_assign_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_create(UUID, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_mark_paid(UUID, UUID, DATE, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;
