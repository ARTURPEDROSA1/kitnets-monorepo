---
version: 1
slug: "src-app-lang-dashboard-page-tsx"
primary_target: "src/app/[lang]/dashboard/page.tsx"
related_targets: ["src/components/dashboard/DashboardHub.tsx"]
---

# Dashboard (/[lang]/dashboard)

Mode: Operate. Inside the established app world (PRODUCT.md, Brand Commitments): new layout, same look.

Audience and job: a landlord (PF or holding, one to dozens of rentals) opens the app to learn whether this month's rent came in, who has not paid, and what money moves next. Frequency: several times a month, around due days. Constraints: no mock figures (dash without data), every amount under the dollar toggle, tenant names and places under the eye toggle, read-only page (actions live in the hubs), a figure whose loader failed reads "—" and says so.

Chosen: the owner locked two cards of the surface round (2026-10-12), "Quadro de aluguéis" (challenger fused from vernacular-ephemera-boarding-pass-and-gate-board) and "Calendário do mês" (the roll), as two views of the same month behind one switch.

## Direction contract

THESIS: The month's rent is one ordered board: every rent that falls due, when, and whether it landed, readable as a table or as a calendar. It refuses the category-default grid of KPI tiles and module cards that never says who has not paid.

OWN-WORLD: The app's world unchanged: Geist, slate neutrals on #f8fafc, white cards with hairline borders, emerald for money received, amber for due soon, rose for overdue, violet for agency, sky and amber chips for bills; status as tinted pills and dots, never coloured side borders; tabular figures.

STORY: The owner sees at once what was due, what came in, what is still to come and what is overdue; scans the rows (or days) to find who; notices what arrived since the last visit; follows a row into the contract, the invoice or the bill.

FIRST VIEWPORT: Header "Aluguéis de outubro" with month arrows, "hoje" and the count of payments new since the last visit; the Quadro | Calendário switch on the right. A four-part strip (Esperado, Recebido, A vencer, Vencido) with a thin proportional bar along its bottom. Below, about three quarters width: the board (spreadsheet table by due date) or the calendar; a narrow right column with the month's bills and installments, the contract dates ahead, and the result of the last closed month. The portfolio cards (occupancy, contracted rent, self-management saving) sit below the fold.

FORM: Challenger "Quadro de aluguéis" (rank: won its place over the dealt list) fused with dealt candidate 6 "Calendário do mês"; seed: none (unavailable): the surface-scope roll (concept-seed --scope surface --mode operate) printed no SEED REFERENCE line, only its dealt indices 6, 2, 4. Signature interaction: a payment confirmed since the owner's last visit stays lit (emerald row tint and dot, "novo") until the visit has been seen; the calendar fills a day emerald once all its rents landed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions

- The portfolio map is gone from this page; whether its code (PortfolioMap, /api/geocode) is deleted or moved to another page is the owner's call.
- "Vencido" means past the due day with no receipt in the ledger; until the bank sync is live it can mean "paid but not posted yet". The board says "sem lançamento" so it never accuses a tenant without evidence; an overdue Kitnets invoice says "fatura em atraso".
