/**
 * Builds the two views of Contratos — the hub's list and one contract's dashboard — for whoever
 * asks: the API routes (`GET /api/leases`, `GET /api/leases/[id]/dashboard`) and the page itself,
 * which preloads them on the server so the first paint already has the data instead of a
 * "Carregando…" while the browser makes a second, cold, authenticated round trip.
 *
 * The index series (IPCA, IGP-M…) come from the same cached reads the index pages use; a series
 * that cannot be read is null, never an error on the page.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { LEASE_DOCUMENTS_BUCKET, LEASE_SELECT_WITH_NAMES, flattenLease, loadOwnedLease, syncLeaseUnitNames } from "@/lib/leases-server";
import { signStorageUrls } from "@/lib/storage";
import { getAllIndexValuesForCalculator, getIndexMetadata } from "@/lib/indexes";
import { resolveCalculatorIndex } from "@/lib/index-calculator";
import { addMonths, leaseIndexSeriesCode, type IndexPoint } from "@/lib/lease-summary";
import { chargeKindOf } from "@/lib/lease-charges";
import { loadPropertyEntries } from "@/lib/property-entries-server";
import type { PropertyIncomeRow } from "@/lib/property-income";
import { INCOME_DIRECT_COLUMNS, normalizeIncomeRow } from "@/lib/property-income";
import { initialValues } from "@/lib/lease-adjustments";
import { syncLeaseAdjustments } from "@/lib/lease-adjustments-server";
import type { LeaseWithDetails } from "@/types/lease";
import type { LeaseDashboardView, LeaseListView, LeaseTenantContact } from "@/lib/lease-views";

/** The account's leases (soft-deleted excluded) with the joined names and how many files each has. */
export async function loadLeaseRows(supabase: AdminSupabase, profileId: string): Promise<LeaseWithDetails[]> {
    const { data: rows, error } = await supabase
        .from("leases")
        .select(LEASE_SELECT_WITH_NAMES)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
    if (error) throw new Error(`leases: ${error.message}`);

    const leases = await syncLeaseUnitNames(supabase, profileId, (rows || []) as unknown as Record<string, unknown>[]);

    const ids = leases.map(l => String(l.id));
    const counts = new Map<string, number>();
    const charges = new Map<string, LeaseWithDetails["charges"]>();
    if (ids.length > 0) {
        const [{ data: docs }, { data: chargeRows }] = await Promise.all([
            supabase.from("lease_documents").select("lease_id").in("lease_id", ids),
            // the hub's cards name the condominium or the energy and add up what the tenant pays
            supabase.from("lease_charges").select("*").in("lease_id", ids),
        ]);
        for (const d of docs || []) counts.set(d.lease_id, (counts.get(d.lease_id) ?? 0) + 1);
        for (const c of (chargeRows || []) as unknown as LeaseWithDetails["charges"]) charges.set(c.lease_id, [...(charges.get(c.lease_id) ?? []), c]);
    }

    return leases.map(l => {
        const flat = flattenLease(l);
        return { ...flat, document_count: counts.get(String(flat.id)) ?? 0, charges: charges.get(String(flat.id)) ?? [] } as unknown as LeaseWithDetails;
    });
}

/** `properties.id` → single or multi, from the profile's cadastro; a garage is left out and so is everything when the cadastro cannot be read (the cards then show whichever charge the contract has). */
export async function loadPropertyKinds(supabase: AdminSupabase, profileId: string): Promise<LeaseListView["propertyKinds"]> {
    try {
        const { entries } = await loadPropertyEntries(supabase, profileId);
        const kinds: LeaseListView["propertyKinds"] = {};
        for (const e of entries) {
            const kind = chargeKindOf(e.propertyType);
            if (e.id && kind) kinds[e.id] = kind;
        }
        return kinds;
    } catch (err) {
        console.error("[Lease views] property kinds failed:", (err as Error).message);
        return {};
    }
}

/** The monthly series of each calculator code (`ipca`, `igpm`…); null for a code that could not be read. */
export async function loadLeaseIndexSeries(codes: string[]): Promise<Record<string, IndexPoint[] | null>> {
    const unique = [...new Set(codes)];
    const entries = await Promise.all(unique.map(async (code): Promise<[string, IndexPoint[] | null]> => {
        try {
            const resolved = resolveCalculatorIndex(code);
            if (!resolved || resolved.spec.source !== "index" || !resolved.spec.key) return [code, null];
            const meta = await getIndexMetadata(resolved.spec.key);
            if (!meta) return [code, null];
            return [code, await getAllIndexValuesForCalculator(meta.id)];
        } catch (err) {
            console.error(`[Lease views] index series ${code} failed:`, (err as Error).message);
            return [code, null];
        }
    }));
    return Object.fromEntries(entries);
}

export async function loadLeaseList(supabase: AdminSupabase, profileId: string): Promise<LeaseListView> {
    const [leases, propertyKinds] = await Promise.all([loadLeaseRows(supabase, profileId), loadPropertyKinds(supabase, profileId)]);
    const codes = leases.map(l => leaseIndexSeriesCode(l.adjustment_index)).filter((c): c is string => Boolean(c));
    const series = await loadLeaseIndexSeries(codes);
    return { leases, series, propertyKinds };
}

const INCOME_COLUMNS =
    `id, property_id, month, unit_id, unit_name, received_on, received_amount, energy_portion, other_income, other_expenses, condo_amount, fee_on_condo, iptu_amount, agency_fee_pct, status, source, bank_reference, notes, ${INCOME_DIRECT_COLUMNS}`;

/** The property's ledger rows between two months (inclusive), numbers normalised like the income route does. */
export async function loadIncomeRows(supabase: AdminSupabase, propertyId: string, fromMonth: string, toMonth: string): Promise<PropertyIncomeRow[]> {
    const { data, error } = await supabase
        .from("property_income_months")
        .select(INCOME_COLUMNS)
        .eq("property_id", propertyId)
        .gte("month", `${fromMonth}-01`)
        .lte("month", `${toMonth}-01`)
        .order("month", { ascending: true });
    if (error) {
        console.error("[Lease views] income rows failed:", error.message);
        return [];
    }
    return ((data ?? []) as unknown as PropertyIncomeRow[]).map(normalizeIncomeRow);
}

/** One contract with everything its dashboard shows. Throws the 404 of `loadOwnedLease` when it is not the account's. */
export async function loadLeaseDashboard(supabase: AdminSupabase, leaseId: string, profileId: string): Promise<LeaseDashboardView> {
    const [row] = await syncLeaseUnitNames(supabase, profileId, [await loadOwnedLease(supabase, leaseId, profileId, LEASE_SELECT_WITH_NAMES)]);
    const lease = flattenLease(row) as unknown as LeaseWithDetails;

    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const fromMonth = lease.start_date.slice(0, 7);
    const lastMonth = ((lease.termination_date ?? lease.end_date) ?? today).slice(0, 7);
    // one month of slack on each side: a rent paid early or a final settlement lands next to the term
    const toMonth = addMonths(`${(lastMonth > today.slice(0, 7) ? today.slice(0, 7) : lastMonth)}-01`, 1).slice(0, 7);
    const seriesCode = leaseIndexSeriesCode(lease.adjustment_index);

    const [tenantsRes, chargesRes, docsRes, contactRes, income, series, entries] = await Promise.all([
        supabase.from("lease_tenants").select("*, tenant:tenants!tenant_id(full_name)").eq("lease_id", leaseId),
        supabase.from("lease_charges").select("*").eq("lease_id", leaseId),
        supabase.from("lease_documents").select("*").eq("lease_id", leaseId).order("uploaded_at", { ascending: false }),
        supabase.from("tenants").select("id, full_name, main_phone, email").eq("id", lease.primary_tenant_id).maybeSingle(),
        loadIncomeRows(supabase, lease.property_id, fromMonth, toMonth),
        seriesCode ? loadLeaseIndexSeries([seriesCode]).then(s => s[seriesCode] ?? null) : Promise.resolve(null),
        // single (house/apartment) or multi (kitnets): decides whether the card names the energy bill or the condominium
        loadPropertyEntries(supabase, profileId).then(r => r.entries).catch(err => { console.error("[Lease views] property entries failed:", (err as Error).message); return []; }),
    ]);

    // a charge readjusted by an index of its own (not the rent's) needs that series too
    const charges = (chargesRes.data || []) as unknown as LeaseWithDetails["charges"];
    const chargeCodes = [...new Set(charges.map(c => (c.adjusts_with_rent ? null : leaseIndexSeriesCode(c.adjustment_index))).filter((c): c is string => !!c && c !== seriesCode))];
    const chargeSeries = chargeCodes.length > 0 ? await loadLeaseIndexSeries(chargeCodes) : {};

    // The calculated adjustments this lease owes are recorded now, so the page opens on today's rent
    // (the daily cron does the same for every lease). When they moved the amounts, read them again.
    const synced = await syncLeaseAdjustments(supabase, { ...lease, charges }, { ...chargeSeries, ...(seriesCode ? { [seriesCode]: series } : {}) }, today);
    let currentRent = Number(lease.monthly_rent) || 0;
    let currentCharges = charges;
    if (synced.changed) {
        const [rentRes, freshCharges] = await Promise.all([
            supabase.from("leases").select("monthly_rent").eq("id", leaseId).maybeSingle(),
            supabase.from("lease_charges").select("*").eq("lease_id", leaseId),
        ]);
        if (rentRes.data) currentRent = Number(rentRes.data.monthly_rent) || currentRent;
        if (freshCharges.data) currentCharges = freshCharges.data as unknown as LeaseWithDetails["charges"];
    }

    const docs = (docsRes.data ?? []) as Array<Record<string, unknown> & { file_url: string }>;
    const signed = await signStorageUrls(supabase, LEASE_DOCUMENTS_BUCKET, docs.map(d => d.file_url));
    const entry = entries.find(e => e.id === lease.property_id);
    const propertyKind = entry ? chargeKindOf(entry.propertyType) : (lease.unit_id ? "multi" : null);

    return {
        propertyKind,
        lease: {
            ...lease,
            monthly_rent: currentRent,
            additional_tenants: (tenantsRes.data || []).map((t: Record<string, unknown>) => ({
                ...t,
                tenant_name: (t.tenant as Record<string, unknown> | null)?.full_name || null,
                tenant: undefined,
            })) as unknown as LeaseWithDetails["additional_tenants"],
            charges: currentCharges,
            documents: docs.map(doc => ({ ...doc, file_url: signed.get(storagePathOf(doc.file_url)) ?? doc.file_url })) as unknown as LeaseWithDetails["documents"],
            document_count: docs.length,
        },
        tenant: (contactRes.data as LeaseTenantContact | null) ?? null,
        income,
        series,
        chargeSeries,
        adjustments: {
            available: synced.available,
            rows: synced.rows,
            initial: initialValues({ ...lease, monthly_rent: currentRent, charges: currentCharges }, synced.rows),
            waiting: synced.waiting,
            pending: synced.pending,
            error: synced.error,
        },
    };
}

/** `signStorageUrls` keys its map by object path; a legacy public URL is reduced to its path the same way. */
function storagePathOf(urlOrPath: string): string {
    const marker = "/storage/v1/object/";
    const idx = urlOrPath.indexOf(marker);
    if (idx === -1) return urlOrPath.replace(/^\/+/, "");
    const [, , ...parts] = urlOrPath.slice(idx + marker.length).split("/");
    return decodeURIComponent(parts.join("/"));
}
