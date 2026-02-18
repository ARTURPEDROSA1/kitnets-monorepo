# Profile Page — Property Details & Configuration

**Version:** 2.0  
**Last updated:** 2026-02-18  
**Author:** Kitnets Engineering

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & File Structure](#2-architecture--file-structure)
3. [Data Model](#3-data-model)
   - 3.1 [PropertyState Interface](#31-propertystate-interface)
   - 3.2 [PropertyDetails Interface](#32-propertydetails-interface)
   - 3.3 [SubUnit Interface](#33-subunit-interface)
   - 3.4 [ProofData Type](#34-proofdata-type)
   - 3.5 [Database Schema](#35-database-schema)
4. [Multi-Property Architecture](#4-multi-property-architecture)
   - 4.1 [Properties Array](#41-properties-array)
   - 4.2 [Legacy Single-Property Aliases](#42-legacy-single-property-aliases)
   - 4.3 [Per-Property Setter Factories](#43-per-property-setter-factories)
   - 4.4 [Additional Properties JSON Column](#44-additional-properties-json-column)
5. [Components](#5-components)
   - 5.1 [ProfileContent (Page Orchestrator)](#51-profilecontent-page-orchestrator)
   - 5.2 [PropertyDetailsCard](#52-propertydetailscard)
   - 5.3 [SubUnitsSection](#53-subunitssection)
   - 5.4 [Helper Components](#54-helper-components)
6. [Ownership Tab — Section Layout](#6-ownership-tab--section-layout)
   - 6.1 [Section Order](#61-section-order)
   - 6.2 [Collapsible Sections](#62-collapsible-sections)
7. [Media Management](#7-media-management)
   - 7.1 [Main Property Media](#71-main-property-media)
   - 7.2 [Sub-Unit Media](#72-sub-unit-media)
   - 7.3 [Upload Flow](#73-upload-flow)
   - 7.4 [Storage Structure](#74-storage-structure)
8. [Ownership Proof Documents](#8-ownership-proof-documents)
   - 8.1 [Upload & Storage](#81-upload--storage)
   - 8.2 [Persistence Strategy](#82-persistence-strategy)
   - 8.3 [Load Flow](#83-load-flow)
9. [Save & Load Flow](#9-save--load-flow)
   - 9.1 [Loading Profile Data](#91-loading-profile-data)
   - 9.2 [Saving Profile Data](#92-saving-profile-data)
10. [Database Migration](#10-database-migration)
11. [Dependencies & APIs](#11-dependencies--apis)
12. [Design Decisions](#12-design-decisions)
13. [Known Issues & Future Work](#13-known-issues--future-work)
14. [Changelog](#14-changelog)

---

## 1. Overview

The **Profile Page** (`/[lang]/profile`) is the central hub where property owners (landlords) configure their property information, upload documents, and manage their identity. The page is organized into three tabs:

| Tab | Purpose |
|-----|---------|
| **Imóvel** (Ownership) | Property address, photos/videos, description, property details, sub-units, ownership proofs |
| **Dados Pessoais** (Basics) | Name, CPF/CNPJ, phone, personal address, PF/PJ toggle |
| **Segurança** (Security) | Account deletion, password management |

This document focuses on the **Ownership tab**, specifically the **Property Details** system, **Sub-Units** configuration, and the **Multi-Property Architecture** that supports multiple properties per user profile.

### Key Features

- **Multi-Property Support** — Users can add and manage multiple properties (primary + additional)
- **Property Details Card** — Solar energy, main meters, total area, internet bill, number of units
- **Dynamic Sub-Unit Cards** — Auto-generated based on unit count, each with full amenity configuration
- **Media Per Entity** — Up to 10 photos + 2 videos for main property AND each sub-unit
- **Ownership Proof Documents** — PDF/JPG/PNG upload per property with AI-powered extraction
- **Per-Property File Uploads** — All file types (docs, photos, videos) are scoped to each property
- **Collapsible Sections** — All ownership tab sections are collapsible with smooth animations

---

## 2. Architecture & File Structure

```
apps/web/src/
├── app/[lang]/profile/
│   ├── page.tsx                    # Server component (loads dictionary)
│   ├── ProfileContent.tsx          # Client component — page orchestrator (~2965 lines)
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
│   ├── properties.map(prop, propIdx =>    ← iterates ALL properties
│   │   ├── Property Header (collapsible accordion)
│   │   ├── Verification Section (collapsible)    ← per-property ownership proofs
│   │   ├── Address Section (collapsible)          ← per-property address
│   │   ├── SubUnitsSection                        ← per-property sub-units
│   │   ├── Photos & Videos Section (collapsible)  ← per-property media
│   │   ├── Description Section (collapsible)      ← per-property description
│   │   └── PropertyDetailsCard                    ← per-property details
│   │)
│   └── "+ Adicionar Propriedade" button
├── Basics Tab
│   └── Personal data forms...
└── Security Tab
    └── Account management...
```

---

## 3. Data Model

### 3.1 PropertyState Interface

> **Added: 2026-02-18** — Central state interface that bundles all per-property data.

```typescript
interface PropertyState {
    propertyType: 'single' | 'multi';
    details: PropertyDetails;
    subUnits: SubUnit[];
    address: {
        cep: string;
        street: string;
        number: string;
        city: string;
        state: string;
        neighborhood: string;
        complement: string;
        description: string;
    };
    photos: File[];           // new photos pending upload
    savedPhotos: string[];    // already-uploaded photo URLs
    videos: File[];           // new videos pending upload
    savedVideos: string[];    // already-uploaded video URLs
    ownershipFiles: File[];   // new proof files pending upload
    savedProofs: ProofData[]; // uploaded proof records

    // Collapsible section states
    ownershipSectionOpen: boolean;
    addressSectionOpen: boolean;
    photosSectionOpen: boolean;
    descriptionSectionOpen: boolean;
    detailsInitialOpen: boolean;
    subUnitOpenIdx: number | null;
}
```

**Each property (primary and additional) is a `PropertyState` object.** The entire profile manages an array: `properties: PropertyState[]`.

### 3.2 PropertyDetails Interface

```typescript
export interface PropertyDetails {
    propertyName: string;        // Display name (e.g., "Casa Nova Lima")
    cadastroImobiliario: string; // Municipal property registration
    inscricaoImobiliaria: string;// Property inscription number
    matricula: string;           // Registry number
    areaLote: string;           // Lot area
    areaEdificada: string;      // Built area
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

**Stored as:** `property_details` JSONB column in `profiles` table (for primary property). For additional properties, stored inside the `additional_properties` JSON array.

### 3.3 SubUnit Interface

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

**Stored as:** `sub_units` JSONB array column in `profiles` table (for primary property). For additional properties, stored inside the `additional_properties` JSON array.

> **Important:** The `newPhotos` and `newVideos` fields are `File` objects that exist only in client memory. They are stripped (destructured out) before saving to the database. See [Section 9.2](#92-saving-profile-data).

### 3.4 ProofData Type

```typescript
type ProofData = {
    id: string;
    original_name: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
};
```

**Stored in:** The `ownership_proofs` table for all properties. For additional properties (index 1+), the proof records are **also persisted** in the `additional_properties` JSON's `savedProofs` field for correct reload.

### 3.5 Database Schema

The `profiles` table has the following columns relevant to property configuration:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `property_details` | `JSONB` | `'{}'` | PropertyDetails object for primary property |
| `sub_units` | `JSONB` | `'[]'` | Array of SubUnit objects for primary property |
| `property_photos` | `JSONB` | `'[]'` | Array of primary property photo URLs |
| `property_videos` | `JSONB` | `'[]'` | Array of primary property video URLs |
| `property_address` | `JSONB` | — | Address object with `description` field |
| `property_type` | `TEXT` | — | `'single'` or `'multi'` |
| `additional_properties` | `JSONB` | `'[]'` | Array of serialized PropertyState objects for properties 1+ |

The `ownership_proofs` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` | Primary key |
| `profile_id` | `UUID` | FK to profiles.id |
| `file_url` | `TEXT` | Storage path in documents bucket |
| `original_name` | `TEXT` | Original filename |
| `file_size` | `BIGINT` | File size in bytes |
| `mime_type` | `TEXT` | MIME type (e.g., `application/pdf`) |
| `status` | `TEXT` | `'pending'`, `'approved'`, or `'rejected'` |
| `created_at` | `TIMESTAMPTZ` | Upload timestamp |

---

## 4. Multi-Property Architecture

> **Added: 2026-02-18** — Complete refactor from single-property to multi-property support.

### 4.1 Properties Array

The core state is a `properties: PropertyState[]` array managed via `useState`:

```typescript
const [properties, setProperties] = useState<PropertyState[]>([/* initial primary property */]);
```

- **`properties[0]`** = Primary property (stored in native `profiles` columns)
- **`properties[1+]`** = Additional properties (stored in `additional_properties` JSONB column)

The `updateProperty` helper enables targeted updates:

```typescript
const updateProperty = (idx: number, updater: (prev: PropertyState) => PropertyState) => {
    setProperties(prev => prev.map((p, i) => i === idx ? updater(p) : p));
};
```

### 4.2 Legacy Single-Property Aliases

For backward compatibility with code that predates the multi-property refactor, legacy aliases point to `properties[0]`:

```typescript
// Legacy single-property aliases (used by progress tracking & existing code)
const propertyDetails = properties[0]?.details ?? emptyPropertyDetails();
const subUnits = properties[0]?.subUnits ?? [];
const propertyPhotos = properties[0]?.photos ?? [];
const savedPhotos = properties[0]?.savedPhotos ?? [];
const propertyVideos = properties[0]?.videos ?? [];
const savedVideos = properties[0]?.savedVideos ?? [];
const ownershipFiles = properties[0]?.ownershipFiles ?? [];
const savedProofs = properties[0]?.savedProofs ?? [];
```

> **⚠️ Warning:** These aliases are **read-only shortcuts**. They should NOT be used in the save function to iterate file uploads — that was the root cause of a critical bug where only `properties[0]`'s files were saved. See [Section 14 Changelog](#14-changelog).

### 4.3 Per-Property Setter Factories

Each property card in the render loop creates scoped setters using `setPropField`:

```typescript
const setPropField = <K extends keyof PropertyState>(
    field: K,
    val: PropertyState[K] | ((prev: PropertyState[K]) => PropertyState[K])
) => {
    updateProperty(propIdx, prev => ({
        ...prev,
        [field]: typeof val === 'function'
            ? (val as (prev: PropertyState[K]) => PropertyState[K])(prev[field])
            : val
    }));
};

// Examples:
const setPOwnershipFiles = (v) => setPropField('ownershipFiles', v);
const setPPhotos = (v) => setPropField('photos', v);
const setPVideos = (v) => setPropField('videos', v);
```

This ensures that file selections, photo uploads, and all user interactions are scoped to the correct property index.

### 4.4 Additional Properties JSON Column

Properties beyond index 0 are serialized into the `additional_properties` JSONB column:

```typescript
// Saved in profilePayload (initial upsert) and post-upload update
additional_properties: properties.slice(1).map(prop => ({
    propertyType: prop.propertyType,
    details: prop.details,
    subUnits: prop.subUnits.map(u => {
        const { newPhotos, newVideos, ...rest } = u;
        return rest; // Strip File objects
    }),
    address: prop.address,
    savedPhotos: prop.savedPhotos,
    savedVideos: prop.savedVideos,
    savedProofs: prop.savedProofs, // ← Added 2026-02-18
})),
```

**On load**, these are deserialized back into `PropertyState[]`:

```typescript
if (profile.additional_properties && Array.isArray(profile.additional_properties)) {
    for (const ap of profile.additional_properties) {
        additionalProps.push({
            propertyType: apTyped.propertyType || 'single',
            details: apTyped.details || emptyPropertyDetails(),
            subUnits: apTyped.subUnits || [],
            address: apTyped.address || emptyPropertyAddress(),
            photos: [],           // File[] — always empty on load
            savedPhotos: apTyped.savedPhotos || [],
            videos: [],
            savedVideos: apTyped.savedVideos || [],
            ownershipFiles: [],   // File[] — always empty on load
            savedProofs: apTyped.savedProofs || [], // ← Restored from JSON
            ownershipSectionOpen: !(apTyped.savedProofs?.length > 0),
            // ... other section states
        });
    }
}
```

---

## 5. Components

### 5.1 ProfileContent (Page Orchestrator)

**File:** `apps/web/src/app/[lang]/profile/ProfileContent.tsx`  
**Type:** Client Component (`"use client"`)  
**Lines:** ~2965

This is the main orchestrator component that:

- Manages all state via the `properties: PropertyState[]` array
- Handles data loading from Supabase (`loadProfile`)
- Handles data saving to Supabase (`handleSave`) — with per-property file uploads
- Renders the three-tab interface
- Manages collapsible section states per property
- Supports automatic modal opening via `?add=true` query parameter

**Key State Variables:**

| State | Type | Purpose |
|-------|------|---------|
| `properties` | `PropertyState[]` | Array of all property states (primary + additional) |
| `expandedPropertyIdx` | `number \| null` | Which property accordion is currently expanded |
| `personType` | `'pf' \| 'pj'` | Person type (individual or company) |
| `formData` | `object` | Personal data form fields |
| `fileAnalysisStatus` | `Record<string, string>` | AI document analysis status per file |
| `activeTab` | `string` | Currently active tab |

### 5.2 PropertyDetailsCard

**File:** `apps/web/src/components/profile/PropertyDetailsCard.tsx`  
**Export:** `default` (default export)

Renders the **"Detalhes"** collapsible card with:

- Number of Units (only for `propertyType === 'multi'`)
- Total Area (m²)
- Solar Energy toggle + kWp input
- Main Meters checkboxes (Water, Energy, Gas)
- Internet Bill checkbox

### 5.3 SubUnitsSection

**File:** `apps/web/src/components/profile/PropertyDetailsCard.tsx`  
**Export:** Named export (`SubUnitsSection`)

Renders the sub-unit card list with full per-unit configuration. Each sub-unit card is an accordion-style collapsible panel.

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

### 5.4 Helper Components

#### `Checkbox`

Styled checkbox with icon support. Used throughout the property details and sub-unit forms.

#### `SelectField`

Styled `<select>` dropdown with label and icon support.

#### `FilePreview`

Renders a preview thumbnail for a `File` object (photo or video) with a delete button overlay. Uses `useMemo` for creating the object URL.

#### `PhotoPreview` (in ProfileContent.tsx)

Similar to `FilePreview` but used specifically for the main property photo uploads.

---

## 6. Ownership Tab — Section Layout

### 6.1 Section Order

Within each property accordion, sections appear in this order:

| # | Section | Component | Scope |
|---|---------|-----------|-------|
| 1 | **Verificação de Propriedade** | Inline (collapsible) | Document upload + AI extraction |
| 2 | **Endereço** | Inline (collapsible) | Property address (auto-filled from docs) |
| 3 | **Sub-unidades** | `SubUnitsSection` | Per-unit configuration (only for `multi` type) |
| 4 | **Fotos e Vídeos do Imóvel** | Inline (collapsible) | Property media (10 photos + 2 videos) |
| 5 | **Descrição do Imóvel** | Inline (collapsible) | Property description |
| 6 | **Detalhes** | `PropertyDetailsCard` (collapsible) | Solar, meters, area, internet |

### 6.2 Collapsible Sections

All sections are collapsible. Each uses:

- A `ChevronUp` / `ChevronDown` icon toggle
- A status badge when collapsed (e.g., "Verificado ✓", "5 fotos · 1 vídeos")
- Colored icon badges for visual distinction

| Section | Color Scheme | Icon |
|---------|-------------|------|
| Ownership | Blue / Emerald (when verified) | `FileText` / `CheckCircle2` |
| Address | Emerald | `MapPin` |
| Photos/Videos | Amber | `Camera` |
| Description | Indigo | `FileText` |
| Details | Violet | `Settings2` |

---

## 7. Media Management

### 7.1 Main Property Media

Each property's **"Fotos e Vídeos do Imóvel"** card manages media scoped to that property.

| Media Type | Max Count | Accepted Formats | State (new) | State (saved) |
|-----------|-----------|------------------|-------------|---------------|
| Photos | 10 | `image/*` | `prop.photos: File[]` | `prop.savedPhotos: string[]` |
| Videos | 2 | `video/*` | `prop.videos: File[]` | `prop.savedVideos: string[]` |

### 7.2 Sub-Unit Media

Each sub-unit has its own media section with the same limits (10 photos, 2 videos).

| Field | Type | Purpose |
|-------|------|---------|
| `unit.photos` | `string[]` | Persisted photo URLs |
| `unit.videos` | `string[]` | Persisted video URLs |
| `unit.newPhotos` | `File[]` | Pending photo uploads (stripped before DB save) |
| `unit.newVideos` | `File[]` | Pending video uploads (stripped before DB save) |

### 7.3 Upload Flow

> **Updated: 2026-02-18** — Now iterates ALL properties, not just `properties[0]`.

Media uploads occur during the `handleSave` function. The upload loop iterates **every property**:

```
for (let propIdx = 0; propIdx < properties.length; propIdx++) {
    const prop = properties[propIdx];

    Step 1: Upload ownership proof documents → ownership_proofs table + documents bucket
    Step 2: Upload property photos → documents bucket (photos/{prefix}/)
    Step 3: Upload property videos → documents bucket (videos/{prefix}/)
    Step 4: Upload sub-unit photos → documents bucket (photos/{prefix}/unit-{idx}/)
    Step 5: Upload sub-unit videos → documents bucket (videos/{prefix}/unit-{idx}/)
}

Step 6: setProperties(updatedProperties)  ← commit all changes to state
Step 7: Serialize and sync to profiles table:
        - property_photos, property_videos, sub_units (for property[0])
        - additional_properties JSON (for properties[1+])
```

### 7.4 Storage Structure

All media is stored in the Supabase `documents` bucket. Each property gets a **unique storage prefix**:

| Property Index | Storage Prefix | Example Path |
|----------------|---------------|--------------|
| 0 (primary) | `{profileId}` | `photos/{profileId}/1708...abc.jpg` |
| 1 | `{profileId}/prop-1` | `photos/{profileId}/prop-1/1708...xyz.jpg` |
| 2 | `{profileId}/prop-2` | `photos/{profileId}/prop-2/1708...def.png` |

Full storage tree:

```
documents/
├── {profileId}/                              # Primary property ownership proofs
│   └── {timestamp}-{random}.{ext}
├── {profileId}/prop-1/                       # Property 1 ownership proofs
│   └── {timestamp}-{random}.{ext}
├── {profileId}/prop-2/                       # Property 2 ownership proofs
│   └── {timestamp}-{random}.{ext}
├── photos/
│   ├── {profileId}/                          # Primary property photos
│   │   └── {timestamp}-{random}.{ext}
│   ├── {profileId}/unit-{idx}/              # Primary property sub-unit photos
│   │   └── {timestamp}-{random}.{ext}
│   ├── {profileId}/prop-1/                   # Property 1 photos
│   │   └── {timestamp}-{random}.{ext}
│   └── {profileId}/prop-1/unit-{idx}/       # Property 1 sub-unit photos
│       └── {timestamp}-{random}.{ext}
└── videos/
    ├── {profileId}/                          # Primary property videos
    │   └── {timestamp}-{random}.{ext}
    ├── {profileId}/unit-{idx}/              # Primary property sub-unit videos
    │   └── {timestamp}-{random}.{ext}
    └── {profileId}/prop-1/                   # Property 1 videos
        └── {timestamp}-{random}.{ext}
```

---

## 8. Ownership Proof Documents

> **Added: 2026-02-18** — Detailed documentation on per-property ownership proof handling.

### 8.1 Upload & Storage

Each property card has a **"Verificação de Propriedade"** section with a file drop zone accepting `.pdf`, `.jpg`, `.jpeg`, `.png` files.

When a file is selected:

1. The file is added to `properties[propIdx].ownershipFiles` (client-side `File[]`)
2. AI analysis (`analyzeDocument`) is triggered on the file
3. On save, the file is uploaded to `documents/{propStoragePrefix}/` in Supabase Storage
4. A record is created in the `ownership_proofs` table with `.select().single()` to get the inserted record back
5. The returned `ProofData` is added to `properties[propIdx].savedProofs`

### 8.2 Persistence Strategy

Ownership proofs use a **dual persistence** strategy:

| Property Index | DB Table | JSON Column |
|----------------|----------|-------------|
| 0 (primary) | `ownership_proofs` table (queried by `profile_id`) | Not needed — loaded from table |
| 1+ (additional) | `ownership_proofs` table (inserted for all properties) | `additional_properties[idx].savedProofs` |

**Why dual?** The `ownership_proofs` table doesn't have a `property_index` column to distinguish which property each proof belongs to. For the primary property, all proofs are loaded from the table. For additional properties, the proof metadata (`id`, `original_name`, `status`, `created_at`) is also stored in the `additional_properties` JSON to enable correct reload.

### 8.3 Load Flow

```typescript
// 1. Load all proofs from DB → assign to primary property
const { data: proofs } = await sb
    .from('ownership_proofs')
    .select('*')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false });

primaryProperty.savedProofs = proofs as ProofData[];

// 2. Load additional properties' proofs from JSON
for (const ap of profile.additional_properties) {
    additionalProp.savedProofs = ap.savedProofs || [];
    additionalProp.ownershipSectionOpen = !(ap.savedProofs?.length > 0);
}
```

---

## 9. Save & Load Flow

### 9.1 Loading Profile Data

The `loadProfile` function (called in `useEffect` on mount) performs:

```typescript
// 1. Fetch profile from Supabase
const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('clerk_id', user.id)
    .single();

// 2. Load ownership proofs from DB
const { data: proofs } = await sb
    .from('ownership_proofs')
    .select('*')
    .eq('profile_id', profile.id);

// 3. Build primary property state from native columns
const primaryProperty: PropertyState = {
    propertyType: profile.property_type,
    details: profile.property_details,
    subUnits: profile.sub_units,
    address: profile.property_address,
    savedPhotos: profile.property_photos,
    savedVideos: profile.property_videos,
    savedProofs: proofs,
    // ... section collapse states based on existing data
};

// 4. Build additional properties from JSON column
const additionalProps = profile.additional_properties.map(ap => ({
    ...ap,
    photos: [],           // File[] — always empty on load
    videos: [],
    ownershipFiles: [],
    savedProofs: ap.savedProofs || [],  // ← Restored from JSON
}));

// 5. Set properties array
setProperties([primaryProperty, ...additionalProps]);
```

### 9.2 Saving Profile Data

The `handleSave` function orchestrates a multi-step save:

```
Phase 1: Initial Profile Upsert
──────────────────────────────────
- Upsert profile record with all form data
- Includes property_details, sub_units, property_type for primary property
- Includes additional_properties JSON with pre-upload data

Phase 2: Per-Property File Upload Loop
──────────────────────────────────────
for each property in properties[]:
  a. Upload ownership proof files → storage + ownership_proofs table
     - Uses .select().single() to get inserted ProofData back
     - Adds to updatedProperties[propIdx].savedProofs
  b. Upload property photos → storage, collect public URLs
  c. Upload property videos → storage, collect public URLs
  d. Upload sub-unit photos/videos → storage, collect public URLs
  e. Update property in updatedProperties[] with new URLs

Phase 3: State & DB Sync
─────────────────────────
- setProperties(updatedProperties)  → commit to React state
- Serialize sub-units (strip File objects)
- profiles.update() with:
  - property_photos: updatedProperties[0].savedPhotos
  - property_videos: updatedProperties[0].savedVideos
  - sub_units: serialized subUnits for property[0]
  - additional_properties: serialized properties[1+] with savedPhotos, savedVideos, savedProofs
```

**File Object Stripping:** Before persisting `SubUnit` objects to DB, `File` objects are removed:

```typescript
const subUnitsForDB = updatedProperties[0].subUnits.map(u => {
    const { newPhotos: _np, newVideos: _nv, ...rest } = u;
    return rest;
});
```

**Authentication:** All Supabase operations use a JWT token obtained from Clerk (`getToken({ template: 'supabase' })`), ensuring Row Level Security (RLS) is enforced.

---

## 10. Database Migration

**File:** `packages/core/database/add_property_details.sql`

Run the following SQL in the **Supabase SQL Editor** to add the required columns:

```sql
-- ============================================================
-- Add property_details, sub_units, property_videos, and
-- additional_properties columns
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS property_details JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS sub_units JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS property_videos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS additional_properties JSONB DEFAULT '[]'::jsonb;
```

> **⚠️ Note:** The `property_photos` column is assumed to already exist. If not, add:
>
> ```sql
> ALTER TABLE public.profiles
>     ADD COLUMN IF NOT EXISTS property_photos JSONB DEFAULT '[]'::jsonb;
> ```

---

## 11. Dependencies & APIs

### Frontend Dependencies

| Dependency | Purpose |
|-----------|---------|
| `react` | UI framework (useState, useMemo, useEffect, useCallback) |
| `next/image` | Optimized image rendering |
| `next/navigation` | useSearchParams for `?add=true` modal trigger |
| `@clerk/nextjs` | Authentication (useUser, useAuth) |
| `@supabase/supabase-js` | Database & storage client |
| `@kitnets/ui` | Shared UI component library (Button) |
| `lucide-react` | Icon library (Camera, Video, Bath, Home, Building2, Trash2, etc.) |
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

## 12. Design Decisions

### Why a properties array instead of separate state?

The `PropertyState[]` array design was chosen to:

1. **Scale naturally** — Adding a property is just pushing to the array
2. **Scope all data** — Each property's files, photos, address, and details are co-located
3. **Simplify the save loop** — A single `for` loop handles all properties uniformly
4. **Avoid prop-drilling** — Per-property setters are created inside the render loop

### Why dual persistence for ownership proofs?

The `ownership_proofs` table doesn't have a `property_index` column. Rather than requiring a DB migration, we store proof metadata redundantly in both:

- The `ownership_proofs` table (for the proofs system and admin review)
- The `additional_properties` JSON (for correct UI reload per property)

This trades a small amount of data duplication for zero DB schema changes.

### Why per-property storage path prefixes?

Using `{profileId}/prop-{N}` as a storage prefix ensures:

1. No filename collisions between properties
2. Easy bulk deletion if a property is removed
3. Clear organizational structure in the storage bucket

### Why strip File objects?

Sub-unit media uses `newPhotos: File[]` and `newVideos: File[]` fields directly in the `SubUnit` interface. `File` objects can't be serialized to JSON, so they're destructured out before saving:

```typescript
const { newPhotos: _np, newVideos: _nv, ...rest } = unit;
```

### Why useMemo for object URL preview?

The `PhotoPreview` and `FilePreview` components use `useMemo` to create the URL synchronously during render, with a separate `useEffect` cleanup to revoke the URL on unmount:

```typescript
const preview = useMemo(() => URL.createObjectURL(file), [file]);
useEffect(() => {
    return () => URL.revokeObjectURL(preview);
}, [preview]);
```

### Why JSONB instead of relational tables?

Property details and sub-units are stored as JSONB in the `profiles` table because:

1. The data is always loaded/saved as a complete unit with the profile
2. No need for cross-profile queries on sub-unit fields
3. Simpler schema and fewer joins
4. Flexible schema evolution without migrations

---

## 13. Known Issues & Future Work

### Pre-existing Lint Warnings

| Warning | Status |
|---------|--------|
| `adminData` missing from useEffect deps | Pre-existing |
| `vitest` module not found in test file | Pre-existing, does not affect builds |

### Future Improvements

- [ ] **Drag-and-drop reorder** for photos within a sub-unit
- [ ] **Image compression** before upload to reduce storage costs
- [ ] **Video thumbnail generation** for better preview UX
- [ ] **Validation** — Required fields, min/max photo counts for publishing
- [ ] **Delete media from storage** — Currently removing a saved photo/video only removes the URL from state; the file remains in Supabase storage
- [ ] **Progress indicator** during multi-file upload (currently no per-file feedback)
- [ ] **Optimistic UI** — Show uploaded photos immediately with loading indicators
- [ ] **`property_index` column** in `ownership_proofs` table — Would eliminate the need for dual persistence and enable admin-side per-property proof filtering
- [ ] **Separate relational table** for sub-units if cross-profile querying becomes necessary

---

## 14. Changelog

### v2.0 — 2026-02-18

#### Multi-Property File Upload Fix (Critical Bug Fix)

**Problem:** PDFs, images, and photos uploaded for the 2nd property onwards were silently lost on save.

**Root Cause (3 issues):**

| Issue | Location | Impact |
|-------|----------|--------|
| Save function used legacy aliases | `handleSave` | Only `properties[0]`'s `ownershipFiles`, `photos`, `videos` were uploaded; properties[1+] were ignored |
| Uploaded proofs not tracked per property | `handleSave` upload loop | Ownership proofs were inserted into DB but never added back to `properties[propIdx].savedProofs` for properties[1+] |
| `savedProofs` missing from JSON persistence | `additional_properties` serialization | On page reload, additional properties always started with `savedProofs: []` |

**Fix:**

1. **Rewrote file upload section** — Now iterates ALL `properties[]` with a `for` loop instead of using legacy `properties[0]` aliases
2. **Per-property storage prefixes** — Property 0 uses `{profileId}`, property N uses `{profileId}/prop-{N}` to avoid path collisions
3. **Proof tracking via `.select().single()`** — The `ownership_proofs.insert()` now returns the inserted record, which is pushed into `updatedProperties[propIdx].savedProofs`
4. **`savedProofs` persisted in JSON** — Added to both the initial `profilePayload` upsert and the post-upload `profiles.update` call
5. **`savedProofs` loaded from JSON** — Additional properties now restore proof data from the JSON on page load
6. **Auto-collapse** — Ownership section for additional properties auto-collapses when proofs exist

#### Dashboard Enhancements (Related Work)

- **Gateway online/offline status** — Dynamic status based on `last_seen_at` with 10-minute threshold
- **Animated pulse dot** for online gateways
- **Relative time display** for "Última atualização"
- **Ingest API update** — Now sets `gateways.last_seen_at` and `status` on successful sync
- **`?add=true` modal trigger** — Dashboard "Novo Imóvel" button navigates to `/profile?add=true`, which auto-opens the "Adicionar Propriedade" modal

### v1.0 — 2026-02-16

- Initial property details and sub-units system
- PropertyDetailsCard and SubUnitsSection components
- Media management (photos, videos) for main property and sub-units
- Ownership proof upload and AI-powered document analysis
- Collapsible sections with status badges
- Database migration for `property_details`, `sub_units`, `property_videos` columns

---

*Document updated on 2026-02-18. For questions, contact Kitnets Engineering.*
