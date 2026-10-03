# Fatura (Tenant Invoicing) Module

**Version:** 0.4 (steps 1 to 4 of 7)  
**Last updated:** 2026-10-02  
**Author:** Kitnets Engineering

---

## 1. Overview

The **Fatura module** charges the tenant, month by month, for what is **not** collected by an agency: the rent of a self-managed lease, the condominium the owner collects on an agency-managed one (pilot: Kitnet 35C), and any fixed charge the tenant pays that the owner marked as theirs (IPTU, internet…).

The end state is automatic: every month the module issues a boleto + PIX through the Banco Inter API and a card link through Stripe, and e-mails them to the tenant. It ships in seven steps:

| Step | Delivers | State |
|---|---|---|
| 1 | Schema, who collects each component, the hub, invoices generated and settled by hand | live (PR #232) |
| 2 | Income ledger and books: what comes in directly from the tenant (`direct_*`), the condominium the owner collects (`condo_direct`), late fees | live (PR #233), §6 |
| 3 | The owner's own Banco Inter integration: sealed credentials, connection screen and test | live (PR #234), §7 |
| 4 | Boleto + PIX issued through Banco Inter, PDF, webhook, refresh from the bank | **this document, §8** |
| 5 | E-mail to the tenant, public payment page, daily cron | pending |
| 6 | Stripe Connect, card link with the fee passed on to the tenant | done |
| 7 | Dashboard card, reminder before the due date, overdue notice, receipt | done |

- **Hub** `/faturas` — KPI strip, "Atenção", then four sections: the invoices as a spreadsheet, "Cobranças recorrentes" (who collects each component of each lease in force), the billing conditions and "Conexões" (the owner's bank integration).
- **Invoice panel** `/faturas?id=<invoice>` — items, payer, the terms it states, payment, timeline; issue the boleto + Pix at the bank, copy the digitable line and the Pix code, open the PDF, refresh from the bank, record a payment by hand or cancel.
- **Sidebar** — "Fatura", between "Água" and "Imobiliária".

`/dashboard/billing` is the water bills page and has nothing to do with this module.

## 2. Who collects ("Emissor da fatura")

A lease says who **pays** a charge (`lease_charges.responsibility`). Who **collects** it is a separate answer, stored per component:

| Column | Component |
|---|---|
| `leases.rent_collected_by` | the rent |
| `lease_charges.collected_by` | each charge |

| Value | Meaning |
|---|---|
| `OWNER` | the owner charges the tenant: **it goes into the invoice** |
| `AGENCY` | the agency collects it and forwards it in its deposit |
| `THIRD_PARTY` | someone else bills the tenant: the building's own condominium (a studio in a building), the utility |
| `NULL` | not answered |

When nobody answered (`lib/invoice-collection.ts`, `resolveCollector`):

- **Rent and condominium** follow the lease's management — gestão própria: the owner; imobiliária: the agency; a lease brokered by a **corretor** stays open ("a definir") until the owner says.
- **Every other charge** stays out of the invoice: "paid by the tenant" often means paid straight to the supplier.

Only a charge the tenant pays (`responsibility = 'TENANT'`) has a collector, and only one with a fixed amount is billable. A utility can also be part of the condominium fee: `responsibility = 'INCLUDED_IN_CONDO'` ("Incluso no condomínio"), next to TENANT, LANDLORD and INCLUDED (in the rent).

The owner answers in two places, same columns:

- **Contratos → Encargos adicionais → "Emissor da fatura"**: one tick among Imobiliária, Proprietário, Terceiros on each charge the tenant pays.
- **Faturas → Cobranças recorrentes**: one line per lease and component, the rent included; also pauses a lease's invoicing (`leases.billing_paused`).

Charges are deleted and inserted again whenever a lease is saved (`writeLeaseChildren`). The form sends each charge's collector; the imports send none, and the charge then inherits the answer its predecessor had (same type and, for an "Outro", same label) — `inheritCollectors`.

## 3. Invoices

One invoice per lease and month (`reference_month` = the month of the due date). Items are a **snapshot** of the components the owner collects when it is created.

- Due date: `leases.billing_due_day`, else `rent_due_day`; a day the month does not have falls on its last day (`lib/invoice-schedule.ts`).
- A lease is charged while it is in force (a contract past its term keeps being charged until it is terminated), from its start, up to its termination.
- Payer: the tenant, with the property's address when the tenant has none of their own (contract import), the unit as the complement (`lib/invoice-payer.ts`). What is missing to issue a boleto and e-mail it becomes a **blocker** (`NO_EMAIL`, `INVALID_CPF`, `NO_ADDRESS`, `NO_CEP`): the invoice exists and can be settled by hand, but will never be issued on incomplete data.
- Only four states are stored: `DRAFT`, `ISSUED`, `PAID`, `CANCELLED`. "Em atraso" is read from the due date every time (`invoiceDisplay`), so it is never stale.
- A payment recorded by hand must cover the invoice's amount; what comes above it is the late fee.

### Billing conditions (`billing_settings`)

Days in advance, late fee (multa), interest (juros de mora) and how long after the due date the invoice still takes the payment. **Each is the owner's decision: blank is stored as NULL and nothing is assumed in its place.** An invoice created meanwhile states no late terms; the daily run cannot be switched on before they are decided, nor before the owner picks the first month it bills (CHECK `billing_settings_automation_needs_decisions`, mirrored by the zod schema). The owner may also choose how the tenant sees the sender of the e-mails (`sender_name`, else the holding's name) and where replies go (`reply_to_email`, else the profile's e-mail).

## 4. Files

```
apps/web/src/
├── app/[lang]/faturas/
│   ├── page.tsx                      # Server: preloads the list and the invoice of ?id=
│   └── FaturasContent.tsx            # Orchestrator: hub | invoice panel, the actions, the URL (?aba, ?view, ?id)
├── app/api/faturas/
│   ├── route.ts                      # GET (invoices + recurring + settings) · POST (generate a month)
│   ├── [id]/route.ts                 # GET (one invoice with payer and timeline)
│   ├── [id]/pagar/route.ts           # POST (baixa manual)
│   ├── [id]/emitir/route.ts          # POST (boleto + Pix at the bank; due_date moves a passed date first)
│   ├── [id]/atualizar/route.ts       # POST (read the boleto back from the bank)
│   ├── [id]/pdf/route.ts             # GET (signed URL of the boleto's PDF)
│   ├── [id]/pagar-sandbox/route.ts   # POST (the bank's sandbox pays; outside production only)
│   ├── [id]/cancelar/route.ts        # POST (cancels the boleto at the bank first)
│   ├── [id]/reenviar/route.ts        # POST (the e-mail to the tenant, again)
│   ├── [id]/copia/route.ts           # POST { email } (a copy of the tenant's e-mail to the address the owner types)
│   ├── cobrancas/route.ts            # PUT (who collects a component · pause a lease)
│   ├── configuracoes/route.ts        # PUT (billing conditions)
│   └── conexoes/                     # GET (status) · inter: PUT (save + test) · DELETE · inter/testar: POST · stripe: POST (re-read) · DELETE · stripe/iniciar: POST · stripe/retorno: GET
├── app/api/webhooks/inter/[key]/route.ts # POST: the bank's callbacks (no Clerk; the key leads to one connection)
├── app/api/cron/faturas/route.ts     # GET: the daily run (cron secret; vercel.json 08:00 BRT)
├── app/[lang]/pagar/[token]/page.tsx # The tenant's page: Pix QR code, copia e cola, linha digitável, PDF (no login, noindex)
├── app/api/pagar/[token]/boleto/route.ts # GET: redirect to the boleto's PDF (no login; IP limit)
├── app/api/pagar/[token]/cartao/route.ts # POST: opens the Stripe Checkout Session and sends the tenant there (no login; IP limit)
├── app/api/webhooks/stripe/route.ts  # POST: Stripe's Connect webhook (signature on the raw body; sessions read back)
├── app/api/webhooks/resend/route.ts  # POST: Resend's webhook (Svix signature): delivered / bounced / complained
├── components/pagar/CopyCode.tsx     # the copy button of the tenant's page
├── components/faturas/
│   ├── FaturasHub.tsx                # KPI strip, "Atenção", sections, view pills, search
│   ├── InvoiceTable.tsx              # The invoices as a spreadsheet (table key `invoices`)
│   ├── RecurringChargesTable.tsx     # Lease × component, the "quem cobra" select (table key `invoice-recurring`)
│   ├── BillingSettingsPanel.tsx      # The owner's decisions, the sender, the automation switch
│   ├── ConnectionsPanel.tsx          # The owner's Banco Inter integration: credentials in, status and test out
│   ├── StripeConnectionCard.tsx      # The owner's Stripe account: connect (OAuth), standing, disconnect
│   ├── InvoiceDetail.tsx             # One invoice's panel
│   └── InvoiceActionModals.tsx       # Record a payment · cancel
├── components/contratos/LeaseForm.tsx  # "Emissor da fatura" on each charge; "Incluso no condomínio"
└── lib/
    ├── invoice-collection.ts (+ test) # collectors, components of a lease, billable items, inheritCollectors
    ├── invoice-schedule.ts (+ test)   # due date, reference month, whether a lease is charged
    ├── invoice-payer.ts (+ test)      # the payer and the blockers
    ├── invoice-generate.ts (+ test)   # planInvoice: one lease's invoice for a month, or why not
    ├── invoice-hub.ts (+ test)        # display status, views, rows, totals, attention
    ├── invoice-views.ts               # the shapes the pages render (types only)
    ├── invoice-views-server.ts        # loaders shared by the page and the API
    ├── invoices-server.ts             # generate, cancel, pay, who collects, settings
    ├── schemas/invoice.ts (+ test)    # zod schemas of the routes
    ├── schemas/billing-connection.ts (+ test)
    ├── secret-box.ts (+ test)         # AES-256-GCM sealing with the server's master key, bound to owner and provider
    └── billing/
        ├── connections.ts (+ test)        # the connections as the screens see them, certificate standing, attention
        ├── connections-server.ts          # save (sealed), test, delete, and the session the bank calls use
        ├── inter-credentials.ts (+ test)  # certificate/key check, scopes, the bank's hosts
        ├── inter-client.ts (+ test)       # mutual TLS to the bank's API (node:https): token, charges, PDF, cancel, webhook
        ├── inter-payload.ts (+ test)      # the charge's body, the bank's states, what the webhook is trusted for
        ├── charges-server.ts              # issue, refresh, cancel at the bank, PDF, the webhook's handling; a boleto turning OPEN e-mails the tenant
        ├── invoice-email.ts (+ test)      # the e-mails: invoice, reminder, overdue notice, receipt; the sender's display name
        ├── email-provider.ts (+ test)     # Resend over fetch, idempotency key = delivery id
        ├── resend-webhook.ts (+ test)     # the Svix signature and the event of Resend's webhook
        ├── deliveries-server.ts           # queue, claim, send; resend by the owner
        ├── public-invoice.ts (+ test)     # what the tenant's page shows, the token's shape, the masked CPF
        ├── public-invoice-server.ts       # the invoice behind a token (refreshes a stale boleto first)
        ├── automation-server.ts (+ test)  # the daily run: reconcile, generate, issue, remind, send — per owner, within a time budget
        ├── reminder-schedule.ts (+ test)  # which reminder an open invoice is due today (before / overdue), from the owner's days
        ├── stripe-client.ts (+ test)      # Stripe over fetch: Connect OAuth, the account, Checkout Sessions on the connected account, the webhook's signature
        ├── stripe-connection-server.ts    # connect (state + OAuth code → account id), re-read, disconnect, the account's owner
        ├── card-offer.ts (+ test)         # whether and for how much the card is offered today (late charges + fee)
        ├── card-server.ts                 # the Checkout Session: open (one at a time), read back, settle as CARD, cancel the boleto; the webhook's handling
        ├── invoice-token-server.ts        # the invoice behind a public token
        └── inter-test-certs.ts            # throwaway certificates for the tests (openssl at test time)
    ├── card-gross-up.ts (+ test)      # the card fee passed on: gross = ceil((net + fixed) / (1 − pct))
    ├── invoice-late-fees.ts (+ test)  # multa once + juros pro rata die, from the invoice's terms (the card's late charges)
    ├── property-income.ts (+ test)    # the ledger's money model: deposit + what was paid by invoice
    └── property-income-readers.test.ts # every reader of the ledger selects the invoice columns

supabase/
├── migrations/20261002120000_invoices_core.sql
├── migrations/20261002200000_invoice_ledger.sql
├── migrations/20261002230000_billing_connections.sql
├── migrations/20261003000000_invoice_charges.sql
├── migrations/20261003100000_invoice_deliveries.sql
├── migrations/20261003200000_card_checkout.sql
├── migrations/20261003300000_invoice_reminders.sql
├── migrations/20261003400000_invoice_tracking.sql
└── checks/invoices.sql, invoice_ledger.sql, billing_connections.sql, invoice_charges.sql, invoice_deliveries.sql, card_checkout.sql, invoice_reminders.sql, invoice_tracking.sql
```

## 5. Database

Migration `20261002120000_invoices_core.sql` (service role only: RLS on, nothing granted to `anon` / `authenticated`):

| Object | What it holds |
|---|---|
| `leases.rent_collected_by`, `billing_due_day`, `billing_email`, `billing_paused` | who collects the rent and how the lease is billed |
| `lease_charges.collected_by` | who collects the charge; `responsibility` now also takes `INCLUDED_IN_CONDO` |
| `billing_settings` | one row per owner: the billing decisions, NULL until decided |
| `invoices` | one per lease and month; numbered per owner; unique partial index `(lease_id, reference_month) WHERE status <> 'CANCELLED'` |
| `invoice_items` | snapshot lines (`RENT`, `CONDOMINIUM`, `IPTU`…) |
| `invoice_events` | timeline (`CREATED`, `PAID`, `CANCELLED`, `DUPLICATE_PAYMENT`) |
| `invoice_create(owner, invoice, items)` | creates invoice + items atomically; NULL when the month already has a live invoice |
| `invoice_cancel(owner, invoice, reason)` | cancels an open invoice, records the event, re-syncs the ledger (step 2) |
| `invoice_mark_paid(…)` | the only way to `PAID`: `PAID`, `ALREADY` (same payment again) or `DUPLICATE` (another payment, or a cancelled invoice — recorded, never applied) |

`supabase/checks/invoices.sql` exercises all of it in one rolled-back transaction.

## 6. The income ledger and the books (step 2)

A ledger row (`property_income_months`: one per property, month and unit) used to know one way for money to arrive: the agency's deposit (`received_amount`), with the tenant's condominium assumed to be inside it. An invoice is a second way in, and it carries no agency fee (migration `20261002200000_invoice_ledger.sql`):

| Column | Meaning |
|---|---|
| `direct_rent`, `direct_condo`, `direct_energy`, `direct_other` | paid by the tenant by invoice. **Never typed**: recomputed from the PAID invoices of the row's property, month and unit |
| `condo_direct` | the owner collects the unit's condominium this month: it is **not** inside the agency's deposit, so the deposit is all rent |
| `source = 'INVOICE'` | a row the sync had to create (no deposit recorded for the month yet) |

`received_amount` keeps its meaning, so everything that edits or imports the deposit works as before, and rows without invoices compute exactly as they did.

**The money model** (`lib/property-income.ts`, `breakdown`): `received = deposit + direct_*`; the agency's fee applies to the deposit's rent only; `gross rent = deposit's rent ÷ (1 − fee) + direct_rent`; `condo_direct` takes the condominium out of the deposit. Kitnet 35C — rent 1.000 through the agency at 10 %, condominium 150 by invoice — reads: deposit 900, gross 1.000, fee 100, received 1.050, NOI 900 (before `condo_direct` the model took 150 out of the 900 and showed a gross rent of 833,33).

**The sync** (`invoice_sync_ledger`, called by `invoice_create`, `invoice_mark_paid` and `invoice_cancel`):

- An open invoice leaves an **expected** month (created if missing: `source INVOICE`, the agency's terms of the unit's previous month) and marks `condo_direct` when it bills the condominium.
- A paid invoice puts each item in its column: rent, condominium, energy; IPTU, water, gas, internet and others add into `direct_other`. A row the invoice made becomes confirmed on the payment date; a row the owner or the bank wrote keeps its own status, date and deposit.
- It recomputes, never adds: running it twice changes nothing. Late fees and the card surcharge never enter the ledger.
- A cancelled open invoice takes away the month it had made, when nothing else is on it.
- `invoice_sync_property` re-syncs every key of a property; the ledger route calls it after a spreadsheet import that replaces the ledger and after a month is deleted by hand, so invoice money is never lost with the row.

**Readers.** Every query that selects the deposit also selects `INCOME_DIRECT_COLUMNS` (`lib/property-income-readers.test.ts` is the fence: a reader that forgets them would silently compute the month without its invoices).

**The Receitas table** (`PropertyIncomeLedger`): "Recebido", "Aluguel bruto" and "Energia" show the totals; typing in them changes the deposit's part only. Two columns appear when they apply: "Cond. por fatura" (the `condo_direct` tick — also the way to correct months before the module existed) and "Por fatura" (read-only: what the invoices brought). The Excel export carries the deposit's side only, so a re-import never types invoice money back in; a replace-import keeps each month's `condo_direct`.

**The books** (`lib/accounting-accruals.ts`):

- The month's rent accrual debits Aluguéis a receber for everything that came in (deposit + invoices) and credits the charges the tenant paid according to the owner's **existing** reimbursements policy: RECEITA → Receita de reembolsos; REPASSE → back against the expense, by the kind of charge on the invoice (condomínio → Condomínio; energia, água, gás → Energia, água e gás; IPTU → IPTU e taxas municipais; internet and others → Outras despesas com os imóveis). While the policy is undecided only the rent is posted, as before.
- Late fee and interest paid on an invoice: one entry per invoice on the payment date (`fatura:{id}:encargos`), D Aluguéis a receber, C Juros e multas recebidos.

**The bank statement.** A credit in a month that already has ledger rows not made by the bank stays "só contábil" (existing rule), so the PIX or transfer of a paid invoice is not routed into Receitas a second time. Matching a statement credit to its invoice automatically arrives with the Banco Inter step.

## 7. The owner's Banco Inter connection (step 3)

Invoices are issued through the owner's **own** integration with the bank — the one the owner creates in the Internet Banking PJ (Integrar → Nova integração, with the *API Cobrança (Boleto com Pix)* permissions; once approved, *Minhas integrações → Download chave e certificado* gives the `.crt`, the `.key`, and shows the Client ID and Client Secret once). The screen `/faturas?aba=conexoes` walks the owner through it.

**Storage** (`billing_connections`, one row per owner and provider): the four secrets go in as one JSON sealed by `lib/secret-box.ts` — AES-256-GCM with the server's master key (`BILLING_ENCRYPTION_KEY`, 32 random bytes: `openssl rand -base64 32`), bound to `owner:provider` so a ciphertext copied onto another row does not open. Without the key the screen says the connection is unavailable and nothing is stored. Rotation: new key in `BILLING_ENCRYPTION_KEY`, old one in `BILLING_ENCRYPTION_KEY_PREVIOUS`; old secrets still open and are re-sealed on the next save. **Losing the key makes every stored credential unreadable**; the owner would have to enter them again.

**Never out**: the API returns only `metadata` (account, the tail of the client id, the certificate's subject), the certificate's expiry, the scopes the bank granted on the last test, and the last error. Fields are write-only; a later save may bring only what changed (a renewed integration keeps its client id and secret; the new `.crt` and `.key` must come together).

**Checks before storing** (`lib/billing/inter-credentials.ts`): the certificate parses, the key is its own (`X509Certificate.checkPrivateKey`), it is within its validity; the subject and the expiry are kept. A fingerprint of the client id (unkeyed SHA-256) keeps the same integration from being registered by two accounts.

**The test** (`lib/billing/inter-client.ts`): `POST /oauth/v2/token` with client credentials over mutual TLS (`node:https`, the certificate on the socket, a fresh socket per call so a certificate is never shared through a pool), asking for `boleto-cobranca.read boleto-cobranca.write`. The bank's answer is recorded as the connection's status: CONNECTED with the granted scopes (and the token, sealed, for the calls that follow — the bank gives out five tokens a minute, each lasting an hour), or ERROR with a reason in words: the certificate refused at the handshake, client id/secret rejected, a permission missing, rate limit, outage. Saves and tests are limited to four per user per minute. The bank's sandbox host can be chosen only outside the production site; a sandbox connection on the production site counts as not usable.

**Attention**: a failing connection or a certificate about to expire (the bank allows renewal from 90 days before) is listed right after the late invoices; an account that collects something and has no connection is reminded, after the open decisions.

The Stripe connection (step 6) is another row of the same table — see §10.

## 8. Boleto + Pix at Banco Inter (step 4)

An invoice becomes a charge at the owner's bank — the API Cobrança v3 "boleto com Pix": one charge gives the boleto (digitable line, barcode, PDF) and the Pix copy-and-paste code, the Pix key being the one registered on the owner's account. The rows live in `invoice_charges` (migration `20261003000000`): one live boleto per invoice (a unique partial index is the lock), the bank's reference (`codigoSolicitacao`), its own state verbatim (`provider_status`) and the module's reading of it (`status`: REQUESTED, OPEN, PAID, CANCELLED, EXPIRED, FAILED). The boleto PDF goes to the private bucket `invoice-documents`.

**Issuing** (`issueInvoice`): the invoice must be open with no live boleto; the bank needs a CPF/CNPJ, a full address with CEP, at least R$ 2,50 and a due date today or later; the owner's terms (multa, juros, prazo) must be decided — nothing is invented in their place. A passed due date is moved first (the owner picks the new one; no late fee for the delay before it). Then: the charge row is inserted REQUESTED (the lock), the webhook is registered once per connection, `POST /cobranca/v3/cobrancas` is sent with `seuNumero` = `F<number>` (`-2`, `-3` on a reissue), the invoice becomes ISSUED, and the charge is read back at once — the bank makes the boleto asynchronously, so a REQUESTED charge just needs "Atualizar status" a moment later. A refusal by the bank leaves the charge FAILED with the bank's words, and the invoice to be issued again.

**Refreshing** (`refreshCharge`): `GET /cobranca/v3/cobrancas/{id}` is the truth. A paid charge settles the invoice through `invoice_mark_paid` (payment date, amount received, BOLETO or PIX; what came above the invoice is the late fee), an expired one reads as "Boleto expirado" and asks for a reissue, a cancelled or failed one leaves the invoice to be issued again; an OPEN charge without its PDF fetches it.

**Webhook** (`POST /api/webhooks/inter/[key]`): the bank reports paid, cancelled and expired charges to a URL with a secret only the owner's connection knows (its hash in `billing_connections.webhook_key_hash`; registered with `PUT /cobranca/v3/cobrancas/webhook` on the first issue). The payload is a hint: each charge it names is read back from the bank before anything changes; a payload seen before (same charge, state and time) is ignored through `invoice_events.dedupe_key`. Always 200 once the key is known; the bank retries four times on an error.

**Cancelling** an invoice cancels its live boleto at the bank first (`POST …/cancelar`); a boleto already gone at the bank is fine.

**Sandbox**: outside the production site, a connection to the bank's sandbox can simulate the tenant's payment (`POST …/pagar`) from the invoice panel.

**Not yet**: matching a statement credit to its invoice (the existing rule keeps the credit "só contábil").

## 9. The e-mail, the tenant's page and the daily run (step 5)

**The e-mail** (`lib/billing/invoice-email.ts`, sent by `lib/billing/deliveries-server.ts` through Resend, `lib/billing/email-provider.ts`): subject "Fatura nº N — mês — imóvel"; the items, the total, the due date; the Pix copia e cola, the boleto's digitable line, the link to the tenant's page, and the boleto's PDF attached when the bank has given it. Sender: "<owner> via Kitnets <BILLING_EMAIL_FROM>" with the owner's reply-to, so the tenant answers the owner, never the platform. It goes out **when the bank makes the boleto payable** — the REQUESTED → OPEN transition in `refreshCharge`, whether seen by the issue itself, "Atualizar status", the webhook, the tenant's page or the daily run — one e-mail per boleto (a reissue after expiry mails the new one). "Reenviar e-mail" on the invoice panel sends it again (`POST /api/faturas/[id]/reenviar`: a delivery that never got there is tried again; after one that did, a numbered resend).

**Never twice** (`invoice_deliveries`, migration `20261003100000`): one row per e-mail, unique on (invoice, kind, sequence); the row is claimed in the database before the provider is called (`invoice_delivery_claim`: status SENDING with a lock; a claim older than ten minutes belongs to a dead run and can be taken over); the provider gets the row's id as `Idempotency-Key`. The outcome stays on the row — SENT with the provider's message id, FAILED with the reason (no e-mail on the tenant, the message refused, the server without `RESEND_API_KEY`) — and shows on the invoice panel and in Atenção. Without `RESEND_API_KEY` + `BILLING_EMAIL_FROM` (both or neither, checked in `lib/env.ts`) nothing is sent and every delivery says so; the Configuração panel warns.

**The tenant's page** (`/pagar/[token]`): reached by the link in the e-mail, no login — the token (`invoices.public_token`, two UUIDs, 64 hex characters) is the key. It shows the least that identifies the invoice to the person who got the e-mail — first name, masked CPF (`***.456.789-**`), the place — and every way to pay: the Pix QR code (SVG made on the server with `qrcode` from the copia e cola), the copia e cola and the digitable line with copy buttons, the boleto's PDF (`GET /api/pagar/[token]/boleto` → 302 to a 5-minute signed URL). A live boleto not checked at the bank for 15 minutes is read back first, so a paid one reads "Paga" and is never paid twice. States: em aberto, vencida (still payable, with the terms), em preparação, boleto expirado (ask the owner for a new one), paga, cancelada. `noindex`, `referrer: no-referrer`, `robots.txt` disallows `/pagar/`, 60 views per IP per minute, page and PDF `force-dynamic`.

**The daily run** (`GET /api/cron/faturas`, `vercel.json` at 11:00 UTC = 08:00 in Brasília, `CRON_SECRET`; `lib/billing/automation-server.ts`): for every owner with **Emissão automática** on, in order — (1) *reconcile*: every boleto still waiting at the bank is read back (paid settles, expired is recorded, just-ready e-mails); (2) *generate*: the invoices falling due from today to `days_in_advance` ahead, from `automation_from_month` on, never before it (origin AUTO; `generateInvoices` takes the due window); (3) *issue*: every open invoice with no boleto yet, no blocker and a due date still ahead, through the owner's usable bank connection — a boleto that expired or whose issue failed is **not** retried here, that is the owner's call and it shows in Atenção; (4) *send*: the e-mails that did not go out (up to ten tries; "Reenviar" has no limit). Each item is its own try/catch; a bank that is down stops that owner's issuing, not the run; the run stops starting work after 240 s of its 300 s and what is left waits for tomorrow. The outcome is one row in `index_sync_state` (job `BILLING`), like the index syncs. The automation needs every decision made and a first month chosen (CHECK + schema); switching it off stops every step — the owner's manual buttons keep working.

## 10. The card (step 6): Stripe Connect and the fee passed on

**The owner's Stripe account** (`billing_connections`, provider STRIPE): connected through Stripe Connect **OAuth for Standard accounts** — "Conectar com Stripe" (`POST /api/faturas/conexoes/stripe/iniciar`) hashes a random `state` onto the row and sends the owner to Stripe, where they sign in to their own account (the holding's existing one) or open one; Stripe brings them back to `GET …/stripe/retorno?code&state`, which checks the state (thirty minutes, this account), swaps the code for the account id (`POST connect.stripe.com/oauth/token`) and reads the account (`GET /v1/accounts/{id}`). Only the id and the standing are kept (`charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements.currently_due`, name, country): the platform's key with `Stripe-Account` is all the calls need, so **there is no secret to seal**. The unique index on `(provider, external_account_id)` keeps one Stripe account from serving two owners. "Atualizar" re-reads the account; "Desconectar" deauthorizes it from the platform and forgets it. **Usable** = CONNECTED, `charges_enabled`, and the same environment as the server's key (a test account on the live site takes no cards, and vice versa). `account.updated` on the webhook re-reads it. The platform's credentials — `STRIPE_SECRET_KEY`, `STRIPE_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET` — are the **Kitnets platform account's**, distinct from any owner's; all three or none (`lib/env.ts`).

**The fee passed on** (`lib/card-gross-up.ts`): the owner types the fee their Stripe account charges them (percentage + fixed part, Configuração → Cartão de crédito; both or neither, zero is a decision, blank means no card). The card is charged `gross = ceil₂((net + fixed) / (1 − pct))`, so the owner receives `net` in full (a centavo more at most); `gross − net` is the line "Taxa de processamento do cartão". **Late payments** cost the same as the boleto would: `lib/invoice-late-fees.ts` applies the invoice's own terms — the fine once, the interest per month pro rata die on a 30-day month — and the fee is grossed up on the whole; an undecided term charges nothing in its place; the owner's payment window (`days_payable_after_due`) closes the card too (`lib/billing/card-offer.ts`).

**The payment** (`lib/billing/card-server.ts`): the tenant's page offers the card whenever the invoice is open, the owner's account is usable and the fee is decided — the boleto is not needed (a draft, an expired boleto, a boleto still being made all take the card). The button is a **form POST** to `/api/pagar/[token]/cartao` (never a link: scanners following links in e-mails would open sessions). The route reads the boleto back from the bank first (a boleto paid minutes ago is not paid again by card), computes today's amount, and opens a **Checkout Session on the connected account** (direct charge: the owner is the merchant, the money lands in their Stripe balance; no application fee) with the lines — the invoice, the late charges, the card fee — `client_reference_id` = invoice id, our ids in the metadata, the tenant's e-mail prefilled, `FATURA N` as the statement descriptor suffix, one hour to pay. The row is inserted REQUESTED first (**one open card session per invoice**, unique index), then OPEN with the session id and URL: a second click within the hour, for the same amount, is sent to the same session; another day of interest expires it and opens another. Then 303 to Stripe.

**Settling**: what Stripe says of the session is the truth, read back (`GET /v1/checkout/sessions/{id}`) — by the webhook (`checkout.session.completed` / `expired`), by the tenant's page when they come back (`?cartao=ok` forces the read; otherwise a session not checked for two minutes), never from the payload alone; an event seen before (`invoice_events.dedupe_key = stripe:<event id>`) is ignored. A paid session marks the charge PAID and the invoice through `invoice_mark_paid` as **CARD**: `paid_amount` = the invoice plus the late charges (what the owner receives), `late_fee_amount` = the late charges, `surcharge_amount` = the card line; then the boleto is **cancelled at the bank**, so the tenant cannot pay twice. Cancelling the invoice closes the open session. The income ledger carries the invoice's items as before — never the fee, never the surcharge.

**Books**: the surcharge is posted on the day of the payment as a reimbursement of a charge (D Aluguéis a receber / C Receita de reembolsos de encargos, `cardSurchargeEntry`), beside the late fee's entry; Stripe's own fee reaches the books with the payout on the bank statement (matching is still manual).

**Webhook** (`POST /api/webhooks/stripe`): the platform's Connect endpoint ("listen to events on connected accounts"), signature checked on the raw body (`t=…,v1=…`, HMAC-SHA256, five minutes of tolerance); 200 once verified, 400 for a bad signature, 500 when we fail (Stripe retries). The tenant's page keeps working without it: the read-back on return covers the common path.

**Sandbox**: with a test platform key, the OAuth connects test accounts and the sessions take Stripe's test cards; the connection's environment follows `livemode`.

## 11. Reminders, the receipt and the Dashboard card (step 7)

**Two more decisions** in `billing_settings` (migration `20261003300000`), NULL until the owner makes them — nothing is sent in their place: `reminder_days_before` (1–15) and `overdue_notice_days` (1–30). And a switch, on by default: `send_receipts`.

**Reminders** (`lib/billing/reminder-schedule.ts`, step 4 of the daily run): for every open invoice the tenant can pay — a live boleto, or the card on offer — the run queues a REMINDER delivery: sequence 0 when today is within `reminder_days_before` days before the due date (a run that missed a day still sends it; the due day itself is not a reminder), sequence 1 when today is `overdue_notice_days` or more past it and the invoice still pays (`days_payable_after_due`). Each goes out once per invoice (the unique key); step 5 sends them with everything else. The reminder repeats the invoice's codes; the overdue notice says it is late, what multa and juros add up to today (`lib/invoice-late-fees.ts`, the same figures the card charges) and until when the boleto still takes the payment, and asks the tenant to disregard it if already paid. Both mention the card when the page offers it.

**The receipt** (`sendReceipt`): the moment `invoice_mark_paid` returns PAID — the boleto or Pix read back from the bank, the card session read back from Stripe, or the owner's "Registrar pagamento" — a RECEIPT delivery is queued and sent: paid when, how (boleto, PIX, cartão, or "pagamento recebido pelo proprietário"), the items, the late charges and the card fee as their own lines, the total; "este e-mail comprova o recebimento". The payment is recorded whatever happens to the e-mail; a failed receipt is retried by the daily run (step 5 now includes receipts of paid invoices). A manual payment also cancels the boleto at the bank and closes any card session, so the tenant cannot pay twice.

**The Dashboard** (`lib/dashboard-hub.ts`, `components/dashboard/DashboardHub.tsx`): the Faturas card — a receber no mês, recebido no mês, em atraso, próximo vencimento — from the same maths as the hub (`invoiceHubTotals`); its attention items (late money, an expired boleto, a failed issue or e-mail) join the merged list; the loader is one more `settle()` in `loadDashboard`, so a failure shows the card as unavailable, never as zero.

## 12. Did it reach the tenant? Delivered, bounced, viewed — and a copy for the owner

"Enviado" only means the provider accepted the message. Three things say more (migration `20261003400000`):

**Delivered / bounced** (`POST /api/webhooks/resend`, `lib/billing/resend-webhook.ts`, `applyEmailEvent`): Resend reports what became of each message — `email.delivered`, `email.bounced`, `email.complained` — signed with Svix (`svix-id`, `svix-timestamp`, `svix-signature`; HMAC-SHA256 of `id.timestamp.body` with the endpoint's `whsec_` secret, `RESEND_WEBHOOK_SECRET`; five minutes of tolerance). The delivery is found by the provider's message id (`invoice_deliveries.provider_id`); an event seen before (`invoice_events.dedupe_key = resend:<svix-id>`) is ignored. Delivered sets `delivered_at`; a bounce turns the delivery **BOUNCED** with the provider's reason — it shows in Atenção ("o e-mail voltou… confira o e-mail no cadastro"), is never retried by the daily run, and "Reenviar" then sends a new, numbered e-mail (to the address as it is now); a complaint is recorded. Without the secret the route answers 503 and the invoices simply stay at "Enviado". Optional: the e-mail works without it.

**Viewed** (`invoice_record_view`, `recordPublicView`): the tenant's page records when it is opened — first time, last time, how many — at most once per half hour. Not counted: crawlers and link scanners (`lib/crawler-guard.ts`), the owner looking at their own invoice while signed in, and the link of a copy (`?copia=1`). The first view is an event on the timeline. It is the strongest signal short of the payment: nobody opens the page without having got the link. (Open-tracking pixels in the e-mail are not used: mail clients mask them.)

**On the screens** (`deliveryState` in `lib/invoice-hub.ts`): the furthest thing known — Visualizada › Entregue › Enviado, or Devolvido / Não enviado — is the **E-mail** column of the invoices table and the first lines of the panel's "E-mail ao inquilino" section, which also says when the page was opened and how often.

**A copy for the owner** (`POST /api/faturas/[id]/copia { email }`, `sendInvoiceCopy`): "Enviar cópia para mim" asks for an address (remembered on the device) and sends the same message the tenant gets — the invoice with the boleto, the Pix and the PDF, or the receipt once it is paid — with `[Cópia]` in the subject and a band on top saying so. It is not a delivery (the tenant's e-mails and their one-per-kind keys are untouched), its link carries `?copia=1` so it never reads as the tenant opening the page, and it is an event on the timeline. 10 per user per minute.

## 13. Not in these steps

- No refunds from the module (a refund made in the Stripe dashboard is not read back yet); no repeated overdue notices (one per invoice).
- A partial payment is not accepted: a payment recorded by hand must cover the invoice.
- Nothing retroactive: the daily run never creates an invoice whose due date has passed; "Gerar faturas" does, on demand.
- Out of scope for the module as planned: automatic rent adjustment on the invoice, pro rata of the first and last month, company tenants (CNPJ), variable-amount charges (metered energy), bounce handling from the e-mail provider (a bounce is read as a failed delivery only when the provider refuses the address).
