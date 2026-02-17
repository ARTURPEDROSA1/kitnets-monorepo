# Profile Page — Property Details & Configuration

**Version:** 1.0  
**Last updated:** 2026-02-16  
**Author:** Kitnets Engineering

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & File Structure](#2-architecture--file-structure)
3. [Data Model](#3-data-model)
   - 3.1 [PropertyDetails Interface](#31-propertydetails-interface)
   - 3.2 [SubUnit Interface](#32-subunit-interface)
   - 3.3 [Database Schema](#33-database-schema)
4. [Components](#4-components)
   - 4.1 [ProfileContent (Page Orchestrator)](#41-profilecontent-page-orchestrator)
   - 4.2 [PropertyDetailsCard](#42-propertydetailscard)
   - 4.3 [SubUnitsSection](#43-subunitssection)
   - 4.4 [Helper Components](#44-helper-components)
5. [Ownership Tab — Section Layout](#5-ownership-tab--section-layout)
   - 5.1 [Section Order](#51-section-order)
   - 5.2 [Collapsible Sections](#52-collapsible-sections)
6. [Media Management](#6-media-management)
   - 6.1 [Main Property Media](#61-main-property-media)
   - 6.2 [Sub-Unit Media](#62-sub-unit-media)
   - 6.3 [Upload Flow](#63-upload-flow)
   - 6.4 [Storage Structure](#64-storage-structure)
7. [Save & Load Flow](#7-save--load-flow)
   - 7.1 [Loading Profile Data](#71-loading-profile-data)
   - 7.2 [Saving Profile Data](#72-saving-profile-data)
8. [Database Migration](#8-database-migration)
9. [Dependencies & APIs](#9-dependencies--apis)
10. [Design Decisions](#10-design-decisions)
11. [Known Issues & Future Work](#11-known-issues--future-work)

---

## 1. Overview

The **Profile Page** (`/[lang]/profile`) is the central hub where property owners (landlords) configure their property information, upload documents, and manage their identity. The page is organized into three tabs:

| Tab | Purpose |
|-----|---------|
| **Imóvel** (Ownership) | Property address, photos/videos, description, property details, sub-units, ownership proofs |
| **Dados Pessoais** (Basics) | Name, CPF/CNPJ, phone, personal address, PF/PJ toggle |
| **Segurança** (Security) | Account deletion, password management |

This document focuses on the **Ownership tab**, specifically the **Property Details** system and **Sub-Units** configuration added on **2026-02-16**.

### Key Features Implemented

- **Property Details Card** — Solar energy, main meters, total area, internet bill, number of units
- **Dynamic Sub-Unit Cards** — Auto-generated based on unit count, each with full amenity configuration
- **Media Per Entity** — Up to 10 photos + 2 videos for main property AND each sub-unit
- **Bathrooms Field** — Added to each sub-unit configuration
- **Per-Unit Description** — Free-text description field for each sub-unit
- **Collapsible Sections** — All ownership tab sections are collapsible with smooth animations
- **Reordered Layout** — Sub-units now appear below the address card for better UX flow

---

## 2. Architecture & File Structure

```
apps/web/src/
├── app/[lang]/profile/
│   ├── page.tsx                    # Server component (loads dictionary)
│   ├── ProfileContent.tsx          # Client component — page orchestrator (2101 lines)
│   └── actions.ts                  # Server actions (account deletion)
│
├── components/profile/
│   └── PropertyDetailsCard.tsx     # Property details + SubUnits components (787 lines)
│
packages/core/database/
│   └── add_property_details.sql    # Migration script for new DB columns
```

### Component Relationship Diagram

```
ProfileContent.tsx (Page Orchestrator)
├── Ownership Tab
│   ├── Verification Section (collapsible)
│   ├── Address Section (collapsible)
│   ├── SubUnitsSection ← from PropertyDetailsCard.tsx
│   ├── Photos & Videos Section (collapsible) ← main property
│   ├── Description Section (collapsible) ← main property
│   └── PropertyDetailsCard ← from PropertyDetailsCard.tsx
├── Basics Tab
│   └── Personal data forms...
└── Security Tab
    └── Account management...
```

---

## 3. Data Model

### 3.1 PropertyDetails Interface

```typescript
export interface PropertyDetails {
    numberOfUnits: number;       // Only used when propertyType === 'multi'
    totalSqMeters: string;       // Total property area in m²
    solarEnergy: boolean;        // Has solar energy installed
    solarKwp: string;            // Solar generation capacity in kWp
    mainMeters: {
        water: boolean;          // Main water meter present
        energy: boolean;         // Main energy meter present
        gas: boolean;            // Main gas meter present
    };
    internetBill: boolean;       // Has internet bill
}
```

**Stored as:** `property_details` JSONB column in `profiles` table.

### 3.2 SubUnit Interface

```typescript
export interface SubUnit {
    // Basic Info
    name: string;                // Display name (e.g., "Kitnet 35A")
    sqMeters: string;            // Unit area in m²
    rooms: string;               // Total rooms count
    bedrooms: string;            // Number of bedrooms
    bathrooms: string;           // Number of bathrooms
    description: string;         // Free-text unit description

    // Amenities (booleans)
    garage: boolean;
    kitchenCabinets: boolean;

    // Amenities (selects)
    laundry: "none" | "individual" | "shared";
    ac: "none" | "cold" | "cold_hot";
    cooktop: "none" | "gas" | "electric" | "induction";

    // Condominium
    condominium: boolean;
    condominiumValue: string;    // Monthly condo fee in R$
    condominiumIncludes: {
        energy: boolean;
        water: boolean;
        internet: boolean;
        iptu: boolean;
        gas: boolean;
    };

    // Media (persisted URLs)
    photos: string[];            // Saved photo URLs (max 10)
    videos: string[];            // Saved video URLs (max 2)

    // Media (pending upload — File objects, NOT persisted to DB)
    newPhotos: File[];           // Pending photo uploads
    newVideos: File[];           // Pending video uploads
}
```

**Stored as:** `sub_units` JSONB array column in `profiles` table.

> **Important:** The `newPhotos` and `newVideos` fields are `File` objects that exist only in client memory. They are stripped (destructured out) before saving to the database. See [Section 7.2](#72-saving-profile-data).

### 3.3 Database Schema

The `profiles` table has the following columns relevant to property configuration:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `property_details` | `JSONB` | `'{}'` | PropertyDetails object |
| `sub_units` | `JSONB` | `'[]'` | Array of SubUnit objects |
| `property_photos` | `JSONB` | `'[]'` | Array of main property photo URLs |
| `property_videos` | `JSONB` | `'[]'` | Array of main property video URLs |
| `property_address` | `JSONB` | — | Address object with `description` field |
| `property_type` | `TEXT` | — | `'single'` or `'multi'` |

---

## 4. Components

### 4.1 ProfileContent (Page Orchestrator)

**File:** `apps/web/src/app/[lang]/profile/ProfileContent.tsx`  
**Type:** Client Component (`"use client"`)  
**Lines:** ~2101

This is the main orchestrator component that:

- Manages all state (form data, photos, videos, property details, sub-units)
- Handles data loading from Supabase (`loadProfile`)
- Handles data saving to Supabase (`handleSave`)
- Renders the three-tab interface
- Manages collapsible section states

**Key State Variables:**

| State | Type | Purpose |
|-------|------|---------|
| `propertyDetails` | `PropertyDetails` | Main property configuration |
| `subUnits` | `SubUnit[]` | Array of sub-unit configurations |
| `propertyPhotos` | `File[]` | New main property photos pending upload |
| `savedPhotos` | `string[]` | Persisted main property photo URLs |
| `propertyVideos` | `File[]` | New main property videos pending upload |
| `savedVideos` | `string[]` | Persisted main property video URLs |
| `propertyType` | `'single' \| 'multi'` | Single or multi-family property |
| `addressSectionOpen` | `boolean` | Collapsible state for address |
| `photosSectionOpen` | `boolean` | Collapsible state for photos/videos |
| `descriptionSectionOpen` | `boolean` | Collapsible state for description |

### 4.2 PropertyDetailsCard

**File:** `apps/web/src/components/profile/PropertyDetailsCard.tsx`  
**Export:** `default` (default export)

Renders the **"Detalhes"** collapsible card with:

- Number of Units (only for `propertyType === 'multi'`)
- Total Area (m²)
- Solar Energy toggle + kWp input
- Main Meters checkboxes (Water, Energy, Gas)
- Internet Bill checkbox

**Props:**

```typescript
interface DetailsProps {
    details: PropertyDetails;
    units: SubUnit[];
    onDetailsChange: (details: PropertyDetails) => void;
    onUnitsChange: (units: SubUnit[]) => void;
    propertyType: "single" | "multi";
}
```

**Behavior:** When `numberOfUnits` changes, the component automatically adjusts the `units` array — adding new default units or trimming excess ones.

### 4.3 SubUnitsSection

**File:** `apps/web/src/components/profile/PropertyDetailsCard.tsx`  
**Export:** Named export (`SubUnitsSection`)

Renders the sub-unit card list with full per-unit configuration. Each sub-unit card is an accordion-style collapsible panel.

**Props:**

```typescript
interface SubUnitsSectionProps {
    details: PropertyDetails;
    units: SubUnit[];
    onDetailsChange: (details: PropertyDetails) => void;
    onUnitsChange: (units: SubUnit[]) => void;
}
```

**Per-Sub-Unit Fields:**

| Section | Fields |
|---------|--------|
| **Identity** | Name, Area (m²) |
| **Rooms** | Cômodos, Quartos, Banheiros |
| **Amenities** | Garage, Kitchen Cabinets (checkboxes) |
| **Equipment** | Laundry, AC, Cooktop (selects) |
| **Description** | Free-text textarea |
| **Photos** | Upload grid (max 10), preview + delete |
| **Videos** | Upload grid (max 2), preview + delete |
| **Condominium** | Toggle + value + inclusions (energy, water, internet, IPTU, gas) |

**Unit Header Summary:** The collapsed header shows a one-line summary:

```
Kitnet 35A — 30 m² · 1 quartos · 1 banheiros · 5 fotos
```

### 4.4 Helper Components

#### `Checkbox`

Styled checkbox with icon support. Used throughout the property details and sub-unit forms.

```typescript
export function Checkbox({
    checked, onChange, label, icon
}: { checked: boolean; onChange: (val: boolean) => void; label: string; icon?: ReactNode })
```

#### `SelectField`

Styled `<select>` dropdown with label and icon support.

#### `FilePreview`

Renders a preview thumbnail for a `File` object (photo or video) with a delete button overlay.

- Uses `useMemo` for creating the object URL (optimized to avoid cascading renders)
- Automatically revokes the object URL on unmount via `useEffect` cleanup

#### `PhotoPreview` (in ProfileContent.tsx)

Similar to `FilePreview` but used specifically for the main property photo uploads.

---

## 5. Ownership Tab — Section Layout

### 5.1 Section Order

The ownership tab sections appear in this order (top to bottom):

| # | Section | Component | Scope |
|---|---------|-----------|-------|
| 1 | **Comprovação de Propriedade** | Inline | Document upload + AI extraction |
| 2 | **Endereço** | Inline (collapsible) | Property address (auto-filled from docs) |
| 3 | **Sub-unidades** | `SubUnitsSection` | Per-unit configuration (only for `multi` type) |
| 4 | **Fotos e Vídeos do Imóvel** | Inline (collapsible) | Main property media (10 photos + 2 videos) |
| 5 | **Descrição do Imóvel** | Inline (collapsible) | Main property description |
| 6 | **Detalhes** | `PropertyDetailsCard` (collapsible) | Solar, meters, area, internet |
| 7 | **Save Button** | Inline | "Salvar Imóvel e Documentos" |

### 5.2 Collapsible Sections

All sections (except Sub-unidades and Save Button) are collapsible. Each uses:

- A `ChevronUp` / `ChevronDown` icon toggle
- A status badge when collapsed (e.g., "Preenchido ✓", "5 fotos · 1 vídeos")
- Colored icon badges for visual distinction:

| Section | Color Scheme | Icon |
|---------|-------------|------|
| Address | Emerald | `MapPin` |
| Photos/Videos | Amber | `Camera` |
| Description | Indigo | `FileText` |
| Details | Violet | `Settings2` |

---

## 6. Media Management

### 6.1 Main Property Media

The **"Fotos e Vídeos do Imóvel"** card manages media for the main property (common areas, facade, etc.).

| Media Type | Max Count | Accepted Formats | State (new) | State (saved) |
|-----------|-----------|------------------|-------------|---------------|
| Photos | 10 | `image/*` | `propertyPhotos: File[]` | `savedPhotos: string[]` |
| Videos | 2 | `video/*` | `propertyVideos: File[]` | `savedVideos: string[]` |

**Enforcement:** The upload handler checks the combined count (saved + new) before allowing additional uploads. If the limit is reached, an `alert()` is shown.

```typescript
const handlePhotoSelect = (e) => {
    const totalPhotos = savedPhotos.length + propertyPhotos.length;
    const remaining = 10 - totalPhotos;
    if (remaining <= 0) { alert('Máximo de 10 fotos...'); return; }
    const newPhotos = Array.from(e.target.files).slice(0, remaining);
    // ...
};
```

### 6.2 Sub-Unit Media

Each sub-unit has its own media section with the same limits (10 photos, 2 videos). Media is managed via the `SubUnitsSection` component.

| Field | Type | Purpose |
|-------|------|---------|
| `unit.photos` | `string[]` | Persisted photo URLs |
| `unit.videos` | `string[]` | Persisted video URLs |
| `unit.newPhotos` | `File[]` | Pending photo uploads (stripped before DB save) |
| `unit.newVideos` | `File[]` | Pending video uploads (stripped before DB save) |

### 6.3 Upload Flow

Media uploads occur during the `handleSave` function in the following order:

```
1. Upsert profile data to Supabase
2. Upload ownership proof documents → documents bucket
3. Upload main property photos → documents bucket (photos/{profileId}/)
4. Upload main property videos → documents bucket (videos/{profileId}/)
5. Upload sub-unit photos → documents bucket (photos/{profileId}/unit-{idx}/)
6. Upload sub-unit videos → documents bucket (videos/{profileId}/unit-{idx}/)
7. Sync all URLs to profile record
```

### 6.4 Storage Structure

All media is stored in the Supabase `documents` bucket:

```
documents/
├── {profileId}/                          # Ownership proof documents
│   └── {timestamp}-{random}.{ext}
├── photos/
│   ├── {profileId}/                      # Main property photos
│   │   └── {timestamp}-{random}.{ext}
│   └── {profileId}/unit-{idx}/           # Sub-unit photos
│       └── {timestamp}-{random}.{ext}
└── videos/
    ├── {profileId}/                      # Main property videos
    │   └── {timestamp}-{random}.{ext}
    └── {profileId}/unit-{idx}/           # Sub-unit videos
        └── {timestamp}-{random}.{ext}
```

---

## 7. Save & Load Flow

### 7.1 Loading Profile Data

The `loadProfile` function (called in `useEffect` on mount) performs:

```typescript
// 1. Fetch profile from Supabase
const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('clerk_id', user.id)
    .single();

// 2. Populate form fields
setFormData({ ...profile fields... });

// 3. Load photos & videos
if (profile.property_photos) setSavedPhotos(profile.property_photos);
if (profile.property_videos) setSavedVideos(profile.property_videos);

// 4. Load property details
if (profile.property_details) setPropertyDetails(profile.property_details);

// 5. Load sub-units
if (profile.sub_units) setSubUnits(profile.sub_units);

// 6. Load ownership proofs
// 7. Auto-collapse sections with existing data
```

### 7.2 Saving Profile Data

The `handleSave` function orchestrates a multi-step save:

```
Step 1: Upsert profile record (includes property_details and sub_units as JSONB)
Step 2: Upload ownership proof files → create ownership_proofs records
Step 3: Upload new main property photos → get public URLs
Step 4: Upload new main property videos → get public URLs
Step 5: Upload new sub-unit photos/videos → update unit objects with URLs
Step 6: Serialize sub-units (strip File objects):
        const subUnitsForDB = updatedSubUnits.map(u => {
            const { newPhotos: _np, newVideos: _nv, ...rest } = u;
            return rest;
        });
Step 7: Update profile with all URLs:
        await sb.from('profiles').update({
            property_photos: updatedPhotoUrls,
            property_videos: updatedVideoUrls,
            sub_units: subUnitsForDB,
        }).eq('id', profile.id);
```

**Authentication:** All Supabase operations use a JWT token obtained from Clerk (`getToken({ template: 'supabase' })`), ensuring Row Level Security (RLS) is enforced.

---

## 8. Database Migration

**File:** `packages/core/database/add_property_details.sql`

Run the following SQL in the **Supabase SQL Editor** to add the required columns:

```sql
-- ============================================================
-- Add property_details, sub_units, and property_videos columns
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS property_details JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS sub_units JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS property_videos JSONB DEFAULT '[]'::jsonb;
```

> **⚠️ Note:** The `property_photos` column is assumed to already exist. If not, add:
>
> ```sql
> ALTER TABLE public.profiles
>     ADD COLUMN IF NOT EXISTS property_photos JSONB DEFAULT '[]'::jsonb;
> ```

---

## 9. Dependencies & APIs

### Frontend Dependencies

| Dependency | Purpose |
|-----------|---------|
| `react` | UI framework (useState, useMemo, useEffect, useCallback) |
| `next/image` | Optimized image rendering |
| `@clerk/nextjs` | Authentication (useUser, useAuth) |
| `@supabase/supabase-js` | Database & storage client |
| `@kitnets/ui` | Shared UI component library (Button) |
| `lucide-react` | Icon library (Camera, Video, Bath, FileText, etc.) |
| `@/components/ui/input` | Styled input component |
| `@/components/ui/label` | Styled label component |
| `@/lib/utils` | Utility functions (`cn` for className merging) |

### Backend APIs

| API | Method | Purpose |
|-----|--------|---------|
| `/api/identity/verify` | POST | AI-powered identity document analysis |
| Supabase `profiles` table | RPC (upsert/update) | Profile data persistence |
| Supabase `ownership_proofs` table | RPC (insert/select) | Ownership proof tracking |
| Supabase `documents` bucket | Storage (upload/getPublicUrl) | File storage for photos, videos, documents |

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| Clerk environment variables | Yes | Authentication configuration |

---

## 10. Design Decisions

### Why split PropertyDetailsCard and SubUnitsSection?

The original implementation had both the "Detalhes" card and the sub-unit cards rendered together inside a single `PropertyDetailsCard` component. This was refactored into two separate exports to allow **independent positioning** in the layout:

- `PropertyDetailsCard` renders the details card (solar, meters, etc.)
- `SubUnitsSection` renders the sub-unit cards

This enables the ownership tab to show **Sub-unidades immediately below Address** (for natural form flow) while keeping **Detalhes** further down.

### Why store File objects in SubUnit state?

Sub-unit media uses `newPhotos: File[]` and `newVideos: File[]` fields directly in the `SubUnit` interface. This keeps the upload state co-located with each unit, avoiding complex separate state management. The `File` objects are stripped during serialization before saving to the database:

```typescript
const { newPhotos: _np, newVideos: _nv, ...rest } = unit;
```

### Why useMemo for object URL preview?

The original `PhotoPreview` and `FilePreview` components used `useState` + `useEffect` to create object URLs. This triggered a React lint error about cascading renders. The fix uses `useMemo` to create the URL synchronously during render, with a separate `useEffect` cleanup to revoke the URL on unmount:

```typescript
const preview = useMemo(() => URL.createObjectURL(file), [file]);
useEffect(() => {
    return () => URL.revokeObjectURL(preview);
}, [preview]);
```

### Why JSONB instead of relational tables?

Property details and sub-units are stored as JSONB in the `profiles` table rather than in separate relational tables. This decision was made because:

1. The data is always loaded/saved as a complete unit with the profile
2. No need for cross-profile queries on sub-unit fields
3. Simpler schema and fewer joins
4. Flexible schema evolution without migrations

---

## 11. Known Issues & Future Work

### Pre-existing Lint Warnings

These warnings exist in `ProfileContent.tsx` and are **not related** to the property details changes:

| Warning | Line | Status |
|---------|------|--------|
| `adminData` missing from useEffect deps | ~294 | Pre-existing |
| `'e' is defined but never used` | ~374 | Pre-existing |
| `'error' is defined but never used` | ~492 | Pre-existing |
| `'analyzingFiles' is assigned but never used` | ~499 | Pre-existing |

### Future Improvements

- [ ] **Drag-and-drop reorder** for photos within a sub-unit
- [ ] **Image compression** before upload to reduce storage costs
- [ ] **Video thumbnail generation** for better preview UX
- [ ] **Dictionary integration** for all labels (currently hardcoded in Portuguese)
- [ ] **Validation** — Required fields, min/max photo counts for publishing
- [ ] **Delete media from storage** — Currently `removeSavedPhoto`/`removeSavedVideo` only remove the URL from state; the file remains in Supabase storage
- [ ] **Progress indicator** during multi-file upload (currently no per-file feedback)
- [ ] **Optimistic UI** — Show uploaded photos immediately with loading indicators
- [ ] **Separate relational table** for sub-units if cross-profile querying becomes necessary

---

*Document generated on 2026-02-16. For questions, contact Kitnets Engineering.*
