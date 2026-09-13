import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { xlsxToTsv } from "@/lib/income-template";
import { INVESTMENT_TEMPLATE_SHEET } from "@/lib/property-investment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const MAX_BYTES = 5 * 1024 * 1024;

/** POST multipart "file" (.xlsx / .csv / .tsv / .txt) → { text } TSV for the client-side parser. Nothing is stored. */
export async function POST(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!(await getOwnedProperty(supabase, profileId, id))) {
        return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }

    let file: File | null = null;
    try {
        const entry = (await request.formData()).get("file");
        file = entry instanceof File ? entry : null;
    } catch {
        return NextResponse.json({ error: "Envie o arquivo no campo 'file'" }, { status: 400 });
    }
    if (!file) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo maior que 5 MB" }, { status: 413 });

    const name = file.name.toLowerCase();
    try {
        const bytes = await file.arrayBuffer();
        if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
            const text = await xlsxToTsv(bytes, INVESTMENT_TEMPLATE_SHEET);
            if (!text) return NextResponse.json({ error: "Não encontrei a linha de cabeçalho (coluna 'Data') na planilha" }, { status: 422 });
            return NextResponse.json({ text, format: "xlsx" });
        }
        if (name.endsWith(".xls")) return NextResponse.json({ error: "Formato .xls antigo não é suportado. Salve como .xlsx ou CSV." }, { status: 415 });
        return NextResponse.json({ text: new TextDecoder("utf-8").decode(bytes), format: "text" });
    } catch (err) {
        console.error("[Transactions parse]", (err as Error).message);
        return NextResponse.json({ error: "Não foi possível ler o arquivo" }, { status: 422 });
    }
}
