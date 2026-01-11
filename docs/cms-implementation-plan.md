# Kitnets.com CMS Implementation Plan

## Executive Summary

To support Kitnets.com's growth into a "Zillow-scale" platform for the Brazilian market, we propose a scalable, database-backed Content Management System (CMS) using **Supabase** and **Next.js**, leveraging **MDX** for rich content rendering. This architecture eliminates technical debt (lint/build warnings from static imports), improves SEO, and enables dynamic author profiles and massive content scaling.

## 1. Architecture Overview

**Current State:**

- Hardcoded pages in `src/app/[lang]/conteudos/...`.
- Static imports likely causing bundle size warnings.
- Difficult to manage metadata, authors, and relations at scale.

**Proposed Architecture:**

- **Database**: Supabase (PostgreSQL). Stores article content (MDX string), metadata, author relations, and category relations.
- **Frontend**: Next.js with Dynamic Routes (`[category]/[slug]`).
- **Rendering**: `next-mdx-remote` to render MDX content stored in the database.
- **Caching**: Incremental Static Regeneration (ISR) to ensure fast load times and SEO, updating content without full rebuilds.

## 2. Database Schema (Supabase)

We will create the following tables to structure content efficiently.

### `authors`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary Key |
| `name` | text | Full name (e.g., "Artur Pedrosa") |
| `slug` | text | URL friendly slug (e.g., "artur-pedrosa") |
| `avatar_url` | text | Profile picture URL |
| `bio` | text | Short biography |
| `social_links` | jsonb | Twitter, LinkedIn, etc. |

### `categories`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary Key |
| `name` | text | Display name (e.g., "Impostos e Legislação") |
| `slug` | text | URL slug (e.g., "impostos-e-legislacao") |
| `description` | text | SEO description for category page |

### `articles`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary Key |
| `title` | text | H1 Title |
| `slug` | text | Unique URL slug |
| `content` | text | The full MDX body content |
| `excerpt` | text | Short summary for cards/SEO |
| `published_at` | timestamptz | Schedule publication |
| `updated_at` | timestamptz | Last modification |
| `status` | text | 'draft', 'published', 'archived' |
| `author_id` | uuid | FK to `authors` |
| `category_id` | uuid | FK to `categories` |
| `metadata` | jsonb | SEO title, description, keywords, og_image |

## 3. Implementation Steps

### Phase 1: Foundation (Solves Builds & Warnings)

1. **Setup Supabase Tables**: Create the schema defined above.
2. **Install Dependencies**: `next-mdx-remote` (lightweight, no build-time compile cost).
3. **Create Service Functions**: `getArticleBySlug`, `getArticlesByCategory` using Supabase SDK. Note: Avoid fetching *all* articles statically; use `generateStaticParams` with a limit or ISR.

### Phase 2: Dynamic Routing & Rendering

1. **Dynamic Route**: Create `apps/web/src/app/[lang]/conteudos/[category]/[slug]/page.tsx`.
2. **MDX Renderer**: Create a `MDXRemote` component to render the content string. Map custom Kitnets UI components (e.g., `CalculatorWidget`, `Callout`) to MDX tags.
3. **Metadata**: Implement `generateMetadata` fetching from the `articles` table.

### Phase 3: Author & Category Pages

1. **Author Page**: `apps/web/src/app/[lang]/autor/[slug]/page.tsx`. Fetches author profile + list of their articles.
2. **Category Page**: `apps/web/src/app/[lang]/conteudos/[category]/page.tsx`. Lists articles in that category.

## 4. Addressing User Requirements

- **"Eliminate lint/build warnings caused by static imports"**: By moving content to the DB, we remove the need to `import` hundreds of page components into a list. Pages are fetched individually on demand.
- **"Optimized for Next.js & Supabase"**: Uses native Next.js caching (ISR) and Supabase's robust querying.
- **"SEO"**: `generateMetadata` ensures every DB article has perfect meta tags. Structured Data (JSON-LD) can be auto-generated from the schema.
- **"Zillow-scale"**: PostgreSQL handles millions of rows. Next.js handles dynamic routing. Changes propagate instantly (revalidate) without 45-minute builds.

## 5. Migration Strategy

1. **Inventory**: List all current hardcoded pages.
2. **Script**: Write a one-off script to parse current React pages, extract the text/content, and insert them into Supabase `articles`.
3. **Redirects**: Ensure old routes redirect to new dynamic routes if the URL structure changes (though we aim to keep `conteudos/[category]/[slug]` consistent).

## 6. Future Improvements

- **Custom Admin Panel**: Build a `/dashboard/cms` route using Kitnets UI components for easy editing.
- **AI Integration**: Use the existing OpenAI/Gemini integration to assist in drafting or optimizing SEO metadata for articles directly in the CMS.
