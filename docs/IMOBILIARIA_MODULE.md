# Imobiliária (Agency) Module

**Version:** 1.0  
**Last updated:** 2026-09-02  
**Author:** Kitnets Engineering

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & File Structure](#2-architecture--file-structure)
3. [Data Model](#3-data-model)
   - 3.1 [Agency Interface](#31-agency-interface)
   - 3.2 [AgencyMember Interface](#32-agencymember-interface)
   - 3.3 [AgencyFormData Interface](#33-agencyformdata-interface)
   - 3.4 [Database Schema — `agencies`](#34-database-schema--agencies)
   - 3.5 [Database Schema — `agency_members`](#35-database-schema--agency_members)
   - 3.6 [Soft Delete Columns](#36-soft-delete-columns)
4. [Multi-Agency Architecture](#4-multi-agency-architecture)
   - 4.1 [Relationship Model](#41-relationship-model)
   - 4.2 [Role System](#42-role-system)
5. [API Routes](#5-api-routes)
   - 5.1 [GET /api/agencies](#51-get-apiagencies)
   - 5.2 [POST /api/agencies](#52-post-apiagencies)
   - 5.3 [PUT /api/agencies/[id]](#53-put-apiagenciesid)
   - 5.4 [DELETE /api/agencies/[id]](#54-delete-apiagenciesid)
   - 5.5 [GET /api/cep](#55-get-apicep)
6. [Components](#6-components)
   - 6.1 [Page Component (`page.tsx`)](#61-page-component-pagetsx)
   - 6.2 [ImobiliariaContent (Page Orchestrator)](#62-imobiliariacontent-page-orchestrator)
   - 6.3 [AgencyProfileCard](#63-agencyprofilecard)
7. [UI Flow & States](#7-ui-flow--states)
   - 7.1 [State Machine](#71-state-machine)
   - 7.2 [List View](#72-list-view)
   - 7.3 [Registration Form](#73-registration-form)
   - 7.4 [Edit Flow](#74-edit-flow)
   - 7.5 [Delete Flow](#75-delete-flow)
8. [Validation & Normalization](#8-validation--normalization)
   - 8.1 [Client-side Validation](#81-client-side-validation)
   - 8.2 [Server-side Validation](#82-server-side-validation)
   - 8.3 [Field Normalization](#83-field-normalization)
   - 8.4 [Validator Functions](#84-validator-functions)
9. [CEP Auto-fill](#9-cep-auto-fill)
10. [Navigation & Auth](#10-navigation--auth)
    - 10.1 [Sidebar Link](#101-sidebar-link)
    - 10.2 [Middleware Protection](#102-middleware-protection)
11. [Database Migrations](#11-database-migrations)
12. [Dependencies & APIs](#12-dependencies--apis)
13. [Design Decisions](#13-design-decisions)
14. [Known Issues & Future Work](#14-known-issues--future-work)
15. [Changelog](#15-changelog)

---

## 1. Overview

The **Imobiliária Module** (`/[lang]/imobiliaria`) allows authenticated users to register, manage, and organize multiple real estate agencies on Kitnets.com. Each user can create an unlimited number of agencies and manage them independently.

### Key Features

- **Multi-Agency Support** — Users can register and manage multiple agencies (no limit)
- **Accordion List View** — Compact overview of all agencies with expand/collapse details
- **Brazilian-Specific Validations** — CNPJ check-digit algorithm, phone masking, CEP auto-fill
- **Soft Delete** — Agencies are soft-deleted with `deleted_at`/`deleted_by` for data recovery
- **Role-Based Access** — OWNER/ADMIN can edit; only OWNER can delete
- **WhatsApp Integration** — Direct wa.me link on collapsed agency row when WhatsApp is enabled
- **CEP Auto-Fill** — ViaCEP proxy auto-populates address fields from a postal code

---

## 2. Architecture & File Structure

```
apps/web/src/
├── app/[lang]/imobiliaria/
│   ├── page.tsx                    # Server component (metadata + lang)
│   └── ImobiliariaContent.tsx      # Client component (1096 lines — list/form/accordion)
├── app/api/
│   ├── agencies/
│   │   ├── route.ts                # GET (list all) + POST (create agency)
│   │   └── [id]/
│   │       └── route.ts            # PUT (update) + DELETE (soft-delete)
│   └── cep/
│       └── route.ts                # CEP lookup proxy (ViaCEP)
├── components/
│   ├── Sidebar.tsx                 # "Imobiliária" nav link (lines 286-295)
│   └── imobiliaria/
│       └── AgencyProfileCard.tsx   # Agency detail card (expanded view)
├── lib/
│   └── validators.ts              # CNPJ, phone, CEP, email, URL validators
├── types/
│   └── agency.ts                   # Agency, AgencyMember, AgencyFormData, AgencyWithRole
└── middleware.ts                   # /imobiliaria(.*)  protected route

packages/core/database/
├── agency_setup.sql                # Initial schema (agencies + agency_members)
└── agency_soft_delete.sql          # Migration: deleted_at + deleted_by columns
```

---

## 3. Data Model

### 3.1 Agency Interface

```typescript
interface Agency {
    id: string;
    name: string;                    // Razão social (required)
    trade_name: string | null;       // Nome fantasia
    cnpj: string | null;             // Digits only: "12345678000190"
    creci_number: string | null;     // e.g. "6013"
    creci_state: string | null;      // UF: "MG", "SP"
    creci_type: 'PJ' | 'PF' | null;
    owner_name: string | null;       // Legal representative name

    main_phone: string;              // E.164: "+5531999999999"
    additional_phone: string | null;
    main_phone_whatsapp: boolean;
    email: string | null;
    website: string | null;          // Normalized: "https://..."

    postal_code: string;             // Digits only: "35450075"
    street: string;
    street_number: string;
    address_complement: string | null;
    neighborhood: string;
    city: string;
    state: string;                   // UF: "MG"
    country: string;                 // Default: "BR"

    logo_url: string | null;
    description: string | null;

    status: 'DRAFT' | 'ACTIVE' | 'VERIFIED' | 'SUSPENDED';
    verified_at: string | null;
    created_at: string;
    updated_at: string;
}
```

### 3.2 AgencyMember Interface

```typescript
interface AgencyMember {
    id: string;
    agency_id: string;               // FK → agencies.id
    user_id: string;                  // FK → profiles.id
    role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';
    created_at: string;
}
```

### 3.3 AgencyFormData Interface

Form data for client-side state. Excludes server-managed fields (`id`, `status`, `created_at`, etc.):

```typescript
interface AgencyFormData {
    name: string;          trade_name: string;
    cnpj: string;          creci_number: string;
    creci_state: string;   creci_type: string;
    owner_name: string;
    main_phone: string;    additional_phone: string;
    main_phone_whatsapp: boolean;
    email: string;         website: string;
    postal_code: string;   street: string;
    street_number: string; address_complement: string;
    neighborhood: string;  city: string;
    state: string;         country: string;
}
```

### 3.4 Database Schema — `agencies`

```sql
CREATE TABLE public.agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    trade_name TEXT,
    cnpj TEXT UNIQUE,                                    -- Digits only
    creci_number TEXT,
    creci_state TEXT,
    creci_type TEXT CHECK (creci_type IN ('PJ', 'PF')),
    owner_name TEXT,
    main_phone TEXT NOT NULL,                            -- E.164
    additional_phone TEXT,
    main_phone_whatsapp BOOLEAN DEFAULT false,
    email TEXT,
    website TEXT,
    postal_code TEXT NOT NULL,                            -- Digits only
    street TEXT NOT NULL,
    street_number TEXT NOT NULL,
    address_complement TEXT,
    neighborhood TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'BR',
    logo_url TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('DRAFT', 'ACTIVE', 'VERIFIED', 'SUSPENDED')),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,                              -- Soft delete
    deleted_by UUID REFERENCES public.profiles(id)       -- Who deleted
);
```

**Indexes:**
- `idx_agencies_cnpj` on `cnpj` (unique constraint)
- `idx_agencies_deleted_at` partial index on `deleted_at WHERE deleted_at IS NULL`

**Triggers:**
- `update_agencies_updated_at` — auto-updates `updated_at` on row changes

### 3.5 Database Schema — `agency_members`

```sql
CREATE TABLE public.agency_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'VIEWER'
        CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(agency_id, user_id)
);
```

**Indexes:**
- `idx_agency_members_user_id` on `user_id`
- Unique constraint on `(agency_id, user_id)`

### 3.6 Soft Delete Columns

Added via `agency_soft_delete.sql`:

| Column | Type | Description |
|--------|------|-------------|
| `deleted_at` | `TIMESTAMPTZ` | When set, the agency is considered deleted |
| `deleted_by` | `UUID` (FK → profiles) | The user who performed the deletion |

All queries filter with `.is('deleted_at', null)` to exclude soft-deleted records.

---

## 4. Multi-Agency Architecture

### 4.1 Relationship Model

```
User (profiles)
  |
  +-- agency_members (role: OWNER) ── Agency 1
  +-- agency_members (role: OWNER) ── Agency 2
  +-- agency_members (role: ADMIN) ── Agency 3
```

- A user can be associated with **multiple agencies** through `agency_members`
- Each `agency_members` row is unique on `(agency_id, user_id)`
- The user who creates an agency is automatically assigned the `OWNER` role
- There is **no limit** on the number of agencies a user can create

### 4.2 Role System

| Role | Can View | Can Edit | Can Delete |
|------|----------|----------|------------|
| OWNER | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ❌ |
| MANAGER | ✅ | ❌ | ❌ |
| AGENT | ✅ | ❌ | ❌ |
| VIEWER | ✅ | ❌ | ❌ |

> **Note:** Currently only OWNER role is assigned automatically on creation. Multi-user membership management (inviting users) is planned for a future iteration.

---

## 5. API Routes

All agency API routes use the **service role key** to bypass RLS, with authentication handled via Clerk's `currentUser()`. The user's `profiles.id` is resolved from their `clerk_id`.

### 5.1 GET /api/agencies

**Purpose:** Returns all agencies associated with the current user.

**Response:**
```json
{ "agencies": [AgencyWithRole, ...] }
```

**Logic:**
1. Authenticate via Clerk
2. Find `profiles.id` from `clerk_id`
3. Query all `agency_members` rows for user
4. Fetch all matching agencies (excluding `deleted_at IS NOT NULL`)
5. Merge role into each agency object
6. Return ordered by `created_at` descending (newest first)

### 5.2 POST /api/agencies

**Purpose:** Creates a new agency and assigns the user as OWNER.

**Request Body:** `AgencyFormData` (JSON)

**Response:**
```json
{ "success": true, "agency": AgencyWithRole }
```

**Logic:**
1. Validate required fields (name, main_phone, address fields)
2. Validate optional fields (CNPJ check-digit, email syntax, phone format)
3. Check CNPJ uniqueness (excluding soft-deleted agencies)
4. Normalize fields (phone → E.164, email → lowercase, website → https://)
5. Insert into `agencies` with `status: 'ACTIVE'`
6. Insert into `agency_members` with `role: 'OWNER'`
7. On membership insert failure, rollback agency creation

### 5.3 PUT /api/agencies/[id]

**Purpose:** Updates an existing agency. Requires OWNER or ADMIN role.

**Request Body:** `AgencyFormData` (JSON)

**Response:**
```json
{ "success": true, "agency": AgencyWithRole }
```

**Permission:** User must have `OWNER` or `ADMIN` role for the agency.

### 5.4 DELETE /api/agencies/[id]

**Purpose:** Soft-deletes an agency. Requires OWNER role.

**Response:**
```json
{ "success": true }
```

**Logic:**
1. Verify user has OWNER role (not just ADMIN)
2. Verify agency exists and is not already deleted
3. Set `deleted_at = NOW()` and `deleted_by = profile.id`

**Permission:** Only `OWNER` can delete.

### 5.5 GET /api/cep

**Purpose:** Proxy for ViaCEP API to auto-fill address fields.

**Query:** `?code=35450075`

**Response:**
```json
{
    "street": "Rua Primo Cavaliere",
    "neighborhood": "Centro",
    "city": "Itabirito",
    "state": "MG",
    "complement": ""
}
```

**Caching:** 24-hour revalidation via Next.js `fetch` options.

---

## 6. Components

### 6.1 Page Component (`page.tsx`)

Server component at `app/[lang]/imobiliaria/page.tsx`:
- Force-dynamic rendering (`export const dynamic = 'force-dynamic'`)
- Generates metadata: `title: 'Imobiliária'`
- Passes `lang` prop to `ImobiliariaContent`

### 6.2 ImobiliariaContent (Page Orchestrator)

Client component (~1096 lines). Manages the entire agency flow:

**State variables:**
| State | Type | Purpose |
|-------|------|---------|
| `pageState` | `'loading' \| 'list' \| 'form' \| 'editing'` | Current page view |
| `agencies` | `AgencyWithRole[]` | All user's agencies |
| `editingAgency` | `AgencyWithRole \| null` | Agency being edited |
| `expandedId` | `string \| null` | Currently expanded accordion row |
| `deletingAgency` | `AgencyWithRole \| null` | Agency pending delete confirmation |
| `form` | `AgencyFormData` | Current form state |
| `errors` | `FieldErrors` | Validation errors per field |

**Key functions:**
- `fetchAgencies()` — Loads all user's agencies from API
- `toggleExpand(id)` — Accordion expand/collapse (one at a time)
- `startAdding()` — Reset form and switch to `form` state
- `startEditing(agency)` — Pre-fill form and switch to `editing` state
- `cancelForm()` — Return to `list` state
- `confirmDelete(agency)` / `executeDelete()` — Delete flow with confirmation
- `handleSubmit()` — Validate, submit to API, refetch list
- `lookupCEP()` — CEP auto-fill via `/api/cep`
- `validate()` — Client-side validation returning field errors

### 6.3 AgencyProfileCard

Presentational component at `components/imobiliaria/AgencyProfileCard.tsx`:

**Props:**
```typescript
interface AgencyProfileCardProps {
    agency: AgencyWithRole;
    onEdit: () => void;
    onDelete?: () => void;
}
```

**Sections:**
1. **Header** — Logo placeholder + name + trade name + status badge + role badge
2. **Business Info** — CNPJ (formatted), CRECI (number + UF + type), legal representative
3. **Contact** — Main phone (with WhatsApp indicator), additional phone, email, website
4. **Address** — Full formatted address + CEP
5. **Description** — "Sobre" section (if provided)
6. **Actions** — "Editar dados" button (OWNER/ADMIN) + "Excluir" button (OWNER only)

---

## 7. UI Flow & States

### 7.1 State Machine

```
               ┌──── startAdding() ────┐
               │                       ▼
loading ──→ list ◄──── cancelForm() ── form
               │                       ▲
               │                       │
               └── startEditing() ──→ editing
               │                       │
               │    handleSubmit() ─────┘
               │        │
               │        └──→ fetchAgencies() ──→ list
               │
               └── confirmDelete() ──→ [modal] ──→ executeDelete() ──→ list
```

### 7.2 List View

The default view after loading. Shows:
- **Header:** "Imobiliárias" + "+ Adicionar imobiliária" button
- **Empty state:** Icon + message + CTA button (when no agencies)
- **Agency rows:** Compact accordion rows with:
  - Expand/collapse chevron icon
  - Agency name (bold, truncated)
  - Subtitle: trade name + city/state
  - WhatsApp link (green, with wa.me URL — hidden on mobile)
  - Status badge (Ativa, Verificada, Rascunho, Suspensa)
- **Expanded detail:** `AgencyProfileCard` with edit + delete buttons
- **Delete modal:** Overlay with confirmation + cancel/confirm buttons

### 7.3 Registration Form

Four form sections matching the spec:

1. **Informações da imobiliária** — Name*, trade name, CNPJ (masked `00.000.000/0000-00`), CRECI + UF + type
2. **Responsável** — Owner/legal representative name
3. **Contato** — Main phone* (masked `(XX) XXXXX-XXXX`) + WhatsApp checkbox, additional phone, email, website
4. **Endereço** — CEP* + "Buscar CEP" button, street*, number*, complement, neighborhood*, city*, state* (dropdown), country (read-only "Brasil")

**Footer:** "Voltar à lista" + "Cadastrar imobiliária" (disabled until valid)

### 7.4 Edit Flow

Pre-fills the form with `agencyToFormData(agency)`:
- Phones formatted from E.164 to `(XX) XXXXX-XXXX`
- CNPJ formatted from digits to `XX.XXX.XXX/XXXX-XX`
- CEP formatted from digits to `XXXXX-XXX`
- Website stripped of `https://` prefix

On submit, sends `PUT /api/agencies/[id]` then refetches list.

### 7.5 Delete Flow

1. User clicks "Excluir" on expanded card
2. Confirmation modal appears with agency name
3. "Cancelar" dismisses modal
4. "Excluir imobiliária" calls `DELETE /api/agencies/[id]`
5. On success, agency is removed from local state immediately
6. If the deleted agency was expanded, accordion closes

---

## 8. Validation & Normalization

### 8.1 Client-side Validation

**Required fields:** `name`, `main_phone`, `postal_code`, `street`, `street_number`, `neighborhood`, `city`, `state`

**Optional field validation:**
- CNPJ: must be exactly 14 digits with valid check-digits (mod 11)
- Email: basic syntax check
- Additional phone: format check
- Website: URL format check

**Submit button** is disabled until all required fields are non-empty and valid.

### 8.2 Server-side Validation

Mirrors client-side validation with the same rules. Returns `{ errors: { field: "message" } }` on validation failure (HTTP 400).

### 8.3 Field Normalization

| Field | Input | Stored As |
|-------|-------|-----------|
| CNPJ | `24.055.400/0001-62` | `24055400000162` |
| Phone | `(31) 3561-3173` | `+553135613173` |
| CEP | `35450-075` | `35450075` |
| Email | `Contact@AGENCY.com` | `contact@agency.com` |
| Website | `www.example.com` | `https://www.example.com` |
| State | `mg` | `MG` |

### 8.4 Validator Functions

Located in `apps/web/src/lib/validators.ts`:

| Function | Purpose |
|----------|---------|
| `validateCNPJ(digits)` | Full check-digit algorithm (mod 11, two digits) |
| `maskCNPJ(input)` | Live masking: `12345678000190` → `12.345.678/0001-90` |
| `formatCNPJ(digits)` | Format stored digits for display |
| `parseCNPJ(formatted)` | Strip to digits only |
| `maskPhone(input)` | Live masking: `31999999999` → `(31) 99999-9999` |
| `formatPhone(e164)` | E.164 → display format |
| `parsePhoneToE164(phone)` | Display → E.164 format |
| `validatePhone(phone)` | Check phone format validity |
| `maskCEP(input)` | Live masking: `35450075` → `35450-075` |
| `formatCEP(digits)` | Format stored digits for display |
| `parseCEP(formatted)` | Strip to digits only |
| `validateCEP(cep)` | Must be exactly 8 digits |
| `validateEmail(email)` | Email syntax check |
| `normalizeEmail(email)` | Lowercase + trim |
| `validateWebsite(url)` | URL format check |
| `normalizeWebsite(url)` | Add `https://` if missing, strip trailing slash |
| `BRAZILIAN_STATES` | Array of `{ code: 'AC', name: 'Acre' }` for dropdowns |

---

## 9. CEP Auto-fill

**Trigger:** User enters a valid 8-digit CEP and clicks "Buscar CEP" (or the CEP field has a valid value).

**Flow:**
1. Client validates CEP format (8 digits)
2. Calls `GET /api/cep?code=35450075`
3. API proxies to `https://viacep.com.br/ws/35450075/json/`
4. Response mapped: `logradouro` → `street`, `bairro` → `neighborhood`, `localidade` → `city`, `uf` → `state`
5. Auto-filled fields overwrite current values (user can still edit)
6. Validation errors on auto-filled fields are cleared
7. Success indicator shown: "Endereço preenchido automaticamente."

**Error handling:**
- Invalid CEP format: "CEP deve ter 8 dígitos."
- CEP not found (ViaCEP `erro: true`): "CEP não encontrado."
- Network error: "Erro ao consultar CEP. Tente novamente."

**Caching:** API response cached for 24 hours via Next.js `revalidate: 86400`.

---

## 10. Navigation & Auth

### 10.1 Sidebar Link

Added to `Sidebar.tsx` (lines 286-295), inside the `isSignedIn && FLAGS.SHOW_DASHBOARD_LINKS` block:

```tsx
<Link href={lang === 'pt' ? '/imobiliaria' : `/${lang}/imobiliaria`}>
    <Building2 className="h-5 w-5" />
    <span>Imobiliária</span>
</Link>
```

Position: Between "Dashboard" and "Meu Perfil".

### 10.2 Middleware Protection

In `middleware.ts`, the `/imobiliaria(.*)` pattern is added to the protected route matcher:

```typescript
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/imobiliaria(.*)"]);
```

Unauthenticated access redirects to the Clerk login page.

---

## 11. Database Migrations

Two SQL files must be run **in order** in the Supabase SQL Editor:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `packages/core/database/agency_setup.sql` | Create `agencies` and `agency_members` tables, RLS policies, indexes, triggers |
| 2 | `packages/core/database/agency_soft_delete.sql` | Add `deleted_at` and `deleted_by` columns to `agencies`, partial index |

**RLS Policies:**
- `agencies` — Members can SELECT their own agencies via `agency_members` join
- `agency_members` — Members can SELECT their own memberships
- INSERT operations use the service role key (bypass RLS) from API routes

---

## 12. Dependencies & APIs

| Dependency | Purpose |
|------------|---------|
| `@clerk/nextjs` | Authentication (`currentUser()`, `SignOutButton`) |
| `@supabase/supabase-js` | Database operations (service role client) |
| `lucide-react` | Icons (Building2, ChevronDown, Plus, Trash2, etc.) |
| `@kitnets/ui` | Shared Button component |
| `class-variance-authority` | Badge variant styling |
| **ViaCEP API** | `https://viacep.com.br/ws/{cep}/json/` — CEP lookup |

---

## 13. Design Decisions

1. **Soft delete over hard delete** — Agencies may be linked to properties, contracts, or billing in the future. Soft delete preserves data integrity and enables recovery.

2. **Service role key for writes** — All INSERT/UPDATE/DELETE operations use the Supabase service role key (bypassing RLS) with authentication handled at the API route level via Clerk. This matches the existing pattern used by the profiles module.

3. **E.164 phone storage** — Phones stored in international format (`+5531999999999`) for consistency, future SMS/WhatsApp API integration, and unambiguous parsing.

4. **CNPJ as digits only** — Stored without formatting (`24055400000162`) for indexing, uniqueness checks, and consistent validation. Formatting applied on display.

5. **Accordion (one-at-a-time)** — Only one agency expanded at a time to keep the list compact and focused.

6. **OWNER-only delete** — Deletion is restricted to the OWNER role to prevent accidental data loss by admins or managers.

7. **No i18n for form labels** — The agency form uses hardcoded Portuguese labels since this is a Brazil-specific feature (CNPJ, CRECI, CEP). The page title and navigation use the existing dictionary system.

8. **`@/` path alias** — All imports use the `@/` TypeScript path alias instead of relative paths for robustness against directory restructuring.

---

## 14. Known Issues & Future Work

| Item | Status | Description |
|------|--------|-------------|
| **Logo upload** | Planned | Upload agency logo to Supabase Storage and save URL in `logo_url` |
| **Description field in form** | Planned | Add "Sobre a imobiliária" textarea to registration/edit form (DB + API already support it) |
| **Multi-user membership** | Planned | Invite other users as ADMIN/MANAGER/AGENT to an agency |
| **Sidebar badge count** | Planned | Show count of active agencies next to sidebar link |
| **Agency verification** | Planned | Admin workflow to verify agencies (set status to VERIFIED) |
| **Property–Agency linking** | Planned | Associate properties with an agency for listing management |

---

## 15. Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-09-02 | 1.0 | Initial implementation: multi-agency list with accordion, CRUD APIs, soft delete, CNPJ/CEP validation, WhatsApp wa.me link on collapsed row |
