-- Contratos: the contract document Kitnets writes for a lease (lib/contract/template.ts), as the owner
-- edits, accepts and gets it signed on gov.br.
--
-- One row per lease. `content` is the editor's document (ProseMirror JSON), `options` the clause
-- choices it was written from. Accepting stores the PDF the parties sign (`pdf_path`, in the
-- lease-documents bucket) and freezes the text; each copy that comes back with more signatures —
-- uploaded by the owner, or by the tenant through the signing link — becomes `signed_path` and is kept
-- in `versions`. When every party signed, the copy becomes the lease's CONTRACT file
-- (`signed_document_id`). Written and read by the API with the service role.

CREATE TABLE IF NOT EXISTS public.lease_contract_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lease_id            UUID NOT NULL UNIQUE REFERENCES public.leases(id) ON DELETE CASCADE,
    content             JSONB NOT NULL,
    options             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACCEPTED', 'SIGNED')),
    accepted_at         TIMESTAMPTZ,
    pdf_path            TEXT,
    signed_path         TEXT,
    -- one entry per copy received: {path, at, by: OWNER | TENANT, count, signers}
    versions            JSONB NOT NULL DEFAULT '[]'::jsonb,
    signature_count     INTEGER NOT NULL DEFAULT 0 CHECK (signature_count >= 0),
    -- the signers read from the latest copy: [{name, cpf}]
    signers             JSONB NOT NULL DEFAULT '[]'::jsonb,
    required_signatures INTEGER NOT NULL DEFAULT 2 CHECK (required_signatures BETWEEN 1 AND 20),
    signed_at           TIMESTAMPTZ,
    signed_document_id  UUID REFERENCES public.lease_documents(id) ON DELETE SET NULL,
    -- the tenant's signing link (/assinar/<token>) and until when it works
    share_token         TEXT UNIQUE CHECK (share_token IS NULL OR share_token ~ '^[0-9a-f]{64}$'),
    share_expires_at    TIMESTAMPTZ,
    shared_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- a text accepted (or signed) always has the PDF it was accepted as
    CONSTRAINT lease_contract_documents_accepted_has_pdf CHECK (status = 'DRAFT' OR (pdf_path IS NOT NULL AND accepted_at IS NOT NULL)),
    CONSTRAINT lease_contract_documents_signed_has_copy CHECK (status <> 'SIGNED' OR (signed_path IS NOT NULL AND signed_at IS NOT NULL))
);

DROP TRIGGER IF EXISTS trg_lease_contract_documents_updated_at ON public.lease_contract_documents;
CREATE TRIGGER trg_lease_contract_documents_updated_at
    BEFORE UPDATE ON public.lease_contract_documents
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.lease_contract_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lease_contract_documents FROM anon, authenticated;

COMMENT ON TABLE public.lease_contract_documents IS 'The contract document Kitnets writes for a lease: the edited text, the accepted PDF and the signed copies (gov.br).';
