import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { pendingDecisions, validateSettings } from "@/lib/accounting-policies";
import { loadAccounts, loadIdentity, loadSettings, saveSettings, simulationDefaults, syncModelAccounts } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/accounting/settings
 * → { settings, saved, identity, pending, defaults }
 * The holding's accounting policies (defaults until saved), its identity from the profile,
 * the decisions still open and the figures that pre-fill the A × B simulation.
 */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        const [{ settings, saved }, identity, defaults, firstBank] = await Promise.all([
            loadSettings(supabase, profileId),
            loadIdentity(supabase, profileId),
            simulationDefaults(supabase, profileId),
            supabase.from("bank_transactions").select("occurred_on").eq("owner_id", profileId).order("occurred_on").limit(1).maybeSingle(),
        ]);
        // the first imported statement date only informs the owner's choice of the start; it never sets it
        const firstBankDate = (firstBank.data as { occurred_on?: string } | null)?.occurred_on ?? null;
        return NextResponse.json({ settings, saved, identity, pending: pendingDecisions(settings), defaults, firstBankDate });
    } catch (err) {
        console.error("[Accounting settings GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar as políticas contábeis" }, { status: 500 });
    }
}

/**
 * PUT /api/accounting/settings  body: partial settings
 * → { settings, pending }
 * Changing the measurement model switches the depreciation / fair-value accounts of the chart.
 */
export async function PUT(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });

    try {
        const { settings: current } = await loadSettings(supabase, profileId);
        const v = validateSettings(body, current);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        if (current.opening_date && !v.value.opening_date) {
            const { count } = await supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("owner_id", profileId);
            if ((count ?? 0) > 0) return NextResponse.json({ error: "Já há lançamentos na escrituração: o início pode ser mudado, mas não apagado" }, { status: 409 });
        }
        await saveSettings(supabase, profileId, v.value);
        if (v.value.property_measurement !== current.property_measurement) {
            const accounts = await loadAccounts(supabase, profileId);
            if (accounts.length) await syncModelAccounts(supabase, profileId, v.value.property_measurement, accounts);
        }
        return NextResponse.json({ settings: v.value, pending: pendingDecisions(v.value) });
    } catch (err) {
        console.error("[Accounting settings PUT]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao salvar as políticas contábeis" }, { status: 500 });
    }
}
