# Corretores (Real Estate Agents) Module

**Version:** 1.0  
**Last updated:** 2026-09-02  
**Author:** Kitnets Engineering  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & File Structure](#2-architecture--file-structure)
3. [Data Model](#3-data-model)
   - 3.1 [Agent Interface](#31-agent-interface)
   - 3.2 [AgentWithAgency Interface](#32-agentwithagency-interface)
   - 3.3 [AgentFormData Interface](#33-agentformdata-interface)
   - 3.4 [Enumerations (`AgentType`, `AgentStatus`)](#34-enumerations-agenttype-agentstatus)
4. [Database Schema & Storage](#4-database-schema--storage)
   - 4.1 [Table: `public.agents`](#41-table-publicagents)
   - 4.2 [Indexes & Uniqueness](#42-indexes--uniqueness)
   - 4.3 [Triggers](#43-triggers)
   - 4.4 [Row Level Security (RLS)](#44-row-level-security-rls)
   - 4.5 [Supabase Storage Bucket: `agent-photos`](#45-supabase-storage-bucket-agent-photos)
5. [Agency Integration](#5-agency-integration)
   - 5.1 [Autonomous vs. Agency-Affiliated](#51-autonomous-vs-agency-affiliated)
   - 5.2 [Dynamic Agency Selection](#52-dynamic-agency-selection)
   - 5.3 [Cascade Behavior (`ON DELETE SET NULL`)](#53-cascade-behavior-on-delete-set-null)
6. [API Routes](#6-api-routes)
   - 6.1 [GET /api/agents](#61-get-apiagents)
   - 6.2 [POST /api/agents](#62-post-apiagents)
   - 6.3 [PUT /api/agents/[id]](#63-put-apiagentsid)
   - 6.4 [DELETE /api/agents/[id]](#64-delete-apiagentsid)
   - 6.5 [POST /api/agents/[id]/photo](#65-post-apiagentsidphoto)
   - 6.6 [DELETE /api/agents/[id]/photo](#66-delete-apiagentsidphoto)
7. [Components](#7-components)
   - 7.1 [Page Component (`page.tsx`)](#71-page-component-pagetsx)
   - 7.2 [CorretoresContent (Page Orchestrator)](#72-corretorescontent-page-orchestrator)
   - 7.3 [AgentProfileCard (Detailed Profile View)](#73-agentprofilecard-detailed-profile-view)
8. [UI Flow & States](#8-ui-flow--states)
   - 8.1 [State Machine](#81-state-machine)
   - 8.2 [List & Accordion View](#82-list--accordion-view)
   - 8.3 [Registration & Edit Form](#83-registration--edit-form)
   - 8.4 [Photo Upload Workflow](#84-photo-upload-workflow)
   - 8.5 [Delete Flow (Soft Delete Confirmation)](#85-delete-flow-soft-delete-confirmation)
9. [Validation & Normalization](#9-validation--normalization)
   - 9.1 [Client-side Validation](#91-client-side-validation)
   - 9.2 [Server-side Validation](#92-server-side-validation)
   - 9.3 [Field Masking & Normalization](#93-field-masking--normalization)
10. [Navigation & Auth](#10-navigation--auth)
    - 10.1 [Sidebar Link](#101-sidebar-link)
    - 10.2 [Middleware Protection](#102-middleware-protection)
11. [Database Setup & Migrations](#11-database-setup--migrations)
12. [Design Decisions](#12-design-decisions)
13. [Changelog](#13-changelog)

---

## 1. Overview

The **Corretores Module** (`/[lang]/corretores`) allows authenticated Kitnets.com users to register, organize, and manage real estate agents (corretores de imóveis). Agents can be registered as either:

- **Autônomo (Independent):** Operating individually without mandatory agency affiliation.
- **Vinculado a Imobiliária (Agency-Affiliated):** Linked directly to one of the user's registered agencies from the [Imobiliária Module](file:///c:/Users/Administrator/Documents/Kitnets/docs/IMOBILIARIA_MODULE.md).

### Key Features

- **Multi-Agent Management:** Users can manage an unlimited roster of real estate agents.
- **Photo Upload & Crop Preview:** Direct profile picture upload with real-time browser preview, stored on Supabase Storage (`agent-photos` bucket) with automatic cleanup of replaced assets.
- **Accordion Row with Quick WhatsApp Contact:** Collapsed rows display agent avatar, full name, CRECI/agency subtitle, status badge, and clickable WhatsApp / phone link.
- **Inline WhatsApp Selection:** Main phone and additional phone each feature an integrated WhatsApp checkbox, automatically creating direct `wa.me` chat links.
- **Agency Linkage with Resilient Soft Deletes:** When an agency is deleted or updated, agents remain preserved through PostgreSQL foreign key `ON DELETE SET NULL`.
- **CRECI & CPF Validation:** Brazilian check-digit algorithms validate CPFs and ensure CRECI uniqueness per Brazilian state (UF).
- **Audit Trails & Soft Delete:** Agents are soft-deleted with timestamp and user ID tracking (`deleted_at`, `deleted_by`).

---

## 2. Architecture & File Structure

```
apps/web/src/
├── app/[lang]/corretores/
│   ├── page.tsx                       # Server Component (metadata, force-dynamic)
│   └── CorretoresContent.tsx          # Client Component (orchestrates list/form/accordion/photo)
├── app/api/agents/
│   ├── route.ts                       # GET (list all) + POST (create agent)
│   └── [id]/
│       ├── route.ts                   # PUT (update) + DELETE (soft-delete)
│       └── photo/
│           └── route.ts               # POST (upload image) + DELETE (remove image)
├── components/
│   ├── Sidebar.tsx                    # "Corretores" nav item with Users icon
│   └── corretores/
│       └── AgentProfileCard.tsx       # Expanded profile card with full contact/details
├── types/
│   └── agent.ts                       # Agent, AgentWithAgency, AgentFormData, AgentType, AgentStatus
└── middleware.ts                      # Route protection (/corretores(.*))

packages/core/database/
└── agent_setup.sql                    # Table schema, indexes, trigger, RLS, storage setup
```

---

## 3. Data Model

### 3.1 Agent Interface

Represents the core database record from `public.agents`:

```typescript
export interface Agent {
    id: string;
    user_id: string;

    // Personal
    full_name: string;
    cpf: string | null;                           // Digits only: "12345678901"
    photo_url: string | null;

    // Professional
    creci_number: string;
    creci_state: string;                          // UF: "MG", "SP", etc.

    // Type & Agency
    agent_type: 'AUTONOMO' | 'IMOBILIARIA';
    agency_id: string | null;                     // FK to public.agencies(id)

    // Contact
    main_phone: string;                           // E.164: "+5531999999999"
    main_phone_whatsapp: boolean;
    additional_phone: string | null;
    additional_phone_whatsapp: boolean;
    email: string | null;
    website: string | null;                       // Normalized: "https://..."

    // Extra
    notes: string | null;

    // Status & timestamps
    status: 'ACTIVE' | 'INACTIVE';
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    deleted_by?: string | null;
}
```

### 3.2 AgentWithAgency Interface

Returned by `GET /api/agents` by joining `public.agencies`:

```typescript
export interface AgentWithAgency extends Agent {
    agency_name: string | null;
}
```

### 3.3 AgentFormData Interface

Used for client-side forms. Phone numbers, CPF, and CRECI are kept in masked display format while editing and converted prior to API calls:

```typescript
export interface AgentFormData {
    full_name: string;
    cpf: string;                                  // Masked: "000.000.000-00"
    creci_number: string;
    creci_state: string;
    agent_type: 'AUTONOMO' | 'IMOBILIARIA';
    agency_id: string;                            // Empty string when autonomous
    main_phone: string;                           // Masked: "(31) 99999-9999"
    main_phone_whatsapp: boolean;
    additional_phone: string;                     // Masked: "(31) 3561-3173"
    additional_phone_whatsapp: boolean;
    email: string;
    website: string;
    notes: string;
    status: 'ACTIVE' | 'INACTIVE';
}
```

### 3.4 Enumerations (`AgentType`, `AgentStatus`)

- **`AgentType`**:
  - `'AUTONOMO'`: Works independently without an agency link.
  - `'IMOBILIARIA'`: Affiliated with an agency; requires selection of a registered agency.
- **`AgentStatus`**:
  - `'ACTIVE'`: Normal active agent (badge variant: `default`).
  - `'INACTIVE'`: Deactivated agent (badge variant: `secondary`).

---

## 4. Database Schema & Storage

### 4.1 Table: `public.agents`

Defined in [`agent_setup.sql`](file:///c:/Users/Administrator/Documents/Kitnets/packages/core/database/agent_setup.sql):

```sql
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Owner profile
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Personal info
    full_name TEXT NOT NULL,
    cpf TEXT,                                        -- Digits only: "12345678901"
    photo_url TEXT,

    -- Professional registration
    creci_number TEXT NOT NULL,
    creci_state TEXT NOT NULL,                       -- UF: "MG", "SP"

    -- Type of work
    agent_type TEXT NOT NULL DEFAULT 'AUTONOMO'
        CHECK (agent_type IN ('AUTONOMO', 'IMOBILIARIA')),

    -- Link to agency
    agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,

    -- Contact
    main_phone TEXT NOT NULL,                        -- E.164: "+5531999999999"
    main_phone_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    additional_phone TEXT,
    additional_phone_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    email TEXT,
    website TEXT,

    -- Notes & Status
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),

    -- Timestamps & Soft Delete
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.profiles(id)
);
```

### 4.2 Indexes & Uniqueness

1. **CRECI Uniqueness per State:**
   ```sql
   CREATE UNIQUE INDEX idx_agents_creci_unique
       ON public.agents (creci_number, creci_state)
       WHERE deleted_at IS NULL;
   ```
2. **CPF Uniqueness (partial index for non-null):**
   ```sql
   CREATE UNIQUE INDEX idx_agents_cpf_unique
       ON public.agents (cpf)
       WHERE deleted_at IS NULL AND cpf IS NOT NULL;
   ```
3. **Lookup Optimizations:**
   ```sql
   CREATE INDEX idx_agents_user_id ON public.agents (user_id);
   CREATE INDEX idx_agents_agency_id ON public.agents (agency_id) WHERE agency_id IS NOT NULL;
   CREATE INDEX idx_agents_deleted_at ON public.agents (deleted_at) WHERE deleted_at IS NULL;
   ```

### 4.3 Triggers

- **`update_agents_updated_at`**: Automatically sets `updated_at = NOW()` on row updates.

### 4.4 Row Level Security (RLS)

- Enabled on `public.agents`.
- Read policy: `agents_select_own` restricts `SELECT` to `user_id = auth.uid()`.
- Mutating operations (`INSERT`, `UPDATE`, `DELETE`) utilize the service role key through Next.js API routes with server-side profile ownership checks.

### 4.5 Supabase Storage Bucket: `agent-photos`

- **Bucket ID:** `agent-photos`
- **Public:** `true` (avatar pictures are served publicly)
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`
- **Max file size:** 2 MB
- **File path structure:** `{agentId}/{timestamp}.{ext}`

---

## 5. Agency Integration

### 5.1 Autonomous vs. Agency-Affiliated

When creating or editing an agent, users select their operating type:
- **`AUTONOMO`**: Clears `agency_id`. The list and card views display "Corretor autônomo".
- **`IMOBILIARIA`**: Displays a dropdown populated with the user's agencies from `GET /api/agencies`.

### 5.2 Dynamic Agency Selection

The form component fetches agencies in parallel on mount. If the user does not yet have any agencies registered, a helpful warning is displayed urging them to register an agency first via the Imobiliária module.

### 5.3 Cascade Behavior (`ON DELETE SET NULL`)

If an agency is deleted, associated agents are **not** removed. Their `agency_id` is set to `NULL`, automatically preserving agent records while converting their association to autonomous.

---

## 6. API Routes

All agent endpoints authenticate with `@clerk/nextjs/server` `currentUser()` and map to `public.profiles`.

### 6.1 GET /api/agents

Fetches all non-deleted agents owned by the current user with agency name joined:

```typescript
// Response 200 OK
{
  "agents": [
    {
      "id": "c1f7...",
      "full_name": "Artur Pedrosa",
      "cpf": "12345678901",
      "creci_number": "12345",
      "creci_state": "MG",
      "agent_type": "IMOBILIARIA",
      "agency_id": "a90b...",
      "agency_name": "Kitnets Imóveis",
      "main_phone": "+5531986364575",
      "main_phone_whatsapp": true,
      "additional_phone": "+553135613173",
      "additional_phone_whatsapp": false,
      "email": "artur@kitnets.com",
      "website": "https://www.kitnets.com",
      "notes": "Corretor responsável por kitnets em Ouro Preto",
      "status": "ACTIVE",
      "photo_url": "https://.../agent-photos/c1f7.../1725289999.png"
    }
  ]
}
```

### 6.2 POST /api/agents

Creates a new agent.

- **Validates:**
  - `full_name` (required, trimmed)
  - `creci_number` & `creci_state` (required, checked for duplicate in same state)
  - `agent_type` (`AUTONOMO` or `IMOBILIARIA`)
  - `agency_id` (required if `agent_type === 'IMOBILIARIA'`)
  - `main_phone` (required, validated & converted to E.164)
  - `cpf` (optional, validated with check-digit & checked for duplicates)
  - `email`, `additional_phone`, `website` (optional, validated & normalized)
- **Status Codes:** `200` (success), `400` (validation errors), `401` (unauthorized), `409` (CRECI or CPF conflict), `500` (internal error).

### 6.3 PUT /api/agents/[id]

Updates an existing agent.
- Ensures current user owns the agent.
- Enforces CRECI and CPF uniqueness excluding the current agent's own record (`neq('id', agentId)`).
- Normalizes and writes updated fields.

### 6.4 DELETE /api/agents/[id]

Soft-deletes the agent:
```sql
UPDATE public.agents
SET deleted_at = NOW(), deleted_by = profile.id
WHERE id = agentId;
```

### 6.5 POST /api/agents/[id]/photo

Uploads agent avatar:
- Expects `multipart/form-data` with key `file`.
- Enforces max size 2 MB and MIME types (`image/jpeg`, `image/png`, `image/webp`).
- Automatically deletes previous photo from `agent-photos` bucket if present.
- Updates `public.agents.photo_url` with public CDN URL.

### 6.6 DELETE /api/agents/[id]/photo

Removes agent avatar from storage and sets `photo_url = null`.

---

## 7. Components

### 7.1 Page Component (`page.tsx`)

Located at `apps/web/src/app/[lang]/corretores/page.tsx`:
- Server component with `dynamic = 'force-dynamic'` and `revalidate = 0`.
- Renders page title and metadata.
- Mounts `CorretoresContent`.

### 7.2 CorretoresContent (Page Orchestrator)

Client component at `apps/web/src/app/[lang]/corretores/CorretoresContent.tsx`:
- **State Machine:** `loading` → `list` ↔ `form` / `editing`.
- **Photo Workflow:** Manages local file selection (`handlePhotoSelect`), immediate thumbnail preview (`photoPreview`), and upload invocation (`uploadPhoto`) following agent save.
- **Accordion:** Manages `expandedId` to reveal one detailed `AgentProfileCard` at a time.
- **Masking:** Handles phone (`(XX) XXXXX-XXXX`), CPF (`000.000.000-00`), and CRECI formatting.

### 7.3 AgentProfileCard (Detailed Profile View)

Presentational component at `apps/web/src/components/corretores/AgentProfileCard.tsx`:
- Displays large photo avatar (or colored initials fallback).
- Header with agent name, CRECI tag, agency badge, and active/inactive status.
- Section 1: **Dados Profissionais & Pessoais** (CPF, CRECI, Tipo de atuação, Imobiliária vinculada).
- Section 2: **Contato** (Main phone with WhatsApp indicator/link, additional phone with WhatsApp indicator/link, email, website).
- Section 3: **Observações** (Rendered if notes are present).
- Actions: "Editar dados" and "Excluir" buttons.

---

## 8. UI Flow & States

### 8.1 State Machine

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
               │        └──→ [uploadPhoto] ──→ fetchAgents() ──→ list
               │
               └── confirmDelete() ──→ [modal] ──→ executeDelete() ──→ list
```

### 8.2 List & Accordion View

- Displays total agent count header and "+ Adicionar corretor" button.
- Empty state with illustration when no agents exist.
- Each agent row presents:
  1. Small avatar or initials
  2. Full name
  3. Subtitle: `CRECI-MG 12345 · Kitnets Imóveis` (or `Corretor autônomo`)
  4. WhatsApp / Phone pill (direct `wa.me` link in green if WhatsApp enabled)
  5. Status badge (`Ativo` or `Inativo`)
  6. Chevron toggle for expanding details

### 8.3 Registration & Edit Form

Four clear sections:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Dados do corretor                                        │
│    [Photo Avatar Upload / Preview]                         │
│    Nome completo *       CPF (opcional)                     │
│    Nº CRECI *            UF CRECI *                         │
├─────────────────────────────────────────────────────────────┤
│ 2. Tipo de atuação                                          │
│    (o) Corretor autônomo                                    │
│    ( ) Trabalha em imobiliária                              │
│        [Select Imobiliária...]                              │
├─────────────────────────────────────────────────────────────┤
│ 3. Contato                                                  │
│    Telefone principal *  [x] WhatsApp                       │
│    Telefone adicional    [ ] WhatsApp                       │
│    E-mail (opcional)                                        │
│    Website / Perfil profissional (opcional)                 │
├─────────────────────────────────────────────────────────────┤
│ 4. Observações e Status                                     │
│    Observações (textarea)                                   │
│    Status: (o) Ativo  ( ) Inativo                           │
└─────────────────────────────────────────────────────────────┘
```

### 8.4 Photo Upload Workflow

1. User clicks the photo upload avatar / button.
2. File is validated locally (format: JPG/PNG/WebP, size ≤ 2 MB).
3. A local blob URL (`URL.createObjectURL(file)`) shows immediate preview without server lag.
4. On form submit:
   - The agent record is created or updated first.
   - If a new photo was chosen, `uploadPhoto(agentId)` posts to `/api/agents/[id]/photo`.
   - Temporary blob URLs are revoked.

### 8.5 Delete Flow (Soft Delete Confirmation)

1. User clicks "Excluir" on an expanded card.
2. An overlay dialog appears asking for confirmation.
3. On confirm, `DELETE /api/agents/[id]` marks the record as soft-deleted.
4. The list is updated smoothly without page reload.

---

## 9. Validation & Normalization

### 9.1 Client-side Validation

Run inside `CorretoresContent.tsx` on submission:
- **`full_name`**: Required, non-empty.
- **`creci_number`**: Required.
- **`creci_state`**: Required Brazilian state code.
- **`agent_type`**: Required (`AUTONOMO` or `IMOBILIARIA`).
- **`agency_id`**: Required when `agent_type === 'IMOBILIARIA'`.
- **`main_phone`**: Required, validated with `validatePhone()`.
- **`additional_phone`**: Optional, validated with `validatePhone()` if filled.
- **`cpf`**: Optional, validated with standard Brazilian modulo 11 algorithm via `validateCPF()`.
- **`email`**: Optional, validated with RFC-compliant regex via `validateEmail()`.
- **`website`**: Optional, validated via `validateWebsite()`.

### 9.2 Server-side Validation

All checks are mirrored on the server in `POST` and `PUT` handlers with clean field-specific JSON errors (`{ errors: { [field]: message } }`).

### 9.3 Field Masking & Normalization

| Field | Input Mask | Database Normalization |
|---|---|---|
| Phone | `(XX) XXXXX-XXXX` or `(XX) XXXX-XXXX` | E.164 (`+5531999999999`) via `parsePhoneToE164` |
| CPF | `000.000.000-00` | 11 raw digits (`12345678901`) via `parseCPF` |
| CRECI | Free-text alphanumeric (max 20) | Trimmed string |
| State | 27 Brazilian UFs dropdown | 2-letter uppercase UF code |
| Email | standard input | Lowercase trimmed via `normalizeEmail` |
| Website | standard input | Prepended with `https://` via `normalizeWebsite` |

---

## 10. Navigation & Auth

### 10.1 Sidebar Link

Configured in [`Sidebar.tsx`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/components/Sidebar.tsx#L296-L305):
- Route: `/[lang]/corretores` (or `/corretores` for default Portuguese locale).
- Icon: Lucide `Users`.
- Highlighted when active.

### 10.2 Middleware Protection

Configured in [`middleware.ts`](file:///c:/Users/Administrator/Documents/Kitnets/apps/web/src/middleware.ts#L4):
- Protected matcher includes `"/corretores(.*)"`.
- Unauthenticated requests are redirected to Clerk sign-in.

---

## 11. Database Setup & Migrations

To initialize or migrate existing databases, execute:

```sql
-- 1. Create table and indexes (from agent_setup.sql)
\i packages/core/database/agent_setup.sql

-- 2. If upgrading from earlier draft with whatsapp_phone:
ALTER TABLE public.agents DROP COLUMN IF EXISTS whatsapp_phone;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS main_phone_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS additional_phone_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;
```

---

## 12. Design Decisions

1. **Inline WhatsApp Checkboxes instead of Separate Phone Field:**  
   Brokers and agents typically conduct business through their main cellular number or office line. Having separate inputs created redundant data entry and user confusion. Checkboxes beside each phone line provide a cleaner, more intuitive interface.
2. **Autonomous vs. Agency Radio System:**  
   In Brazil, real estate brokers frequently transition between working as independent contractors and partnering with brokerages. Keeping both options within a single table with an optional foreign key (`agency_id`) avoids schema splitting while ensuring seamless switching.
3. **Dedicated Photo Upload Sub-resource (`/api/agents/[id]/photo`):**  
   Decoupling file upload from JSON form mutations simplifies error handling, prevents orphaned image uploads if form validation fails, and enables future standalone avatar updating.

---

## 13. Changelog

- **2026-09-02 (v1.0):** Initial release of Corretores module:
  - Agent CRUD with photo upload, CPF/CRECI validation, and agency linkage.
  - Replaced separate WhatsApp input with inline checkboxes for main and additional phones.
  - Added dual WhatsApp support on collapsed accordion rows and profile cards.
  - Completed documentation and setup SQL scripts.
