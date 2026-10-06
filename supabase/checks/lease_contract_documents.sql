-- Behaviour checks for migrations/20261005130000_lease_contract_documents.sql (run by the db workflow
-- after every migration is applied; one rolled-back transaction).
BEGIN;

DO $$
DECLARE
    v_owner UUID; v_property UUID; v_tenant UUID; v_lease UUID; v_doc UUID;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_contract_doc_owner') RETURNING id INTO v_owner;
    INSERT INTO public.properties (name, owner_id) VALUES ('Kitnets', v_owner) RETURNING id INTO v_property;
    INSERT INTO public.tenants (user_id, full_name, cpf, property_id, management_type)
    VALUES (v_owner, 'Inquilino', '52998224725', v_property, 'SELF_MANAGED') RETURNING id INTO v_tenant;
    INSERT INTO public.leases (user_id, property_id, primary_tenant_id, management_type, start_date, end_date, monthly_rent, rent_due_day, status)
    VALUES (v_owner, v_property, v_tenant, 'SELF_MANAGED', '2025-09-15', '2028-03-15', 1324.31, 10, 'DRAFT') RETURNING id INTO v_lease;

    INSERT INTO public.lease_contract_documents (lease_id, content) VALUES (v_lease, '{"type":"doc","content":[]}') RETURNING id INTO v_doc;
    RAISE NOTICE 'ok: a lease gets its contract draft';

    BEGIN
        INSERT INTO public.lease_contract_documents (lease_id, content) VALUES (v_lease, '{"type":"doc","content":[]}');
        RAISE EXCEPTION 'FAIL: a second document for the same lease was accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: one document per lease';
    END;

    BEGIN
        UPDATE public.lease_contract_documents SET status = 'ACCEPTED' WHERE id = v_doc;
        RAISE EXCEPTION 'FAIL: accepted without its PDF';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: an accepted text always has its PDF';
    END;
    UPDATE public.lease_contract_documents SET status = 'ACCEPTED', pdf_path = 'x/contrato.pdf', accepted_at = NOW() WHERE id = v_doc;

    BEGIN
        UPDATE public.lease_contract_documents SET status = 'SIGNED' WHERE id = v_doc;
        RAISE EXCEPTION 'FAIL: signed without a signed copy';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: a signed contract always has its signed copy';
    END;

    BEGIN
        UPDATE public.lease_contract_documents SET share_token = 'not-a-token' WHERE id = v_doc;
        RAISE EXCEPTION 'FAIL: a malformed signing token was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the signing token is 64 hex characters';
    END;
    UPDATE public.lease_contract_documents SET share_token = repeat('ab', 32), share_expires_at = NOW() + INTERVAL '30 days' WHERE id = v_doc;

    DELETE FROM public.leases WHERE id = v_lease;
    PERFORM 1 FROM public.lease_contract_documents WHERE id = v_doc;
    IF FOUND THEN RAISE EXCEPTION 'FAIL: the document outlived its lease'; END IF;
    RAISE NOTICE 'ok: deleting the lease deletes its document';
END $$;

ROLLBACK;
