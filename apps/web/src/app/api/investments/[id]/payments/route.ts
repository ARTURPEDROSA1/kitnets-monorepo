import { NextResponse } from "next/server";
import { badRequest, withAuth } from "@/lib/api-route";
import { paymentInputSchema } from "@/lib/schemas/new-investment";
import { adoptStagedUpload, loadOwnedInvestment, mimeTypeOfPath, ownStagedPath } from "@/lib/new-investments-server";

type Params = { id: string };

/**
 * POST /api/investments/[id]/payments
 *
 * A line of the payment table. `receipt_path` may be a staged upload (POST
 * /api/investments/upload-url): it is moved into the investment's folder and also recorded as a
 * RECEIPT document, so the receipt shows up both on its line and in the documents list.
 */
export const POST = withAuth<typeof paymentInputSchema, Params>(
    { body: paymentInputSchema, tag: "Investment Payment POST" },
    async ({ body, params, profileId, supabase }) => {
        await loadOwnedInvestment(supabase, params.id, profileId);
        if (body.amount <= 0 && body.correction_amount <= 0) {
            throw badRequest({ amount: "Informe o valor pago." });
        }

        // Every staged receipt becomes a document of this payment; a split has one per pocket.
        const stagedPaths = [body.receipt_path, ...(body.receipt_paths ?? [])].filter((p): p is string => Boolean(p));
        const adopted: { path: string; size: number | null }[] = [];
        for (const raw of stagedPaths) {
            const staged = ownStagedPath(profileId, raw);
            const moved = staged ? await adoptStagedUpload(supabase, params.id, staged) : null;
            if (!moved) throw badRequest({ receipt_path: "Comprovante não encontrado. Envie o arquivo novamente." });
            adopted.push(moved);
        }

        const { data, error } = await supabase
            .from("new_investment_payments")
            .insert({
                investment_id: params.id,
                owner_id: profileId,
                due_on: body.due_on,
                paid_on: body.paid_on,
                kind: body.kind,
                amount: body.amount,
                correction_amount: body.correction_amount,
                installment_number: body.installment_number,
                status: body.status,
                receipt_path: adopted[0]?.path ?? null,
                receipt_name: body.receipt_name,
                payer: body.payer ?? null,
                pj_amount: body.payer === "SPLIT" ? (body.pj_amount ?? 0) : null,
                notes: body.notes,
                source: "MANUAL",
            })
            .select()
            .single();
        if (error || !data) {
            console.error("[Investment Payment POST] insert failed:", error?.message);
            throw new Error(`payment insert failed: ${error?.message}`);
        }

        if (adopted.length > 0) {
            await supabase.from("new_investment_documents").insert(
                adopted.map((file, index) => ({
                    investment_id: params.id,
                    owner_id: profileId,
                    payment_id: data.id,
                    kind: "RECEIPT",
                    storage_path: file.path,
                    file_name: index === 0 ? body.receipt_name : null,
                    mime_type: mimeTypeOfPath(file.path),
                    size_bytes: file.size,
                }))
            );
        }

        return NextResponse.json({ payment: data }, { status: 201 });
    }
);
