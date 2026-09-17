import { describe, expect, it } from "vitest";
import { cellMonth, cellNumber, cellText, mapFipezapColumns, parseFipezapSheet, shiftMonth, validateFipezapRecords, type FipezapRecord, type SheetCell } from "./fipezap-import";

/** A sheet shaped like FIPE's "Índice FipeZAP": merged headers sit on the first column of each block. */
function sheet(months: Array<{ date: SheetCell; fill: (block: number, dorm: number) => SheetCell }>): SheetCell[][] {
    const dorms = ["Total", "1D", "2D", "3D", "4D"];
    const blocks: Array<[string, string, string]> = [
        ["Imóveis residenciais", "Venda", "Número-Índice"], ["", "", "Var. mensal (%)"], ["", "", "Var. em 12 meses (%)"], ["", "", "Preço médio (R$/m²)"],
        ["Imóveis residenciais", "Locação", "Número-Índice"], ["", "", "Var. mensal (%)"], ["", "", "Var. em 12 meses (%)"], ["", "", "Preço médio (R$/m²)"],
        ["Imóveis residenciais", "", "(% - mensalizada)"],
    ];
    const r1: SheetCell[] = [null, "Índice FipeZAP"], r2: SheetCell[] = [null, "Índice FipeZAP"], r3: SheetCell[] = [null, "Índice FipeZAP"], r4: SheetCell[] = [null, "Data"];
    blocks.forEach(([section, type, metric], b) => dorms.forEach((d, i) => {
        r1.push(i === 0 && section ? section : null);
        // the yield block's type cell is rich text in the real file
        r2.push(b === 8 ? { richText: [{ text: "Rentabilidade do aluguel" }] } : i === 0 && type ? type : null);
        r3.push(i === 0 ? metric : null);
        r4.push(d);
    }));
    // commercial block: a single "Total" column per metric, must be ignored
    r1.push("Imóveis comerciais"); r2.push("Venda"); r3.push("Var. mensal (%)"); r4.push("Total");
    const rows = months.map(m => { const row: SheetCell[] = [null, m.date]; for (let b = 0; b < 9; b++) for (let i = 0; i < 5; i++) row.push(m.fill(b, i)); row.push(0.5); return row; });
    return [r1, r2, r3, r4, ...rows, [null, null, null, "Fonte: ZAP e IBGE."]];
}

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
    // block 0/4 = index number (skipped); 1/5 = monthly; 2/6 = 12 months; 3/7 = price; 8 = yield
    const fill = (b: number, i: number): SheetCell => (b === 0 || b === 4 ? 100 + i : b === 3 ? 9595.6 + i : b === 7 ? 50.84 + i : b === 8 ? 0.0049 : b === 2 || b === 6 ? 0.0692 : 0.0058);
    const grid = sheet([
        { date: new Date(Date.UTC(2008, 0, 1)), fill: (b, i) => (b === 1 || b === 2 || b === 5 || b === 6 ? "." : fill(b, i)) },
        { date: new Date(Date.UTC(2025, 10, 1)), fill },
    ]);

    it("finds the 35 residential columns by their labels and skips index numbers and the commercial block", () => {
        const map = mapFipezapColumns(grid)!;
        expect(map.headerRow).toBe(3);
        expect(map.dateCol).toBe(1);
        expect(map.columns).toHaveLength(35);
        expect(map.columns.filter(c => c.index_type === "yield")).toHaveLength(5);
        expect(map.columns.some(c => c.col === grid[3].length - 1)).toBe(false);   // commercial "Total"
    });

    it("converts fractions to % and keeps the table's price rounding", () => {
        const recs = parseFipezapSheet(grid);
        const get = (d: string, t: string, m: string, dorm: string) => recs.find(r => r.reference_date === d && r.index_type === t && r.metric === m && r.dormitorios === dorm)?.value;
        expect(get("2025-11-01", "venda", "var_mensal", "total")).toBe(0.58);
        expect(get("2025-11-01", "locacao", "var_12m", "3")).toBe(6.92);
        expect(get("2025-11-01", "venda", "preco_m2", "total")).toBe(9596);
        expect(get("2025-11-01", "venda", "preco_m2", "2")).toBe(9598);
        expect(get("2025-11-01", "locacao", "preco_m2", "total")).toBe(50.8);
        expect(get("2025-11-01", "yield", "yield_mensal", "4")).toBe(0.49);
        // "." months produce no record; the footnote row ends the data
        expect(get("2008-01-01", "venda", "var_mensal", "total")).toBeUndefined();
        expect(get("2008-01-01", "venda", "preco_m2", "total")).toBe(9596);
        expect(recs).toHaveLength(15 + 35);
    });

    it("refuses a sheet whose headers it does not recognise", () => {
        expect(() => parseFipezapSheet([[null, "x"], [null, "y"]])).toThrow(/Cabeçalho/);
        const broken = grid.map(r => [...r]);
        broken[2] = broken[2].map(v => (v === "Var. mensal (%)" ? "Monthly change" : v));
        expect(() => parseFipezapSheet(broken)).toThrow(/Layout inesperado/);
    });
});

describe("validateFipezapRecords", () => {
    const series = (latest: string, locacaoLatest = latest): FipezapRecord[] => {
        const out: FipezapRecord[] = [];
        for (let i = 0; i < 230; i++) {
            const month = shiftMonth(latest, -i);
            for (const dormitorios of ["total", "1", "2", "3", "4"] as const) {
                out.push({ reference_date: month, index_type: "venda", metric: "var_mensal", dormitorios, value: 0.5 }, { reference_date: month, index_type: "venda", metric: "preco_m2", dormitorios, value: 9000 });
                if (month <= locacaoLatest) out.push({ reference_date: month, index_type: "locacao", metric: "var_mensal", dormitorios, value: 0.6 }, { reference_date: month, index_type: "yield", metric: "yield_mensal", dormitorios, value: 0.5 }, { reference_date: month, index_type: "locacao", metric: "preco_m2", dormitorios, value: 50 });
            }
        }
        return out;
    };
    it("accepts a complete file, also when the rental series trails the sale series by a month", () => {
        expect(validateFipezapRecords(series("2026-08-01"), "2025-11-01")).toEqual([]);
        expect(validateFipezapRecords(series("2026-08-01", "2026-07-01"), "2025-11-01")).toEqual([]);
    });
    it("rejects a short read, a file older than the table, a stalled series and wild values", () => {
        expect(validateFipezapRecords(series("2026-08-01").slice(0, 100), null)[0]).toMatch(/poucos valores/);
        expect(validateFipezapRecords(series("2025-06-01"), "2025-11-01").join(" ")).toMatch(/antes do banco/);
        expect(validateFipezapRecords(series("2026-08-01", "2026-01-01"), null).join(" ")).toMatch(/série locacao parada/);
        const wild = series("2026-08-01"); wild[0] = { ...wild[0], value: 58 };   // a fraction already multiplied twice
        expect(validateFipezapRecords(wild, null).join(" ")).toMatch(/fora da faixa/);
    });
});
