import { NextResponse } from "next/server";
import { badRequest, notFound, withAuth } from "@/lib/api-route";
import { UUID_REGEX } from "@/lib/api-auth";
import { paymentPatchSchema } from "@/lib/schemas/new-investment";
import {
    INVESTMENT_DOCUMENTS_BUCKET,
    adoptStagedUpload,
    loadOwnedInvestment,
    mimeTypeOfPath,
    ownStagedPath,
} from "@/lib/new-investments-server";

type Params = { id: string; paymentId: string };

/**
 * PATCH  /api/investments/[id]/payments/[paymentId]  — one cell of the table, or the receipt.
 * DELETE /api/investments/[id]/payments/[paymentId]  — the line and the receipt file it owns.
 */
export const PATCH = withAuth<typeof paymentPatchSchema, Params>(
    { body: paymentPatchSchema, tag: "Investment Payment PATCH" },
    async ({ body, params, profileId, supabase }) => {
        await loadOwnedInvestment(supabase, params.id, profileId);
        if (!UUID_REGEX.test(params.paymentId)) throw notFound("Pagamento não encontrado.");

        const row: Record<string, unknown> = {};
        for (const key of ["due_on", "paid_on", "kind", "amount", "correction_amount", "installment_number", "status", "receipt_name", "payer", "pj_amount", "notes"] as const) {
            if (body[key] !== undefined) row[key] = body[key];
        }
        // A line turned PAID without a date would fall outside every month bucket.
        if (row.status === "PAID" && body.paid_on === undefined) {
            const { data: current } = await supabase
                .from("new_investment_payments")
                .select("paid_on, due_on")
                .eq("id", params.paymentId)
                .eq("owner_id", profileId)
                .maybeSingle();
            if (current && !current.paid_on) row.paid_on = (row.due_on as string) ?? current.due_on;
        }
        if (row.status === "PLANNED" && body.paid_on === undefined) row.paid_on = null;

        if (body.receipt_path !== undefined) {
            if (body.receipt_path === null) {
                row.receipt_path = null;
            } else {
                const staged = ownStagedPath(profileId, body.receipt_path);
                if (!staged) throw badRequest({ receipt_path: "Comprovante não encontrado. Envie o arquivo novamente." });
                const adopted = await adoptStagedUpload(supabase, params.id, staged);
                if (!adopted) throw badRequest({ receipt_path: "Comprovante não encontrado. Envie o arquivo novamente." });
                row.receipt_path = adopted.path;
                await supabase.from("new_investment_documents").insert({
                    investment_id: params.id,
                    owner_id: profileId,
                    payment_id: params.paymentId,
                    kind: "RECEIPT",
                    storage_path: adopted.path,
                    file_name: body.receipt_name ?? null,
                    mime_type: mimeTypeOfPath(adopted.path),
                    size_bytes: adopted.size,
                });
            }
        }

        // The PJ share only means something for a split; any other payer clears it.
        if (row.payer !== undefined && row.payer !== "SPLIT") row.pj_amount = null;

        if (Object.keys(row).length === 0) throw badRequest({ _form: "Nada para atualizar." });

        const { data, error } = await supabase
            .from("new_investment_payments")
            .update(row)
            .eq("id", params.paymentId)
            .eq("investment_id", params.id)
            .eq("owner_id", profileId)
            .select()
            .maybeSingle();
        if (error) {
            console.error("[Investment Payment PATCH] update failed:", error.message);
            throw new Error(`payment update failed: ${error.message}`);
        }
        if (!data) throw notFound("Pagamento não encontrado.");
        return NextResponse.json({ payment: data });
    }
);

export const DELETE = withAuth<undefined, Params>({ tag: "Investment Payment DELETE" }, async ({ params, profileId, supabase }) => {
    await loadOwnedInvestment(supabase, params.id, profileId);
    if (!UUID_REGEX.test(params.paymentId)) throw notFound("Pagamento não encontrado.");

    // The receipts' rows go with the payment (ON DELETE CASCADE); their files do not, so list them first.
    const { data: receipts } = await supabase
        .from("new_investment_documents")
        .select("storage_path")
        .eq("payment_id", params.paymentId)
        .eq("owner_id", profileId);

    const { data, error } = await supabase
        .from("new_investment_payments")
        .delete()
        .eq("id", params.paymentId)
        .eq("investment_id", params.id)
        .eq("owner_id", profileId)
        .select("receipt_path")
        .maybeSingle();
    if (error) {
        console.error("[Investment Payment DELETE] delete failed:", error.message);
        throw new Error(`payment delete failed: ${error.message}`);
    }
    if (!data) throw notFound("Pagamento não encontrado.");

    // A receipt from before receipts were linked has only the mirror on the payment: remove its row too.
    const paths = new Set<string>((receipts ?? []).map(r => r.storage_path as string));
    if (data.receipt_path) {
        paths.add(data.receipt_path as string);
        await supabase.from("new_investment_documents").delete().eq("storage_path", data.receipt_path).eq("owner_id", profileId);
    }
    if (paths.size > 0) await supabase.storage.from(INVESTMENT_DOCUMENTS_BUCKET).remove([...paths]);
    return NextResponse.json({ success: true });
});
