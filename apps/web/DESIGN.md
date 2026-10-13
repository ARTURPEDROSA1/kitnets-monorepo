---
name: Kitnets.com
description: "The landlord's own ledger, read at a glance: slate paper, emerald money, one tint per module."
colors:
  canvas: "hsl(210 20% 98%)"
  ink: "hsl(222.2 84% 4.9%)"
  card: "hsl(0 0% 100%)"
  primary: "hsl(222.2 47.4% 11.2%)"
  primary-foreground: "hsl(210 40% 98%)"
  muted: "hsl(210 40% 96.1%)"
  muted-foreground: "hsl(215 25% 40%)"
  border: "hsl(214.3 31.8% 91.4%)"
  destructive: "hsl(0 84.2% 60.2%)"
  canvas-dark: "hsl(222.2 84% 4.9%)"
  muted-dark: "hsl(217.2 32.6% 17.5%)"
  muted-foreground-dark: "hsl(215 20% 65%)"
  money-in: "oklch(69.6% 0.17 162.48)"
  money-in-soft: "oklch(84.5% 0.143 164.978)"
  due-soon: "oklch(82.8% 0.189 84.429)"
  overdue: "oklch(64.5% 0.246 16.439)"
  expected: "oklch(70.4% 0.04 256.788)"
  agency-violet: "oklch(60.6% 0.25 292.717)"
  saving-teal: "oklch(70.4% 0.14 182.503)"
  term-indigo: "oklch(58.5% 0.233 277.117)"
  deposit-sky: "oklch(68.5% 0.169 237.323)"
  works-orange: "oklch(70.5% 0.213 47.604)"
  dash-in: "hsl(163 94% 24%)"
  dash-due: "hsl(26 90% 37%)"
  dash-late: "hsl(345 83% 41%)"
  dash-fee: "hsl(263 69% 42%)"
  dash-in-dark: "hsl(158 64% 52%)"
  dash-due-dark: "hsl(43 96% 56%)"
  dash-late-dark: "hsl(351 95% 71%)"
  dash-fee-dark: "hsl(255 92% 76%)"
typography:
  headline:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.333
    letterSpacing: "normal"
  figure:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    fontFeature: "tnum"
  section-title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  body:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  cell-strong:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.375
  meta:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
  pill:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.45
  column-label:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  segmented-item-active:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  segmented-item:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  pill-received:
    backgroundColor: "oklch(69.6% 0.17 162.48 / 0.15)"
    textColor: "{colors.dash-in}"
    typography: "{typography.pill}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  pill-due-soon:
    backgroundColor: "oklch(76.9% 0.188 70.08 / 0.2)"
    textColor: "{colors.dash-due}"
    typography: "{typography.pill}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  pill-overdue:
    backgroundColor: "oklch(64.5% 0.246 16.439 / 0.15)"
    textColor: "{colors.dash-late}"
    typography: "{typography.pill}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  pill-later:
    backgroundColor: "oklch(55.4% 0.046 257.417 / 0.1)"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.pill}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
    height: "48px"
  table-header:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.column-label}"
    padding: "8px 8px"
  nav-item-active:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px"
    height: "44px"
---

# Design System: Kitnets.com

## Overview

**Creative North Star: "The Owner's Ledger"**

Kitnets.com reads like a landlord's own books laid open on a clean desk: slate paper, white sheets with hairline edges, and figures in a firm sans with tabular digits. Colour is not decoration; it is the state of the money. Emerald is money that came in (and the brand), amber is money about to fall due, rose is money past due, violet is what the agency kept, slate grey is what was merely expected. Every other hue belongs to one module and stays inside it.

The authenticated app is dense but calm. Rows of figures live in spreadsheet-like tables the owner can sort, filter, sum and reshape; summaries live in a few big graphic cards (a large figure, one proportional bar, a dotted legend) rather than grids of label/value pairs. Nothing is invented: a figure without data is an honest dash, and a failed source says which one failed. Any amount or identifier can be blurred with one click, so every value is wrapped for privacy from the start.

The dashboard (`/dashboard`, "Aluguéis de outubro") is one surface of this world, built as an extension with a new layout and the same look: a four-part money strip over the month's rents, shown as a board (the spreadsheet) or a calendar, a narrow side column of bills, contract dates and last month's result, and portfolio cards below. The North Star name is proposed by this pass from the built system; the owner has not confirmed it.

**Key Characteristics:**
- Geist sans throughout; bold figures with tabular numerals; sentence-case labels in plain pt-BR.
- Slate neutrals on a near-white canvas; white cards with a hairline border and no shadow at rest.
- Emerald brand and money-in; amber, rose, violet and slate as fixed money states.
- One tinted colour per module (violet, emerald, teal, indigo, amber, sky) for hub cards and icon chips.
- Status as tinted pills and 8px dots, never as stripes.
- Spreadsheet tables for rows of figures; big graphic cards for summaries; "?" for every formula.
- Privacy wrappers on every amount and identifier; "—" whenever a figure is unknown.

## Colors

Cool slate neutrals carry the page; a small, fixed set of saturated hues carries meaning, each used at full strength only for dots and bars and at low opacity for fills.

### Primary
- **Ledger Emerald** (money-in): the brand and the colour of money received. Status dots and bar segments for "Recebido", the selected-cell and filter-chip tint in tables, the today ring in the calendar, the "novo" highlight on receipts posted since the last visit, and the focus ring on the dashboard's own controls. Its lighter step **Soft Emerald** (money-in-soft) is the second part of an emerald bar (self-managed rent beside agency rent).
- **Emerald Ink** (dash-in, dash-in-dark in dark theme): the text colour of received money and of "hoje".

### Secondary
- **Due Amber** (due-soon): money falling due this month; the strip's "A vencer" dot and bar segment. Its ink, **Burnt Amber** (dash-due), is the figure and pill text; due within three days the pill fills amber, later dues sit in a quiet slate pill.
- **Overdue Rose** (overdue): money past due with no receipt in the ledger. Dot, bar segment, a 5% row or day tint, and the pill. Its ink, **Deep Rose** (dash-late), is also the colour of every "could not load" message.
- **Agency Violet** (agency-violet): what the agency kept; its ink **Fee Violet** (dash-fee) colours the fee percentage beside the manager and the fee line of a month's result. Violet is also the tone of occupancy and of the Contratos count card.

### Tertiary
- **Module tones**, one per module card or event chip: **Saving Teal** (saving-teal, self-management saving, contract total value), **Term Indigo** (term-indigo, contract ends), **Deposit Sky** (deposit-sky, deposits and water bills), **Works Orange** (works-orange, project instalments). Energy bills and rent adjustments use the amber family.

### Neutral
- **Slate Canvas** (canvas): the page background behind every card.
- **Sheet White** (card): cards, tables, the strip, menus. In the dark theme the card equals the canvas (canvas-dark) and only the hairline separates them.
- **Night Ink** (ink): headings, figures, primary text.
- **Slate Ink** (primary): the default solid button and the dark-on-light emphasis of the shared primitives.
- **Mist** (muted): the selected segment, hover fills, table header wash at 30%, empty bar tracks; muted-dark in the dark theme.
- **Slate Grey Text** (muted-foreground): every secondary line, legends, column labels, dates already past.
- **Hairline** (border): card edges at 80% opacity, row rules at 50 to 60%.
- **Expected Slate** (expected): the dot for "Esperado" and the "other costs" bar segment: money that is neither in nor at risk.
- **Alarm Red** (destructive): the shared destructive button only; data surfaces use Overdue Rose instead.

### Named Rules
**The Money Has a Colour Rule.** Emerald means in, amber means due, rose means overdue, violet means the agency's cut, slate means merely expected. These five hues never change meaning and never appear as decoration.

**The One Tint per Module Rule.** A hub card or chip carries exactly one tone: its border at 25% opacity, its fill at 5 to 6%, its icon chip at 15%, its bar at full strength with a lighter step or a 135° hatch for a third part. Two tones in one card is a defect.

**The Theme-Class Ink Rule.** Coloured text that must stay legible in both themes is a CSS variable defined under `:root` and `.dark` (the `--dash-*` and `--calc-ink-*` families), applied as `text-[hsl(var(--dash-in))]`. The theme is a class on `<html>`; Tailwind's `dark:` variant follows the operating system instead, so it is not used for new colour decisions.

## Typography

**Display Font:** Geist (with Arial, Helvetica, sans-serif)
**Body Font:** Geist (with Arial, Helvetica, sans-serif)
**Label/Mono Font:** Geist Mono is loaded as a variable but no surface depends on it.

**Character:** One neo-grotesque family at every size, made expressive only by weight and by tabular numerals: bold, compact figures over quiet 12 to 14px explanations.

### Hierarchy
- **Headline** (700, 24px, 1.333): the page title, one per page ("Aluguéis de outubro", "Contratos").
- **Figure** (700, 24px, 1.25, tabular): the big number of a strip segment or summary card; 20px on a phone in the dashboard strip, 18px in the Contratos cards on a phone. A secondary unit ("/mês") follows in 12px medium muted text.
- **Section title** (600, 16px, 1.5): a section heading inside a page ("A carteira").
- **Title** (600, 14px, 1.43): card headings ("Contas e parcelas", "Resultado de setembro").
- **Body** (400, 14px, 1.43): help text, empty states (max 28rem wide), dialog prose.
- **Cell strong** (600, 13px, 1.375): the lead line of a table cell or side-card row (the contract or unit name, an amount).
- **Meta** (400, 12px, 1.333): table cells, legends, the line under a figure, dates; muted unless it carries a money state.
- **Pill** (600, 11px): status pills and the 10px "novo" badge.
- **Column label** (600, 10px, 0.05em tracking, uppercase): spreadsheet column headers and sidebar group headings only.

### Named Rules
**The Tabular Figures Rule.** Every amount, date, count and percentage is set with tabular numerals, so columns and month-to-month comparisons align.

**The Quiet Label Rule.** A label above a figure is sentence case at 13px in muted text, led by an 8px dot in its state colour. Uppercase micro-type is reserved for column headers and sidebar group headings.

## Layout

The app is a fixed left sidebar (16rem, which the owner can collapse to a 5rem icon rail from 640px; a top bar and drawer on a phone) beside a fluid content column. Pages cap at 1600px, padded 16px on a phone and 24px from 640px, with sections stacked 20px apart.

The dashboard's grid: the money strip spans the width (two by two on a phone, four across from 768px, a 6px proportional bar along its bottom edge). Below it the board or calendar takes the remaining width beside a 272px side column from 1360px (85rem); under that width the side cards flow into one, two (768px) or three (1024px) columns beneath the board. Portfolio cards sit below in one column, three across from 768px. Grid gaps are 16px between major regions and 12px between sibling cards.

Inside cards, padding is 16px (12px for compact KPI cards on a phone); strip segments use 16px by 12px, 20px horizontally from 640px. Table cells are 12px by 8px, so a row of contract, tenant and amounts stays one glance tall. The calendar is a seven-column grid (Sunday first, 112px minimum day height) from 768px and becomes a list of the busy days on a phone. Wide tables scroll horizontally inside their card; the page itself never scrolls sideways.

Below 768px, inputs, selects and textareas are forced to 16px to stop iOS zooming.

## Elevation & Depth

The authenticated app is flat at rest. Depth comes from tone: white sheets on a slate canvas, a hairline border, a 30% muted wash on table headers and footers, and 5 to 7% state tints on rows and days. Shadows appear only on layers that float above the page.

### Shadow Vocabulary
- **Floating layer** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): the cell-sum bar at the bottom of a table, column menus, popovers.
- **Shared card** (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): the default of the shared Card primitive; hub surfaces built on plain sections omit it.

### Named Rules
**The Hairline Rule.** A card is separated from the canvas by its border (Hairline at 80%), not by a shadow. If a card needs a shadow to be seen, its fill or border is wrong.

## Shapes

Gently rounded and consistent: 12px for every card, table frame, strip and calendar; 6px for small controls (month arrows, segmented items, event chips, icon chips); 8px for sidebar items and inline links with a hover fill; 16px for dashed empty-state panels; fully round for pills, dots, legend swatches and proportional bars. Occupancy cells are 14px squares with 3px corners, filled for occupied units and dashed-outlined for vacant ones. Borders are 1px; dashed borders mean "empty" or "vacant". Bars are 6 to 10px tall pills that clip their segments.

## Components

### Buttons
Shared primitives, restrained and compact.
- **Shape:** gently rounded (6px), 40px tall (36px small, 44px large).
- **Primary:** Slate Ink fill with near-white text, 14px medium, 8px by 16px; hover lightens to 90%.
- **Outline:** 1px border on the canvas colour; hover fills with Mist. Used for the second action ("Importar contrato").
- **Ghost / icon:** no border, muted icon, Mist fill on hover; the "?" help button is a 16px icon in a ghost square.
- **Focus:** a 2px ring in the ring token with a 2px offset on shared primitives; the dashboard's own controls use a 2px emerald-500 ring.
- **Public calculators** carry a louder, larger emerald pill CTA; it stays on those public pages.

### Segmented toggle
How a view is shown (Quadro | Calendário, Lista | Linha): a bordered 8px container with 2px inset; the active item fills with Mist and goes semibold, the others are muted until hovered. The choice is remembered per account.

### Status pills and dots
- **Style:** fully round, 11px semibold, 2px by 8px; fill is the state hue at 15% (amber 20%), text is the state's ink.
- **Text says the fact:** "recebido 11/10", "vence em 3 dias", "vencido há 7 dias"; a due date more than three days out sits in a quiet slate pill.
- **Dots:** 8px circles in the 500 hue lead every due date, legend line and strip label.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Sheet White on the Slate Canvas; module cards tint the background with their tone at 5 to 6% and the border at 25%.
- **Shadow Strategy:** none at rest (see The Hairline Rule).
- **Border:** 1px Hairline at 80%.
- **Internal Padding:** 16px.
- **Anatomy of a summary card:** title (14px semibold), one big figure, one proportional bar, a dotted legend in 12px. A card that opens something shows a right arrow that nudges 2px on hover; a card that opens nothing has no arrow and no hover.

### Inputs / Fields
- **Style:** 48px tall, 12px corners, 1px input border on the canvas colour, 16px text on phones.
- **Focus:** 2px ring in the ring token with offset.
- **Disabled:** 50% opacity, not-allowed cursor. Dates are typed as dd/mm/aaaa.

### Navigation
The sidebar lists four collapsible groups (Operação, Contábil & Fiscal, Ferramentas, Configurações) under 11px uppercase group headings. Items are 44px tall with 8px corners; hover and the current page fill with Mist. From 640px the owner can collapse the sidebar to a 5rem icon rail (the choice is remembered); on a phone it is a drawer behind a top bar. The footer holds the language select, theme toggle and the eye and dollar privacy toggles.

### Spreadsheet table (signature)
Every list of figures uses the same machinery (`TableColumnFilters`, `TableCellSum`, `TableColumnVisibility`, `TableColumnWidths`): uppercase 10px column headers on a 30% Mist wash that sort and filter on click, right-click to hide columns, resizable widths saved per account, filter chips in an emerald tint above the table, selected cells tinted emerald with a floating sum bar, Ctrl+C copies as TSV, and a footer row of sums on a 20% Mist wash. Cells are 12px text, amounts right-aligned and tabular, a missing amount a muted "—".

### Money strip (dashboard)
Four segments (Esperado, Recebido, A vencer, Vencido), each a dotted label, a figure in its state ink and a one-line explanation, divided by hairlines, over a 6px bar whose parts are proportional to received, due and overdue money. The board inserts a "hoje" rule in emerald between what already fell due and what is ahead, and lights receipts new since the last visit with a 7% emerald row tint and a "novo" badge.

### Help ("?")
A 16px question-mark icon beside a page's view controls opens a dialog (on the dashboard, "Como ler o painel") with one short paragraph per term, the term in bold. Formulas and definitions live there and in `title` hints on column headers, never as paragraphs on the page.

### Privacy wrappers
Every R$ amount renders inside `<Money>` (or carries `privacy-money`), every address, document number, phone or tenant name inside `<Sensitive>`; the sidebar's dollar and eye toggles blur them by 0.45em (1.5rem for maps). Bars that reveal proportions of money carry `privacy-money` too.

## Do's and Don'ts

### Do:
- **Do** wrap every amount in `<Money>` and every identifier or tenant name in `<Sensitive>`, and keep those values out of `title` attributes, which are not blurred.
- **Do** show an unknown figure as a muted "—" and name the source that failed in Deep Rose ink; never show zero for missing data.
- **Do** put rows of figures in the spreadsheet table machinery, with sums in the footer.
- **Do** set every amount, date and count with tabular numerals.
- **Do** mark status with a tinted pill (15% fill, state ink) and an 8px dot in the 500 hue.
- **Do** define coloured text as theme variables under `:root` and `.dark` (the `--dash-*` pattern) so it follows the theme class.
- **Do** give each module card one tone: 25% border, 5 to 6% fill, 15% icon chip, full-strength bar.
- **Do** keep gross rent, the agency fee and net rent as separate figures.
- **Do** put formulas and definitions behind a "?" that opens a "Como ler" dialog.

### Don't:
- **Don't** mark the status of a row, card or day with a coloured side stripe; status is a pill and a dot.
- **Don't** summarise rows of figures in grids of KPI tiles or label/value pairs.
- **Don't** show mock, sample or estimated figures on any dashboard.
- **Don't** use emerald, amber, rose or violet decoratively; each one is a money state.
- **Don't** add new colour decisions with Tailwind's `dark:` variant; it follows the operating system, not the app's theme class.
- **Don't** make a card clickable without an arrow, or show an arrow on a card that opens nothing.
- **Don't** add shadows to cards at rest.
