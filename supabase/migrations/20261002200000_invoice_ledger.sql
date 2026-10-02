-- Fatura → Receitas: what the tenant pays the owner directly reaches the income ledger.
--
-- Until now a ledger row knew one way for money to arrive: the agency's deposit (received_amount),
-- with the tenant's condominium assumed to be inside it. An invoice is a second way in, and it
-- carries no agency fee:
--   direct_rent    rent paid by invoice
--   direct_condo   condominium paid by invoice
--   direct_energy  energy paid by invoice
--   direct_other   every other charge paid by invoice (IPTU, water, gas, internet, other)
--   condo_direct   the unit's condominium is collected by the owner this month: it is NOT inside the
--                  agency's deposit, so the deposit is all rent (lib/property-income.ts, breakdown)
-- received_amount keeps its meaning (the deposit, or what the owner typed), so everything that edits
-- or imports it works as before; the columns default to 0 / false and existing rows are unchanged.
--
-- The direct_* columns are never typed: invoice_sync_ledger recomputes them from the PAID invoices of
-- the row's property, month and unit, so it can run any number of times. Late fees and the card
-- surcharge never enter the ledger. A row the sync had to create is marked source INVOICE.

ALTER TABLE public.property_income_months
    ADD COLUMN IF NOT EXISTS direct_rent   NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS direct_condo  NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS direct_energy NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS direct_other  NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS condo_direct  BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.property_income_months DROP CONSTRAINT IF EXISTS property_income_months_direct_non_negative;
ALTER TABLE public.property_income_months ADD CONSTRAINT property_income_months_direct_non_negative
    CHECK (direct_rent >= 0 AND direct_condo >= 0 AND direct_energy >= 0 AND direct_other >= 0);

ALTER TABLE public.property_income_months DROP CONSTRAINT IF EXISTS property_income_months_source_check;
ALTER TABLE public.property_income_months ADD CONSTRAINT property_income_months_source_check
    CHECK (source IN ('MANUAL', 'IMPORT', 'BANK', 'INVOICE'));

COMMENT ON COLUMN public.property_income_months.direct_rent IS 'Rent the tenant paid the owner directly, by invoice (no agency fee). Recomputed from the paid invoices: never typed.';
COMMENT ON COLUMN public.property_income_months.direct_condo IS 'Condominium the tenant paid the owner directly, by invoice. Recomputed from the paid invoices.';
COMMENT ON COLUMN public.property_income_months.direct_energy IS 'Energy the tenant paid the owner directly, by invoice. Recomputed from the paid invoices.';
COMMENT ON COLUMN public.property_income_months.direct_other IS 'Other charges (IPTU, water, gas, internet, other) the tenant paid the owner directly, by invoice. Recomputed from the paid invoices.';
COMMENT ON COLUMN public.property_income_months.condo_direct IS 'The owner collects this unit''s condominium this month: it is not inside the agency''s deposit.';

-- ── The sync ────────────────────────────────────────────────────────

-- Brings one ledger row (property, month, unit) in line with the invoices of that key.
CREATE OR REPLACE FUNCTION public.invoice_sync_ledger(p_owner UUID, p_property UUID, p_month DATE, p_unit TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_rent      NUMERIC(12, 2);
    v_condo     NUMERIC(12, 2);
    v_energy    NUMERIC(12, 2);
    v_other     NUMERIC(12, 2);
    v_condo_due NUMERIC(12, 2);   -- condominium on the live invoices, paid or not
    v_live      INTEGER;
    v_paid      INTEGER;
    v_paid_on   DATE;
    v_unit_name TEXT;
    v_row       public.property_income_months%ROWTYPE;
    v_fee       NUMERIC(5, 2);
    v_fee_condo BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = p_property AND owner_id = p_owner) THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(it.amount) FILTER (WHERE i.status = 'PAID' AND it.kind = 'RENT'), 0),
           COALESCE(SUM(it.amount) FILTER (WHERE i.status = 'PAID' AND it.kind = 'CONDOMINIUM'), 0),
           COALESCE(SUM(it.amount) FILTER (WHERE i.status = 'PAID' AND it.kind = 'ELECTRICITY'), 0),
           COALESCE(SUM(it.amount) FILTER (WHERE i.status = 'PAID' AND it.kind NOT IN ('RENT', 'CONDOMINIUM', 'ELECTRICITY')), 0),
           COALESCE(SUM(it.amount) FILTER (WHERE it.kind = 'CONDOMINIUM'), 0),
           COUNT(DISTINCT i.id),
           COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'PAID'),
           MAX(i.paid_on) FILTER (WHERE i.status = 'PAID'),
           MAX(i.unit_name)
      INTO v_rent, v_condo, v_energy, v_other, v_condo_due, v_live, v_paid, v_paid_on, v_unit_name
      FROM public.invoices i
      JOIN public.invoice_items it ON it.invoice_id = i.id
     WHERE i.owner_id = p_owner AND i.property_id = p_property AND i.reference_month = p_month
       AND i.unit_id IS NOT DISTINCT FROM p_unit AND i.status <> 'CANCELLED';

    SELECT * INTO v_row
      FROM public.property_income_months
     WHERE property_id = p_property AND month = p_month AND unit_id IS NOT DISTINCT FROM p_unit
       FOR UPDATE;

    IF NOT FOUND THEN
        IF v_live = 0 THEN
            RETURN;
        END IF;
        -- the agency's terms of the unit's most recent month, like the ledger's own "add a month" form
        SELECT agency_fee_pct, fee_on_condo INTO v_fee, v_fee_condo
          FROM public.property_income_months
         WHERE property_id = p_property AND unit_id IS NOT DISTINCT FROM p_unit AND month < p_month
         ORDER BY month DESC
         LIMIT 1;
        INSERT INTO public.property_income_months (
            owner_id, property_id, month, unit_id, unit_name, received_amount, agency_fee_pct, fee_on_condo,
            condo_amount, condo_direct, direct_rent, direct_condo, direct_energy, direct_other, status, source, received_on
        )
        VALUES (
            p_owner, p_property, p_month, p_unit, v_unit_name, 0, COALESCE(v_fee, 0), COALESCE(v_fee_condo, false),
            v_condo_due, v_condo_due > 0, v_rent, v_condo, v_energy, v_other,
            CASE WHEN v_paid > 0 THEN 'CONFIRMED' ELSE 'EXPECTED' END, 'INVOICE', v_paid_on
        );
        RETURN;
    END IF;

    -- an invoice-made row whose invoice was cancelled, with nothing else on it, goes away
    IF v_live = 0 AND v_row.source = 'INVOICE' AND v_row.received_amount = 0 AND v_row.energy_portion = 0
       AND v_row.other_income = 0 AND COALESCE(v_row.other_expenses, 0) = 0 AND v_row.notes IS NULL THEN
        DELETE FROM public.property_income_months WHERE id = v_row.id;
        RETURN;
    END IF;

    UPDATE public.property_income_months
       SET direct_rent = v_rent,
           direct_condo = v_condo,
           direct_energy = v_energy,
           direct_other = v_other,
           -- what the owner set by hand stays; an invoice that bills the condominium sets it
           condo_direct = condo_direct OR v_condo_due > 0,
           condo_amount = CASE WHEN COALESCE(condo_amount, 0) = 0 AND v_condo_due > 0 THEN v_condo_due ELSE condo_amount END,
           -- a row the owner (or the bank) wrote keeps its own status and date
           status = CASE WHEN source = 'INVOICE' THEN (CASE WHEN v_paid > 0 THEN 'CONFIRMED' ELSE 'EXPECTED' END) ELSE status END,
           received_on = CASE WHEN source = 'INVOICE' THEN v_paid_on ELSE received_on END
     WHERE id = v_row.id;
END;
$$;

-- Every key of a property that has a live invoice: for after the ledger itself was rewritten (a
-- spreadsheet import that replaces it, a month deleted by hand).
CREATE OR REPLACE FUNCTION public.invoice_sync_property(p_owner UUID, p_property UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_key   RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_key IN
        SELECT DISTINCT reference_month, unit_id
          FROM public.invoices
         WHERE owner_id = p_owner AND property_id = p_property AND status <> 'CANCELLED'
    LOOP
        PERFORM public.invoice_sync_ledger(p_owner, p_property, v_key.reference_month, v_key.unit_id);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- ── The writes now keep the ledger in step ──────────────────────────

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

    PERFORM public.invoice_sync_ledger(p_owner, (p_invoice ->> 'property_id')::UUID, (p_invoice ->> 'reference_month')::DATE, p_invoice ->> 'unit_id');

    RETURN v_id;
END;
$$;

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
    v_paid   public.invoices%ROWTYPE;
BEGIN
    UPDATE public.invoices
       SET status = 'PAID', paid_at = NOW(), paid_on = p_paid_on, paid_amount = p_amount, paid_via = p_via,
           late_fee_amount = COALESCE(p_late_fee, 0), surcharge_amount = COALESCE(p_surcharge, 0), paid_ref = p_ref
     WHERE id = p_invoice AND owner_id = p_owner AND status IN ('DRAFT', 'ISSUED')
    RETURNING * INTO v_paid;
    IF FOUND THEN
        INSERT INTO public.invoice_events (invoice_id, owner_id, type, actor, detail)
        VALUES (p_invoice, p_owner, 'PAID', p_actor, jsonb_build_object('via', p_via, 'amount', p_amount, 'paid_on', p_paid_on, 'ref', p_ref));
        PERFORM public.invoice_sync_ledger(p_owner, v_paid.property_id, v_paid.reference_month, v_paid.unit_id);
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

-- Cancels an open invoice and takes it out of the ledger. 'CANCELLED' when it did; otherwise the
-- status the invoice is in (paid, or already cancelled) and nothing changes.
CREATE OR REPLACE FUNCTION public.invoice_cancel(p_owner UUID, p_invoice UUID, p_reason TEXT DEFAULT NULL, p_actor TEXT DEFAULT 'OWNER')
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_done   public.invoices%ROWTYPE;
BEGIN
    UPDATE public.invoices
       SET status = 'CANCELLED', cancelled_at = NOW(), cancel_reason = p_reason
     WHERE id = p_invoice AND owner_id = p_owner AND status IN ('DRAFT', 'ISSUED')
    RETURNING * INTO v_done;
    IF FOUND THEN
        INSERT INTO public.invoice_events (invoice_id, owner_id, type, actor, detail)
        VALUES (p_invoice, p_owner, 'CANCELLED', p_actor, CASE WHEN p_reason IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('reason', p_reason) END);
        PERFORM public.invoice_sync_ledger(p_owner, v_done.property_id, v_done.reference_month, v_done.unit_id);
        RETURN 'CANCELLED';
    END IF;

    SELECT status INTO v_status FROM public.invoices WHERE id = p_invoice AND owner_id = p_owner;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fatura não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    RETURN v_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invoice_sync_ledger(UUID, UUID, DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_sync_property(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_cancel(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_create(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_mark_paid(UUID, UUID, DATE, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_sync_ledger(UUID, UUID, DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_sync_property(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_cancel(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_create(UUID, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_mark_paid(UUID, UUID, DATE, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;

-- Invoices paid before this migration (the module's first days) reach the ledger now.
DO $$
DECLARE
    v_key RECORD;
BEGIN
    FOR v_key IN
        SELECT DISTINCT owner_id, property_id, reference_month, unit_id FROM public.invoices WHERE status <> 'CANCELLED'
    LOOP
        PERFORM public.invoice_sync_ledger(v_key.owner_id, v_key.property_id, v_key.reference_month, v_key.unit_id);
    END LOOP;
END;
$$;
