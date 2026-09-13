/**
 * Excel template for the property investment ledger (server-side only — exceljs).
 * Same look as the income template; sheet "Investimento".
 */
import ExcelJS from "exceljs";
import { KITNETS_LOGO_PNG_BASE64 } from "./income-template-logo";
import {
    INVESTMENT_TEMPLATE_HEADERS,
    INVESTMENT_TEMPLATE_SHEET,
    KIND_LABELS,
    TRANSACTION_KINDS,
    type PropertyTransaction,
} from "./property-investment";

const BRAND = "059669";
const BRAND_DARK = "065F46";
const INK = "0F172A";
const MUTED = "64748B";
const ZEBRA = "F0FDF4";
const LINE = "CBD5E1";
const CURRENCY_FMT = '"R$ "#,##0.00';
const DATE_FMT = "dd/mm/yyyy";

const thin: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: `FF${LINE}` } },
    left: { style: "thin", color: { argb: `FF${LINE}` } },
    bottom: { style: "thin", color: { argb: `FF${LINE}` } },
    right: { style: "thin", color: { argb: `FF${LINE}` } },
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const isoToDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

export interface InvestmentTemplateOptions {
    propertyName: string;
    /** Filled export (newest first). Omit for the empty template. */
    rows?: PropertyTransaction[];
    /** Empty rows to pre-format when `rows` is omitted. Default 24. */
    blankRows?: number;
    now?: Date;
}

export async function buildInvestmentTemplate(opts: InvestmentTemplateOptions): Promise<Buffer> {
    const now = opts.now ?? new Date();
    const exportRows = opts.rows ? [...opts.rows].sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1)) : null;
    const count = exportRows ? Math.max(exportRows.length, 1) : Math.min(Math.max(opts.blankRows ?? 24, 1), 500);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Kitnets.com";
    wb.created = now;

    const ws = wb.addWorksheet(INVESTMENT_TEMPLATE_SHEET, {
        views: [{ state: "frozen", ySplit: 7, xSplit: 1 }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [
        { key: "date", width: 18 },
        { key: "kind", width: 24 },
        { key: "amount", width: 18 },
        { key: "interest", width: 16 },
        { key: "principal", width: 18 },
        { key: "insurance", width: 14 },
        { key: "comment", width: 48 },
    ];

    const logoId = wb.addImage({ base64: KITNETS_LOGO_PNG_BASE64, extension: "png" });
    ws.addImage(logoId, { tl: { col: 0.12, row: 0.15 }, ext: { width: 54, height: 54 } });
    ws.getRow(1).height = 22;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 18;
    ws.getCell("B1").value = "Kitnets.com";
    ws.getCell("B1").font = { name: "Calibri", size: 18, bold: true, color: { argb: `FF${BRAND}` } };
    ws.getCell("B2").value = `Investimento no imóvel — ${opts.propertyName}${exportRows ? " (registro exportado)" : ""}`;
    ws.getCell("B2").font = { name: "Calibri", size: 12, bold: true, color: { argb: `FF${INK}` } };
    ws.getCell("B3").value = `Modelo gerado em ${fmtDate(now)} · Um lançamento por linha (do mais recente para o mais antigo) e importe em Imóveis › Gerenciar › Investimento › Importar planilha`;
    ws.getCell("B3").font = { name: "Calibri", size: 9, italic: true, color: { argb: `FF${MUTED}` } };

    ws.mergeCells("A5:G5");
    ws.getCell("A5").value =
        "Tipo: Entrada · Custos de aquisição · Prestação · Amortização extra · Quitação · Tarifa bancária · IPTU · Utilidades · Reforma · Energia solar · Outros. " +
        "Valor = total pago. Juros / Amortização / Seguro são opcionais (só para prestações, se você souber a composição). " +
        "Energia solar é acompanhada como investimento à parte, pago pela receita líquida de energia.";
    ws.getCell("A5").alignment = { wrapText: true, vertical: "top" };
    ws.getCell("A5").font = { name: "Calibri", size: 9, color: { argb: `FF${MUTED}` } };
    ws.getRow(5).height = 44;

    const HEADER_ROW = 7;
    const header = ws.getRow(HEADER_ROW);
    INVESTMENT_TEMPLATE_HEADERS.forEach((label, i) => {
        const cell = header.getCell(i + 1);
        cell.value = label;
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND}` } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = thin;
    });
    header.height = 30;

    const kindList = `"${TRANSACTION_KINDS.map(k => k.label).join(",")}"`;

    for (let i = 0; i < count; i++) {
        const row = ws.getRow(HEADER_ROW + 1 + i);
        const tx = exportRows ? exportRows[i] : undefined;
        row.getCell(1).numFmt = DATE_FMT;
        row.getCell(3).numFmt = CURRENCY_FMT;
        row.getCell(4).numFmt = CURRENCY_FMT;
        row.getCell(5).numFmt = CURRENCY_FMT;
        row.getCell(6).numFmt = CURRENCY_FMT;
        if (tx) {
            row.getCell(1).value = isoToDate(tx.occurred_on);
            row.getCell(2).value = KIND_LABELS[tx.kind];
            row.getCell(3).value = Number(tx.amount);
            if (tx.interest_part !== null) row.getCell(4).value = Number(tx.interest_part);
            if (tx.principal_part !== null) row.getCell(5).value = Number(tx.principal_part);
            if (tx.insurance_part !== null) row.getCell(6).value = Number(tx.insurance_part);
            row.getCell(7).value = tx.comment ?? null;
        }
        for (let c = 1; c <= 7; c++) {
            const cell = row.getCell(c);
            cell.border = thin;
            cell.font = { name: "Calibri", size: 10, color: { argb: `FF${INK}` } };
            cell.alignment = { vertical: "middle", horizontal: c === 1 ? "center" : c === 2 || c === 7 ? "left" : "right" };
            if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ZEBRA}` } };
        }
        row.height = 18;
    }

    const lastRow = HEADER_ROW + count + 200;
    for (let r = HEADER_ROW + 1; r <= lastRow; r++) {
        ws.getCell(`A${r}`).dataValidation = {
            type: "date", operator: "greaterThan", formulae: ["DATE(1990,1,1)"], allowBlank: true,
            showErrorMessage: true, errorTitle: "Data inválida", error: "Use uma data no formato dd/mm/aaaa.",
        };
        ws.getCell(`B${r}`).dataValidation = {
            type: "list", allowBlank: true, formulae: [kindList],
            showErrorMessage: true, errorTitle: "Tipo inválido", error: "Escolha um tipo da lista.",
        };
        for (const col of ["C", "D", "E", "F"]) {
            ws.getCell(`${col}${r}`).dataValidation = {
                type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true,
                showErrorMessage: true, errorTitle: "Valor inválido", error: "Informe um valor em reais maior ou igual a zero.",
            };
        }
    }

    // Instruções
    const info = wb.addWorksheet("Instruções");
    info.columns = [{ width: 26 }, { width: 100 }];
    const lines: Array<[string, string, "title" | "h" | "p"]> = [
        ["Kitnets.com — Investimento no imóvel", "", "title"],
        ["Como usar", "", "h"],
        ["1.", "Um lançamento por linha na aba “Investimento”: data (dd/mm/aaaa), tipo (lista), valor total pago e, se quiser, um comentário.", "p"],
        ["2.", "Para prestações do financiamento, Juros / Amortização / Seguro são opcionais: preencha se tiver o extrato do banco; senão deixe em branco.", "p"],
        ["3.", "Salve (.xlsx) e importe em Kitnets.com › Imóveis › Gerenciar Imóvel › Investimento no imóvel › Importar planilha. A importação substitui todos os lançamentos do imóvel.", "p"],
        ["Tipos", "", "h"],
        ...TRANSACTION_KINDS.map(k => [k.label, k.hint, "p"] as [string, string, "p"]),
        ["Cálculos no Kitnets.com", "", "h"],
        ["Total investido", "Entrada + custos de aquisição + prestações + amortizações + quitação + reformas", "p"],
        ["Pago ao banco", "Prestações + amortizações extras + quitação (juros + seguros = pago ao banco − valor financiado, quando quitado)", "p"],
        ["Custos do imóvel", "Tarifa bancária + IPTU + utilidades + outros — abatidos do resultado, não do investimento", "p"],
        ["Energia solar", "Investimento à parte: recuperado pela receita líquida de energia (energia − custo de energia) registrada nas Receitas de Aluguel", "p"],
        ["Payback do imóvel", "Σ NOI das receitas − custos do imóvel, dividido pelo total investido", "p"],
    ];
    lines.forEach(([a, b, kind], i) => {
        const row = info.getRow(i + 1);
        row.getCell(1).value = a;
        row.getCell(2).value = b;
        if (kind === "title") { row.getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: `FF${BRAND}` } }; row.height = 26; }
        else if (kind === "h") { row.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: `FF${BRAND_DARK}` } }; row.height = 22; }
        else {
            row.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: `FF${INK}` } };
            row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: `FF${INK}` } };
            row.getCell(2).alignment = { wrapText: true, vertical: "top" };
            row.getCell(1).alignment = { vertical: "top" };
        }
    });

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
}
