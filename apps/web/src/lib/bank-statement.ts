/**
 * Bank statement import (OFX / CSV) for the investment ledger — pure parsing
 * and classification. Groundwork for the Banco Inter API sync: the same
 * classifier will run on rows fetched from the bank.
 */
import { parseDateCell, parseMoney, parseSheet } from "./property-income";
import { kindFromText, type TransactionKind } from "./property-investment";

export interface StatementRow {
    /** `YYYY-MM-DD` */
    date: string;
    /** signed: negative = money out */
    amount: number;
    memo: string;
    /** bank's own id (OFX FITID) or a stable hash of date+amount+memo */
    reference: string;
}

export interface ClassifiedRow extends StatementRow {
    /** suggested ledger kind for outflows; null = needs review */
    kind: TransactionKind | null;
    /** true when the row is money in (rent etc.): not a ledger outflow */
    inflow: boolean;
}

/** Minimal OFX (SGML or XML flavour) reader: STMTTRN blocks with DTPOSTED, TRNAMT, MEMO/NAME, FITID. */
export function parseOfx(text: string): StatementRow[] {
    const rows: StatementRow[] = [];
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    for (const block of blocks) {
        const body = block.split(/<\/STMTTRN>/i)[0];
        const tag = (name: string) => {
            const m = body.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
            return m ? m[1].trim() : "";
        };
        const dt = tag("DTPOSTED").replace(/\[.*$/, "");
        const date = /^\d{8}/.test(dt) ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : null;
        const amount = Number(tag("TRNAMT").replace(",", "."));
        if (!date || !Number.isFinite(amount)) continue;
        const memo = [tag("NAME"), tag("MEMO")].filter(Boolean).join(" · ").replace(/\s+/g, " ").trim();
        const fitid = tag("FITID");
        rows.push({ date, amount: Math.round(amount * 100) / 100, memo, reference: fitid || hashRef(date, amount, memo) });
    }
    return rows;
}

/** Drops the preamble some banks put before the header row (Inter: "Extrato Conta Corrente", "Conta", "Período", "Saldo"). */
function stripPreamble(text: string): string {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const isHeader = (l: string) => /(^|[;,\t])\s*"?data\b/i.test(l) && /valor|d[eé]bito|cr[eé]dito|amount/i.test(l);
    const idx = lines.findIndex(isHeader);
    return idx > 0 ? lines.slice(idx).join("\n") : text;
}

/**
 * Generic CSV/TSV statement: finds the date, amount and description columns by
 * header name (Data, Valor/Débito/Crédito, Histórico/Descrição/Lançamento).
 * Histórico and Descrição are joined when both exist (Banco Inter layout).
 */
export function parseStatementCsv(text: string): StatementRow[] {
    const sheet = parseSheet(stripPreamble(text));
    const h = sheet.headers.map(x => x.trim().toLowerCase());
    const find = (...res: RegExp[]) => h.findIndex(x => res.some(r => r.test(x)));
    const cDate = sheet.dateColumn >= 0 ? sheet.dateColumn : find(/^data/);
    const cAmount = find(/^valor/, /^montante/, /^amount/);
    const cDebit = find(/d[eé]bito/, /sa[ií]da/);
    const cCredit = find(/cr[eé]dito/, /entrada/);
    const memoCols = [find(/hist[oó]rico/, /^lan[cç]amento/, /memo/), find(/descri/, /detalhe/, /favorecido|benefici/)].filter((c, i, a) => c >= 0 && c !== cDate && a.indexOf(c) === i);
    const rows: StatementRow[] = [];
    if (cDate < 0 || (cAmount < 0 && cDebit < 0 && cCredit < 0)) return rows;
    for (const r of sheet.rows) {
        const date = parseDateCell(r.cells[cDate]);
        if (!date) continue;
        let amount: number | null = null;
        if (cAmount >= 0) amount = parseMoney(r.cells[cAmount]);
        else {
            const d = cDebit >= 0 ? parseMoney(r.cells[cDebit]) : null;
            const c = cCredit >= 0 ? parseMoney(r.cells[cCredit]) : null;
            if (d !== null && d !== 0) amount = -Math.abs(d);
            else if (c !== null && c !== 0) amount = Math.abs(c);
        }
        if (amount === null || amount === 0) continue;
        const memo = memoCols.map(c => (r.cells[c] ?? "").trim()).filter(Boolean).join(" · ").replace(/\s+/g, " ").trim();
        rows.push({ date, amount: Math.round(amount * 100) / 100, memo, reference: hashRef(date, amount, memo) });
    }
    return rows;
}

export function parseStatement(text: string, fileName = ""): StatementRow[] {
    const isOfx = /\.(ofx|qfx)$/i.test(fileName) || /<OFX>|<STMTTRN>/i.test(text);
    return isOfx ? parseOfx(text) : parseStatementCsv(text);
}

/** Statement wording → ledger kind. Extends `kindFromText` with common bank phrasing. */
export function classifyMemo(memo: string): TransactionKind | null {
    const t = memo.toLowerCase();
    if (/iptu/.test(t)) return null;   // taxes belong in Tributos do imóvel, not in the investment ledger
    if (/cemig|enel|light|copel|celesc|energia|sabesp|copasa|sanepar|\bagua\b|água|gas\b|comgas/.test(t)) return "UTILIDADES";
    if (/tarifa|cesta|pacote de servi|manuten[cç][aã]o de conta|anuidade|enc\.? descob/.test(t)) return "TARIFA";
    if (/reforma|obra|material de constru|leroy|telhanorte|c&c|pintura|marcenaria/.test(t)) return "REFORMA";
    if (/solar|fotovolt/.test(t)) return "ENERGIA_SOLAR";
    return kindFromText(memo);
}

export function classifyStatement(rows: StatementRow[]): ClassifiedRow[] {
    return rows.map(r => ({ ...r, inflow: r.amount > 0, kind: r.amount < 0 ? classifyMemo(r.memo) : null }));
}

function hashRef(date: string, amount: number, memo: string): string {
    const s = `${date}|${amount.toFixed(2)}|${memo}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return `csv:${date}:${h.toString(16)}`;
}
