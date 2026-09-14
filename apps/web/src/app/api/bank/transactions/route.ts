import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";
import { BANK_TABLE, loadBankRows, loadPropertyRefs } from "@/lib/bank-ledger-server";

export const dynamic = "force-dynamic";

/** GET /api/bank/transactions?limit=200 → { rows, properties } (holding bank ledger, newest first) */
export async function GET(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const limit = Math.min(1000, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 200));
    try {
        const [rows, properties] = await Promise.all([loadBankRows(supabase, profileId, limit), loadPropertyRefs(supabase, profileId)]);
        return NextResponse.json({ rows, properties: properties.map(p => ({ id: p.id, name: p.name })) });
    } catch (err) {
        console.error("[Bank GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar lançamentos bancários" }, { status: 500 });
    }
}

/**
 * DELETE /api/bank/transactions?id=<uuid> → { ok }
 * Removes the bank row and the ledger row it created (investment transaction);
 * an income month is left untouched because it may carry hand-entered fields.
 */
export async function DELETE(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !UUID_REGEX.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    const { data: row } = await supabase.from(BANK_TABLE).select("id, destination, linked_id, property_id").eq("id", id).eq("owner_id", profileId).maybeSingle();
    if (!row) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    if (row.destination === "INVESTMENT" && row.linked_id) {
        await supabase.from("property_transactions").delete().eq("id", row.linked_id).eq("owner_id", profileId);
    }
    const { error } = await supabase.from(BANK_TABLE).delete().eq("id", id).eq("owner_id", profileId);
    if (error) {
        console.error("[Bank DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
