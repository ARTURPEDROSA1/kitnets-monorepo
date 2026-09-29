import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";
import { isAutoSource, postingErrorMessage } from "@/lib/accounting-journal";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Entries a person may delete; the automated ones are removed by the module that created them. */
const DELETABLE = new Set(["MANUAL", "OPENING", "REVERSAL"]);

/**
 * DELETE /api/accounting/entries/<id> → { ok }
 * Only in an open month (the database refuses otherwise) and only when the entry has not
 * been reversed — delete the reversal first.
 */
export async function DELETE(_request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    const { data: entry } = await supabase.from("journal_entries").select("id, source").eq("id", id).eq("owner_id", profileId).maybeSingle();
    if (!entry) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    if (isAutoSource(entry.source)) return NextResponse.json({ error: "Lançamentos automáticos do fechamento seguem os registros de origem: corrija o registro e atualize o mês em Fechamento do mês" }, { status: 409 });
    if (!DELETABLE.has(entry.source)) return NextResponse.json({ error: "Lançamentos automáticos não são excluídos aqui: estorne-o" }, { status: 409 });
    const { count } = await supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("owner_id", profileId).eq("reverses_entry_id", id);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "Este lançamento foi estornado: exclua primeiro o estorno" }, { status: 409 });

    const { error } = await supabase.from("journal_entries").delete().eq("id", id).eq("owner_id", profileId);
    if (error) return NextResponse.json({ error: postingErrorMessage(error.message) }, { status: 400 });
    return NextResponse.json({ ok: true });
}
