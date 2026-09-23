-- Who paid an instalment: the person (PF), the company (PJ), or both.
--
-- An off-plan instalment is routinely settled from more than one pocket — the owner's own account
-- and the holding's — and the split matters for tax. A payment now carries a payer and, when the
-- payer is both, the PJ share; the PF share is whatever is left of the paid total, so the two can
-- never disagree. NULL payer = not recorded, which is what every existing row is.
--
-- A split also needs both receipts on the one row, so receipts stop being a single path on the
-- payment and become documents that point at their payment. The path the payment already held is
-- kept as a mirror of the first receipt and backfilled into the link.

ALTER TABLE public.new_investment_payments
    ADD COLUMN IF NOT EXISTS payer     TEXT CHECK (payer IS NULL OR payer IN ('PF', 'PJ', 'SPLIT')),
    ADD COLUMN IF NOT EXISTS pj_amount NUMERIC(14, 2) CHECK (pj_amount IS NULL OR pj_amount >= 0);

COMMENT ON COLUMN public.new_investment_payments.payer IS
    'Quem pagou: PF (pessoa física), PJ (pessoa jurídica) ou SPLIT (os dois). NULL = não informado.';
COMMENT ON COLUMN public.new_investment_payments.pj_amount IS
    'Parte paga pela PJ quando payer = SPLIT; a parte PF é o restante do valor pago.';

ALTER TABLE public.new_investment_documents
    ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.new_investment_payments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_new_investment_documents_payment
    ON public.new_investment_documents (payment_id);

-- The receipt a payment already points at is that payment's receipt.
UPDATE public.new_investment_documents d
SET payment_id = p.id
FROM public.new_investment_payments p
WHERE d.payment_id IS NULL
  AND p.receipt_path IS NOT NULL
  AND d.storage_path = p.receipt_path;
