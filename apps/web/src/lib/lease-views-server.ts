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
import type { PropertyIncomeRow } from "@/lib/property-income";
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
    if (ids.length > 0) {
        const { data: docs } = await supabase.from("lease_documents").select("lease_id").in("lease_id", ids);
        for (const d of docs || []) counts.set(d.lease_id, (counts.get(d.lease_id) ?? 0) + 1);
    }

    return leases.map(l => {
        const flat = flattenLease(l);
        return { ...flat, document_count: counts.get(String(flat.id)) ?? 0 } as unknown as LeaseWithDetails;
    });
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
    const leases = await loadLeaseRows(supabase, profileId);
    const codes = leases.map(l => leaseIndexSeriesCode(l.adjustment_index)).filter((c): c is string => Boolean(c));
    const series = await loadLeaseIndexSeries(codes);
    return { leases, series };
}

const INCOME_COLUMNS =
    "id, property_id, month, unit_id, unit_name, received_on, received_amount, energy_portion, other_income, other_expenses, condo_amount, fee_on_condo, iptu_amount, agency_fee_pct, status, source, bank_reference, notes";

/** The property's ledger rows between two months (inclusive), numbers normalised like the income route does. */
async function loadIncomeRows(supabase: AdminSupabase, propertyId: string, fromMonth: string, toMonth: string): Promise<PropertyIncomeRow[]> {
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
    return ((data ?? []) as unknown as PropertyIncomeRow[]).map(r => ({
        ...r,
        received_amount: Number(r.received_amount) || 0,
        energy_portion: Number(r.energy_portion) || 0,
        other_income: Number(r.other_income) || 0,
        other_expenses: Number(r.other_expenses) || 0,
        condo_amount: Number(r.condo_amount) || 0,
        fee_on_condo: r.fee_on_condo === true,
        unit_id: r.unit_id ?? null,
        unit_name: r.unit_name ?? null,
        iptu_amount: Number(r.iptu_amount) || 0,
        agency_fee_pct: Number(r.agency_fee_pct) || 0,
    }));
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

    const [tenantsRes, chargesRes, docsRes, contactRes, income, series] = await Promise.all([
        supabase.from("lease_tenants").select("*, tenant:tenants!tenant_id(full_name)").eq("lease_id", leaseId),
        supabase.from("lease_charges").select("*").eq("lease_id", leaseId),
        supabase.from("lease_documents").select("*").eq("lease_id", leaseId).order("uploaded_at", { ascending: false }),
        supabase.from("tenants").select("id, full_name, main_phone, email").eq("id", lease.primary_tenant_id).maybeSingle(),
        loadIncomeRows(supabase, lease.property_id, fromMonth, toMonth),
        seriesCode ? loadLeaseIndexSeries([seriesCode]).then(s => s[seriesCode] ?? null) : Promise.resolve(null),
    ]);

    const docs = (docsRes.data ?? []) as Array<Record<string, unknown> & { file_url: string }>;
    const signed = await signStorageUrls(supabase, LEASE_DOCUMENTS_BUCKET, docs.map(d => d.file_url));

    return {
        lease: {
            ...lease,
            additional_tenants: (tenantsRes.data || []).map((t: Record<string, unknown>) => ({
                ...t,
                tenant_name: (t.tenant as Record<string, unknown> | null)?.full_name || null,
                tenant: undefined,
            })) as unknown as LeaseWithDetails["additional_tenants"],
            charges: (chargesRes.data || []) as unknown as LeaseWithDetails["charges"],
            documents: docs.map(doc => ({ ...doc, file_url: signed.get(storagePathOf(doc.file_url)) ?? doc.file_url })) as unknown as LeaseWithDetails["documents"],
            document_count: docs.length,
        },
        tenant: (contactRes.data as LeaseTenantContact | null) ?? null,
        income,
        series,
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
