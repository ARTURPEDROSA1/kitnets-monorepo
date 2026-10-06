import { NextResponse } from "next/server";
import type { AdminSupabase } from "@/lib/api-auth";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { deletePropertyCascade } from "@/lib/energy-bills-server";
import { linkPropertyRows, type PropertyLink } from "@/lib/property-link";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; address: string | null; electronic_id: string | null };

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

/**
 * The row of the Imóveis property being removed: the one linked to that entry by id (lib/property-link.ts),
 * never one found by name — a namesake's row is another property's (2026-10-06). The caller names the entry
 * by slot (0 = the first property, n = additional_properties[n - 1]) and name, plus the row id it holds;
 * anything that does not match is a stale page.
 */
async function resolveEntryRow(
    supabase: AdminSupabase,
    profileId: string,
    slot: number,
    name: string,
    propertyId: string | null,
): Promise<{ link: PropertyLink | null; row: Row | null; stale: boolean }> {
    const [{ data: profile }, { data: rows }] = await Promise.all([
        supabase.from("profiles").select("property_type, property_details, property_address, additional_properties").eq("id", profileId).maybeSingle(),
        supabase.from("properties").select("id, name, address, electronic_id").eq("owner_id", profileId).order("created_at", { ascending: true }),
    ]);
    const all = (rows ?? []) as Row[];
    const links = linkPropertyRows(all.filter(r => !isStandaloneUc(r.electronic_id)).map(r => ({ id: r.id, name: r.name ?? "", address: r.address })), (profile ?? {}) as Record<string, unknown>);
    const link = links.find(l => l.ref.slot === slot) ?? null;
    if (!link) return { link: null, row: null, stale: !!propertyId };
    const key = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
    if (key(link.ref.name) !== key(name)) return { link, row: null, stale: true };
    if (propertyId && link.rowId !== propertyId) return { link, row: null, stale: true };
    return { link, row: all.find(r => r.id === link.rowId) ?? null, stale: false };
}

const STALE = { error: "O imóvel mudou desde que a página foi aberta. Recarregue a página e tente de novo — nada foi apagado." };

function readSlot(v: unknown): number | null {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

/**
 * GET /api/energy-bills/properties/sync-deletion?slot=&name=&propertyId=
 * What removing the property would take with it, and what stops it (contracts, invoices) — the delete
 * dialog shows this before the owner confirms.
 */
export const GET = withAuth({ tag: "sync-deletion preview" }, async ({ req, profileId, supabase }) => {
    const url = new URL(req.url);
    const slot = readSlot(url.searchParams.get("slot"));
    if (slot === null) return NextResponse.json({ error: "slot inválido" }, { status: 400 });
    const { row, stale } = await resolveEntryRow(supabase, profileId, slot, url.searchParams.get("name") ?? "", url.searchParams.get("propertyId"));
    if (stale) return NextResponse.json(STALE, { status: 409 });
    if (!row) return NextResponse.json({ hasRow: false });

    const id = row.id;
    const head = { count: "exact" as const, head: true };
    const [leases, deletedLeases, invoices, tenants, energyBills, waterBills, incomeMonths, transactions, taxes] = await Promise.all([
        count(supabase.from("leases").select("id", head).eq("property_id", id).is("deleted_at", null)),
        count(supabase.from("leases").select("id", head).eq("property_id", id).not("deleted_at", "is", null)),
        count(supabase.from("invoices").select("id", head).eq("property_id", id)),
        count(supabase.from("tenants").select("id", head).eq("property_id", id)),
        count(supabase.from("energy_bills").select("id", head).eq("property_id", id)),
        count(supabase.from("water_bills").select("id", head).eq("property_id", id)),
        count(supabase.from("property_income_months").select("id", head).eq("property_id", id)),
        count(supabase.from("property_transactions").select("id", head).eq("property_id", id)),
        count(supabase.from("property_taxes").select("id", head).eq("property_id", id)),
    ]);
    return NextResponse.json({ hasRow: true, propertyId: id, leases, deletedLeases, invoices, tenants, energyBills, waterBills, incomeMonths, transactions, taxes });
});

/**
 * POST /api/energy-bills/properties/sync-deletion  { slot, name, propertyId, action }
 * Called before a rental property is removed from the profile. `delete_all` (default) deletes the
 * property's row with its cascade, in one transaction (refused while contracts or invoices point to it);
 * `keep_energy` keeps the row as a standalone consumer unit so energy monitoring continues. The page
 * removes the property from the profile only after this succeeds.
 */
export const POST = withAuth({ tag: "sync-deletion" }, async ({ req, profileId, supabase }) => {
    const body = await readJsonBody(req);
    const slot = readSlot(body.slot);
    if (slot === null) return NextResponse.json({ error: "slot inválido" }, { status: 400 });
    const propertyId = typeof body.propertyId === "string" && body.propertyId ? body.propertyId : null;
    const name = typeof body.name === "string" ? body.name : "";
    const action = body.action === "keep_energy" ? "keep_energy" : "delete_all";

    const { row, stale } = await resolveEntryRow(supabase, profileId, slot, name, propertyId);
    if (stale) return NextResponse.json(STALE, { status: 409 });
    if (!row) {
        return NextResponse.json({ success: true, action: "none_needed", message: "O imóvel não tinha registro vinculado." });
    }

    if (action === "keep_energy") {
        const { count: leases } = await supabase.from("leases").select("id", { count: "exact", head: true }).eq("property_id", row.id).is("deleted_at", null);
        if ((leases ?? 0) > 0) {
            return NextResponse.json({ error: `Este imóvel tem ${leases === 1 ? "1 contrato" : `${leases} contratos`} em Contratos. Exclua ${leases === 1 ? "o contrato" : "os contratos"} antes de remover o imóvel — nada foi alterado.` }, { status: 409 });
        }
        let current: Record<string, unknown> = {};
        try {
            current = row.electronic_id ? JSON.parse(row.electronic_id) : {};
        } catch {
            current = {};
        }
        const { error } = await supabase
            .from("properties")
            .update({
                electronic_id: JSON.stringify({
                    ...current,
                    isStandaloneUc: true,
                    category: current.category || "outro",
                    convertedFromRental: true,
                    convertedAt: new Date().toISOString(),
                    notes: current.notes || "Convertido de imóvel de aluguel removido",
                }),
            })
            .eq("id", row.id)
            .eq("owner_id", profileId);
        if (error) {
            console.error("[sync-deletion] keep_energy update failed:", error.message);
            return NextResponse.json({ error: "Não foi possível manter a energia do imóvel — nada foi alterado." }, { status: 500 });
        }
        return NextResponse.json({ success: true, action: "converted_to_standalone", propertyId: row.id });
    }

    const { error } = await deletePropertyCascade(supabase, row.id, profileId, "sync-deletion");
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ success: true, action: "deleted", propertyId: row.id });
});
