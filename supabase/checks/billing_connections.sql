-- Behaviour checks for migrations/20261002230000_billing_connections.sql (run by the db workflow after
-- every migration is applied; one rolled-back transaction).

BEGIN;

DO $$
DECLARE
    v_owner UUID;
    v_other UUID;
    v_id    UUID;
BEGIN
    INSERT INTO public.profiles (clerk_id) VALUES ('check_conn_owner') RETURNING id INTO v_owner;
    INSERT INTO public.profiles (clerk_id) VALUES ('check_conn_other') RETURNING id INTO v_other;

    -- 1. Service role only.
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.billing_connections'::regclass) THEN
        RAISE EXCEPTION 'FAIL: RLS is off on billing_connections';
    END IF;
    IF has_table_privilege('anon', 'public.billing_connections', 'SELECT') OR has_table_privilege('authenticated', 'public.billing_connections', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: billing_connections is readable by a browser role';
    END IF;
    RAISE NOTICE 'ok: the connections are service-role only';

    -- 2. A sealed secret always names the key that sealed it.
    BEGIN
        INSERT INTO public.billing_connections (owner_id, provider, secret_ciphertext) VALUES (v_owner, 'INTER', 'v1.abcd1234.iv.tag.data');
        RAISE EXCEPTION 'FAIL: a secret without its key id was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: a secret names its key';
    END;
    BEGIN
        INSERT INTO public.billing_connections (owner_id, provider, token_ciphertext) VALUES (v_owner, 'INTER', 'v1.abcd1234.iv.tag.data');
        RAISE EXCEPTION 'FAIL: a token without an expiry was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: a kept token has an expiry';
    END;

    -- 3. One row per owner and provider; the same integration cannot be registered by another account.
    INSERT INTO public.billing_connections (owner_id, provider, environment, credential_fingerprint, secret_ciphertext, secret_key_id, metadata)
    VALUES (v_owner, 'INTER', 'PRODUCTION', 'fp-1', 'v1.abcd1234.iv.tag.data', 'abcd1234', '{"client_id_tail": "…1234"}') RETURNING id INTO v_id;
    BEGIN
        INSERT INTO public.billing_connections (owner_id, provider) VALUES (v_owner, 'INTER');
        RAISE EXCEPTION 'FAIL: a second Inter connection for the same owner was accepted' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: one connection per owner and provider';
    END;
    BEGIN
        INSERT INTO public.billing_connections (owner_id, provider, environment, credential_fingerprint, secret_ciphertext, secret_key_id)
        VALUES (v_other, 'INTER', 'PRODUCTION', 'fp-1', 'v1.abcd1234.iv.tag.other', 'abcd1234');
        RAISE EXCEPTION 'FAIL: another account registered the same integration' USING ERRCODE = 'P0001';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'ok: an integration belongs to one owner';
    END;
    -- the same client id in the bank's sandbox is a different integration
    INSERT INTO public.billing_connections (owner_id, provider, environment, credential_fingerprint, secret_ciphertext, secret_key_id)
    VALUES (v_other, 'INTER', 'SANDBOX', 'fp-1', 'v1.abcd1234.iv.tag.other', 'abcd1234');
    RAISE NOTICE 'ok: sandbox and production integrations are told apart';

    -- 4. Only the providers and states the module knows.
    BEGIN
        UPDATE public.billing_connections SET status = 'MAYBE' WHERE id = v_id;
        RAISE EXCEPTION 'FAIL: junk accepted as a status' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the status is constrained';
    END;
    BEGIN
        INSERT INTO public.billing_connections (owner_id, provider) VALUES (v_owner, 'PAYPAL');
        RAISE EXCEPTION 'FAIL: junk accepted as a provider' USING ERRCODE = 'P0001';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok: the provider is constrained';
    END;

    -- 5. Deleting the owner takes the connection with it.
    DELETE FROM public.profiles WHERE id = v_owner;
    IF EXISTS (SELECT 1 FROM public.billing_connections WHERE id = v_id) THEN
        RAISE EXCEPTION 'FAIL: the connection outlived its owner';
    END IF;
    RAISE NOTICE 'ok: the connection goes with the owner';
END;
$$;

ROLLBACK;
