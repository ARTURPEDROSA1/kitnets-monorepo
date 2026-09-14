/**
 * Holding bank ledger — pure helpers for the Contas bancárias import:
 * routing suggestions (which property, which ledger, which kind), learning
 * from rows the owner already routed, and the shape of PDF extractions.
 */
import { classifyMemo, type StatementRow } from "./bank-statement";
import type { TransactionKind } from "./property-investment";

export type BankSource = "OFX" | "CSV" | "PDF" | "API";
export type BankDestination = "INVESTMENT" | "INCOME" | "IGNORED";

export interface BankTransaction {
    id: string;
    occurred_on: string;
    amount: number;
    memo: string;
    reference: string;
    source: BankSource;
    bank: string | null;
    destination: BankDestination;
    property_id: string | null;
    kind: TransactionKind | null;
    linked_id: string | null;
    created_at?: string;
}

export interface PropertyRef {
    id: string;
    name: string;
    /** extra words that identify the property in a memo (tenant name, street…) */
    aliases?: string[];
}

export interface RoutedRow extends StatementRow {
    source: BankSource;
    destination: BankDestination;
    property_id: string | null;
    kind: TransactionKind | null;
    /** already in the bank ledger */
    duplicate: boolean;
    /** why the suggestion was made */
    reason: "history" | "memo" | "kind" | "single-property" | null;
}

export const DESTINATION_LABELS: Record<BankDestination, string> = {
    INVESTMENT: "Investimento do imóvel",
    INCOME: "Receita de aluguel",
    IGNORED: "Ignorar (só contábil)",
};

/** Lowercase, no accents, no digits, collapsed spaces — the "shape" of a memo. */
export function normalizeMemo(memo: string): string {
    return memo
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\d+/g, " ")
        .replace(/[^a-z ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Property whose name (or an alias) appears in the memo; null when none or ambiguous. */
export function matchProperty(memo: string, properties: PropertyRef[]): string | null {
    const m = normalizeMemo(memo);
    if (!m) return null;
    const hits = properties.filter(p => {
        const words = [p.name, ...(p.aliases ?? [])].map(normalizeMemo).filter(w => w.length >= 3);
        return words.some(w => m.includes(w));
    });
    return hits.length === 1 ? hits[0].id : null;
}

/** Rows the owner routed before, indexed by memo shape (latest wins). */
export function historyIndex(history: Pick<BankTransaction, "memo" | "destination" | "property_id" | "kind" | "created_at">[]): Map<string, { destination: BankDestination; property_id: string | null; kind: TransactionKind | null }> {
    const idx = new Map<string, { destination: BankDestination; property_id: string | null; kind: TransactionKind | null }>();
    const sorted = [...history].sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1));
    for (const h of sorted) {
        const key = normalizeMemo(h.memo);
        if (key) idx.set(key, { destination: h.destination, property_id: h.property_id, kind: h.kind });
    }
    return idx;
}

const INFLOW_RENT = /pix|ted|doc|transf|aluguel|locac|deposito|dep\b/;

/**
 * Suggests destination / property / kind for every parsed row:
 *   1. a row with the same memo shape routed before → same routing
 *   2. outflow with a recognisable kind → INVESTMENT (property by memo, or the only property)
 *   3. inflow that looks like a transfer → INCOME when a property matches (or the only property)
 *   4. otherwise IGNORED for the owner to decide
 */
export function suggestRouting(
    rows: StatementRow[],
    source: BankSource,
    properties: PropertyRef[],
    history: Pick<BankTransaction, "memo" | "destination" | "property_id" | "kind" | "created_at">[],
    existingReferences: Set<string>
): RoutedRow[] {
    const idx = historyIndex(history);
    const only = properties.length === 1 ? properties[0].id : null;
    return rows.map(r => {
        const duplicate = existingReferences.has(r.reference);
        const learned = idx.get(normalizeMemo(r.memo));
        if (learned) return { ...r, source, destination: learned.destination, property_id: learned.property_id, kind: learned.kind, duplicate, reason: "history" };
        const byMemo = matchProperty(r.memo, properties);
        const property = byMemo ?? only;
        const reason: RoutedRow["reason"] = byMemo ? "memo" : only ? "single-property" : null;
        if (r.amount < 0) {
            const kind = classifyMemo(r.memo);
            if (kind) return { ...r, source, destination: "INVESTMENT", property_id: property, kind, duplicate, reason: reason ?? "kind" };
            return { ...r, source, destination: "IGNORED", property_id: property, kind: null, duplicate, reason };
        }
        if (INFLOW_RENT.test(r.memo.toLowerCase()) && property) return { ...r, source, destination: "INCOME", property_id: property, kind: null, duplicate, reason };
        return { ...r, source, destination: "IGNORED", property_id: property, kind: null, duplicate, reason };
    });
}

/** A routed row is ready to import when it has a property for a ledger destination and a kind for investment. */
export function routingProblem(r: Pick<RoutedRow, "destination" | "property_id" | "kind" | "amount" | "duplicate">): string | null {
    if (r.duplicate) return "já importado";
    if (r.destination === "IGNORED") return null;
    if (!r.property_id) return "escolha o imóvel";
    if (r.destination === "INVESTMENT") {
        if (r.amount >= 0) return "investimento precisa ser uma saída";
        if (!r.kind) return "escolha o tipo";
    }
    if (r.destination === "INCOME" && r.amount <= 0) return "receita precisa ser uma entrada";
    return null;
}

/** Rows extracted from a PDF statement by the AI: normalised into StatementRow[]. */
export function rowsFromExtraction(raw: unknown, hash: (date: string, amount: number, memo: string) => string): StatementRow[] {
    const list = Array.isArray(raw) ? raw : (raw as { rows?: unknown })?.rows;
    if (!Array.isArray(list)) return [];
    const out: StatementRow[] = [];
    for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
        const amount = typeof o.amount === "number" ? o.amount : Number(String(o.amount ?? "").replace(/\./g, "").replace(",", "."));
        if (!date || !Number.isFinite(amount) || amount === 0) continue;
        const memo = String(o.memo ?? o.description ?? "").replace(/\s+/g, " ").trim();
        const rounded = Math.round(amount * 100) / 100;
        out.push({ date, amount: rounded, memo, reference: hash(date, rounded, memo) });
    }
    return out;
}
