import { NextResponse } from "next/server";
import { HttpError, withAuth } from "@/lib/api-route";
import { loadContractData } from "@/lib/contract/data-server";
import { acceptContract, contractView, readContent } from "@/lib/contract/document-server";
import { contractSupport, pickOptions, readContractOptions, requiredSignatures } from "@/lib/contract/template";
import { MAX_SIGNED_PDF_BYTES } from "@/lib/contract/document";

type Params = { id: string };

/**
 * POST /api/leases/[id]/contrato/aceitar
 * multipart/form-data: `file` (the PDF the editor drew), `content` and `options` (JSON). Stores the
 * PDF, freezes the text and counts the signatures it needs (one per party).
 */
export const POST = withAuth<undefined, Params>(
    { tag: "Contract accept", limit: { scope: "contract-accept", limit: 20, windowMs: 60_000 } },
    async ({ req, params, profileId, supabase }) => {
        const loaded = await loadContractData(supabase, profileId, params.id);
        const support = contractSupport(loaded.data);
        if (!support.ok) throw new HttpError(400, { error: support.reason });

        let form: FormData;
        try {
            form = await req.formData();
        } catch {
            throw new HttpError(400, { error: "Envie o PDF do contrato." });
        }
        const file = form.get("file");
        if (!(file instanceof File)) throw new HttpError(400, { error: "Envie o PDF do contrato." });
        if (file.size > MAX_SIGNED_PDF_BYTES) throw new HttpError(400, { error: "O PDF ficou grande demais (máximo 4 MB)." });
        const content = readContent(form.get("content"));
        let rawOptions: unknown = null;
        try {
            rawOptions = JSON.parse(String(form.get("options") ?? "null"));
        } catch {
            rawOptions = null;
        }
        const options = readContractOptions(rawOptions, loaded.data);

        const row = await acceptContract(supabase, params.id, {
            content,
            options: pickOptions({ ...(rawOptions && typeof rawOptions === "object" ? rawOptions : {}), ...options }),
            pdf: new Uint8Array(await file.arrayBuffer()),
            requiredSignatures: requiredSignatures(loaded.data, options),
        });
        return NextResponse.json({ document: await contractView(supabase, row, loaded.data.reference) });
    },
);
