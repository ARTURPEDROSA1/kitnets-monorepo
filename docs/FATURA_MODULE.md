# Fatura (Tenant Invoicing) Module

**Version:** 0.1 (step 1 of 7)  
**Last updated:** 2026-10-02  
**Author:** Kitnets Engineering

---

## 1. Overview

The **Fatura module** charges the tenant, month by month, for what is **not** collected by an agency: the rent of a self-managed lease, the condominium the owner collects on an agency-managed one (pilot: Kitnet 35C), and any fixed charge the tenant pays that the owner marked as theirs (IPTU, internet…).

The end state is automatic: every month the module issues a boleto + PIX through the Banco Inter API and a card link through Stripe, and e-mails them to the tenant. It ships in seven steps; **this step delivers the core**:

| Step | Delivers | State |
|---|---|---|
| 1 | Schema, who collects each component, the hub, invoices generated and settled by hand | **this document** |
| 2 | Income ledger: what comes in directly from the tenant (`direct_*`), no double counting with the agency deposit and the bank statement | pending |
| 3 | Per-owner encrypted credentials, Banco Inter connection screen | pending |
| 4 | Boleto + PIX issued through Banco Inter, webhook, reconciliation | pending |
| 5 | E-mail to the tenant, public payment page, daily cron | pending |
| 6 | Stripe Connect, card link with the fee passed on to the tenant | pending |
| 7 | Dashboard card, overdue reminders, receipt | pending |

- **Hub** `/faturas` — KPI strip, "Atenção", then three sections: the invoices as a spreadsheet, "Cobranças recorrentes" (who collects each component of each lease in force) and the billing conditions.
- **Invoice panel** `/faturas?id=<invoice>` — items, payer, the terms it states, payment, timeline; record a payment or cancel.
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

Days in advance, late fee (multa), interest (juros de mora) and how long after the due date the invoice still takes the payment. **Each is the owner's decision: blank is stored as NULL and nothing is assumed in its place.** An invoice created meanwhile states no late terms; the automation of later steps cannot be switched on before they are decided (CHECK `billing_settings_automation_needs_decisions`).

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
│   ├── [id]/cancelar/route.ts        # POST
│   ├── cobrancas/route.ts            # PUT (who collects a component · pause a lease)
│   └── configuracoes/route.ts        # PUT (billing conditions)
├── components/faturas/
│   ├── FaturasHub.tsx                # KPI strip, "Atenção", sections, view pills, search
│   ├── InvoiceTable.tsx              # The invoices as a spreadsheet (table key `invoices`)
│   ├── RecurringChargesTable.tsx     # Lease × component, the "quem cobra" select (table key `invoice-recurring`)
│   ├── BillingSettingsPanel.tsx      # The owner's decisions
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
    └── schemas/invoice.ts (+ test)    # zod schemas of the routes

supabase/
├── migrations/20261002120000_invoices_core.sql
└── checks/invoices.sql
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
| `invoice_mark_paid(…)` | the only way to `PAID`: `PAID`, `ALREADY` (same payment again) or `DUPLICATE` (another payment, or a cancelled invoice — recorded, never applied) |

`supabase/checks/invoices.sql` exercises all of it in one rolled-back transaction.

## 6. Not in this step

- Nothing is issued or sent: no boleto, no PIX, no card link, no e-mail. The hub says so.
- A paid invoice does **not** reach the income ledger yet (step 2). Until then, keep recording the receipt in the property's Receitas as today.
- No automatic generation: "Gerar faturas" creates the month's invoices on demand; running it again only fills what is missing.
- Out of scope for the module as planned: automatic rent adjustment on the invoice, pro rata of the first and last month, company tenants (CNPJ), variable-amount charges (metered energy).
