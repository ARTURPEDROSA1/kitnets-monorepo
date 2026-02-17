---
description: Property Wizard Refactor — step-by-step guided flow for adding properties
---

# Property Wizard Refactor — Implementation Plan

## Status: ✅ ALL PHASES COMPLETE

## Overview

Transform the current flat property form into a **guided wizard flow** with:

- "Adicionar Propriedade" button + popup for single/multi selection
- Step-by-step card progression with auto-collapse & auto-save
- New fields in Detalhes card (Nome da Propriedade, IPTU fields)
- Updated progress bar counting ALL wizard steps
- Collapsible "Dados da Holding" and "Dados do Administrador" cards
- Auto-navigation from property → holding tab

## Completed Changes

### ✅ Phase 1: Data Model Updates

**File: `PropertyDetailsCard.tsx` — PropertyDetails interface**
Added 6 new fields: `propertyName`, `cadastroImobiliario`, `inscricaoImobiliaria`, `matricula`, `areaLote`, `areaEdificada`

### ✅ Phase 2: Remove the Unifamiliar/Multifamiliar Toggle

**File: `ProfileContent.tsx`**
Replaced the toggle with a conditional layout:

- When no property exists: shows "Adicionar Propriedade" button
- When property exists: shows a read-only badge with the property type

### ✅ Phase 3: "Adicionar Propriedade" Button + Popup Modal

**File: `ProfileContent.tsx`**

- Added `showAddPropertyModal` state
- Added modal with two cards (Unifamiliar/Multifamiliar)
- On selection: sets `propertyType`, `propertyCreated`, opens documentation section

### ✅ Phase 4: Wizard Step Navigation

**File: `ProfileContent.tsx`**

- Wizard steps only visible after `propertyCreated = true`
- "Continuar" buttons on each card:
  - Documentation → Address
  - Address → Details
  - Details → Photos
  - Description → Sub-units (multi) or Save+Navigate to Basics (single)
- Each button collapses current card and opens next

### ✅ Phase 5: New Fields in the Detalhes Card

**File: `PropertyDetailsCard.tsx` — rendering**

- `Nome da Propriedade` (text input, mandatory)
- IPTU fields grid: Cadastro Imobiliário, Inscrição Imobiliária, Matrícula, Área Lote, Área Edificada
- Collapsed summary badge shows property name + area

### ✅ Phase 6: Updated Progress Bar

**File: `ProfileContent.tsx` — calculateProgress()**
Comprehensive step-based calculation:

- Ownership tab: documentation, address, details, photos, description, sub-units (multi)
- Basics tab: identity, personal data, owner address, admin data (PJ)
- Dynamic total based on property type and person type

### ✅ Phase 7: Collapsible Holding + Admin Cards

**File: `ProfileContent.tsx` — Basics tab**

- "Dados da Holding/Proprietário" card: collapsible with completion badge
- "Dados do Administrador" card: collapsible with completion badge
- Auto-collapse on load if data exists

### ✅ Phase 8: Auto-navigation to Dados da Holding Tab

**File: `ProfileContent.tsx`**

- Final "Continuar" in Description card auto-saves and switches to basics tab (for single-family)
- `propertyCreated` flag persisted from database on load
- Holding/admin sections auto-collapse when data is pre-filled
