-- Contratos: the tenant's notice of departure (aviso de desocupação).
--
-- After the first months a tenant may give the property back by telling the owner (an e-mail, a letter)
-- that they will leave on a date ahead — usually 30 days later. Until then the lease is still in force:
-- the rent runs, the contract stays among the ones in force. So a notice is a lease in force (ACTIVE /
-- EXPIRING_SOON) whose termination_date is the planned move-out day; notice_date is when the tenant
-- gave notice. The day after the move-out the API closes it as TERMINATED (the daily cron and the
-- Contratos loaders). A rescission typed with a date ahead used to close the lease at once: those are
-- notices too, and go back in force until their date.

ALTER TABLE public.leases
    ADD COLUMN IF NOT EXISTS notice_date DATE;

COMMENT ON COLUMN public.leases.notice_date IS 'When the tenant gave notice of leaving (aviso de desocupação); with the lease in force, termination_date is the planned move-out day.';

-- the notice itself and the closing term join the kinds of file a lease keeps
ALTER TABLE public.lease_documents DROP CONSTRAINT IF EXISTS lease_documents_document_type_check;
ALTER TABLE public.lease_documents
    ADD CONSTRAINT lease_documents_document_type_check
    CHECK (document_type = ANY (ARRAY['CONTRACT', 'ADDENDUM', 'INSPECTION', 'TENANT_DOC', 'DEPOSIT_RECEIPT', 'NOTICE', 'TERMINATION', 'OTHER']));

-- before notices existed, a lease in force had no business with a termination date: one made active again
-- after a rescission kept the date that had closed it (the contract then seemed to end on it). It runs on.
UPDATE public.leases
SET termination_date = NULL, termination_reason = NULL
WHERE status IN ('ACTIVE', 'EXPIRING_SOON')
  AND termination_date IS NOT NULL
  AND notice_date IS NULL
  AND deleted_at IS NULL;

-- a rescission dated ahead is a notice: in force until that day (given when the rescission was typed)
UPDATE public.leases
SET status = 'ACTIVE', notice_date = COALESCE(notice_date, (updated_at AT TIME ZONE 'America/Sao_Paulo')::date)
WHERE status = 'TERMINATED'
  AND termination_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND deleted_at IS NULL;

-- No adjustment from the notice on: the calculated adjustments recorded on or after the notice date go and
-- the lease's amounts go back to what they were before them (a notice dated back past an anniversary). An
-- addendum on or after the date is an agreement the parties signed: then nothing is removed. → rows removed.
CREATE OR REPLACE FUNCTION public.lease_adjustments_drop_from(p_lease_id UUID, p_from DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_first public.lease_adjustments%ROWTYPE;
    v_moves_charge BOOLEAN;
    v_count INTEGER;
BEGIN
    PERFORM 1 FROM public.leases l WHERE l.id = p_lease_id AND l.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN 0; END IF;
    IF EXISTS (SELECT 1 FROM public.lease_adjustments a WHERE a.lease_id = p_lease_id AND a.effective_date >= p_from AND a.source = 'ADDENDUM') THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_first FROM public.lease_adjustments a
    WHERE a.lease_id = p_lease_id AND a.effective_date >= p_from
    ORDER BY a.effective_date
    LIMIT 1;
    IF NOT FOUND THEN RETURN 0; END IF;

    SELECT EXISTS (SELECT 1 FROM public.lease_adjustments a WHERE a.lease_id = p_lease_id AND a.effective_date >= p_from AND a.new_condo IS NOT NULL)
    INTO v_moves_charge;

    DELETE FROM public.lease_adjustments a WHERE a.lease_id = p_lease_id AND a.effective_date >= p_from;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.leases SET monthly_rent = v_first.previous_rent WHERE id = p_lease_id;
    IF v_moves_charge AND v_first.previous_condo IS NOT NULL THEN
        UPDATE public.lease_charges SET amount = v_first.previous_condo
        WHERE lease_id = p_lease_id AND charge_type = COALESCE(v_first.charge_type, 'CONDOMINIUM');
    END IF;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lease_adjustments_drop_from(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_adjustments_drop_from(UUID, DATE) TO service_role;
