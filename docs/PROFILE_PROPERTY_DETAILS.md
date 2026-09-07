# Profile Page — Property Details & Configuration

**Version:** 2.2  
**Last updated:** 2026-09-07  
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
   - 5.2 [PropertyDocumentsCard (Document Manager & Creation Dropzone)](#52-propertydocumentscard-document-manager--creation-dropzone)
   - 5.3 [PropertyDetailsCard (Property Details & Amenities)](#53-propertydetailscard-property-details--amenities)
   - 5.4 [SubUnitsSection (Multi-family Sub-Units)](#54-subunitssection-multi-family-sub-units)
   - 5.5 [Helper Components](#55-helper-components)
6. [Ownership Tab — Section Layout](#6-ownership-tab--section-layout)
   - 6.1 [Section Order & Wizard Progression](#61-section-order--wizard-progression)
   - 6.2 [Collapsible Sections](#62-collapsible-sections)
7. [Media Management](#7-media-management)
   - 7.1 [Main Property Media](#71-main-property-media)
   - 7.2 [Sub-Unit Media](#72-sub-unit-media)
   - 7.3 [Upload Flow](#73-upload-flow)
   - 7.4 [Storage Structure](#74-storage-structure)
8. [Ownership Proof Documents & Categorized Folders](#8-ownership-proof-documents--categorized-folders)
   - 8.1 [Creation Dropzone Mode](#81-creation-dropzone-mode)
   - 8.2 [8-Folder Categorized Document System](#82-8-folder-categorized-document-system)
   - 8.3 [IPTU Exercise Year Organization](#83-iptu-exercise-year-organization)
   - 8.4 [Upload, Storage & Persistence Strategy](#84-upload-storage--persistence-strategy)
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

The **Profile Page** (`/[lang]/profile` and `/[lang]/imoveis`) is the central hub where property owners (landlords) configure their property information, upload documents, and manage their identity. The page is organized into three tabs:

| Tab | Purpose |
|-----|---------|
| **Imóvel** (Ownership) | Property address, documents, details, sub-units, photos/videos, description |
| **Dados Pessoais** (Basics) | Name, CPF/CNPJ, phone, personal address, PF/PJ toggle |
| **Segurança** (Security) | Account deletion, password management |

This document focuses on the **Ownership tab**, specifically the **Property Documents & Folders** system, **Property Details** system, **Sub-Units** configuration, and the **Multi-Property Architecture** that supports multiple properties per user profile.

### Key Features

- **Multi-Property Support** — Users can add and manage multiple properties (primary + additional)
- **Document Management & AI Ingestion** — Creation-mode dropzone for instant GPT Vision address extraction; switches to 8-Folder categorized manager once property is saved
- **Categorized Document Folders** — Dedicated folders for IPTU (by exercise year), Contratos, Vistoria, Compra e Venda, Matrícula, Escritura, Certidões, and Outros
- **Comprehensive Property Details** — Lot area, built area, total area, units count, solar kWp, utilities (Water, Energy, Internet, Gas), and full single-family amenity configuration (rooms, bedrooms, bathrooms, parking spaces, kitchen cabinets, laundry, AC, cooktop)
- **Dynamic Sub-Unit Cards** — Auto-generated based on unit count for multi-family, each with full amenity & utility configuration
- **Media Per Entity** — Up to 10 photos + 2 videos for main property AND each sub-unit
- **Sequential Step Wizard** — Smooth card disclosure guiding landlord from documents to address, details, media, and description
- **Collapsible Sections** — All ownership tab sections are collapsible with smooth animations and status indicators

---

## 2. Architecture & File Structure

```
apps/web/src/
├── app/[lang]/profile/
│   ├── page.tsx                    # Server component (loads dictionary)
│   ├── ProfileContent.tsx          # Client component — page orchestrator (~3700 lines)
│   └── actions.ts                  # Server actions (account deletion)
│
├── components/profile/
│   ├── PropertyDocumentsCard.tsx   # Document dropzone & 8-folder system (~720 lines)
│   └── PropertyDetailsCard.tsx     # Property details + SubUnits components (~1210 lines)
│
packages/core/database/
├── add_property_details.sql        # Migration script for property details DB columns
└── add_property_index_to_ownership_proofs.sql # Migration for per-property proof isolation
```

### Component Relationship Diagram

```
ProfileContent.tsx (Page Orchestrator)
├── Ownership Tab
│   ├── properties.map(prop, propIdx =>    ← iterates ALL properties
│   │   ├── Property Header (collapsible accordion)
│   │   ├── 1. PropertyDocumentsCard (Dropzone when adding / 8-Folder Grid when saved)
│   │   ├── 2. Address Section (collapsible)
│   │   ├── 3. PropertyDetailsCard (Single-family & common details)
│   │   ├── 4. SubUnitsSection (Multi-family unit configuration)
│   │   ├── 5. Photos & Videos Section (collapsible)
│   │   └── 6. Description Section (collapsible)
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

> **Updated: 2026-09-07** — Bundles per-property data, section open states, step wizard visibility flags, and persistent saved status.

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
    profilePhotoUrl: string | null;

    // Collapsible section states
    ownershipSectionOpen: boolean;
    addressSectionOpen: boolean;
    photosSectionOpen: boolean;
    descriptionSectionOpen: boolean;
    detailsInitialOpen: boolean;
    subUnitOpenIdx: number | null;

    // Sequential step wizard visibility flags
    showAddressCard?: boolean;
    showDetailsCard?: boolean;
    showPhotosCard?: boolean;
    showDescriptionCard?: boolean;

    // Saved status: false during creation until wizard is completed; true once saved
    isSavedProperty?: boolean;
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
    areaLote: string;            // Lot area in m²
    areaEdificada: string;       // Built area in m²
    totalSqMeters: string;       // Total property area in m² (optional, positioned right of areaEdificada)
    numberOfUnits: number;       // For multi: defaults to 1; for single: 0
    solarEnergy: boolean;        // Has solar energy installed
    solarKwp: string;            // Solar generation capacity in kWp
    mainMeters: {
        water: boolean;          // Main water meter (paid by landlord)
        energy: boolean;         // Main energy meter (paid by landlord)
        gas: boolean;            // Main gas meter (paid by landlord)
    };
    internetBill: boolean;       // Internet included (paid by landlord, placed between energy and gas)

    // Single-family details & amenities
    rooms: string;               // Total rooms
    bedrooms: string;            // Bedrooms
    bathrooms: string;           // Bathrooms
    parkingSpaces: string;       // Parking spaces (text input, defaults to '1')
    kitchenCabinets: boolean;    // Kitchen cabinets
    laundry: "none" | "individual" | "shared";
    ac: "none" | "cold" | "cold_hot";
    cooktop: "none" | "gas" | "electric" | "induction";
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
    property_index?: number;
    file_url?: string;
};
```

**Stored in:** The `ownership_proofs` table for all properties with `property_index`. For additional properties (index 1+), the proof records are **also persisted** in the `additional_properties` JSON's `savedProofs` field for redundancy.

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
| `property_index` | `INTEGER` | Property index (0 = primary, 1+ = additional) |
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
**Lines:** ~3700

This is the main orchestrator component that:

- Manages all state via the `properties: PropertyState[]` array
- Handles data loading from Supabase (`loadProfile`)
- Handles data saving to Supabase (`handleSave`) — with per-property file uploads and persistence
- Coordinates the step-by-step disclosure wizard (`showAddressCard`, `showDetailsCard`, `showPhotosCard`, `showDescriptionCard`)
- Tracks `isSavedProperty` status to toggle between initial upload mode and full folder management mode
- Renders the three-tab interface and multi-property management controls

**Key State Variables:**

| State | Type | Purpose |
|-------|------|---------|
| `properties` | `PropertyState[]` | Array of all property states (primary + additional) |
| `expandedPropertyIdx` | `number \| null` | Which property accordion is currently expanded |
| `personType` | `'pf' \| 'pj'` | Person type (individual or company) |
| `formData` | `object` | Personal data form fields |
| `fileAnalysisStatus` | `Record<string, string>` | AI document analysis status per file |
| `activeTab` | `string` | Currently active tab (`basics`, `ownership`, `security`) |

### 5.2 PropertyDocumentsCard (Document Manager & Creation Dropzone)

**File:** `apps/web/src/components/profile/PropertyDocumentsCard.tsx`  
**Lines:** ~720  
**Export:** `default` (default export)

A specialized document management component with two distinct modes:

1. **Creation Mode (`!isPropertySaved`)**:
   - Renders a clean, simple, inviting upload dropzone designed to encourage users to send documents (IPTU, Matrícula, Escritura, Compra e Venda) for automated address extraction via GPT Vision.
   - If files are uploaded while adding, displays an orderly list of uploaded documents with AI extraction status (`Analisando com IA...`, `Endereço extraído`) and `Visualizar` / `Excluir` actions, keeping the dropzone available for further files.
   - Conditionally hides "Digitar manualmente" once address fields are already filled.
   - Displays "Confirmar →" button once documents are added to advance to the address card.

2. **Saved Mode (`isPropertySaved`)**:
   - Renders the organized **8-Folder System** grid:
     1. **IPTU**: Organizes IPTU files by tax exercise year (current year + past years) with quick-upload inside the folder.
     2. **Contratos**: Rental contracts, addenda, and termination agreements.
     3. **Vistoria**: Ingoing and outgoing inspection reports.
     4. **Compra e Venda**: Purchase and sale agreements.
     5. **Matrícula**: Property registry certificates from the Cartório de Registro de Imóveis.
     6. **Escritura**: Public deeds.
     7. **Certidões**: Clearance and negative certificates (municipal, state, federal).
     8. **Outros**: Floor plans and other property files.
   - Clean, short folder labels without visual subtitle clutter; displays file count badges ("X arquivos" or "Vazia").
   - Clicking a folder opens a full folder view with document cards, download/view signed URLs, delete actions, and direct folder file upload.

### 5.3 PropertyDetailsCard (Property Details & Amenities)

**File:** `apps/web/src/components/profile/PropertyDetailsCard.tsx`  
**Lines:** ~1210  
**Export:** `default` (default export)

Renders the **"Dados da Propriedade"** card:

- Property name, municipal registration, inscription, matricula
- **3-Column Area Grid**: Área Lote (m²), Área Edif. (m²), and Área Total (m²) (non-mandatory)
- **Number of Units**: Only displayed for `multi` properties (defaults to `1`)
- **Solar Energy**: Toggle + generation capacity in kWp
- **Main Meters & Utilities** (`pagos pelo Proprietário`): Inline checkboxes for **Água**, **Energia**, **Internet**, and **Gás**
- **Single-Family Details & Amenities**: Rooms, bedrooms, bathrooms, parking spaces (text input, defaults to `1`), kitchen cabinets, laundry (none/individual/shared), AC (none/cold/cold_hot), and cooktop (none/gas/electric/induction)

### 5.4 SubUnitsSection (Multi-family Sub-Units)

**File:** `apps/web/src/components/profile/PropertyDetailsCard.tsx`  
**Export:** Named export (`SubUnitsSection`)

Renders the sub-unit card list with full per-unit configuration for multi-family properties (`propertyType === 'multi'`). Each sub-unit card is an accordion panel with amenities, condominium inclusions, media, and description.

### 5.5 Helper Components

#### `Checkbox`
Styled checkbox with icon support. Used throughout the property details and sub-unit forms.

#### `SelectField`
Styled `<select>` dropdown with label and icon support.

#### `FilePreview`
Renders a preview thumbnail for a `File` object (photo or video) with a delete button overlay.

---

## 6. Ownership Tab — Section Layout

### 6.1 Section Order & Wizard Progression

Within each property accordion, sections appear in this logical order:

| # | Section | Component | Scope / Purpose |
|---|---------|-----------|-----------------|
| 1 | **Documentos da Propriedade** | `PropertyDocumentsCard` | Document dropzone (creation) / 8-Folder manager (saved) |
| 2 | **Endereço** | Inline (collapsible) | Property address (auto-filled by AI from documents or manual entry) |
| 3 | **Dados da Propriedade** | `PropertyDetailsCard` | Single-family amenities, areas, utilities, solar |
| 4 | **Sub-unidades** | `SubUnitsSection` | Per-unit configuration & media (only for `multi` properties) |
| 5 | **Fotos e Vídeos do Imóvel** | Inline (collapsible) | Property media (up to 10 photos + 2 videos) |
| 6 | **Descrição do Imóvel** | Inline (collapsible) | Property listing description; confirming marks property as saved |

#### Wizard Card Progression:
1. On a new property, only Step 1 (Documentos) is initially open.
2. Clicking "Digitar manualmente" or uploading a document unlocks Step 2 (Endereço).
3. Confirming Endereço unlocks Step 3 (Dados da Propriedade).
4. Confirming Dados da Propriedade unlocks Step 5 (Fotos e Vídeos) or Step 4 (Sub-unidades).
5. Confirming Fotos e Vídeos unlocks Step 6 (Descrição do Imóvel).
6. Clicking "Confirmar" on Descrição persists the property, marks `isSavedProperty: true`, collapses the wizard, and enables the 8-folder system in Step 1.

### 6.2 Collapsible Sections

All sections are collapsible. Each uses:

- A `ChevronUp` / `ChevronDown` icon toggle
- A status badge when collapsed (e.g., "Verificado ✓", "5 fotos · 1 vídeos")
- Colored icon badges for visual distinction

| Section | Color Scheme | Icon |
|---------|-------------|------|
| Documentos | Blue / Emerald (when verified) | `FileText` / `CheckCircle2` |
| Endereço | Emerald | `MapPin` |
| Dados da Propriedade | Violet | `Home` / `Building2` |
| Fotos/Vídeos | Amber | `Camera` |
| Descrição | Indigo | `FileText` |

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

## 8. Ownership Proof Documents & Categorized Folders

> **Updated: 2026-09-07** — Transformed from a flat verification list into an adaptive document management system: clean dropzone during creation and an organized 8-Folder grid once saved.

### 8.1 Creation Dropzone Mode (`!isPropertySaved`)

When a property is being created (`isPropertySaved: false`), the user is in the setup wizard. To reduce cognitive overhead and eliminate intimidating empty folders:

- Displays a single inviting dropzone with formats (`.pdf`, `.jpg`, `.jpeg`, `.png`, max 15MB) and an informational banner explaining that AI will automatically extract the address from IPTU, Matrícula, Escritura, or Compra e Venda.
- As files are selected/dropped:
  - Files are added to pending uploads.
  - GPT Vision analysis (`analyzeDocument`) runs, extracting address, street, number, neighborhood, city, state, CEP, and cadastral data.
  - A temporary floating success badge appears (`xxx — Endereço extraído com sucesso (Visão GPT)`) and auto-dismisses after 6 seconds, reappearing only upon new uploads.
  - Uploaded files are listed in an orderly list with document category badge, size, status, and *Visualizar* / *Excluir* actions.
  - The dropzone remains available below the list in a compact form to add more files if desired.
- Includes a conditional **"Digitar manualmente"** button (hidden if address is already filled) and a **"Confirmar →"** button (visible once documents exist) to advance to the Address step.

### 8.2 8-Folder Categorized Document System (`isPropertySaved`)

Once a property is saved (`isPropertySaved: true`), the document card switches to the full **8-Folder System**:

| Folder | ID | Icon | Purpose |
|--------|----|------|---------|
| **IPTU** | `iptu` | `Receipt` | Annual property tax documents, organized by exercise year |
| **Contratos** | `contrato_aluguel` | `FileSignature` | Lease contracts, renewals, amendments, termination agreements |
| **Vistoria** | `vistoria` | `ClipboardCheck` | Entry and exit inspection reports with photos and checklists |
| **Compra e Venda** | `compra_venda` | `FileText` | Purchase and sale agreements or commitment contracts |
| **Matrícula** | `matricula` | `FileSpreadsheet` | Updated land registry certificates from Cartório de Registro |
| **Escritura** | `escritura` | `Scroll` | Public deeds drawn up in Tabelionato de Notas |
| **Certidões** | `certidoes` | `ShieldCheck` | Clearance/negative certificates (municipal, state, federal, labor) |
| **Outros** | `outros` | `Folder` | Floor plans, utility receipts, and miscellaneous files |

**Folder View Features:**
- Root view displays a 4-column responsive grid with folder icon, title, and count badge (`X arquivos` or `Vazia`). Subtitle clutter has been stripped for a clean look.
- Clicking any folder opens its dedicated folder view with:
  - Back button (`← Todas as Pastas`) and folder header with total item count.
  - Document cards with category badge, exercise year tag, file size, creation date, view link (signed URL or Blob), and delete button.
  - Embedded dropzone allowing direct uploads directly into the opened folder.

### 8.3 IPTU Exercise Year Organization

The IPTU folder contains special logic to group files by tax exercise year:
- **Current Year Highlight**: Emphasizes the current calendar year's IPTU document with a distinct badge.
- **Historic Years List**: Neatly displays previous years' receipts and IPTU carnês in descending order.
- Filenames and tags automatically parse the year from `[IPTU YYYY]`, filename patterns, or upload timestamps.

### 8.4 Upload, Storage & Persistence Strategy

Ownership proofs and documents are scoped per property via the `property_index` column:

| Property Index | DB Table | JSON Column |
|----------------|----------|-------------|
| 0 (primary) | `ownership_proofs` table (`property_index = 0`) | Not needed — loaded from table |
| 1+ (additional) | `ownership_proofs` table (`property_index = idx`) | `additional_properties[idx].savedProofs` (redundancy) |

Each proof row records `property_index` matching its property. For additional properties, proof metadata is also mirrored in `additional_properties` JSON for fast client-side restores.

### 8.3 Load Flow

```typescript
// 1. Load all proofs from DB for this profile
const { data: proofs } = await sb
    .from('ownership_proofs')
    .select('*')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false });

// 2. Primary property receives ONLY proofs with property_index === 0
primaryProperty.savedProofs = dedupeProofs(
    allProofs.filter(p => getProofPropertyIndex(p) === 0 && !additionalProofIds.has(p.id))
);

// 3. Additional properties receive their own matching proofs, deduplicated
for (let apIdx = 0; apIdx < profile.additional_properties.length; apIdx++) {
    const targetPropIdx = apIdx + 1;
    const dbProofsForProp = allProofs.filter(p => getProofPropertyIndex(p) === targetPropIdx);
    const jsonProofsForProp = apTyped.savedProofs || [];
    additionalProp.savedProofs = dedupeProofs([...dbProofsForProp, ...jsonProofsForProp]);
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
- [x] **`property_index` column** in `ownership_proofs` table — Enables true per-property proof isolation, eliminates cross-leakage, and supports admin-side per-property proof filtering
- [ ] **Separate relational table** for sub-units if cross-profile querying becomes necessary

---

## 14. Changelog

### v2.2 — 2026-09-07

#### Document Management Overhaul, Creation Dropzone & Property Details Expansion

1. **Clean Creation Dropzone vs 8-Folder System**:
   - Replaced empty 8-folder grid on new properties with a clean, inviting document dropzone encouraging uploads (IPTU, Matrícula, Escritura, Compra e Venda) for automated GPT Vision address extraction.
   - 8-Folder system (IPTU, Contratos, Vistoria, Compra e Venda, Matrícula, Escritura, Certidões, Outros) now only appears after property creation is fully completed (saved) up to description confirmation.
   - Floating GPT Vision address extraction success banner now auto-dismisses after 6 seconds and only reappears upon new document upload.
   - "Digitar manualmente" button is hidden when address fields are already filled.
   - Streamlined folder names and badges, eliminating clutter and redundant subtitles.
   - IPTU folder unified and organized by exercise year (current calendar year highlighted + past years listed chronologically).

2. **Dados da Propriedade (Property Details) Expansion**:
   - Added single-family fields: Cômodos, Quartos, Banheiros, Vagas de Garagem (input with initial value `1`), Armários de Cozinha, Lavanderia, Ar-Condicionado, and Cooktop.
   - Multi-family properties now default to `1` unit (`numberOfUnits: 1`).
   - Repositioned **Área Total (m²)** to the right of **Área Edif. (m²)** and removed non-mandatory asterisk.
   - Moved **Internet** checkbox inline into Medidores Principais between **Energia** and **Gás** (`Água`, `Energia`, `Internet`, `Gás`).

3. **Step Wizard & Save State Flow**:
   - Added `isSavedProperty` flag to `PropertyState` interface and DB persistence.
   - Guided step disclosure: Documents → Address → Details → Photos/SubUnits → Description.
   - Confirming Description sets `isSavedProperty: true`, collapses the wizard, and enables the organized 8-folder document view.

### v2.1 — 2026-09-04

#### Multi-Property Document Cross-Contamination & Duplication Fix

**Problem:**
1. Documents from multi-property (Property 1+) were showing up inside the single property (Property 0).
2. Multiple duplicate copies of the same document (e.g., 10 copies of `IPTU 2025.pdf`) existed and kept reappearing even after deletion.

**Root Causes & Fixes:**
1. **Per-property scoping:** Added `property_index` column to `ownership_proofs`. Proof loading now strictly filters proofs per property index (`property_index === 0` for primary property, `property_index === i + 1` for additional properties), with fallback matching on `file_url` and exclusion of IDs in `additional_properties`.
2. **True deletion:** `removePropSavedProof` now deletes the record from `ownership_proofs` table in Supabase and removes the file from the storage bucket. Added RLS `DELETE` policy on `ownership_proofs`.
3. **Save concurrency guards:** Added `if (!user || isSaving) return;` guard to `handleSave` and disabled all section "Continuar" buttons while saving (`disabled={isSaving}`), preventing rapid clicks from triggering multiple concurrent upload operations.
4. **Deduplication:** Added `dedupeProofs` utility to filter out identical proofs by ID and document name both on load, save, and UI rendering. Added client-side duplicate prevention on file input dropzone.
5. **Database migration script:** Created `packages/core/database/add_property_index_to_ownership_proofs.sql` to add the column, backfill existing records from `file_url`, enable the `DELETE` policy, and deduplicate existing rows.

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

*Document updated on 2026-09-07. For questions, contact Kitnets Engineering.*
