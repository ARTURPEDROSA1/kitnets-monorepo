-- Contratos: the condominium that is readjusted together with the rent.
--
-- A lease's condominium charge often follows the rent's own rule — same index, same anniversary. The
-- owner says so with "Reajusta com o aluguel"; the screens then show the next adjustment date and
-- the amount corrected by the index to date, as they do for the rent. false = the charge keeps its
-- own rule (adjustment_index / adjustment_notes), as before.

ALTER TABLE public.lease_charges
    ADD COLUMN IF NOT EXISTS adjusts_with_rent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lease_charges.adjusts_with_rent IS 'The charge (the condominium) is readjusted with the rent: same index, same date.';
