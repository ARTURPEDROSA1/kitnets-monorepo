import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { xlsxToTsv } from "@/lib/income-template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/properties/[id]/income/parse   (multipart/form-data, field "file")
 * → { text }  TSV text for the client-side column mapper.
 *
 * .xlsx is parsed with exceljs; .csv/.tsv/.txt are returned as-is (UTF-8).
 * Nothing is stored — the client still previews, maps and confirms.
 */
export async function POST(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { id } = await context.params;
    const property = await getOwnedProperty(supabase, profileId, id);
    if (!property) {
        return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }

    let file: File | null = null;
    try {
        const form = await request.formData();
        const entry = form.get("file");
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
            const text = await xlsxToTsv(bytes);
            if (!text) {
                return NextResponse.json({ error: "Não encontrei a linha de cabeçalho (coluna 'Mês' ou 'Data') na planilha" }, { status: 422 });
            }
            return NextResponse.json({ text, format: "xlsx" });
        }
        if (name.endsWith(".xls")) {
            return NextResponse.json({ error: "Formato .xls antigo não é suportado. Salve como .xlsx ou CSV." }, { status: 415 });
        }
        return NextResponse.json({ text: new TextDecoder("utf-8").decode(bytes), format: "text" });
    } catch (err) {
        console.error("[Income parse]", (err as Error).message);
        return NextResponse.json({ error: "Não foi possível ler o arquivo" }, { status: 422 });
    }
}
