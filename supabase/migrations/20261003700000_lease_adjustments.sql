-- Contratos: the history of a lease's adjustments.
--
-- One row per adjustment date. Truth, in this order: an addendum ("aditivo") the owner imported says
-- the new values — the parties may negotiate freely, whatever the index did (source ADDENDUM, with its
-- document when there is one); without one, Kitnets' own calculation on the anniversary (source
-- CALCULATED: the previous amount times the index of the cycle that closed, lib/lease-adjustments.ts).
--
-- Recording a row moves the lease's current amounts (leases.monthly_rent and the condominium charge),
-- so whatever reads them — the invoices included — follows. The first row's previous_* keep the
-- contract's original amounts. Written and read by the API with the service role.

CREATE TABLE IF NOT EXISTS public.lease_adjustments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lease_id        UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    effective_date  DATE NOT NULL,
    source          TEXT NOT NULL CHECK (source IN ('CALCULATED', 'ADDENDUM')),
    index_code      TEXT,
    -- the cycle's index in % and the exact factor behind it (kept so an addendum can chain the later rows again)
    index_pct       NUMERIC(9,4),
    index_factor    NUMERIC(16,12),
    previous_rent   NUMERIC(12,2) NOT NULL CHECK (previous_rent >= 0),
    new_rent        NUMERIC(12,2) NOT NULL CHECK (new_rent >= 0),
    -- the condominium before and after; new_condo NULL = unchanged
    previous_condo  NUMERIC(12,2) CHECK (previous_condo IS NULL OR previous_condo >= 0),
    new_condo       NUMERIC(12,2) CHECK (new_condo IS NULL OR new_condo >= 0),
    condo_factor    NUMERIC(16,12),
    document_id     UUID REFERENCES public.lease_documents(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lease_id, effective_date)
);

DROP TRIGGER IF EXISTS trg_lease_adjustments_updated_at ON public.lease_adjustments;
CREATE TRIGGER trg_lease_adjustments_updated_at
    BEFORE UPDATE ON public.lease_adjustments
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.lease_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lease_adjustments FROM anon, authenticated;

COMMENT ON TABLE public.lease_adjustments IS 'History of a lease''s adjustments: an addendum says the values, else Kitnets'' calculation on the anniversary.';

-- Records adjustments and moves the lease's current amounts, in one transaction.
--
-- p_rows: [{effective_date, source, index_code, index_pct, index_factor, previous_rent, new_rent,
--           previous_condo, new_condo, condo_factor, document_id, notes}]
-- p_replace = false (the daily calculation): insert only. When any of the dates is already recorded
--   somebody else got there first — nothing changes and the answer is STALE, so two readers that
--   calculated from the same state never adjust twice.
-- p_replace = true (an addendum saved by the owner): the rows are the lease's whole history from now on —
--   they take the place of whatever their dates had, and a date left out of them is removed (the
--   calculated row of the anniversary an addendum stands for).
-- p_rent / p_condo: the lease's amounts after the last row; p_condo NULL leaves the condominium alone.
CREATE OR REPLACE FUNCTION public.lease_adjustments_record(
    p_lease_id UUID,
    p_rows     JSONB,
    p_rent     NUMERIC,
    p_condo    NUMERIC,
    p_replace  BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_lease UUID;
BEGIN
    SELECT l.id INTO v_lease FROM public.leases l WHERE l.id = p_lease_id AND l.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RETURN 'EMPTY'; END IF;

    IF NOT p_replace AND EXISTS (
        SELECT 1
        FROM public.lease_adjustments a
        JOIN jsonb_array_elements(p_rows) r ON (r->>'effective_date')::date = a.effective_date
        WHERE a.lease_id = p_lease_id
    ) THEN
        RETURN 'STALE';
    END IF;

    IF p_replace THEN
        DELETE FROM public.lease_adjustments a
        WHERE a.lease_id = p_lease_id
          AND a.effective_date NOT IN (SELECT (r->>'effective_date')::date FROM jsonb_array_elements(p_rows) r);
    END IF;

    INSERT INTO public.lease_adjustments AS a (
        lease_id, effective_date, source, index_code, index_pct, index_factor,
        previous_rent, new_rent, previous_condo, new_condo, condo_factor, document_id, notes
    )
    SELECT p_lease_id, (r->>'effective_date')::date, r->>'source', r->>'index_code',
           (r->>'index_pct')::numeric, (r->>'index_factor')::numeric,
           (r->>'previous_rent')::numeric, (r->>'new_rent')::numeric,
           (r->>'previous_condo')::numeric, (r->>'new_condo')::numeric, (r->>'condo_factor')::numeric,
           (r->>'document_id')::uuid, r->>'notes'
    FROM jsonb_array_elements(p_rows) r
    ON CONFLICT (lease_id, effective_date) DO UPDATE SET
        source = EXCLUDED.source,
        index_code = EXCLUDED.index_code,
        index_pct = EXCLUDED.index_pct,
        index_factor = EXCLUDED.index_factor,
        previous_rent = EXCLUDED.previous_rent,
        new_rent = EXCLUDED.new_rent,
        previous_condo = EXCLUDED.previous_condo,
        new_condo = EXCLUDED.new_condo,
        condo_factor = EXCLUDED.condo_factor,
        document_id = EXCLUDED.document_id,
        notes = EXCLUDED.notes;

    UPDATE public.leases SET monthly_rent = p_rent WHERE id = p_lease_id;
    IF p_condo IS NOT NULL THEN
        UPDATE public.lease_charges SET amount = p_condo WHERE lease_id = p_lease_id AND charge_type = 'CONDOMINIUM';
    END IF;
    RETURN 'OK';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lease_adjustments_record(UUID, JSONB, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_adjustments_record(UUID, JSONB, NUMERIC, NUMERIC, BOOLEAN) TO service_role;

-- Removes the lease's latest adjustment when it is an addendum, putting the amounts back to what they
-- were before it (a calculated row is never removed: the daily calculation would write it again).
CREATE OR REPLACE FUNCTION public.lease_adjustment_remove(p_lease_id UUID, p_adjustment_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_row public.lease_adjustments%ROWTYPE;
BEGIN
    PERFORM 1 FROM public.leases l WHERE l.id = p_lease_id AND l.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;

    SELECT * INTO v_row FROM public.lease_adjustments a WHERE a.id = p_adjustment_id AND a.lease_id = p_lease_id;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF v_row.source <> 'ADDENDUM' THEN RETURN 'NOT_ADDENDUM'; END IF;
    IF EXISTS (SELECT 1 FROM public.lease_adjustments a WHERE a.lease_id = p_lease_id AND a.effective_date > v_row.effective_date) THEN
        RETURN 'NOT_LATEST';
    END IF;

    DELETE FROM public.lease_adjustments WHERE id = v_row.id;
    UPDATE public.leases SET monthly_rent = v_row.previous_rent WHERE id = p_lease_id;
    IF v_row.previous_condo IS NOT NULL AND v_row.new_condo IS NOT NULL THEN
        UPDATE public.lease_charges SET amount = v_row.previous_condo WHERE lease_id = p_lease_id AND charge_type = 'CONDOMINIUM';
    END IF;
    RETURN 'OK';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lease_adjustment_remove(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_adjustment_remove(UUID, UUID) TO service_role;
