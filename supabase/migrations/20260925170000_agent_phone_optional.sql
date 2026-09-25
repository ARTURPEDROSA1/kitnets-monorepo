-- A corretor's phone is no longer required: lease agreements name the agency's representative
-- (with their CRECI) far more often than they give that person's own phone, and the Contratos
-- AI import now registers the corretor from the contract. The phone gets filled in later on
-- the Corretores page, like a tenant's (migration 20260918120000_tenant_main_phone_optional).
ALTER TABLE "public"."agents" ALTER COLUMN "main_phone" DROP NOT NULL;

COMMENT ON COLUMN "public"."agents"."main_phone" IS 'Phone in E.164 (+5531999999999); NULL when not known yet (e.g. a corretor registered from a lease agreement).';
