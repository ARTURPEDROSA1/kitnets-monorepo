-- Corretores: the CRECI is optional.
--
-- A lease agreement often names the agency's representative or the corretor without their CRECI, and
-- the import then could not register them. Like the phone (20260925170000_agent_phone_optional.sql),
-- the CRECI number and its UF may now be left empty (NULL). The unique index on (creci_number,
-- creci_state) stays: NULLs never collide, so any number of corretores may have no CRECI.

ALTER TABLE "public"."agents" ALTER COLUMN "creci_number" DROP NOT NULL;
ALTER TABLE "public"."agents" ALTER COLUMN "creci_state" DROP NOT NULL;
