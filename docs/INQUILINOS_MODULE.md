# Inquilinos (Tenants) Module

**Version:** 1.0  
**Last updated:** 2026-09-02  
**Author:** Kitnets Engineering  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & File Structure](#2-architecture--file-structure)
3. [Data Model](#3-data-model)
   - 3.1 [Tenant Interface](#31-tenant-interface)
   - 3.2 [TenantWithDetails Interface](#32-tenantwithdetails-interface)
   - 3.3 [TenantFormData Interface](#33-tenantformdata-interface)
   - 3.4 [Enumerations (`TenantStatus`, `TenantManagementType`)](#34-enumerations-tenantstatus-tenantmanagementtype)
   - 3.5 [Dropdown Types (`PropertyOption`, `AgencyOption`, `AgentOption`)](#35-dropdown-types-propertyoption-agencyoption-agentoption)
4. [Database Schema & Storage](#4-database-schema--storage)
   - 4.1 [Table: `public.tenants`](#41-table-publictenants)
   - 4.2 [Indexes & Uniqueness](#42-indexes--uniqueness)
   - 4.3 [Triggers](#43-triggers)
   - 4.4 [Row Level Security (RLS)](#44-row-level-security-rls)
   - 4.5 [Foreign Key Relationships](#45-foreign-key-relationships)
5. [API Routes](#5-api-routes)
   - 5.1 [GET /api/tenants](#51-get-apitenants)
   - 5.2 [POST /api/tenants](#52-post-apitenants)
   - 5.3 [PUT /api/tenants/[id]](#53-put-apitenantsid)
   - 5.4 [DELETE /api/tenants/[id]](#54-delete-apitenantsid)
   - 5.5 [GET /api/tenants/properties](#55-get-apitenantsproperties)
6. [Components](#6-components)
   - 6.1 [Page Component (`page.tsx`)](#61-page-component-pagetsx)
   - 6.2 [InquilinosContent (Page Orchestrator)](#62-inquilinoscontent-page-orchestrator)
   - 6.3 [TenantProfileCard (Detailed Profile View)](#63-tenantprofilecard-detailed-profile-view)
7. [UI Flow & States](#7-ui-flow--states)
   - 7.1 [State Machine](#71-state-machine)
   - 7.2 [List & Accordion View](#72-list--accordion-view)
   - 7.3 [Registration & Edit Form](#73-registration--edit-form)
   - 7.4 [Delete Flow (Soft Delete Confirmation)](#74-delete-flow-soft-delete-confirmation)
8. [Validation & Normalization](#8-validation--normalization)
   - 8.1 [Client-side Validation](#81-client-side-validation)
   - 8.2 [Server-side Validation](#82-server-side-validation)
   - 8.3 [Field Masking & Normalization](#83-field-masking--normalization)
   - 8.4 [Date Handling (DD/MM/YYYY)](#84-date-handling-ddmmyyyy)
9. [Navigation & Auth](#9-navigation--auth)
   - 9.1 [Sidebar Link](#91-sidebar-link)
   - 9.2 [Middleware Protection](#92-middleware-protection)
10. [Database Setup & Migrations](#10-database-setup--migrations)
11. [Cross-Module Dependencies](#11-cross-module-dependencies)
12. [Design Decisions](#12-design-decisions)
13. [Future Integration: Lease Module](#13-future-integration-lease-module)
14. [Changelog](#14-changelog)

---

## 1. Overview

The **Inquilinos Module** (`/[lang]/inquilinos`) allows authenticated Kitnets.com users to register, organize, and manage tenants (inquilinos) across their properties. Each tenant is associated with:

- **A property** from the user's registered properties.
- **A management type:** Self-Managed (`Gestão própria`) or Agency-Managed (`Imobiliária`).

### Key Features

- **Multi-Tenant Management:** Users can register and manage an unlimited number of tenants across all their properties.
- **Property Association:** Each tenant is linked to a specific property via FK to `public.properties`.
- **Flexible Management:** Tenants can be self-managed or assigned to a real estate agency (and optionally a specific agent within that agency).
- **Brazilian Data Formats:** CPF validation with check-digit algorithm, phone masking (XX) XXXXX-XXXX, CEP auto-fill, and all dates in DD/MM/YYYY format.
- **Address Convenience:** "Use property address" checkbox allows marking the tenant's current address as the same as the rented property.
- **Status Tracking:** Tenants are categorized as `Ativo` (active), `Futuro` (future tenant), or `Ex-Inquilino` (former tenant).
- **Emergency Contact:** Optional emergency contact name and phone per tenant.
- **Soft Delete with Audit:** Tenants are soft-deleted with `deleted_at` and `deleted_by` tracking.
- **Search & Filters:** Search by name, CPF, phone, or property; filter by status, property, and management type.

---

## 2. Architecture & File Structure

```
apps/web/src/
├── app/
│   ├── [lang]/inquilinos/
│   │   ├── page.tsx                     # Server component wrapper
│   │   └── InquilinosContent.tsx        # Client component (full CRUD UI)
│   └── api/tenants/
│       ├── route.ts                     # GET (list) + POST (create)
│       ├── [id]/route.ts               # PUT (update) + DELETE (soft delete)
│       └── properties/route.ts          # GET (property dropdown data)
├── components/
│   └── inquilinos/
│       └── TenantProfileCard.tsx        # Expanded detail card
└── types/
    └── tenant.ts                        # TypeScript interfaces

packages/core/database/
└── tenant_setup.sql                     # Database migration
```

### Architecture Pattern

The module follows the same architecture established by the [Imobiliária Module](file:///c:/Users/Administrator/Documents/Kitnets/docs/IMOBILIARIA_MODULE.md) and [Corretores Module](file:///c:/Users/Administrator/Documents/Kitnets/docs/CORRETORES_MODULE.md):

1. **Server page wrapper** (`page.tsx`) → extracts `lang` param → renders client component.
2. **Client orchestrator** (`InquilinosContent.tsx`) → manages all state, fetches, and renders list/form/delete views.
3. **API routes** → authenticate via Clerk, resolve `profiles.id`, operate via Supabase Service Role key (bypasses RLS).
4. **Shared validators** from `@/lib/validators` for CPF, phone, email, CEP masking/parsing.

---

## 3. Data Model

### 3.1 Tenant Interface

The base `Tenant` interface maps 1:1 to the `public.tenants` database row.

```typescript
export interface Tenant {
    id: string;
    user_id: string;

    // Personal (required)
    full_name: string;
    cpf: string;                          // Digits only: "12345678901"
    main_phone: string;                   // E.164: "+5531999999999"
    email: string | null;                 // Optional

    // Personal (optional)
    date_of_birth: string | null;         // ISO date: "1990-01-15"
    rg: string | null;
    additional_phone: string | null;      // E.164

    // Address (optional)
    postal_code: string | null;           // Digits only: "30000000"
    street: string | null;
    street_number: string | null;
    address_complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;                 // UF: "MG", "SP"

    // Property association
    property_id: string;
    use_property_address: boolean;

    // Management
    management_type: TenantManagementType;
    agency_id: string | null;
    agent_id: string | null;

    // Rental
    move_in_date: string | null;          // ISO date
    move_out_date: string | null;         // ISO date
    status: TenantStatus;

    // Additional
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null; // E.164
    notes: string | null;

    // Timestamps
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}
```

**Source:** [`tenant.ts`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/types/tenant.ts)

### 3.2 TenantWithDetails Interface

Extends `Tenant` with joined names from related tables. This is the shape returned by `GET /api/tenants`.

```typescript
export interface TenantWithDetails extends Tenant {
    property_name: string | null;   // from properties.name
    agency_name: string | null;     // from agencies.name
    agent_name: string | null;      // from agents.full_name
}
```

### 3.3 TenantFormData Interface

Form-level data used by the frontend. All fields are `string` or `boolean` (no nulls) for controlled inputs.

```typescript
export interface TenantFormData {
    full_name: string;
    cpf: string;
    main_phone: string;
    email: string;
    date_of_birth: string;      // DD/MM/YYYY display format
    rg: string;
    additional_phone: string;
    postal_code: string;
    street: string;
    street_number: string;
    address_complement: string;
    neighborhood: string;
    city: string;
    state: string;
    property_id: string;
    use_property_address: boolean;
    management_type: TenantManagementType;
    agency_id: string;
    agent_id: string;
    move_in_date: string;       // DD/MM/YYYY display format
    move_out_date: string;      // DD/MM/YYYY display format
    status: TenantStatus;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    notes: string;
}
```

### 3.4 Enumerations (`TenantStatus`, `TenantManagementType`)

| Type | Values | Description |
|------|--------|-------------|
| `TenantStatus` | `'ACTIVE'`, `'FUTURE'`, `'FORMER'` | Current occupancy status |
| `TenantManagementType` | `'SELF_MANAGED'`, `'AGENCY'` | How the tenant is managed |

**Status labels in UI:**

| Value | Portuguese Label | Badge Variant |
|-------|-----------------|---------------|
| `ACTIVE` | Ativo | `default` (blue/primary) |
| `FUTURE` | Futuro | `outline` |
| `FORMER` | Ex-Inquilino | `secondary` |

**Management labels in UI:**

| Value | Portuguese Label | Description |
|-------|-----------------|-------------|
| `SELF_MANAGED` | Gestão própria | Owner manages tenant directly |
| `AGENCY` | Imobiliária | Managed by a registered agency |

### 3.5 Dropdown Types (`PropertyOption`, `AgencyOption`, `AgentOption`)

```typescript
export interface PropertyOption { id: string; name: string; }
export interface AgencyOption  { id: string; name: string; }
export interface AgentOption   { id: string; full_name: string; agency_id: string | null; }
```

These are fetched at form mount for populating `<select>` dropdowns.

---

## 4. Database Schema & Storage

### 4.1 Table: `public.tenants`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `UUID` | NO | `uuid_generate_v4()` | Primary key |
| `user_id` | `UUID` | NO | — | FK → `profiles(id)` ON DELETE CASCADE |
| `full_name` | `TEXT` | NO | — | Tenant's legal name |
| `cpf` | `TEXT` | NO | — | 11 digits only |
| `main_phone` | `TEXT` | NO | — | E.164 format |
| `email` | `TEXT` | YES | — | Optional email |
| `date_of_birth` | `DATE` | YES | — | ISO date |
| `rg` | `TEXT` | YES | — | RG / ID number |
| `additional_phone` | `TEXT` | YES | — | E.164 format |
| `postal_code` | `TEXT` | YES | — | 8 digits only |
| `street` | `TEXT` | YES | — | Street name |
| `street_number` | `TEXT` | YES | — | Building/house number |
| `address_complement` | `TEXT` | YES | — | Apartment, block, etc. |
| `neighborhood` | `TEXT` | YES | — | Bairro |
| `city` | `TEXT` | YES | — | City name |
| `state` | `TEXT` | YES | — | UF: "MG", "SP", etc. |
| `property_id` | `UUID` | NO | — | FK → `properties(id)` ON DELETE RESTRICT |
| `use_property_address` | `BOOLEAN` | NO | `FALSE` | Tenant lives at the rented property |
| `management_type` | `TEXT` | NO | — | `CHECK ('SELF_MANAGED', 'AGENCY')` |
| `agency_id` | `UUID` | YES | — | FK → `agencies(id)` ON DELETE SET NULL |
| `agent_id` | `UUID` | YES | — | FK → `agents(id)` ON DELETE SET NULL |
| `move_in_date` | `DATE` | YES | — | Occupancy start |
| `move_out_date` | `DATE` | YES | — | Occupancy end |
| `status` | `TEXT` | NO | `'ACTIVE'` | `CHECK ('ACTIVE', 'FUTURE', 'FORMER')` |
| `emergency_contact_name` | `TEXT` | YES | — | Emergency contact |
| `emergency_contact_phone` | `TEXT` | YES | — | E.164 format |
| `notes` | `TEXT` | YES | — | Free-text notes |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | Row creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | Last update (auto-updated by trigger) |
| `deleted_at` | `TIMESTAMPTZ` | YES | — | Soft delete timestamp |
| `deleted_by` | `UUID` | YES | — | FK → `profiles(id)`, who deleted |

**Source:** [`tenant_setup.sql`](file:///c:/Users/Administrator/Documents/Kitnets/packages/core/database/tenant_setup.sql)

### 4.2 Indexes & Uniqueness

| Index | Columns | Condition | Purpose |
|-------|---------|-----------|---------|
| `idx_tenants_cpf_per_user` | `(user_id, cpf)` UNIQUE | `WHERE deleted_at IS NULL` | Prevents duplicate CPF per account |
| `idx_tenants_user_id` | `(user_id)` | — | Fast lookup by owner |
| `idx_tenants_property_id` | `(property_id)` | — | Fast lookup by property |
| `idx_tenants_agency_id` | `(agency_id)` | `WHERE agency_id IS NOT NULL` | Partial index for agency lookup |
| `idx_tenants_deleted_at` | `(deleted_at)` | `WHERE deleted_at IS NULL` | Active (non-deleted) tenants |
| `idx_tenants_status` | `(status)` | `WHERE deleted_at IS NULL` | Status filter on active tenants |

**CPF Uniqueness Rule:** A user cannot register two active (non-deleted) tenants with the same CPF. Soft-deleted tenants are excluded from the uniqueness check, allowing re-registration.

### 4.3 Triggers

| Trigger | Event | Function | Purpose |
|---------|-------|----------|---------|
| `trg_tenants_updated_at` | `BEFORE UPDATE` | `update_tenants_updated_at()` | Auto-sets `updated_at = NOW()` on any row update |

### 4.4 Row Level Security (RLS)

```sql
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Users can read their own tenants
CREATE POLICY tenants_select_own ON public.tenants
    FOR SELECT USING (user_id = auth.uid());
```

- **SELECT:** Users can only read rows where `user_id = auth.uid()`.
- **INSERT/UPDATE/DELETE:** Performed via Supabase Service Role key (bypasses RLS) in API routes, with ownership verified in application code.

### 4.5 Foreign Key Relationships

```
tenants.user_id      → profiles(id)     ON DELETE CASCADE   — user deletion cascades
tenants.property_id  → properties(id)   ON DELETE RESTRICT  — cannot delete a property with tenants
tenants.agency_id    → agencies(id)     ON DELETE SET NULL   — agency deletion preserves tenant
tenants.agent_id     → agents(id)       ON DELETE SET NULL   — agent deletion preserves tenant
tenants.deleted_by   → profiles(id)     — audit trail
```

---

## 5. API Routes

All API routes use Clerk authentication (`currentUser()`) and resolve the internal `profiles.id` via the `clerk_id` lookup. Operations are performed with the Supabase Service Role key.

### 5.1 GET /api/tenants

**File:** [`route.ts`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/app/api/tenants/route.ts)

Returns all tenants for the authenticated user, excluding soft-deleted rows. Joins property, agency, and agent names.

**Response:**
```json
{
  "tenants": [
    {
      "id": "uuid",
      "full_name": "João Silva",
      "cpf": "12345678901",
      "main_phone": "+5531999999999",
      "email": "joao@example.com",
      "property_id": "uuid",
      "property_name": "Kitnet Centro",
      "agency_name": "Imob ABC",
      "agent_name": "Maria Santos",
      "status": "ACTIVE",
      ...
    }
  ]
}
```

### 5.2 POST /api/tenants

**File:** [`route.ts`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/app/api/tenants/route.ts)

Creates a new tenant. Performs full validation including:

- **Required fields:** `full_name`, `cpf`, `main_phone`, `property_id`, `management_type`
- **CPF validation:** Check-digit algorithm + uniqueness per user account
- **Property ownership:** Verifies the property belongs to the user
- **Agency/Agent:** If `management_type === 'AGENCY'`, validates agency exists and belongs to user; if agent provided, validates agent belongs to the selected agency
- **Optional validation:** Email format, phone format, CEP format

**Request body:** `TenantFormData` (JSON)

**Success:** `201 Created` with `{ tenant: Tenant }`

**Error:** `400 Bad Request` with `{ errors: { [field]: string } }` for validation errors

### 5.3 PUT /api/tenants/[id]

**File:** [`[id]/route.ts`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/app/api/tenants/%5Bid%5D/route.ts)

Updates an existing tenant. Same validation as POST, plus:

- **Ownership check:** Verifies the tenant belongs to the authenticated user
- **Existence check:** Returns 404 if tenant not found or soft-deleted
- **CPF uniqueness:** Excludes self from duplicate check

**Success:** `200 OK` with `{ tenant: Tenant }`

### 5.4 DELETE /api/tenants/[id]

**File:** [`[id]/route.ts`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/app/api/tenants/%5Bid%5D/route.ts)

Soft-deletes a tenant by setting `deleted_at` and `deleted_by`.

- **Ownership check:** Verifies the tenant belongs to the authenticated user
- **Future lease check:** Placeholder for preventing deletion if an active lease exists (to be implemented with the Lease module)

**Success:** `200 OK` with `{ message: "Inquilino excluído com sucesso." }`

### 5.5 GET /api/tenants/properties

**File:** [`properties/route.ts`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/app/api/tenants/properties/route.ts)

Returns properties, agencies, and agents for the user to populate form dropdowns.

**Response:**
```json
{
  "properties": [{ "id": "uuid", "name": "Kitnet Centro" }],
  "agencies": [{ "id": "uuid", "name": "Imob ABC" }],
  "agents": [{ "id": "uuid", "full_name": "Maria Santos", "agency_id": "uuid" }]
}
```

---

## 6. Components

### 6.1 Page Component (`page.tsx`)

**File:** [`page.tsx`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/app/%5Blang%5D/inquilinos/page.tsx)

Minimal server component that extracts the `lang` route parameter and renders `InquilinosContent`.

### 6.2 InquilinosContent (Page Orchestrator)

**File:** [`InquilinosContent.tsx`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/app/%5Blang%5D/inquilinos/InquilinosContent.tsx)

The main client component (~1430 lines) managing all CRUD operations. Contains:

- **State management:** `pageState` machine (`listing`, `adding`, `editing`), form data, dropdown options, filters
- **List view:** Accordion rows with search/filter bar
- **Form view:** 6-section form with validation and CEP auto-fill
- **Delete modal:** Confirmation dialog with tenant name and soft delete

**Form sections:**
1. **Informações Pessoais** — Name, CPF, phone, email (optional), date of birth, RG, additional phone
2. **Endereço Atual** — "Use property address" checkbox, CEP with auto-fill, street, number, complement, neighborhood, city, state
3. **Imóvel Associado** — Property dropdown (required)
4. **Administração** — Management type radio (Self/Agency), agency dropdown (conditional), agent dropdown (conditional, filtered by agency)
5. **Informações de Ocupação** — Move-in date, move-out date, status
6. **Informações Adicionais** — Emergency contact, notes

### 6.3 TenantProfileCard (Detailed Profile View)

**File:** [`TenantProfileCard.tsx`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/components/inquilinos/TenantProfileCard.tsx)

Renders a fully detailed tenant profile when a row is expanded. Organized into sections:

- Personal information (name, CPF, email, phones, DOB, RG)
- Current address (or "Utiliza o endereço do imóvel alugado" badge)
- Property association
- Management info (self-managed label or agency + agent names)
- Rental dates + status
- Linked lease placeholder (for future Lease module)
- Emergency contact
- Notes

---

## 7. UI Flow & States

### 7.1 State Machine

```
  ┌─────────┐
  │ listing │ ← Default state on mount
  └────┬────┘
       │ "+ Adicionar"          "Editar" (pencil icon)
       ▼                       │
  ┌─────────┐            ┌─────────┐
  │ adding  │            │ editing │
  └────┬────┘            └────┬────┘
       │ "Salvar" / "Voltar"  │ "Salvar" / "Voltar"
       ▼                      ▼
  ┌─────────┐
  │ listing │  (refetch tenants)
  └─────────┘
```

### 7.2 List & Accordion View

Each tenant row displays:
- **Full name** (bold)
- **CPF** (partially masked: `***.XXX.XXX-**`)
- **Phone** (formatted)
- **Property name**
- **Management** — "Gestão própria" or agency name
- **Status badge** (color-coded)
- **Action buttons:** Expand/Collapse, Edit, Delete

**Toolbar features:**
- Search input (name, CPF, phone, property)
- Status filter dropdown (Ativo / Futuro / Ex-Inquilino)
- Property filter dropdown
- Management type filter dropdown
- "Limpar filtros" clear button

**Expanded row:** Renders `TenantProfileCard` with full details.

### 7.3 Registration & Edit Form

- **6 card-based sections** with icons and descriptions
- **Real-time input masks:** CPF (`XXX.XXX.XXX-XX`), Phone (`(XX) XXXXX-XXXX`), CEP (`XXXXX-XXX`), Dates (`DD/MM/AAAA`)
- **CEP auto-fill:** Fetches address from `/api/cep` and populates street, neighborhood, city, state
- **Conditional fields:**
  - Address section hidden when "Utilizar endereço do imóvel" is checked
  - Agency dropdown appears only when management type = "Imobiliária"
  - Agent dropdown appears only when an agency is selected (filtered by that agency)
- **Scroll-to-first-error:** On validation failure, the page scrolls to the first invalid field

### 7.4 Delete Flow (Soft Delete Confirmation)

1. User clicks trash icon on a row
2. Confirmation modal appears with tenant name
3. On confirm: `DELETE /api/tenants/[id]` → sets `deleted_at` + `deleted_by`
4. List refreshes, tenant disappears

---

## 8. Validation & Normalization

### 8.1 Client-side Validation

| Field | Rule | Error Message |
|-------|------|---------------|
| `full_name` | Required, non-empty | "Nome completo é obrigatório." |
| `cpf` | Required + check-digit algorithm | "CPF é obrigatório." / "CPF inválido." |
| `main_phone` | Required + format check | "Telefone principal é obrigatório." / "Telefone inválido." |
| `email` | Optional, format check if provided | "E-mail inválido." |
| `property_id` | Required | "Selecione um imóvel." |
| `management_type` | Required | "Tipo de gestão é obrigatório." |
| `agency_id` | Required if `management_type === 'AGENCY'` | "Selecione a imobiliária." |
| `additional_phone` | Optional, format check if provided | "Telefone inválido." |
| `emergency_contact_phone` | Optional, format check if provided | "Telefone inválido." |
| `postal_code` | Optional, 8 digits if provided | "CEP inválido (8 dígitos)." |

### 8.2 Server-side Validation

All client-side checks are duplicated on the server, plus:

| Check | Detail |
|-------|--------|
| CPF uniqueness | `SELECT` on `tenants` table for same `user_id` + `cpf` (excluding self on edit, excluding soft-deleted) |
| Property ownership | Verifies `property.user_id === profiles.id` |
| Agency ownership | Verifies `agency.user_id === profiles.id` (when `management_type === 'AGENCY'`) |
| Agent → Agency | Verifies the selected agent belongs to the selected agency |

### 8.3 Field Masking & Normalization

| Field | Display (form) | Stored (database) | Utility Functions |
|-------|---------------|-------------------|-------------------|
| CPF | `123.456.789-01` | `12345678901` | `maskCPF()`, `parseCPF()`, `validateCPF()`, `formatCPF()` |
| Phone | `(31) 99999-9999` | `+5531999999999` (E.164) | `maskPhone()`, `parsePhoneToE164()`, `validatePhone()`, `formatPhone()` |
| CEP | `30000-000` | `30000000` | `maskCEP()`, `parseCEP()`, `validateCEP()`, `formatCEP()` |
| Email | `user@example.com` | `user@example.com` (lowercased, trimmed) | `normalizeEmail()`, `validateEmail()` |
| Dates | `DD/MM/AAAA` | `YYYY-MM-DD` (ISO) | `maskDate()`, `parseDateBR()`, `formatDateBR()` |

All mask/parse/validate functions are imported from [`@/lib/validators`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/lib/validators.ts). The date helpers (`maskDate`, `parseDateBR`, `formatDateBR`) are defined locally in `InquilinosContent.tsx`.

### 8.4 Date Handling (DD/MM/YYYY)

All date fields use the Brazilian format `DD/MM/AAAA`:

- **Form display:** Masked text input with placeholder `DD/MM/AAAA` and auto-slash insertion while typing
- **API submission:** Converted from `DD/MM/YYYY` → `YYYY-MM-DD` (ISO) via `parseDateBR()` before sending
- **API response → form:** Converted from `YYYY-MM-DD` → `DD/MM/YYYY` via `formatDateBR()` when loading for editing
- **Profile card display:** Uses `Intl.DateTimeFormat('pt-BR')` for localized rendering

**Affected fields:** `date_of_birth`, `move_in_date`, `move_out_date`

---

## 9. Navigation & Auth

### 9.1 Sidebar Link

Added to [`Sidebar.tsx`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/components/Sidebar.tsx) between "Corretores" and "Meu Perfil":

- **Icon:** `UserCheck` (from `lucide-react`)
- **Label:** "Inquilinos"
- **Route:** `/inquilinos` (pt) or `/{lang}/inquilinos`
- **Active highlight:** `bg-accent` class applied when current path matches

### 9.2 Middleware Protection

The route `/[lang]/inquilinos` is protected by the existing Clerk middleware. Unauthenticated users are redirected to the login page.

---

## 10. Database Setup & Migrations

### First-time setup

Run the SQL migration in the Supabase SQL Editor:

```sql
-- File: packages/core/database/tenant_setup.sql
-- Prerequisite: agency_setup.sql, agent_setup.sql, phase1_dashboard_setup.sql
```

### If the tenants table already exists

If you originally created the table with `email TEXT NOT NULL`, run:

```sql
ALTER TABLE public.tenants ALTER COLUMN email DROP NOT NULL;
```

---

## 11. Cross-Module Dependencies

| Module | Dependency | Relationship |
|--------|-----------|-------------|
| **Profiles** (`profiles`) | `tenants.user_id` → `profiles.id` | Owner of the tenant record |
| **Properties** (`properties`) | `tenants.property_id` → `properties.id` | Associated property (RESTRICT delete) |
| **Imobiliária** (`agencies`) | `tenants.agency_id` → `agencies.id` | Managing agency (SET NULL on delete) |
| **Corretores** (`agents`) | `tenants.agent_id` → `agents.id` | Responsible agent (SET NULL on delete) |
| **Validators** (`lib/validators.ts`) | Shared utility | CPF, phone, email, CEP functions |
| **CEP API** (`/api/cep`) | External API call | Address auto-fill from postal code |

---

## 12. Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Email is optional** | Many tenants in Brazil don't have or share email addresses. Making it optional reduces friction during registration. |
| **DD/MM/YYYY text inputs** (not `type="date"`) | Browser `type="date"` renders in the OS locale (often `mm/dd/yyyy` on English systems). Masked text inputs ensure consistent DD/MM/YYYY format for Brazilian users. |
| **Soft delete** (not hard delete) | Preserves audit trail and allows recovery. Partial unique index on CPF excludes deleted rows, allowing re-registration. |
| **Property ON DELETE RESTRICT** | A property with registered tenants cannot be accidentally deleted. User must remove or reassign tenants first. |
| **Agency/Agent ON DELETE SET NULL** | Deleting an agency or agent doesn't destroy tenant records. The management info is preserved (tenant continues with null references). |
| **CPF uniqueness per user** (not global) | Different users may legitimately manage the same tenant (e.g., tenant moves between landlords). |
| **Date helpers inline** (not in `validators.ts`) | `maskDate`, `parseDateBR`, `formatDateBR` are specific to the tenant form pattern and not yet needed elsewhere. They can be migrated to `validators.ts` when reused. |
| **No lease financial data** | Per spec: "Do not duplicate lease financial data." Occupancy dates and status are tracked here; detailed contract data belongs in the future Lease module. |

---

## 13. Future Integration: Lease Module

The tenant module contains **placeholders** for integration with a future Lease (Contrato/Locação) module:

1. **Delete guard:** In `DELETE /api/tenants/[id]`, there is a commented-out section that will check for active leases before allowing deletion. When the Lease module is implemented, uncomment and update the query.

2. **Profile card:** The `TenantProfileCard` displays a "Nenhum contrato vinculado" placeholder in the "Contrato de Locação" section. This should be replaced with actual lease data when available.

3. **Form note:** The "Informações de Ocupação" section header explicitly states: "Informações contratuais detalhadas pertencem ao registro de Contrato/Locação."

---

## 14. Changelog

| Date | Version | Description |
|------|---------|-------------|
| 2026-09-02 | 1.0 | Initial implementation: full CRUD, search/filter, form with 6 sections, soft delete |
| 2026-09-02 | 1.1 | Date fields changed from `type="date"` to DD/MM/YYYY masked text inputs; email made optional |
