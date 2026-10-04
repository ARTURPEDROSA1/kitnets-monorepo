-- Contratos: a house's energy is readjusted like the condominium.
--
-- Next to the rent, the adjustment history follows the property's own charge: the condominium of a
-- kitnet, or — in a contract without one, a house — the energy bill, often a fixed amount readjusted by
-- an index on the lease's anniversary. previous_condo / new_condo / condo_factor keep their names and
-- carry the charge named by charge_type; NULL (the rows written before) is the condominium.
--
-- The functions keep their signatures (a deploy of either side first keeps working): each row of p_rows
-- may say its charge_type, and the charge whose amount moves is the one the last row that changed it
-- names — the condominium when it names none.

ALTER TABLE public.lease_adjustments
    ADD COLUMN IF NOT EXISTS charge_type TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_adjustments_charge_type_check') THEN
        ALTER TABLE public.lease_adjustments
            ADD CONSTRAINT lease_adjustments_charge_type_check CHECK (charge_type IS NULL OR charge_type IN ('CONDOMINIUM', 'ELECTRICITY'));
    END IF;
END;
$$;

COMMENT ON COLUMN public.lease_adjustments.charge_type IS 'The charge previous_condo / new_condo / condo_factor carry: CONDOMINIUM, or ELECTRICITY in a contract without a condominium. NULL = CONDOMINIUM.';

-- p_rows: [{effective_date, source, index_code, index_pct, index_factor, previous_rent, new_rent,
--           previous_condo, new_condo, condo_factor, charge_type, document_id, notes}]
-- p_condo: the followed charge's amount after the last row; NULL leaves the charges alone.
-- The rest as in 20261003700000_lease_adjustments.sql.
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
    v_charge TEXT;
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
        previous_rent, new_rent, previous_condo, new_condo, condo_factor, charge_type, document_id, notes
    )
    SELECT p_lease_id, (r->>'effective_date')::date, r->>'source', r->>'index_code',
           (r->>'index_pct')::numeric, (r->>'index_factor')::numeric,
           (r->>'previous_rent')::numeric, (r->>'new_rent')::numeric,
           (r->>'previous_condo')::numeric, (r->>'new_condo')::numeric, (r->>'condo_factor')::numeric,
           r->>'charge_type', (r->>'document_id')::uuid, r->>'notes'
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
        charge_type = EXCLUDED.charge_type,
        document_id = EXCLUDED.document_id,
        notes = EXCLUDED.notes;

    UPDATE public.leases SET monthly_rent = p_rent WHERE id = p_lease_id;
    IF p_condo IS NOT NULL THEN
        -- the charge the last row that moved it names
        SELECT r->>'charge_type' INTO v_charge
        FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(r, n)
        WHERE r->>'new_condo' IS NOT NULL
        ORDER BY n DESC
        LIMIT 1;
        UPDATE public.lease_charges SET amount = p_condo
        WHERE lease_id = p_lease_id AND charge_type = COALESCE(v_charge, 'CONDOMINIUM');
    END IF;
    RETURN 'OK';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lease_adjustments_record(UUID, JSONB, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_adjustments_record(UUID, JSONB, NUMERIC, NUMERIC, BOOLEAN) TO service_role;

-- Removing the latest addendum puts back the charge its row names.
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
        UPDATE public.lease_charges SET amount = v_row.previous_condo
        WHERE lease_id = p_lease_id AND charge_type = COALESCE(v_row.charge_type, 'CONDOMINIUM');
    END IF;
    RETURN 'OK';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lease_adjustment_remove(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_adjustment_remove(UUID, UUID) TO service_role;
