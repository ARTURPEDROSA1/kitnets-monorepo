import { NextResponse } from "next/server";
import { notFound, withAuth } from "@/lib/api-route";
import { UUID_REGEX } from "@/lib/api-auth";
import { INVESTMENT_DOCUMENTS_BUCKET, loadOwnedInvestment } from "@/lib/new-investments-server";

type Params = { id: string; docId: string };

/** DELETE /api/investments/[id]/documents/[docId] — the row, its file, and the cover if it was one. */
export const DELETE = withAuth<undefined, Params>({ tag: "Investment Doc DELETE" }, async ({ params, profileId, supabase }) => {
    await loadOwnedInvestment(supabase, params.id, profileId);
    if (!UUID_REGEX.test(params.docId)) throw notFound("Documento não encontrado.");

    const { data, error } = await supabase
        .from("new_investment_documents")
        .delete()
        .eq("id", params.docId)
        .eq("investment_id", params.id)
        .eq("owner_id", profileId)
        .select("storage_path")
        .maybeSingle();
    if (error) {
        console.error("[Investment Doc DELETE] delete failed:", error.message);
        throw new Error(`document delete failed: ${error.message}`);
    }
    if (!data) throw notFound("Documento não encontrado.");

    const path = data.storage_path as string;
    await supabase.storage.from(INVESTMENT_DOCUMENTS_BUCKET).remove([path]);
    await supabase.from("new_investment_payments").update({ receipt_path: null }).eq("receipt_path", path).eq("owner_id", profileId);
    await supabase.from("new_investments").update({ cover_path: null }).eq("id", params.id).eq("cover_path", path);

    return NextResponse.json({ success: true });
});
