-- A tenant's phone is no longer required: lease agreements (the source of the
-- AI import on Contratos) never carry it, so tenants created from a contract
-- start without one and get it filled in later on the Inquilinos page.
ALTER TABLE "public"."tenants" ALTER COLUMN "main_phone" DROP NOT NULL;
