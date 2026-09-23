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

        let receiptPath: string | null = null;
        let receiptSize: number | null = null;
        if (body.receipt_path) {
            const staged = ownStagedPath(profileId, body.receipt_path);
            if (!staged) throw badRequest({ receipt_path: "Comprovante não encontrado. Envie o arquivo novamente." });
            const adopted = await adoptStagedUpload(supabase, params.id, staged);
            if (!adopted) throw badRequest({ receipt_path: "Comprovante não encontrado. Envie o arquivo novamente." });
            receiptPath = adopted.path;
            receiptSize = adopted.size;
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
                receipt_path: receiptPath,
                receipt_name: body.receipt_name,
                notes: body.notes,
                source: "MANUAL",
            })
            .select()
            .single();
        if (error || !data) {
            console.error("[Investment Payment POST] insert failed:", error?.message);
            throw new Error(`payment insert failed: ${error?.message}`);
        }

        if (receiptPath) {
            await supabase.from("new_investment_documents").insert({
                investment_id: params.id,
                owner_id: profileId,
                kind: "RECEIPT",
                storage_path: receiptPath,
                file_name: body.receipt_name,
                mime_type: mimeTypeOfPath(receiptPath),
                size_bytes: receiptSize,
            });
        }

        return NextResponse.json({ payment: data }, { status: 201 });
    }
);
