# AI Ownership Confirmation (AOC) v1.0 - Implementation & Strategy

## Implementation Status

Per the SRS requirements, the following modules have been implemented:

1. **Frontend UX** (`StepOwnership.tsx`):
    * Drag & drop document upload.
    * Real-time processing status.
    * Review & Confirm UI with extracted data.
    * Dynamic confidence scoring display.
    * Verified state handling (skips upload for returning users).

2. **Backend Services** (`/api/ownership/analyze`):
    * Mocked AI Analysis simulating OCR and Extraction.
    * **Testable Triggers**:
        * Include "matricula" in filename -> Returns `MATRICULA` type with high confidence.
        * Include "iptu" in filename -> Returns `IPTU` type.
        * Include "luz" or "conta" -> Returns Utility Bill.
    * Classification and Confidence Scoring logic placeholders.

3. **Data Architecture** (`types/ownership.ts`):
    * Full `OwnershipClaim` schema.
    * Document types and Extraction interfaces.

## Paid Verification Strategy Recommendations

Per the request for recommendations on the **Paid Verification Hook**:

### 1. Product Placement (The "Hook")

* **Immediate Upsell**: If the system outputs `NEEDS_MORE_DOCS` or `MANUAL_REVIEW` (Score < 60), show a "Fast Track" option immediately.
  * *Copy*: "Difficulty proving ownership? Get verified by our experts in 24h."
* **Trust Badge Upsell**: For successfully verified users, offer a "Premium Verified" badge that boosts listing visibility.

### 2. SKU Structure (Stripe/Payment)

We recommend creating three distinct SKUs:

1. **`VERIFY_BASIC` (Free)**: Automated AI check.
2. **`VERIFY_MANUAL` (R$ 29,90)**: Human review if AI fails. Guaranteed response in 48h.
3. **`VERIFY_CERTIFIED` (R$ 99,90)**: Full "Matrícula" checkout at the registry (requires integration with API like *BuscaLegal* or *Cartorios*).

### 3. Workflow Integration

* **Trigger**: In `StepOwnership.tsx`, if `overall_score < threshold`, replace the "Confirm" button with two options:
  * "Upload more documents" (Secondary)
  * "Request Manual Verification (Paid)" (Primary)
* **Status**: Add `PENDING_PAYMENT` to the `OwnershipClaim` status enum.

### 4. Technical Implementation

* Create table `verification_orders` linking `user_id`, `claim_id`, and `payment_intent_id`.
* Webhook listener for payment success -> Transitions claim from `PENDING_PAYMENT` to `MANUAL_REVIEW_QUEUE`.

## Next Steps (v1.1)

1. Connect a real OCR provider (Google Cloud Vision or AWS Textract).
2. Implement the Admin Review Queue to handle cases flagged as `MANUAL_REVIEW`.
3. Integrate the Payment Gateway for the recommended SKUs.
