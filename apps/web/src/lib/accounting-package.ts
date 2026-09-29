/**
 * Pacote do contador (Contábil & Fiscal, Etapa 3): one workbook per month with what the
 * contador reviews before signing — Resumo (holding, result, automated entries and the closing
 * checklist), Balancete, Diário, Razão and Aluguéis a receber per property.
 */
import ExcelJS from "exceljs";
import type { AdminSupabase } from "./api-auth";
import { ENTRY_SOURCE_LABELS, monthStart, type EntrySource } from "./accounting-journal";
import { monthEnd, shiftMonth, type CheckLevel } from "./accounting-accruals";
import { accountSums, balancesByProperty, closeContext, monthStatus } from "./accounting-close-server";
import { buildLedger, buildTrialBalance, receivablesByProperty, trialBalanceTotals } from "./accounting-reports";
import { loadEntries, loadIdentity } from "./accounting-server";
import { formatMonthKey, round2 } from "./property-income";

const BRL = '"R$" #,##0.00';
const HEADER_FILL = "FF047857";
const LEVEL_LABELS: Record<CheckLevel, string> = { error: "Pendência", warning: "Aviso", info: "Informação", ok: "OK" };
const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const dc = (v: number) => (round2(v) === 0 ? "" : v > 0 ? "D" : "C");
const formatCnpj = (v: string | null) => {
    const d = (v ?? "").replace(/\D/g, "");
    return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : v || "—";
};

function header(ws: ExcelJS.Worksheet, row = 1) {
    const r = ws.getRow(row);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    r.alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: row }];
}

function money(ws: ExcelJS.Worksheet, keys: string[]) {
    for (const k of keys) {
        const col = ws.getColumn(k);
        col.numFmt = BRL;
        col.alignment = { horizontal: "right" };
    }
}

export async function buildContadorPackage(supabase: AdminSupabase, ownerId: string, month: string): Promise<{ buffer: Buffer; filename: string }> {
    const from = monthStart(month), to = monthEnd(month);
    const ctx = await closeContext(supabase, ownerId);
    const receivable = ctx.byKey.get("ALUGUEIS_A_RECEBER");
    const [identity, status, sums, entries, receivableOpening] = await Promise.all([
        loadIdentity(supabase, ownerId),
        monthStatus(supabase, ctx, month),
        accountSums(supabase, ownerId, from, to),
        loadEntries(supabase, ownerId, from, to),
        receivable ? balancesByProperty(supabase, ownerId, monthEnd(shiftMonth(month, -1)), [receivable.id]) : Promise.resolve([]),
    ]);
    const accountById = new Map(ctx.accounts.map(a => [a.id, a]));
    const propertyName = (id: string | null) => (id ? ctx.propertyNames.get(id) ?? "Imóvel" : "");
    const s = ctx.settings;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Kitnets.com";
    wb.created = new Date();

    // ── Resumo ────────────────────────────────────────────────────────────
    const sr = wb.addWorksheet("Resumo");
    sr.columns = [{ key: "a", width: 34 }, { key: "b", width: 70 }, { key: "c", width: 90 }];
    const title = sr.addRow([`Pacote do contador — ${formatMonthKey(month)}`]);
    title.font = { bold: true, size: 14 };
    sr.addRow([]);
    const info = (label: string, value: string | number, fmt?: string) => {
        const r = sr.addRow([label, value]);
        r.getCell(1).font = { bold: true };
        if (fmt) { r.getCell(2).numFmt = fmt; r.getCell(2).alignment = { horizontal: "left" }; }
    };
    info("Holding", identity.business_name || "—");
    info("CNPJ", formatCnpj(identity.cnpj));
    info("Contador responsável", s.accountant_name ? `${s.accountant_name}${s.accountant_crc ? ` — CRC ${s.accountant_crc_uf ?? ""} ${s.accountant_crc}` : ""}` : "não cadastrado");
    info("Período", `${dateBR(from)} a ${dateBR(to)}`);
    info("Situação do mês", status.status === "CLOSED"
        ? `Fechado${status.period?.closed_at ? ` em ${dateBR(status.period.closed_at.slice(0, 10))}` : ""}${status.period?.closed_note ? ` — ${status.period.closed_note}` : ""}`
        : "Aberto: prévia, pode mudar até o fechamento");
    info("Gerado em", new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    sr.addRow([]);
    info("Receitas do mês", status.result.revenue, BRL);
    info("Despesas do mês", status.result.expenses, BRL);
    info("Resultado do mês", status.result.net, BRL);
    sr.addRow([]);
    info("Aluguéis por competência", `${status.automated.rentEntries} lançamento(s); receita bruta de aluguéis ${status.automated.grossRent.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
    info("Depreciação", status.automated.depreciation === null ? "não lançada (modelo de mensuração a definir ou valor justo)" : status.automated.depreciation.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
    if (status.automated.fairValue) info("Ajuste a valor justo", `ganho ${status.automated.fairValue.gain.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}; perda ${status.automated.fairValue.loss.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
    info("Parcelas de financiamento com juros separados", status.automated.financing);
    if (status.automated.pending) info("Lançamentos automáticos pendentes", `${status.automated.pending} a gerar ou atualizar`);
    sr.addRow([]);
    const ch = sr.addRow(["Conferência do fechamento", "Item", "Detalhe"]);
    ch.font = { bold: true, color: { argb: "FFFFFFFF" } };
    ch.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    for (const i of status.items) {
        const r = sr.addRow([LEVEL_LABELS[i.level], i.title, i.detail ?? ""]);
        r.alignment = { wrapText: true, vertical: "top" };
        if (i.level === "error") r.getCell(1).font = { bold: true, color: { argb: "FFB91C1C" } };
        else if (i.level === "warning") r.getCell(1).font = { bold: true, color: { argb: "FFB45309" } };
    }

    // ── Balancete ─────────────────────────────────────────────────────────
    const rows = buildTrialBalance(ctx.accounts, sums);
    const tb = wb.addWorksheet("Balancete");
    tb.columns = [
        { header: "Código", key: "code", width: 12 }, { header: "Conta", key: "name", width: 48 },
        { header: "Saldo anterior", key: "opening", width: 18 }, { header: "D/C", key: "openingDc", width: 5 },
        { header: "Débitos", key: "debit", width: 18 }, { header: "Créditos", key: "credit", width: 18 },
        { header: "Saldo atual", key: "closing", width: 18 }, { header: "D/C", key: "closingDc", width: 5 },
    ];
    for (const r of rows) {
        const row = tb.addRow({ code: r.code, name: `${"  ".repeat(r.level - 1)}${r.name}`, opening: Math.abs(r.opening), openingDc: dc(r.opening), debit: r.debit, credit: r.credit, closing: Math.abs(r.closing), closingDc: dc(r.closing) });
        if (!r.analytic) row.font = { bold: true };
    }
    const totals = trialBalanceTotals(rows);
    const tr = tb.addRow({ name: "Totais (contas analíticas)", debit: totals.debit, credit: totals.credit });
    tr.font = { bold: true };
    header(tb);
    money(tb, ["opening", "debit", "credit", "closing"]);

    // ── Diário ────────────────────────────────────────────────────────────
    const ordered = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const dj = wb.addWorksheet("Diário");
    dj.columns = [
        { header: "Data", key: "date", width: 11 }, { header: "Nº", key: "no", width: 6 }, { header: "Histórico", key: "description", width: 60 },
        { header: "Origem", key: "source", width: 16 }, { header: "Conta", key: "code", width: 11 }, { header: "Nome da conta", key: "account", width: 40 },
        { header: "Débito", key: "debit", width: 15 }, { header: "Crédito", key: "credit", width: 15 },
        { header: "Imóvel", key: "property", width: 24 }, { header: "Observação", key: "memo", width: 50 },
    ];
    ordered.forEach((e, idx) => {
        for (const l of e.lines) {
            const a = accountById.get(l.account_id);
            dj.addRow({
                date: dateBR(e.entry_date), no: idx + 1, description: e.description, source: ENTRY_SOURCE_LABELS[e.source as EntrySource] ?? e.source,
                code: a?.code ?? "", account: a?.name ?? "", debit: l.debit || null, credit: l.credit || null, property: propertyName(l.property_id), memo: l.memo ?? "",
            });
        }
    });
    header(dj);
    money(dj, ["debit", "credit"]);

    // ── Razão ─────────────────────────────────────────────────────────────
    const ledger = buildLedger(ctx.accounts, new Map(sums.map(x => [x.account_id, x.opening])), ordered);
    const rz = wb.addWorksheet("Razão");
    rz.columns = [
        { header: "Data", key: "date", width: 11 }, { header: "Histórico", key: "description", width: 60 },
        { header: "Débito", key: "debit", width: 15 }, { header: "Crédito", key: "credit", width: 15 },
        { header: "Saldo", key: "balance", width: 17 }, { header: "D/C", key: "dc", width: 5 }, { header: "Imóvel", key: "property", width: 24 },
    ];
    for (const acc of ledger) {
        const h = rz.addRow({ date: acc.code, description: `${acc.name} — saldo anterior`, balance: Math.abs(acc.opening), dc: dc(acc.opening) });
        h.font = { bold: true };
        for (const l of acc.lines) rz.addRow({ date: dateBR(l.date), description: l.description, debit: l.debit || null, credit: l.credit || null, balance: Math.abs(l.balance), dc: dc(l.balance), property: propertyName(l.property_id) });
        const f = rz.addRow({ description: "Saldo final", balance: Math.abs(acc.closing), dc: dc(acc.closing) });
        f.font = { italic: true };
        rz.addRow({});
    }
    header(rz);
    money(rz, ["debit", "credit", "balance"]);

    // ── Aluguéis a receber ────────────────────────────────────────────────
    const ar = wb.addWorksheet("Aluguéis a receber");
    ar.columns = [
        { header: "Imóvel", key: "property", width: 32 }, { header: "Saldo anterior", key: "opening", width: 17 },
        { header: "Aluguéis do mês", key: "accrued", width: 17 }, { header: "Recebimentos", key: "received", width: 17 }, { header: "Saldo final", key: "closing", width: 17 },
    ];
    if (receivable) {
        const opening = new Map((receivableOpening as Array<{ key: string; balance: number }>).map(r => [r.key, r.balance]));
        const list = receivablesByProperty(opening, ordered, receivable.id).sort((a, b) => propertyName(a.property_id).localeCompare(propertyName(b.property_id), "pt-BR"));
        for (const r of list) ar.addRow({ property: r.property_id ? propertyName(r.property_id) : "Sem imóvel", opening: r.opening, accrued: r.accrued, received: r.received, closing: r.closing });
    }
    header(ar);
    money(ar, ["opening", "accrued", "received", "closing"]);

    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `kitnets-contabil-${month}.xlsx` };
}
