import { describe, expect, it } from "vitest";
import { applyRetention, cellMonth, cellNumber, cellText, latestMonth, mapFipezapColumns, parseFipezapSheet, retentionCutoff, shiftMonth, validateFipezapRecords, validateFipezapWorkbook, type FipezapRecord, type SheetCell } from "./fipezap-import";

interface SheetOptions {
    /** the title cell (B1); FIPE writes the city name, "Índice FipeZAP" for the national sheet */
    title?: string;
    /** bedroom buckets present in the sheet: the national sheet and 15 cities have all five, the others only Total */
    dorms?: string[];
}

/** A sheet shaped like FIPE's: merged headers sit on the first column of each block. */
function sheet(months: Array<{ date: SheetCell; fill: (block: number, dorm: number) => SheetCell }>, opts: SheetOptions = {}): SheetCell[][] {
    const dorms = opts.dorms ?? ["Total", "1D", "2D", "3D", "4D"];
    const title = opts.title ?? "Índice FipeZAP";
    const blocks: Array<[string, string, string]> = [
        ["Imóveis residenciais", "Venda", "Número-Índice"], ["", "", "Var. mensal (%)"], ["", "", "Var. em 12 meses (%)"], ["", "", "Preço médio (R$/m²)"],
        ["Imóveis residenciais", "Locação", "Número-Índice"], ["", "", "Var. mensal (%)"], ["", "", "Var. em 12 meses (%)"], ["", "", "Preço médio (R$/m²)"],
        ["Imóveis residenciais", "", "(% - mensalizada)"],
    ];
    const r1: SheetCell[] = [null, title], r2: SheetCell[] = [null, title], r3: SheetCell[] = [null, title], r4: SheetCell[] = [null, "Data"];
    blocks.forEach(([section, type, metric], b) => dorms.forEach((d, i) => {
        r1.push(i === 0 && section ? section : null);
        // the yield block's type cell is rich text in the real file
        r2.push(b === 8 ? { richText: [{ text: "Rentabilidade do aluguel" }] } : i === 0 && type ? type : null);
        r3.push(i === 0 ? metric : null);
        r4.push(d);
    }));
    // commercial block: a single "Total" column per metric, must be ignored
    r1.push("Imóveis comerciais"); r2.push("Venda"); r3.push("Var. mensal (%)"); r4.push("Total");
    const rows = months.map(m => { const row: SheetCell[] = [null, m.date]; for (let b = 0; b < 9; b++) for (let i = 0; i < dorms.length; i++) row.push(m.fill(b, i)); row.push(0.5); return row; });
    return [r1, r2, r3, r4, ...rows, [null, null, null, "Fonte: ZAP e IBGE."]];
}

// block 0/4 = index number; 1/5 = monthly; 2/6 = 12 months; 3/7 = price; 8 = yield
const fill = (b: number, i: number): SheetCell => (b === 0 || b === 4 ? 100.12345 + i : b === 3 ? 9595.6 + i : b === 7 ? 50.84 + i : b === 8 ? 0.0049 : b === 2 || b === 6 ? 0.0692 : 0.0058);

describe("cell helpers", () => {
    it("reads text from plain, rich-text and formula cells", () => {
        expect(cellText(" Venda ")).toBe("Venda");
        expect(cellText({ richText: [{ text: "Rental " }, { text: "yield" }] })).toBe("Rental yield");
        expect(cellText({ result: "Total" })).toBe("Total");
        expect(cellText(null)).toBe("");
    });
    it("reads numbers and treats FIPE's dot as empty", () => {
        expect(cellNumber(0.0061)).toBe(0.0061);
        expect(cellNumber(".")).toBeNull();
        expect(cellNumber("0,61%")).toBe(0.61);
        expect(cellNumber({ result: 12.5 })).toBe(12.5);
        expect(cellNumber(new Date())).toBeNull();
    });
    it("reads the month from dates, Excel serials and ISO text", () => {
        expect(cellMonth(new Date(Date.UTC(2026, 7, 1)))).toBe("2026-08-01");
        expect(cellMonth(39448)).toBe("2008-01-01");   // Excel serial of 01/01/2008
        expect(cellMonth("2025-11-01")).toBe("2025-11-01");
        expect(cellMonth("Fonte: ZAP")).toBeNull();
        expect(cellMonth(41.8)).toBeNull();
    });
    it("shifts months across years", () => {
        expect(shiftMonth("2025-11-01", -12)).toBe("2024-11-01");
        expect(shiftMonth("2025-11-01", 3)).toBe("2026-02-01");
    });
});

describe("parseFipezapSheet", () => {
    const grid = sheet([
        { date: new Date(Date.UTC(2008, 0, 1)), fill: (b, i) => (b === 1 || b === 2 || b === 5 || b === 6 ? "." : fill(b, i)) },
        { date: new Date(Date.UTC(2025, 10, 1)), fill },
    ]);

    it("finds the 45 residential columns by their labels and skips the commercial block", () => {
        const map = mapFipezapColumns(grid)!;
        expect(map.headerRow).toBe(3);
        expect(map.dateCol).toBe(1);
        expect(map.columns).toHaveLength(45);
        expect(map.columns.filter(c => c.metric === "indice")).toHaveLength(10);
        expect(map.columns.filter(c => c.index_type === "yield")).toHaveLength(5);
        expect(map.columns.some(c => c.col === grid[3].length - 1)).toBe(false);   // commercial "Total"
    });

    it("converts fractions to %, keeps the table's price rounding and stamps the city", () => {
        const recs = parseFipezapSheet(grid, { citySlug: "brasil", strict: true });
        const get = (d: string, t: string, m: string, dorm: string) => recs.find(r => r.reference_date === d && r.index_type === t && r.metric === m && r.dormitorios === dorm)?.value;
        expect(recs.every(r => r.city_slug === "brasil")).toBe(true);
        expect(get("2025-11-01", "venda", "var_mensal", "total")).toBe(0.58);
        expect(get("2025-11-01", "locacao", "var_12m", "3")).toBe(6.92);
        expect(get("2025-11-01", "venda", "preco_m2", "total")).toBe(9596);
        expect(get("2025-11-01", "venda", "preco_m2", "2")).toBe(9598);
        expect(get("2025-11-01", "locacao", "preco_m2", "total")).toBe(50.8);
        expect(get("2025-11-01", "yield", "yield_mensal", "4")).toBe(0.49);
        expect(get("2025-11-01", "venda", "indice", "1")).toBe(101.1235);
        // "." months produce no record; the footnote row ends the data
        expect(get("2008-01-01", "venda", "var_mensal", "total")).toBeUndefined();
        expect(get("2008-01-01", "venda", "preco_m2", "total")).toBe(9596);
        expect(recs).toHaveLength(25 + 45);
    });

    it("parses a Total-only city sheet when not strict, and refuses it when strict", () => {
        const city = sheet([{ date: new Date(Date.UTC(2025, 10, 1)), fill }], { title: "Pelotas", dorms: ["Total"] });
        const recs = parseFipezapSheet(city, { citySlug: "pelotas" });
        expect(recs).toHaveLength(9);
        expect(recs.every(r => r.dormitorios === "total" && r.city_slug === "pelotas")).toBe(true);
        expect(() => parseFipezapSheet(city, { citySlug: "pelotas", strict: true })).toThrow(/esperado 35/);
    });

    it("refuses a sheet whose headers it does not recognise", () => {
        expect(() => parseFipezapSheet([[null, "x"], [null, "y"]], { citySlug: "brasil" })).toThrow(/Cabeçalho/);
        const broken = grid.map(r => [...r]);
        broken[2] = broken[2].map(v => (v === "Var. mensal (%)" ? "Monthly change" : v));
        expect(() => parseFipezapSheet(broken, { citySlug: "brasil", strict: true })).toThrow(/Layout inesperado/);
        expect(() => parseFipezapSheet(broken, { citySlug: "santos" })).toThrow(/faltam as colunas/);
    });
});

describe("retention", () => {
    it("keeps the 180 most recent months", () => {
        expect(retentionCutoff("2026-08-01")).toBe("2011-09-01");
        expect(retentionCutoff("2027-01-01")).toBe("2012-02-01");   // 2012-01 is dropped once 2027-01 arrives
        expect(retentionCutoff("2026-12-01")).toBe("2012-01-01");
        const recs: FipezapRecord[] = ["2011-08-01", "2011-09-01", "2026-08-01"].map(reference_date => ({ city_slug: "brasil", reference_date, index_type: "venda", metric: "var_mensal", dormitorios: "total", value: 1 }));
        expect(applyRetention(recs, retentionCutoff("2026-08-01")).map(r => r.reference_date)).toEqual(["2011-09-01", "2026-08-01"]);
        expect(latestMonth(recs)).toBe("2026-08-01");
        expect(latestMonth([])).toBe("");
    });
});

/** 180 months of one sheet; `dorms` buckets; the rental series may end earlier or be absent. */
const series = (slug: string, latest: string, opts: { locacaoLatest?: string | null; dorms?: FipezapRecord["dormitorios"][]; months?: number } = {}): FipezapRecord[] => {
    const out: FipezapRecord[] = [];
    const dorms = opts.dorms ?? ["total", "1", "2", "3", "4"];
    const locacaoLatest = opts.locacaoLatest === undefined ? latest : opts.locacaoLatest;
    for (let i = 0; i < (opts.months ?? 180); i++) {
        const month = shiftMonth(latest, -i);
        for (const dormitorios of dorms) {
            const base = { city_slug: slug, reference_date: month, dormitorios } as const;
            out.push({ ...base, index_type: "venda", metric: "var_mensal", value: 0.5 }, { ...base, index_type: "venda", metric: "preco_m2", value: 9000 }, { ...base, index_type: "venda", metric: "indice", value: 150 });
            if (locacaoLatest && month <= locacaoLatest) out.push({ ...base, index_type: "locacao", metric: "var_mensal", value: 0.6 }, { ...base, index_type: "yield", metric: "yield_mensal", value: 0.5 }, { ...base, index_type: "locacao", metric: "preco_m2", value: 50 });
        }
    }
    return out;
};

describe("validateFipezapRecords", () => {
    it("accepts a complete national sheet, also when the rental series trails the sale series by a month", () => {
        expect(validateFipezapRecords(series("brasil", "2026-08-01"), "2025-11-01", { strict: true })).toEqual([]);
        expect(validateFipezapRecords(series("brasil", "2026-08-01", { locacaoLatest: "2026-07-01" }), "2025-11-01", { strict: true })).toEqual([]);
    });
    it("rejects a short read, a file older than the table, a stalled series and wild values", () => {
        expect(validateFipezapRecords(series("brasil", "2026-08-01").slice(0, 100), null, { strict: true })[0]).toMatch(/poucos valores/);
        expect(validateFipezapRecords(series("brasil", "2025-06-01"), "2025-11-01", { strict: true }).join(" ")).toMatch(/antes do banco/);
        expect(validateFipezapRecords(series("brasil", "2026-08-01", { locacaoLatest: "2026-01-01" }), null, { strict: true }).join(" ")).toMatch(/série locacao parada/);
        const wild = series("brasil", "2026-08-01"); wild[0] = { ...wild[0], value: 58 };   // a fraction already multiplied twice
        expect(validateFipezapRecords(wild, null, { strict: true }).join(" ")).toMatch(/fora da faixa/);
        expect(validateFipezapRecords([], null)).toEqual(["nenhum valor lido"]);
    });
    it("accepts a Total-only city with the three series, even a short one, and a wide monthly swing", () => {
        expect(validateFipezapRecords(series("cuiaba", "2026-08-01", { dorms: ["total"], months: 56 }), "2026-07-01")).toEqual([]);
        const swing = series("natal", "2026-08-01", { dorms: ["total", "4"], months: 56 }); swing[0] = { ...swing[0], value: 29.3 };   // real FIPE figure for 4-bedroom rentals
        expect(validateFipezapRecords(swing, null)).toEqual([]);
        const doubled = series("natal", "2026-08-01", { dorms: ["total"], months: 56 }); doubled[0] = { ...doubled[0], value: 58 };
        expect(validateFipezapRecords(doubled, null).join(" ")).toMatch(/fora da faixa/);
    });
    it("rejects a city without the rental series or one that regressed against its own table", () => {
        expect(validateFipezapRecords(series("guaruja", "2026-08-01", { dorms: ["total"], locacaoLatest: null }), null).join(" ")).toMatch(/série locacao parada em nenhum mês.*série yield parada/);
        expect(validateFipezapRecords(series("santos", "2026-06-01", { dorms: ["total"] }), "2026-08-01").join(" ")).toMatch(/antes do banco/);
    });
});

describe("validateFipezapWorkbook", () => {
    const expected = { nationalSlug: "brasil", citySlugs: ["sao-paulo", "santos", "cuiaba"], minCities: 2 };
    const parsed = () => new Map<string, FipezapRecord[]>([
        ["brasil", series("brasil", "2026-08-01")],
        ["sao-paulo", series("sao-paulo", "2026-08-01")],
        ["santos", series("santos", "2026-08-01", { dorms: ["total"] })],
        ["cuiaba", series("cuiaba", "2026-08-01", { dorms: ["total"], months: 56 })],
    ]);
    const db = new Map<string, string | null>([["brasil", "2026-07-01"], ["sao-paulo", "2026-07-01"]]);

    it("accepts every sheet of a good file, national first", () => {
        const v = validateFipezapWorkbook(parsed(), db, expected);
        expect(v.fatal).toEqual([]);
        expect(v.skipped.size).toBe(0);
        expect(v.accepted).toEqual(["brasil", "sao-paulo", "santos", "cuiaba"]);
    });
    it("skips and reports a missing or bad city, keeps the rest", () => {
        const p = parsed();
        p.delete("santos");
        p.set("cuiaba", series("cuiaba", "2026-08-01", { dorms: ["total"], months: 56, locacaoLatest: null }));
        const v = validateFipezapWorkbook(p, db, { ...expected, minCities: 1 });
        expect(v.fatal).toEqual([]);
        expect(v.accepted).toEqual(["brasil", "sao-paulo"]);
        expect(v.skipped.get("santos")).toEqual(["planilha não encontrada no arquivo"]);
        expect(v.skipped.get("cuiaba")?.join(" ")).toMatch(/locacao parada/);
    });
    it("is fatal without the national sheet, with a bad national sheet, or with too few cities", () => {
        const p = parsed();
        p.delete("brasil");
        expect(validateFipezapWorkbook(p, db, expected).fatal[0]).toMatch(/nacional não encontrada/);
        const q = parsed();
        q.set("brasil", series("brasil", "2026-05-01"));
        expect(validateFipezapWorkbook(q, db, expected).fatal[0]).toMatch(/^nacional: .*antes do banco/);
        expect(validateFipezapWorkbook(parsed(), db, { ...expected, minCities: 10 }).fatal[0]).toMatch(/só 3 cidades reconhecidas/);
    });
});
