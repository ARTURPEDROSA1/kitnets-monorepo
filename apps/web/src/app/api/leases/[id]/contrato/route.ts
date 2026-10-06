import { NextResponse } from "next/server";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { loadOwnedLease } from "@/lib/leases-server";
import { emailAvailable } from "@/lib/billing/email-provider";
import { loadContractData } from "@/lib/contract/data-server";
import { contractView, loadContractRow, readContent, saveDraft } from "@/lib/contract/document-server";
import { contractSupport, pickOptions } from "@/lib/contract/template";
import type { ContractScreenData } from "@/lib/contract/document";

type Params = { id: string };

/**
 * GET /api/leases/[id]/contrato
 * What the contract editor needs: the data the template writes from, the stored document (if any) and
 * whether the residential template fits this lease.
 */
export const GET = withAuth<undefined, Params>({ tag: "Contract document GET" }, async ({ params, profileId, supabase }) => {
    const loaded = await loadContractData(supabase, profileId, params.id);
    const row = await loadContractRow(supabase, params.id);
    const body: ContractScreenData = {
        data: loaded.data,
        document: await contractView(supabase, row, loaded.data.reference),
        support: contractSupport(loaded.data),
        tenant: { name: loaded.tenantName, email: loaded.tenantEmail, phone: loaded.tenantPhone },
        emailAvailable: emailAvailable(),
    };
    return NextResponse.json(body);
});

/**
 * PUT /api/leases/[id]/contrato  { content, options }
 * Saves the draft (the editor autosaves). An accepted contract is frozen: 409.
 */
export const PUT = withAuth<undefined, Params>(
    { tag: "Contract document PUT", limit: { scope: "contract-draft", limit: 120, windowMs: 60_000 } },
    async ({ req, params, profileId, supabase }) => {
        await loadOwnedLease(supabase, params.id, profileId);
        const body = await readJsonBody(req);
        const row = await saveDraft(supabase, params.id, readContent(body.content), pickOptions(body.options));
        return NextResponse.json({ updatedAt: row.updated_at, status: row.status });
    },
);
