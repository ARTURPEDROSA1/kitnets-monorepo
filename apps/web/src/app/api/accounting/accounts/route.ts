import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";
import { validateNewAccount, type AccountNature } from "@/lib/accounting-chart";
import { ACCOUNT_COLUMNS, ensureChart, loadAccounts, loadSettings } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";

/** GET /api/accounting/accounts → { accounts, usage } — the chart (created from the template on first use) and how many lines each account has. */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        const { settings } = await loadSettings(supabase, profileId);
        const accounts = await ensureChart(supabase, profileId, settings.property_measurement);
        const { data: used, error } = await supabase.rpc("accounting_account_usage", { p_owner: profileId });
        if (error) throw new Error(error.message);
        const usage: Record<string, number> = {};
        for (const r of (used ?? []) as Array<{ account_id: string; lines: number | string }>) usage[r.account_id] = Number(r.lines) || 0;
        return NextResponse.json({ accounts, usage, measurement: settings.property_measurement });
    } catch (err) {
        console.error("[Accounting accounts GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar o plano de contas" }, { status: 500 });
    }
}

/** POST /api/accounting/accounts  body: { code, name, analytic, nature? } → { account } */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { code?: string; name?: string; analytic?: boolean; nature?: AccountNature };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    try {
        const existing = await loadAccounts(supabase, profileId);
        const v = validateNewAccount({ code: String(body.code ?? ""), name: String(body.name ?? ""), analytic: Boolean(body.analytic), nature: body.nature }, existing);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        const { data, error } = await supabase.from("accounting_accounts").insert({ owner_id: profileId, ...v.row }).select(ACCOUNT_COLUMNS).single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ account: data });
    } catch (err) {
        console.error("[Accounting accounts POST]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao criar a conta" }, { status: 500 });
    }
}

/**
 * PATCH /api/accounting/accounts  body: { id, name?, active?, referential_code? } → { account }
 * The code, type and nature of an account stay as created: the automation and the posted
 * lines rely on them.
 */
export async function PATCH(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { id?: string; name?: string; active?: boolean; referential_code?: string | null };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    if (!body.id || !UUID_REGEX.test(body.id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name || name.length > 120) return NextResponse.json({ error: "Nome inválido" }, { status: 400 });
        patch.name = name;
    }
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.referential_code !== undefined) {
        const ref = body.referential_code === null ? null : String(body.referential_code).trim();
        if (ref && !/^[0-9A-Za-z.]{1,40}$/.test(ref)) return NextResponse.json({ error: "Código referencial inválido" }, { status: 400 });
        patch.referential_code = ref || null;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada para alterar" }, { status: 400 });
    const { data, error } = await supabase.from("accounting_accounts").update(patch).eq("id", body.id).eq("owner_id", profileId).select(ACCOUNT_COLUMNS).maybeSingle();
    if (error) {
        console.error("[Accounting accounts PATCH]", error.message);
        return NextResponse.json({ error: "Erro ao alterar a conta" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    return NextResponse.json({ account: data });
}

/** DELETE /api/accounting/accounts?id=<uuid> → { ok } — only accounts the owner added, with no lines and no sub-accounts. */
export async function DELETE(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !UUID_REGEX.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    const accounts = await loadAccounts(supabase, profileId);
    const acc = accounts.find(a => a.id === id);
    if (!acc) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    if (acc.system_key) return NextResponse.json({ error: "Contas do modelo não são excluídas; desative-a se não for usar" }, { status: 409 });
    if (accounts.some(a => a.code.startsWith(`${acc.code}.`))) return NextResponse.json({ error: "Exclua primeiro as contas dentro deste grupo" }, { status: 409 });
    const { count } = await supabase.from("journal_lines").select("id", { count: "exact", head: true }).eq("owner_id", profileId).eq("account_id", id);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "A conta tem lançamentos: desative-a em vez de excluir" }, { status: 409 });
    const { error } = await supabase.from("accounting_accounts").delete().eq("id", id).eq("owner_id", profileId);
    if (error) {
        console.error("[Accounting accounts DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao excluir a conta" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
