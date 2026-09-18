import { describe, expect, it } from "vitest";
import {
    bcbSeriesUrl, completedMonths, currentMonthBRT, ivarDiffers, minimumWageChanges, nextMonth, parseBcbSeries, parseIvarTables,
    planWrites, rateDiffers, validateIvar, validateRates, type IvarPoint, type MonthPoint,
} from "./index-sync";

describe("Banco Central series", () => {
    it("builds a date-range query, since the 'últimos N' form is capped at 20 points", () => {
        const url = bcbSeriesUrl(4391, 24, new Date(Date.UTC(2026, 8, 17)));
        expect(url).toBe("https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados?formato=json&dataInicial=01/09/2024&dataFinal=17/09/2026");
    });
    it("parses the payload oldest first and skips malformed rows", () => {
        const pts = parseBcbSeries([{ data: "01/09/2026", valor: "0.57" }, { data: "01/08/2026", valor: "1.09" }, { data: "x", valor: "1" }, { data: "01/07/2026", valor: "abc" }]);
        expect(pts).toEqual([{ month: "2026-08", value: 1.09 }, { month: "2026-09", value: 0.57 }]);
        expect(() => parseBcbSeries({ erro: { statusCode: 400 } })).toThrow(/fora do formato/);
    });
    it("uses Brasília time for the current month and drops the running month", () => {
        expect(currentMonthBRT(new Date("2026-10-01T02:00:00Z"))).toBe("2026-09");   // still 30/09 in Brasília
        expect(currentMonthBRT(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10");
        const pts: MonthPoint[] = [{ month: "2026-08", value: 1.09 }, { month: "2026-09", value: 0.57 }];
        expect(completedMonths(pts, "2026-09")).toEqual([{ month: "2026-08", value: 1.09 }]);
    });
    it("inserts missing months, corrects wrong values and keeps stored values that only differ by rounding", () => {
        const source: MonthPoint[] = [{ month: "2025-10", value: 1.28 }, { month: "2025-11", value: 1.05 }, { month: "2025-12", value: 1.22 }, { month: "2026-01", value: 1.16 }];
        const stored = new Map<string, MonthPoint>([["2025-10", { month: "2025-10", value: 1.2757 }], ["2025-11", { month: "2025-11", value: 1 }], ["2025-12", { month: "2025-12", value: 1.1715 }]]);
        const plan = planWrites(source, stored, rateDiffers);
        expect(plan.inserts.map(p => p.month)).toEqual(["2026-01"]);
        expect(plan.updates.map(p => p.month)).toEqual(["2025-11", "2025-12"]);
        expect(plan.unchanged).toBe(1);
    });
    it("refuses rates outside a sane monthly band", () => {
        expect(validateRates([{ month: "2026-08", value: 1.09 }], "CDI")).toEqual([]);
        expect(validateRates([{ month: "2026-08", value: 14.9 }], "CDI")[0]).toMatch(/fora da faixa/);   // an annual rate by mistake
        expect(validateRates([{ month: "2026-08", value: 0 }], "SELIC")).toHaveLength(1);
    });
});

describe("minimumWageChanges", () => {
    const flat = (from: string, n: number, value: number): MonthPoint[] => { const out: MonthPoint[] = []; let m = from; for (let i = 0; i < n; i++) { out.push({ month: m, value }); m = nextMonth(m); } return out; };
    const series = [...flat("2024-09", 4, 1412), ...flat("2025-01", 12, 1518), ...flat("2026-01", 9, 1621)];
    it("adds nothing when the table already has the current wage", () => {
        expect(minimumWageChanges(series, { reference_date: "2026-01-01", amount_brl: 1621 }, "2026-09")).toEqual([]);
    });
    it("adds the month the wage changed, with its variation", () => {
        expect(minimumWageChanges(series, { reference_date: "2025-01-01", amount_brl: 1518 }, "2026-09")).toEqual([{ reference_date: "2026-01-01", amount_brl: 1621, variation_percent: 6.79 }]);
    });
    it("catches up over two changes and never writes a future month", () => {
        expect(minimumWageChanges(series, { reference_date: "2024-01-01", amount_brl: 1412 }, "2026-09").map(r => r.reference_date)).toEqual(["2025-01-01", "2026-01-01"]);
        expect(minimumWageChanges(series, { reference_date: "2025-01-01", amount_brl: 1518 }, "2025-12")).toEqual([]);
    });
    it("does not invent a row from an empty table", () => {
        expect(minimumWageChanges(flat("2026-01", 3, 1621), null, "2026-09")).toEqual([]);
    });
});

describe("IVAR page", () => {
    const table = (rows: Array<[string, string, string]>) => `<table><thead><tr><th>M&#xEA;s de refer&#xEA;ncia</th><th>IVAR no m&#xEA;s</th><th>Acumulado 12 meses</th><th>Acumulado</th></tr></thead><tbody>${rows.map(([m, a, b]) => `<tr> <td>${m}</td> <td>${a}</td> <td>${b}</td> <td>0,00%</td> </tr>`).join("")}</tbody></table>`;
    const page = `<h1>Valor atual do IVAR</h1><p>agosto/2026 IVAR acumulado em 12 meses: 5,10%</p>
        <div><h2>IVAR 2026</h2><p>tabela do IVAR em 2026</p>${table([["janeiro", "0,65%", "5,61%"], ["fevereiro", "0,29%", "4,03%"], ["mar&#xE7;o", "-0,40%", "4,77%"]])}</div>
        <div><h2>IVAR 2025</h2>${table([["novembro", "0,37%", "6,90%"], ["dezembro", "0,51%", "8,84%"]])}</div>
        <h2>Calend&#xE1;rio de divulga&#xE7;&#xE3;o do IVAR em 2026</h2>${table([["janeiro", "9,99%", "9,99%"]])}`;

    it("reads each year's table under its own heading, so the year is never guessed", () => {
        expect(parseIvarTables(page)).toEqual([
            { month: "2025-11", monthly: 0.37, acc12m: 6.9 }, { month: "2025-12", monthly: 0.51, acc12m: 8.84 },
            { month: "2026-01", monthly: 0.65, acc12m: 5.61 }, { month: "2026-02", monthly: 0.29, acc12m: 4.03 }, { month: "2026-03", monthly: -0.4, acc12m: 4.77 },
        ]);
    });
    it("ignores tables under other headings and pages without the expected structure", () => {
        expect(parseIvarTables(page).some(p => p.monthly === 9.99)).toBe(false);
        expect(parseIvarTables("<html><body>manutenção</body></html>")).toEqual([]);
    });

    const months = (from: string, n: number): IvarPoint[] => { const out: IvarPoint[] = []; let m = from; for (let i = 0; i < n; i++) { out.push({ month: m, monthly: 0.4, acc12m: 5 }); m = nextMonth(m); } return out; };
    it("accepts a complete, in-sequence page that continues the stored series", () => {
        expect(validateIvar(months("2025-01", 20), "2026-09", "2025-12")).toEqual([]);
    });
    it("refuses a future month, which is how a wrong year shows up", () => {
        expect(validateIvar([...months("2025-01", 20), { month: "2026-12", monthly: 0.51, acc12m: 4.03 }], "2026-09", "2025-12").join(" ")).toMatch(/ainda não terminou/);
    });
    it("refuses a short read, a gap, months out of sequence and wild values", () => {
        expect(validateIvar(months("2026-06", 2), "2026-09", "2026-05").join(" ")).toMatch(/poucos meses/);
        expect(validateIvar(months("2026-01", 8), "2026-09", "2025-10").join(" ")).toMatch(/buraco/);
        const gap = months("2025-01", 20); gap.splice(5, 1);
        expect(validateIvar(gap, "2026-09", "2025-12").join(" ")).toMatch(/fora de sequência/);
        const wild = months("2025-01", 20); wild[3] = { ...wild[3], monthly: 40 };
        expect(validateIvar(wild, "2026-09", "2025-12").join(" ")).toMatch(/fora da faixa/);
    });
    it("fills a missing 12-month figure but leaves equal rows alone", () => {
        const src: IvarPoint = { month: "2025-05", monthly: -0.56, acc12m: 5.1 };
        expect(ivarDiffers(src, { month: "2025-05", monthly: -0.56, acc12m: null })).toBe(true);
        expect(ivarDiffers(src, { month: "2025-05", monthly: -0.56, acc12m: 5.1 })).toBe(false);
        expect(ivarDiffers({ ...src, acc12m: null }, { month: "2025-05", monthly: -0.56, acc12m: 5.1 })).toBe(false);   // never blanks a stored figure
    });
});
