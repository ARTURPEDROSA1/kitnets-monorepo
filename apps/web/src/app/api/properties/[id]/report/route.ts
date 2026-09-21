import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { computeInvestmentMetrics } from "@/lib/investment-metrics";
import { breakdown, formatMonthKey, monthKey, type PropertyIncomeRow } from "@/lib/property-income";
import { KIND_LABELS, type PropertyInvestment, type PropertyTransaction } from "@/lib/property-investment";
import { effectiveTax, TAX_KINDS } from "@/lib/property-taxes";
import { loadTaxRows } from "@/lib/property-taxes-server";
import { latestValuation, VALUATION_SOURCE_LABELS } from "@/lib/property-valuations";
import { loadIpcaSeries, loadValuations } from "@/lib/property-valuations-server";
import { KITNETS_LOGO_PNG_BASE64 } from "@/lib/income-template-logo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const BRL = '"R$" #,##0.00';
const PCT = '0.0"%"';

/**
 * GET /api/properties/[id]/report → .xlsx
 *
 * One workbook with everything the analysis shows: Resumo (KPIs), Série mensal
 * (the engine's monthly walk), Receitas, Investimento, Tributos, Avaliações.
 */
export async function GET(_request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    const property = await getOwnedProperty(supabase, profileId, id, "id, name");
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    const propertyName = String(property.name ?? "Imóvel");

    try {
        const [inv, txs, income, taxes, valuations, ipca] = await Promise.all([
            supabase.from("property_investments").select("*").eq("property_id", id).maybeSingle(),
            supabase.from("property_transactions").select("id, property_id, occurred_on, kind, amount, interest_part, principal_part, insurance_part, comment, source, bank_reference").eq("property_id", id).order("occurred_on", { ascending: true }),
            supabase.from("property_income_months").select("id, property_id, month, unit_id, unit_name, received_on, received_amount, energy_portion, other_income, other_expenses, condo_amount, iptu_amount, agency_fee_pct, status, source, bank_reference, notes").eq("property_id", id).order("month", { ascending: true }),
            loadTaxRows(supabase, id),
            loadValuations(supabase, id),
            loadIpcaSeries(supabase).catch(() => []),
        ]);
        if (txs.error) throw new Error(txs.error.message);
        if (income.error) throw new Error(income.error.message);

        const investment = (inv.data as unknown as PropertyInvestment | null) ?? null;
        if (investment) { investment.purchase_price = Number(investment.purchase_price) || 0; investment.principal = investment.principal === null ? null : Number(investment.principal); }
        const transactions = ((txs.data ?? []) as unknown as PropertyTransaction[]).map(t => ({ ...t, amount: Number(t.amount) || 0, interest_part: t.interest_part === null ? null : Number(t.interest_part), principal_part: t.principal_part === null ? null : Number(t.principal_part), insurance_part: t.insurance_part === null ? null : Number(t.insurance_part) }));
        const incomeRows = ((income.data ?? []) as unknown as PropertyIncomeRow[]).map(r => ({ ...r, received_amount: Number(r.received_amount) || 0, energy_portion: Number(r.energy_portion) || 0, other_income: Number(r.other_income) || 0, other_expenses: Number(r.other_expenses) || 0, iptu_amount: Number(r.iptu_amount) || 0, agency_fee_pct: Number(r.agency_fee_pct) || 0 }));
        const latest = latestValuation(valuations);
        const m = computeInvestmentMetrics({
            investment, transactions, incomeRows, taxes, ipca,
            marketValue: latest ? { amount: latest.amount, valuedOn: latest.valued_on, source: latest.source } : null,
        });

        const wb = new ExcelJS.Workbook();
        wb.creator = "Kitnets.com";
        wb.created = new Date();

        // ── Resumo ──────────────────────────────────────────────────────
        const ws = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 3 }, { width: 44 }, { width: 24 }, { width: 60 }];
        const logoId = wb.addImage({ base64: KITNETS_LOGO_PNG_BASE64, extension: "png" });
        ws.addImage(logoId, { tl: { col: 0.12, row: 0.15 }, ext: { width: 54, height: 54 } });
        ws.getCell("B2").value = `Análise do investimento — ${propertyName}`;
        ws.getCell("B2").font = { bold: true, size: 16 };
        ws.getCell("B3").value = `Gerado em ${new Date().toLocaleDateString("pt-BR")} · dados até ${formatMonthKey(m.asOf)} · Kitnets.com`;
        ws.getCell("B3").font = { color: { argb: "FF6B7280" }, size: 10 };
        let row = 5;
        const section = (title: string) => {
            row++;
            const c = ws.getCell(`B${row}`);
            c.value = title; c.font = { bold: true, size: 12, color: { argb: "FF047857" } };
            row++;
        };
        const line = (label: string, value: ExcelJS.CellValue, fmt?: string, note?: string) => {
            ws.getCell(`B${row}`).value = label;
            const c = ws.getCell(`C${row}`);
            c.value = value ?? "—";
            if (fmt && typeof value === "number") c.numFmt = fmt;
            c.alignment = { horizontal: "right" };
            if (note) { ws.getCell(`D${row}`).value = note; ws.getCell(`D${row}`).font = { color: { argb: "FF6B7280" }, size: 9 }; }
            row++;
        };
        const monthOrDash = (k: string | null) => (k ? formatMonthKey(k) : "—");

        section("Aquisição");
        line("Valor de compra", investment?.purchase_price ?? null, BRL);
        line("Data da compra", investment?.acquired_on ? investment.acquired_on.split("-").reverse().join("/") : "—");
        line("Financiamento", investment ? `${investment.financing_status === "ACTIVE" ? "Ativo" : investment.financing_status === "PAID_OFF" ? `Quitado${investment.paid_off_on ? ` em ${investment.paid_off_on.split("-").reverse().join("/")}` : ""}` : "Sem financiamento"}${investment.lender ? ` · ${investment.lender}` : ""}${investment.financing_system ? ` · ${investment.financing_system}` : ""}` : "—");

        section("Investimento e payback");
        line("Total investido (base de caixa)", m.cashInvested, BRL, "Tudo o que foi pago: entrada, custos de aquisição, prestações, amortizações, quitação, tarifas, reformas, custos, tributos e energia solar");
        line("Renda líquida acumulada", m.netIncomeToDate, BRL, `${m.incomeMonths} meses com receita`);
        line("Payback até hoje", m.paybackPct, PCT, m.paybackReachedOn ? `Atingido em ${formatMonthKey(m.paybackReachedOn)}` : `Falta R$ ${m.remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
        line("Payback previsto", monthOrDash(m.paybackForecastMonth), undefined, m.monthsToPayback !== null ? `${m.monthsToPayback} meses · R$ ${m.monthlyNoiPace.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês (média de 12 meses)${m.forecastGrowthPctYear > 0 ? ` + ${m.forecastGrowthPctYear.toLocaleString("pt-BR")}% a.a. (reajuste histórico do aluguel)` : ""}` : undefined);
        line("Renda líquida últimos 12 meses", m.noi12m, BRL);
        line("Yield bruto sobre o valor de compra", m.grossYieldOnPrice, PCT, "12 × aluguel bruto atual ÷ valor de compra");
        line("Yield sobre custo", m.netYieldOnCost, PCT, "Renda líquida anualizada ÷ total investido");
        line("Cash-on-cash (12 m)", m.cashOnCash, PCT);
        line("TIR realizada (sem venda)", m.irrRealized, PCT);
        if (m.registerIptuUsed > 0) line("IPTU pago pelo proprietário (Tributos)", m.registerIptuUsed, BRL, "Contado no mês do pagamento");

        section("Valor de mercado e retornos");
        line("Valor de mercado", m.marketValue, BRL, m.marketValueSource ? `${VALUATION_SOURCE_LABELS[m.marketValueSource as keyof typeof VALUATION_SOURCE_LABELS] ?? m.marketValueSource} · ${m.marketValueOn?.split("-").reverse().join("/") ?? ""}` : "Sem avaliação");
        line("Valorização sobre o valor de compra", m.appreciationPct, PCT, m.appreciationGain !== null ? `R$ ${m.appreciationGain.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : undefined);
        line("Valorização ao ano (composta)", m.appreciationPctAnnual, PCT, "(valor de mercado ÷ valor de compra)^(1 ÷ anos) − 1");
        line("Saldo devedor", m.outstandingBalance, BRL);
        line("Patrimônio no imóvel", m.equity, BRL, "Valor de mercado − saldo devedor");
        line("Múltiplo (renda + patrimônio) ÷ investido", m.equityMultiple, "0.00\"×\"");
        line("Retorno total", m.totalReturn, BRL, m.totalReturnPct !== null ? `${m.totalReturnPct}% do investido` : undefined);
        line("TIR com valorização", m.irrWithValue, PCT, "Patrimônio como saída hoje (estimado)");
        line("Cap rate", m.capRate, PCT, "Renda líquida anualizada ÷ valor de mercado");

        section("Em valores de hoje (IPCA)");
        line("Investido", m.cashInvestedReal, BRL, m.ipcaAvailable ? `Corrigido até ${formatMonthKey(m.asOf)}` : "Série IPCA indisponível");
        line("Renda líquida acumulada", m.netIncomeToDateReal, BRL);
        line("Payback real", m.paybackPctReal, PCT);

        // ── Série mensal ────────────────────────────────────────────────
        const sm = wb.addWorksheet("Série mensal");
        sm.columns = [
            { header: "Mês", key: "month", width: 12 },
            { header: "Investido no mês", key: "invested", width: 18 },
            { header: "Prestações", key: "debt", width: 14 },
            { header: "Custos do imóvel", key: "running", width: 16 },
            { header: "Aluguel líquido", key: "net", width: 16 },
            { header: "Aluguel bruto", key: "gross", width: 14 },
            { header: "Excedente energia", key: "energy", width: 17 },
            { header: "Renda líquida (NOI)", key: "noi", width: 18 },
            { header: "Fluxo após prestações", key: "cf", width: 20 },
            { header: "Investido acumulado", key: "cumInv", width: 20 },
            { header: "Renda acumulada", key: "cumNoi", width: 18 },
            { header: "Falta para o payback", key: "rem", width: 20 },
            { header: "Investido acum. (hoje)", key: "cumInvReal", width: 22 },
            { header: "Renda acum. (hoje)", key: "cumNoiReal", width: 20 },
            { header: "Evento", key: "event", width: 14 },
        ];
        for (const p of m.series) {
            sm.addRow({ month: formatMonthKey(p.month), invested: p.invested, debt: p.debtService, running: p.runningCosts, net: p.netRent, gross: p.grossRent, energy: p.energySurplus, noi: p.noi, cf: p.cashFlow, cumInv: p.cumInvested, cumNoi: p.cumNoi, rem: Math.max(0, p.remaining), cumInvReal: p.cumInvestedReal ?? null, cumNoiReal: p.cumNoiReal ?? null, event: p.event === "QUITACAO" ? "Quitação" : p.event === "AMORTIZACAO" ? "Amortização" : "" });
        }
        for (const p of m.projection.slice(1)) sm.addRow({ month: formatMonthKey(p.month), cumInv: p.cumInvested, cumNoi: p.cumNoi, rem: Math.max(0, p.cumInvested - p.cumNoi), event: "projeção" });
        styleTable(sm, ["invested", "debt", "running", "net", "gross", "energy", "noi", "cf", "cumInv", "cumNoi", "rem", "cumInvReal", "cumNoiReal"]);

        // ── Receitas ────────────────────────────────────────────────────
        const sr = wb.addWorksheet("Receitas");
        sr.columns = [
            { header: "Mês", key: "month", width: 12 }, { header: "Unidade", key: "unit", width: 18 }, { header: "Aluguel bruto", key: "gross", width: 14 }, { header: "Taxa (%)", key: "pct", width: 10 },
            { header: "Aluguel líquido", key: "net", width: 15 }, { header: "Energia", key: "energy", width: 12 }, { header: "Recebido", key: "received", width: 13 },
            { header: "Custo de energia", key: "other", width: 16 }, { header: "Outras despesas", key: "otherExp", width: 16 }, { header: "Condomínio", key: "condo", width: 13 },
            { header: "NOI", key: "noi", width: 13 }, { header: "Status", key: "status", width: 12 }, { header: "Comentários", key: "notes", width: 40 },
        ];
        for (const r of incomeRows) {
            const b = breakdown(r);
            sr.addRow({ month: formatMonthKey(monthKey(r.month)), unit: r.unit_name ?? "", gross: b.grossRent, pct: b.feePct, net: b.netRent, energy: b.energy, received: b.received, other: b.other, otherExp: b.otherExpenses, condo: b.condo, noi: b.noi, status: r.status === "CONFIRMED" ? "Confirmado" : "Previsto", notes: r.notes ?? "" });
        }
        styleTable(sr, ["gross", "net", "energy", "received", "other", "otherExp", "condo", "noi"]);

        // ── Investimento ────────────────────────────────────────────────
        const si = wb.addWorksheet("Investimento");
        si.columns = [
            { header: "Data", key: "date", width: 12 }, { header: "Tipo", key: "kind", width: 22 }, { header: "Valor", key: "amount", width: 14 },
            { header: "Juros", key: "interest", width: 12 }, { header: "Amortização", key: "principal", width: 13 }, { header: "Seguro", key: "insurance", width: 11 },
            { header: "Origem", key: "source", width: 10 }, { header: "Comentários", key: "comment", width: 40 },
        ];
        for (const t of transactions) si.addRow({ date: t.occurred_on.split("-").reverse().join("/"), kind: KIND_LABELS[t.kind] ?? t.kind, amount: t.amount, interest: t.interest_part, principal: t.principal_part, insurance: t.insurance_part, source: t.source, comment: t.comment ?? "" });
        styleTable(si, ["amount", "interest", "principal", "insurance"]);

        // ── Tributos ────────────────────────────────────────────────────
        const st = wb.addWorksheet("Tributos");
        st.columns = [
            { header: "Ano", key: "year", width: 8 }, { header: "Tributo", key: "kind", width: 12 }, { header: "Valor", key: "amount", width: 14 },
            { header: "Pago por", key: "payer", width: 14 }, { header: "Parcelas", key: "parts", width: 10 }, { header: "Data", key: "date", width: 12 }, { header: "Comentários", key: "comment", width: 40 },
        ];
        for (const t of taxes) {
            const e = effectiveTax(t);
            st.addRow({ year: t.year, kind: TAX_KINDS.find(k => k.kind === t.kind)?.label ?? t.kind, amount: e.amount, payer: e.payer === "LANDLORD" ? "Proprietário" : e.payer === "TENANT" ? "Inquilino" : "Misto", parts: e.installments || 1, date: t.paid_on ? t.paid_on.split("-").reverse().join("/") : "", comment: t.comment ?? "" });
        }
        styleTable(st, ["amount"]);

        // ── Avaliações ──────────────────────────────────────────────────
        const sv = wb.addWorksheet("Avaliações");
        sv.columns = [{ header: "Data", key: "date", width: 12 }, { header: "Valor", key: "amount", width: 16 }, { header: "Fonte", key: "source", width: 24 }, { header: "Observação", key: "note", width: 60 }];
        for (const v of valuations) sv.addRow({ date: v.valued_on.split("-").reverse().join("/"), amount: v.amount, source: VALUATION_SOURCE_LABELS[v.source] ?? v.source, note: v.note ?? "" });
        styleTable(sv, ["amount"]);

        const buffer = Buffer.from(await wb.xlsx.writeBuffer());
        const slug = propertyName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "imovel";
        return new NextResponse(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="kitnets-relatorio-${slug}-${m.asOf}.xlsx"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[Report]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao gerar o relatório" }, { status: 500 });
    }
}

function styleTable(ws: ExcelJS.Worksheet, moneyKeys: string[]) {
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
    header.alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const key of moneyKeys) {
        const col = ws.getColumn(key);
        col.numFmt = BRL;
        col.alignment = { horizontal: "right" };
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}
