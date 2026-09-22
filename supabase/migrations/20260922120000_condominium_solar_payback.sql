-- Condomínio setting: whether the condominium's monthly result counts towards the solar energy payback.
--
-- Water, internet and IPTU are passed through to the units at cost; the condominium's monthly surplus
-- (condominium charged − its costs) is the saving the solar system makes on the energy bill. The owner decides, per condominium,
-- whether that monthly result is added to the "Recuperado" of the Energia solar card in Investimento no
-- imóvel (alongside the tenants' energy payments minus the energy cost). Off by default.

ALTER TABLE public.condominiums
    ADD COLUMN IF NOT EXISTS solar_payback_from_result boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.condominiums.solar_payback_from_result IS 'true = the condominium''s monthly result (revenue − costs) counts towards the property''s solar energy payback.';
