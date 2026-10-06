/**
 * Reads a CEMIG bill from the PDF's text layer — the lines the vision model sometimes misses or sums
 * wrong. A bill may compensate energy in more than one regime ("Energia compensada GD I" and "GD II",
 * Lei 14.300; some months print "Compensação GD I" / "GD II" and "Energia compensada ISENTA" instead
 * of "Energia SCEE ISENTA"): the compensated energy is the sum of every such line (SET/2026, UC 2.777.942.018-25:
 * GD I 220 kWh + GD II 992 kWh = 1.212 kWh, R$ −137,17 − R$ 458,91), never one of them.
 *
 * Digital CEMIG bills carry a clean text layer; a scanned or photographed bill has none, and then the
 * vision model is the only reader. Pure: no I/O.
 */

export interface CompensationLine {
    /** "GD I", "GD II", "GD III" */
    regime: string;
    kwh: number;
    /** R$, negative (a credit on the bill) */
    amount: number;
}

export interface MeterRow {
    meter: string;
    previous: number;
    current: number;
    constant: number;
    kwh: number;
}

export interface BillTextFacts {
    compensation: CompensationLine[];
    sceeExempt: { kwh: number; amount: number } | null;
    consumption: MeterRow | null;
    injected: MeterRow | null;
    generationBalanceKwh: number | null;
    totalAmount: number | null;
}

/** "1.586,61" → 1586.61, "1.212" → 1212, "-137,17" → -137.17 */
export function parseBrNumber(raw: string): number {
    const s = raw.trim();
    const negative = s.startsWith("-");
    const n = Number(s.replace(/^-/, "").replace(/\./g, "").replace(",", "."));
    return negative ? -n : n;
}

const NUM = String.raw`-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?`;

function meterRow(text: string, label: RegExp): MeterRow | null {
    const re = new RegExp(String.raw`${label.source}\s+(\S+)\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})`, "i");
    const m = text.match(re);
    if (!m) return null;
    return { meter: m[1], previous: parseBrNumber(m[2]), current: parseBrNumber(m[3]), constant: parseBrNumber(m[4]), kwh: parseBrNumber(m[5]) };
}

/** What the text layer states; null / empty where it says nothing. */
export function parseBillText(text: string | null | undefined): BillTextFacts {
    const t = (text ?? "").replace(/ /g, " ");
    const compensation: CompensationLine[] = [];
    const lineRe = new RegExp(String.raw`(?:Energia compensada|Compensa[çc][ãa]o)\s+(GD\s*[IVX]+)\s+kWh\s+(${NUM})\s+(${NUM})\s+(${NUM})`, "gi");
    for (const m of t.matchAll(lineRe)) {
        compensation.push({ regime: m[1].replace(/\s+/g, " ").toUpperCase(), kwh: parseBrNumber(m[2]), amount: parseBrNumber(m[4]) });
    }
    const scee = t.match(new RegExp(String.raw`Energia (?:SCEE|compensada) ISENTA\s+kWh\s+(${NUM})\s+(${NUM})\s+(${NUM})`, "i"));
    const saldo = t.match(/SALDO ATUAL DE GERA[ÇC][ÃA]O:?\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*kWh/i);
    const total = t.match(new RegExp(String.raw`(?:^|\n)\s*TOTAL\s+(${NUM})`, "i"));
    return {
        compensation,
        sceeExempt: scee ? { kwh: parseBrNumber(scee[1]), amount: parseBrNumber(scee[3]) } : null,
        // "Energia kWh <medidor> <anterior> <atual> <constante> <consumo>" (Informações Técnicas)
        consumption: meterRow(t, /Energia\s+kWh/),
        injected: meterRow(t, /Energia\s+Injetada/),
        generationBalanceKwh: saldo ? parseBrNumber(saldo[1]) : null,
        totalAmount: total ? parseBrNumber(total[1]) : null,
    };
}

/** The bill's compensated energy: every regime's line added up (kWh and R$). */
export function sumCompensation(lines: ReadonlyArray<{ kwh: number; amount: number }>): { kwh: number; amount: number } {
    const kwh = lines.reduce((s, l) => s + (Number.isFinite(l.kwh) ? l.kwh : 0), 0);
    const amount = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
    return { kwh: Math.round(kwh * 100) / 100, amount: Math.round(amount * 100) / 100 };
}
