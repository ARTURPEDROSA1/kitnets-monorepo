/**
 * Server-side helpers for the holding bank ledger: loading rows, the owner's
 * properties, and PDF statement extraction with Gemini.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_MODELS } from "@/lib/ai-models";
import type { AdminSupabase } from "./api-auth";
import type { BankTransaction, PropertyRef } from "./bank-ledger";

export const BANK_TABLE = "bank_transactions";
export const BANK_COLUMNS = "id, occurred_on, amount, memo, reference, source, bank, destination, property_id, kind, linked_id, created_at";

export async function loadBankRows(supabase: AdminSupabase, ownerId: string, limit = 500): Promise<BankTransaction[]> {
    const { data, error } = await supabase
        .from(BANK_TABLE).select(BANK_COLUMNS).eq("owner_id", ownerId)
        .order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as BankTransaction[]).map(r => ({ ...r, amount: Number(r.amount) || 0 }));
}

/** Owner's properties with the words that identify them in a memo (name, street, tenant names from active leases). */
export async function loadPropertyRefs(supabase: AdminSupabase, ownerId: string): Promise<PropertyRef[]> {
    const { data, error } = await supabase.from("properties").select("id, name, address").eq("owner_id", ownerId).order("name");
    if (error) throw new Error(error.message);
    const refs: PropertyRef[] = (data ?? []).map(p => ({ id: p.id, name: p.name, aliases: p.address ? [String(p.address).split(",")[0]] : [] }));
    try {
        const { data: leases } = await supabase.from("leases").select("property_id, tenant_name").eq("owner_id", ownerId);
        for (const l of (leases ?? []) as Array<{ property_id: string | null; tenant_name: string | null }>) {
            const ref = refs.find(r => r.id === l.property_id);
            if (ref && l.tenant_name) ref.aliases!.push(l.tenant_name);
        }
    } catch { /* leases table shape may differ; names are enough */ }
    return refs;
}

const PDF_PROMPT = `Você lê extratos bancários brasileiros em PDF (Banco Inter, Bradesco, Itaú, Caixa, Santander, Nubank, Sicoob…).
Extraia TODOS os lançamentos do extrato e retorne EXCLUSIVAMENTE um JSON válido no formato:
{"rows":[{"date":"YYYY-MM-DD","amount":-1234.56,"memo":"histórico completo do lançamento"}]}

Regras:
1. "amount" é o valor com sinal: saídas/débitos negativos, entradas/créditos positivos. Converta "3.850,04" em 3850.04.
2. "date" é a data do lançamento em YYYY-MM-DD.
3. "memo" é o texto do histórico como impresso (nome do favorecido/pagador, tipo do lançamento, documento), sem o valor.
4. Ignore linhas de saldo (saldo anterior, saldo do dia, saldo final) e totais.
5. Não invente lançamentos; se não houver, retorne {"rows":[]}.`;

/** PDF statement → raw rows via Gemini (JSON mode). */
export async function extractStatementPdf(base64: string, mimeType: string): Promise<unknown> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: AI_MODELS.gemini,
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });
    const result = await model.generateContent([PDF_PROMPT, { inlineData: { data: base64, mimeType } }]);
    let text = (await result.response).text().trim();
    if (text.startsWith("```")) text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(text);
}
