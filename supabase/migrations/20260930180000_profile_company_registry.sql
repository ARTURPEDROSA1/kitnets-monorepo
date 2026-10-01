-- The owner page (/proprietario) is now the holding's flat record, filled by the "Comprovante de
-- Inscrição e de Situação Cadastral" (the Cartão CNPJ) the owner imports:
--
-- * profiles.company_registry keeps everything read from the card (razão social, nome fantasia,
--   abertura, situação cadastral, natureza jurídica, porte, CNAE principal, CNAEs secundários,
--   endereço da sede, telefone, e-mail, ente federativo, situação especial, who read it and when,
--   the file's path). The scalar columns the app already had (cnpj, business_name, trade_name,
--   registration_status_date, address) are mirrored from it, so nothing that reads them changes.
--   lib/cnpj-card-extract.ts says the shape.
-- * profile_documents lists the owner's own files (the Cartão CNPJ, the contrato social, others) in
--   the private "documents" bucket under <profile id>/company/…, the way ownership_proofs lists a
--   property's. Service role only (the API checks the Clerk session), like the other tables.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_registry JSONB;
COMMENT ON COLUMN public.profiles.company_registry IS 'What the Cartão CNPJ says about the holding (lib/cnpj-card-extract.ts CompanyRegistry); the cnpj/business_name/trade_name/registration_status_date/address columns mirror it.';

CREATE TABLE IF NOT EXISTS public.profile_documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category      TEXT NOT NULL CHECK (category IN ('cnpj_card', 'social_contract', 'other')),
    path          TEXT NOT NULL,
    original_name TEXT,
    mime_type     TEXT,
    file_size     BIGINT CHECK (file_size IS NULL OR file_size >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_documents_profile_idx ON public.profile_documents (profile_id, created_at DESC);

COMMENT ON TABLE public.profile_documents IS 'The owner''s own documents (Cartão CNPJ, contrato social, others) in the private documents bucket; served through signed URLs by the API.';
COMMENT ON COLUMN public.profile_documents.path IS 'Object path in the private "documents" bucket (<profile id>/company/<category>/<file>).';

ALTER TABLE public.profile_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_documents FROM anon, authenticated;
