-- Property taxes: fields extracted from the IPTU document (DAM) and the current PDF.
--
-- The AI import reads the municipal DAM and stores the assessment fields so the
-- register can show how the taxable value and the rate move over time. One PDF
-- per property is kept in the private bucket `property-taxes` as
-- {propertyId}/current_iptu.pdf (same approach as energy-bills/current_bill.pdf);
-- `document_path` marks the row the current PDF belongs to.

ALTER TABLE public.property_taxes
    ADD COLUMN IF NOT EXISTS municipio           TEXT,
    ADD COLUMN IF NOT EXISTS inscricao           TEXT,
    ADD COLUMN IF NOT EXISTS referencia          TEXT,             -- "Única", "1/6"…
    ADD COLUMN IF NOT EXISTS vencimento          DATE,
    ADD COLUMN IF NOT EXISTS area_terreno        NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS area_construida     NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS valor_venal_terreno NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS valor_venal_predial NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS valor_venal_imovel  NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS aliquota_pct        NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS valor_imposto       NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS coleta_lixo         NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS tsa                 NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS desconto            NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS document_path       TEXT,
    ADD COLUMN IF NOT EXISTS extracted_at        TIMESTAMPTZ;

COMMENT ON COLUMN public.property_taxes.document_path IS
    'Storage path of the current IPTU PDF in bucket property-taxes ({propertyId}/current_iptu.pdf). Only one row per property carries it.';

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-taxes', 'property-taxes', false)   -- current_iptu.pdf per property (signed URLs)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
