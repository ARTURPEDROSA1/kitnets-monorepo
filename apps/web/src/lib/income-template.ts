/**
 * Excel template for the property income ledger (server-side only — exceljs).
 *
 *   buildIncomeTemplate()  → formatted .xlsx the owner fills in
 *   xlsxToTsv()            → converts an uploaded .xlsx into the TSV text the
 *                            existing `parseSheet` / column mapper understands
 */
import ExcelJS from "exceljs";
import { KITNETS_LOGO_PNG_BASE64 } from "./income-template-logo";

export const INCOME_TEMPLATE_SHEET = "Receitas";

/** Header labels — chosen so `suggestMapping` maps them without user input. */
export const INCOME_TEMPLATE_HEADERS = [
    "Mês (dd/mm/aaaa)",
    "Aluguel bruto (R$)",
    "Taxa imobiliária (%)",
    "Valor recebido (R$)",
    "Energia (R$)",
    "Outras despesas (R$)",
    "Observações",
] as const;

const BRAND = "059669";        // emerald-600
const BRAND_DARK = "065F46";   // emerald-800
const INK = "0F172A";          // slate-900
const MUTED = "64748B";        // slate-500
const ZEBRA = "F0FDF4";        // emerald-50
const CALC = "F1F5F9";         // slate-100
const LINE = "CBD5E1";         // slate-300

const CURRENCY_FMT = '"R$ "#,##0.00';
const PCT_FMT = "0.00";
const DATE_FMT = "dd/mm/yyyy";

const thin: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: `FF${LINE}` } },
    left: { style: "thin", color: { argb: `FF${LINE}` } },
    bottom: { style: "thin", color: { argb: `FF${LINE}` } },
    right: { style: "thin", color: { argb: `FF${LINE}` } },
};

export interface IncomeTemplateOptions {
    propertyName: string;
    feePct: number;
    /** Number of month rows to pre-fill, ending at the current month. Default 12. */
    months?: number;
    now?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

export async function buildIncomeTemplate(opts: IncomeTemplateOptions): Promise<Buffer> {
    const now = opts.now ?? new Date();
    const months = Math.min(Math.max(opts.months ?? 12, 1), 120);
    const feePct = Number.isFinite(opts.feePct) ? Math.min(Math.max(opts.feePct, 0), 99.99) : 10;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Kitnets.com";
    wb.created = now;

    // ── Sheet 1: Receitas ───────────────────────────────────────────────
    const ws = wb.addWorksheet(INCOME_TEMPLATE_SHEET, {
        views: [{ state: "frozen", ySplit: 7, xSplit: 1 }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [
        { key: "month", width: 18 },
        { key: "gross", width: 20 },
        { key: "fee", width: 20 },
        { key: "received", width: 20 },
        { key: "energy", width: 16 },
        { key: "other", width: 20 },
        { key: "notes", width: 44 },
    ];

    // Logo + title block (rows 1-3)
    const logoId = wb.addImage({ base64: KITNETS_LOGO_PNG_BASE64, extension: "png" });
    ws.addImage(logoId, { tl: { col: 0.12, row: 0.15 }, ext: { width: 54, height: 54 } });
    ws.getRow(1).height = 22;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 18;

    ws.getCell("B1").value = "Kitnets.com";
    ws.getCell("B1").font = { name: "Calibri", size: 18, bold: true, color: { argb: `FF${BRAND}` } };
    ws.getCell("B2").value = `Receitas de aluguel — ${opts.propertyName}`;
    ws.getCell("B2").font = { name: "Calibri", size: 12, bold: true, color: { argb: `FF${INK}` } };
    ws.getCell("B3").value = `Modelo gerado em ${fmtDate(now)} · Preencha uma linha por mês e importe em Imóveis › Gerenciar › Importar planilha`;
    ws.getCell("B3").font = { name: "Calibri", size: 9, italic: true, color: { argb: `FF${MUTED}` } };

    // Instructions (row 5)
    ws.mergeCells("A5:G5");
    ws.getCell("A5").value =
        "Aluguel bruto = valor do contrato. Taxa = % que a imobiliária retém. Valor recebido = o que entrou na sua conta " +
        "(já calculado pela fórmula; sobrescreva com o valor real do extrato quando tiver). Energia = parcela paga pelo inquilino " +
        "referente à energia solar (é deduzida do aluguel e vai para o centro de energia). Aluguel líquido = recebido − energia − outras despesas.";
    ws.getCell("A5").alignment = { wrapText: true, vertical: "top" };
    ws.getCell("A5").font = { name: "Calibri", size: 9, color: { argb: `FF${MUTED}` } };
    ws.getRow(5).height = 44;

    // Header (row 7)
    const HEADER_ROW = 7;
    const header = ws.getRow(HEADER_ROW);
    INCOME_TEMPLATE_HEADERS.forEach((label, i) => {
        const cell = header.getCell(i + 1);
        cell.value = label;
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND}` } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = thin;
    });
    header.height = 30;

    // Month rows (newest first: current month at the top, like the ledger on screen)
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < months; i++) {
        const rowIdx = HEADER_ROW + 1 + i;
        const row = ws.getRow(rowIdx);
        const monthDate = new Date(first.getFullYear(), first.getMonth() - i, 1);
        const r = rowIdx;

        row.getCell(1).value = monthDate;
        row.getCell(1).numFmt = DATE_FMT;
        row.getCell(2).numFmt = CURRENCY_FMT;
        row.getCell(3).value = feePct;
        row.getCell(3).numFmt = PCT_FMT;
        row.getCell(4).value = { formula: `IF(B${r}="","",ROUND(B${r}*(1-C${r}/100)+E${r}+F${r},2))`, result: "" };
        row.getCell(4).numFmt = CURRENCY_FMT;
        row.getCell(5).numFmt = CURRENCY_FMT;
        row.getCell(6).numFmt = CURRENCY_FMT;

        for (let c = 1; c <= 7; c++) {
            const cell = row.getCell(c);
            cell.border = thin;
            cell.font = { name: "Calibri", size: 10, color: { argb: `FF${INK}` } };
            cell.alignment = { vertical: "middle", horizontal: c === 1 ? "center" : c === 7 ? "left" : "right" };
            if (c === 4) {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${CALC}` } };
            } else if (i % 2 === 1) {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ZEBRA}` } };
            }
        }
        row.height = 18;
    }

    // Data validation on the filled block (+ a generous tail for extra rows)
    const lastRow = HEADER_ROW + months + 60;
    for (let r = HEADER_ROW + 1; r <= lastRow; r++) {
        ws.getCell(`A${r}`).dataValidation = {
            type: "date", operator: "greaterThan", formulae: ["DATE(2000,1,1)"], allowBlank: true,
            showErrorMessage: true, errorTitle: "Data inválida", error: "Use uma data no formato dd/mm/aaaa.",
        };
        ws.getCell(`C${r}`).dataValidation = {
            type: "decimal", operator: "between", formulae: [0, 99.99], allowBlank: true,
            showErrorMessage: true, errorTitle: "Taxa inválida", error: "Informe a taxa em % entre 0 e 99,99 (ex.: 10).",
        };
        for (const col of ["B", "D", "E", "F"]) {
            ws.getCell(`${col}${r}`).dataValidation = {
                type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true,
                showErrorMessage: true, errorTitle: "Valor inválido", error: "Informe um valor em reais maior ou igual a zero.",
            };
        }
    }

    // Footer note
    const noteRow = HEADER_ROW + months + 2;
    ws.mergeCells(`A${noteRow}:G${noteRow}`);
    ws.getCell(`A${noteRow}`).value =
        "Meses do mais recente para o mais antigo. Adicione mais linhas abaixo se precisar (a coluna Valor recebido pode ser copiada para manter a fórmula). Meses futuros são importados como “previstos”.";
    ws.getCell(`A${noteRow}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: `FF${MUTED}` } };

    // ── Sheet 2: Instruções ─────────────────────────────────────────────
    const info = wb.addWorksheet("Instruções");
    info.columns = [{ width: 26 }, { width: 96 }];
    const lines: Array<[string, string, "title" | "h" | "p"]> = [
        ["Kitnets.com — Receitas de aluguel", "", "title"],
        ["Como usar", "", "h"],
        ["1.", "Preencha a aba “Receitas”: uma linha por mês, com a data no formato dd/mm/aaaa.", "p"],
        ["2.", "Informe o Aluguel bruto (valor do contrato) e a Taxa da imobiliária em %. O Valor recebido é calculado automaticamente; substitua pelo valor real do extrato bancário quando quiser.", "p"],
        ["3.", "Se o inquilino paga uma parcela referente à energia solar, informe em Energia. Esse valor é deduzido do aluguel e contabilizado no centro de energia.", "p"],
        ["4.", "Salve o arquivo (.xlsx) e importe em Kitnets.com › Imóveis › Gerenciar Imóvel › Importar planilha. As colunas são reconhecidas automaticamente.", "p"],
        ["Colunas", "", "h"],
        ["Mês", "Data de referência do mês (qualquer dia do mês serve).", "p"],
        ["Aluguel bruto (R$)", "Valor do aluguel no contrato, antes da taxa da imobiliária.", "p"],
        ["Taxa imobiliária (%)", "Percentual retido pela imobiliária (ex.: 10). Use 0 quando você mesmo administra o imóvel.", "p"],
        ["Valor recebido (R$)", "O que efetivamente entrou na sua conta: bruto × (1 − taxa) + energia + outras despesas.", "p"],
        ["Energia (R$)", "Parcela do pagamento do inquilino referente à energia (solar).", "p"],
        ["Outras despesas (R$)", "Outros valores repassados junto com o aluguel (estacionamento, multa, reembolsos).", "p"],
        ["Observações", "Texto livre (reajuste, vacância, troca de inquilino).", "p"],
        ["Cálculos no Kitnets.com", "", "h"],
        ["Aluguel líquido", "recebido − energia − outras despesas", "p"],
        ["Aluguel bruto", "líquido ÷ (1 − taxa/100), quando o bruto não é informado", "p"],
        ["Taxa acumulada", "bruto − líquido, somado mês a mês: a economia potencial ao administrar o imóvel pelo Kitnets.com.", "p"],
        ["Exemplo", "", "h"],
        ["Bruto 4.000 · Taxa 10 % · Energia 350", "Recebido 3.950 · Aluguel líquido 3.600 · Taxa da imobiliária 400", "p"],
    ];
    lines.forEach(([a, b, kind], i) => {
        const row = info.getRow(i + 1);
        row.getCell(1).value = a;
        row.getCell(2).value = b;
        if (kind === "title") {
            row.getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: `FF${BRAND}` } };
            row.height = 26;
        } else if (kind === "h") {
            row.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: `FF${BRAND_DARK}` } };
            row.height = 22;
        } else {
            row.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: `FF${INK}` } };
            row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: `FF${INK}` } };
            row.getCell(2).alignment = { wrapText: true, vertical: "top" };
            row.getCell(1).alignment = { vertical: "top" };
        }
    });

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
}

// ───────────────────────────────────────────────────────────────────────────
// Import side: .xlsx → TSV text
// ───────────────────────────────────────────────────────────────────────────

const MAX_ROWS = 2000;

function cellText(cell: ExcelJS.Cell): string {
    const v = cell.value;
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return fmtDate(v);
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    if (typeof v === "string") return v;
    if (typeof v === "object") {
        if ("richText" in v && Array.isArray(v.richText)) return v.richText.map(t => t.text).join("");
        if ("result" in v) {
            const r = (v as ExcelJS.CellFormulaValue).result;
            if (r === null || r === undefined) return "";
            if (r instanceof Date) return fmtDate(r);
            if (typeof r === "object") return "";   // error value
            return String(r);
        }
        if ("text" in v && typeof (v as ExcelJS.CellHyperlinkValue).text === "string") return String((v as ExcelJS.CellHyperlinkValue).text);
        if ("error" in v) return "";
    }
    return String(cell.text ?? "");
}

const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();

/**
 * Reads the "Receitas" sheet (or the first sheet), finds the header row (the
 * first row containing a "Mês"/"Data" cell) and returns TSV text.
 */
export async function xlsxToTsv(data: ArrayBuffer | Buffer): Promise<string> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as ArrayBuffer);
    const ws = wb.getWorksheet(INCOME_TEMPLATE_SHEET) ?? wb.worksheets[0];
    if (!ws) return "";

    let headerRow = 0;
    let lastCol = 0;
    ws.eachRow((row, rowNumber) => {
        if (headerRow) return;
        const texts: string[] = [];
        row.eachCell({ includeEmpty: false }, cell => texts.push(cellText(cell).toLowerCase()));
        if (texts.some(t => /^(m[eê]s|data|date|month)\b/.test(t)) && texts.length >= 2) {
            headerRow = rowNumber;
            lastCol = row.cellCount;
        }
    });
    if (!headerRow) return "";

    const lines: string[] = [];
    const rowToLine = (row: ExcelJS.Row) => {
        const cells: string[] = [];
        for (let c = 1; c <= lastCol; c++) cells.push(clean(cellText(row.getCell(c))));
        return cells.join("\t");
    };
    lines.push(rowToLine(ws.getRow(headerRow)));
    const end = Math.min(ws.rowCount, headerRow + MAX_ROWS);
    for (let r = headerRow + 1; r <= end; r++) {
        const cells = rowToLine(ws.getRow(r)).split("\t");
        const nonEmpty = cells.filter(c => c !== "");
        if (nonEmpty.length === 0) continue;
        // A merged note/instruction row reports the same text in every cell — not data.
        if (nonEmpty.length > 1 && nonEmpty.every(c => c === nonEmpty[0])) continue;
        lines.push(cells.join("\t"));
    }
    return lines.join("\n");
}
