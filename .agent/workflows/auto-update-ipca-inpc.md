---
description: Implementation plan to auto-update IPCA and INPC data from IBGE after each official disclosure
---

# Auto-Update IPCA & INPC from IBGE — Implementation Plan

## Overview

Automatically fetch IPCA and INPC data from the official IBGE SIDRA API 10 minutes after each scheduled disclosure, then upsert the data into the Supabase `economic_index_values` table.

## Architecture Decision: Vercel Cron Jobs (Recommended)

### Why Vercel Cron over GitHub Actions?

| Criteria | Vercel Cron | GitHub Actions |
|---|---|---|
| **Already in use** | ✅ IGP-M cron already deployed | ❌ No `.github/workflows/` exists |
| **Infrastructure** | ✅ Same as production app | Separate CI runner |
| **Supabase access** | ✅ Env vars already configured | Needs secrets setup |
| **Scheduling** | ⚠️ Cron syntax only (no specific dates) | ✅ `schedule` + `workflow_dispatch` |
| **Cost** | ✅ Free on Hobby (1 cron) / Pro (unlimited) | ✅ Free for public repos |
| **Code location** | `apps/web/src/app/api/cron/` | `.github/workflows/` |

**Decision:** Use **Vercel Cron Jobs** to match the existing IGPM pattern. Since Vercel cron only supports standard cron syntax (not specific calendar dates), we'll run a daily cron and have the API route itself check whether today is a disclosure date.

### Alternative: GitHub Actions (if Vercel Cron limits are hit)

If on the Vercel Hobby plan (limited to 1 daily cron), use GitHub Actions with `workflow_dispatch` + scheduled triggers. See Appendix A for this approach.

---

## IBGE SIDRA API — Verified Endpoints

### IPCA (Tabela 1737)

```
GET https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63,69,2265/p/last%201/d/v63%202,v69%202,v2265%202
```

**Variables:**

- `v/63` → IPCA - Variação mensal (%)
- `v/69` → IPCA - Variação acumulada no ano (%)
- `v/2265` → IPCA - Variação acumulada em 12 meses (%)

**Response example (Jan/2026):**

```json
[
  { "header": "..." },
  { "V": "0.33", "D2C": "63", "D2N": "IPCA - Variação mensal", "D3C": "202601", "D3N": "janeiro 2026" },
  { "V": "0.33", "D2C": "69", "D2N": "IPCA - Variação acumulada no ano", "D3C": "202601" },
  { "V": "4.44", "D2C": "2265", "D2N": "IPCA - Variação acumulada em 12 meses", "D3C": "202601" }
]
```

### INPC (Tabela 1736)

```
GET https://apisidra.ibge.gov.br/values/t/1736/n1/all/v/44,68,2292/p/last%201/d/v44%202,v68%202,v2292%202
```

**Variables:**

- `v/44` → INPC - Variação mensal (%)
- `v/68` → INPC - Variação acumulada no ano (%)
- `v/2292` → INPC - Variação acumulada em 12 meses (%)

**Response example (Jan/2026):**

```json
[
  { "header": "..." },
  { "V": "0.39", "D2C": "44", "D2N": "INPC - Variação mensal", "D3C": "202601" },
  { "V": "0.39", "D2C": "68", "D2N": "INPC - Variação acumulada no ano", "D3C": "202601" },
  { "V": "4.30", "D2C": "2292", "D2N": "INPC - Variação acumulada em 12 meses", "D3C": "202601" }
]
```

---

## Implementation Steps

### Step 1: Create the API Route

**File:** `apps/web/src/app/api/cron/update-ipca-inpc/route.ts`

This route will:

1. Authenticate via `CRON_SECRET`
2. Check if today is a disclosure date (or was within the last 24h)
3. Fetch latest IPCA data from SIDRA Table 1737
4. Fetch latest INPC data from SIDRA Table 1736
5. Parse the YYYYMM period code from the response
6. Upsert both records into `economic_index_values`
7. Return a JSON summary of what was done

**Key logic:**

```typescript
// IBGE 2026 IPCA/INPC disclosure dates (DD/MM/YYYY at 9:00 BRT)
const IBGE_DISCLOSURE_DATES_2026 = [
    '2026-01-10', // ref Dec/2025
    '2026-02-10', // ref Jan/2026
    '2026-03-12', // ref Feb/2026
    '2026-04-10', // ref Mar/2026
    '2026-05-12', // ref Apr/2026
    '2026-06-12', // ref May/2026
    '2026-07-10', // ref Jun/2026
    '2026-08-11', // ref Jul/2026
    '2026-09-11', // ref Aug/2026
    '2026-10-09', // ref Sep/2026
    '2026-11-12', // ref Oct/2026
    '2026-12-11', // ref Nov/2026
    '2027-01-12', // ref Dec/2026
];

// Check if today is a disclosure date
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC
const isDisclosureDay = IBGE_DISCLOSURE_DATES_2026.includes(today);
```

**Data parsing:**

```typescript
// Parse SIDRA response
// D3C = "202601" → year=2026, month=1
// D2C = "63" (monthly), "69" (YTD), "2265" (12m)
interface SidraRow {
    V: string;   // value
    D2C: string; // variable code
    D3C: string; // period YYYYMM
}

function parseSidraData(rows: SidraRow[]) {
    // Skip header row (index 0)
    const dataRows = rows.slice(1);
    const period = dataRows[0].D3C; // "202601"
    const year = parseInt(period.slice(0, 4));
    const month = parseInt(period.slice(4, 6));

    let monthly = 0, ytd = 0, acc12m = 0;
    for (const row of dataRows) {
        const val = parseFloat(row.V);
        if (row.D2C === '63' || row.D2C === '44') monthly = val;  // IPCA=63, INPC=44
        if (row.D2C === '69' || row.D2C === '68') ytd = val;      // IPCA=69, INPC=68
        if (row.D2C === '2265' || row.D2C === '2292') acc12m = val; // IPCA=2265, INPC=2292
    }

    return { year, month, monthly, ytd, acc12m };
}
```

### Step 2: Register the Vercel Cron Job

**File:** `vercel.json`

```json
{
    "crons": [
        {
            "path": "/api/cron/update-igpm",
            "schedule": "0 10 * * *"
        },
        {
            "path": "/api/cron/update-ipca-inpc",
            "schedule": "10 12 * * *"
        }
    ]
}
```

**Schedule explanation:**

- `10 12 * * *` = every day at 12:10 UTC = **9:10 AM BRT (UTC-3)**
- IBGE publishes at 9:00 BRT, so this runs **10 minutes after**
- The route itself checks if today is a disclosure date; if not, it returns early with `{ action: 'not-disclosure-day' }`

### Step 3: Environment Variables (already configured)

These already exist on Vercel from the IGPM cron:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

### Step 4: Database Schema (already exists)

The `economic_index_values` table already has the correct schema:

```sql
-- Columns used:
-- index_id (FK to economic_indexes.id)
-- year, month
-- reference_date
-- value_percent (monthly variation)
-- accumulated_12m
-- is_projection
-- source_url
```

The `accumulated_year` (YTD) is calculated dynamically by `getIndexValuesByDateRange()` in `lib/indexes.ts`, so we only need to store `value_percent` and `accumulated_12m`.

### Step 5: Error Handling & Monitoring

The route should:

- Log all actions to `console.log` (visible in Vercel Functions logs)
- Return structured JSON with `success`, `action`, and `message` fields
- Handle IBGE API being temporarily unavailable (retry logic or graceful failure)
- Handle the case where data hasn't been updated yet on IBGE (same period as last fetch)

### Step 6: Manual Trigger Endpoint

Add a query parameter `?force=true` to bypass the disclosure-date check, allowing manual triggers:

```
GET /api/cron/update-ipca-inpc?force=true
Authorization: Bearer <CRON_SECRET>
```

---

## File Structure

```
apps/web/
├── src/app/api/cron/
│   ├── update-igpm/route.ts          ← existing
│   └── update-ipca-inpc/route.ts     ← NEW
├── vercel.json                        ← update with new cron
```

---

## Testing Checklist

1. [ ] Deploy the route and verify it returns `401` without auth header
2. [ ] Test with `?force=true` + Bearer token to trigger immediate fetch
3. [ ] Verify IPCA data is correctly upserted into `economic_index_values`
4. [ ] Verify INPC data is correctly upserted into `economic_index_values`
5. [ ] Verify the page `/pt/indices/ipca` shows updated values after ISR revalidation (1 hour)
6. [ ] Verify the page `/pt/indices/inpc` shows updated values
7. [ ] Wait for next disclosure date and confirm automatic execution in Vercel logs
8. [ ] Verify that non-disclosure days return `{ action: 'not-disclosure-day' }` without making DB writes

---

## Appendix A: GitHub Actions Alternative

If Vercel cron limits are a concern, use GitHub Actions with exact schedule dates:

**File:** `.github/workflows/update-ipca-inpc.yml`

```yaml
name: Update IPCA/INPC from IBGE

on:
  schedule:
    # 12:10 UTC = 9:10 BRT — run on each IBGE disclosure date
    # Since GitHub Actions doesn't support specific dates, run daily and check inside
    - cron: '10 12 * * *'
  workflow_dispatch: # Manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Vercel Cron Endpoint
        run: |
          curl -s -X GET "https://kitnets.com/api/cron/update-ipca-inpc?force=true" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            | jq .
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

This approach calls the same Vercel API route but from GitHub Actions, giving you:

- Full execution logs in GitHub
- Easy manual re-runs
- No Vercel cron slot consumed

---

## Appendix B: Future Improvements

1. **Slack/Email notifications**: Send a notification when new data is ingested
2. **Dictionary auto-update**: Automatically update the `pt.json` analysis text (requires a separate API or build step)
3. **Calendar year rollover**: In December 2026, update the disclosure calendar for 2027
4. **Retry logic**: If IBGE API returns stale data at 9:10, retry at 9:30 and 10:00
5. **IPCA-15 support**: Add Table 7062 for IPCA-15 preview data
