import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { xlsxToTsv } from "@/lib/income-template";
import { classifyStatement, parseStatement, type ClassifiedRow } from "@/lib/bank-statement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const MAX_BYTES = 5 * 1024 * 1024;

export interface StatementPreviewRow extends ClassifiedRow {
    /** a ledger row with this bank reference already exists */
    duplicate: boolean;
}

/**
 * POST multipart "file" (.ofx / .qfx / .csv / .tsv / .txt / .xlsx) → { rows: StatementPreviewRow[] }
 * Parses a bank statement, suggests a ledger kind per outflow and flags rows
 * already imported (by bank reference). Nothing is stored; the client sends
 * the reviewed rows to PUT /transactions with source BANK.
 */
export async function POST(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!(await getOwnedProperty(supabase, profileId, id))) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    let file: File | null = null;
    try {
        const entry = (await request.formData()).get("file");
        file = entry instanceof File ? entry : null;
    } catch {
        return NextResponse.json({ error: "Envie o arquivo no campo 'file'" }, { status: 400 });
    }
    if (!file) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo maior que 5 MB" }, { status: 413 });

    try {
        const name = file.name.toLowerCase();
        const bytes = await file.arrayBuffer();
        let text: string;
        if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
            // first sheet: xlsxToTsv looks for a "Data" header on any sheet name we pass; try the common ones
            text = (await xlsxToTsv(bytes, "Extrato")) || (await xlsxToTsv(bytes, "Sheet1")) || (await xlsxToTsv(bytes, "Planilha1")) || "";
            if (!text) return NextResponse.json({ error: "Não encontrei a linha de cabeçalho (coluna 'Data') na planilha. Exporte o extrato como OFX ou CSV." }, { status: 422 });
        } else {
            text = new TextDecoder("utf-8").decode(bytes);
            if (text.includes("�")) text = new TextDecoder("latin1").decode(bytes);
        }
        const parsed = parseStatement(text, name);
        if (parsed.length === 0) return NextResponse.json({ error: "Nenhum lançamento reconhecido. Use um extrato OFX ou um CSV com colunas Data, Histórico e Valor." }, { status: 422 });
        const refs = parsed.map(r => r.reference);
        const { data: existing } = await supabase.from("property_transactions").select("bank_reference").eq("property_id", id).in("bank_reference", refs);
        const seen = new Set((existing ?? []).map(r => r.bank_reference));
        const rows: StatementPreviewRow[] = classifyStatement(parsed).map(r => ({ ...r, duplicate: seen.has(r.reference) }));
        return NextResponse.json({ rows });
    } catch (err) {
        console.error("[Statement import]", (err as Error).message);
        return NextResponse.json({ error: "Não foi possível ler o extrato" }, { status: 422 });
    }
}
