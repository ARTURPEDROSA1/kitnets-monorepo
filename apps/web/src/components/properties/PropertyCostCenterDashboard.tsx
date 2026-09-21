"use client";

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    TrendingUp,
    DollarSign,
    Percent,
    Building2,
    Home,
    Sun,
    Zap,
    FileText,
    AlertCircle,
    Users,
    Calendar,
    Sparkles,
    Shield,
    ExternalLink,
    PieChart as PieChartIcon,
    BarChart3,
} from 'lucide-react';
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { Button } from '@kitnets/ui';
import { cn } from '@/lib/utils';
import type { PropertyDetails, SubUnit } from '@/components/profile/PropertyDetailsCard';
import PropertyIncomeLedger from './PropertyIncomeLedger';
import PropertyInvestmentSection from './PropertyInvestmentSection';
import PropertyTaxesSection from './PropertyTaxesSection';
import PropertyInvestmentAnalysis from './PropertyInvestmentAnalysis';
import PeriodFilter, { GroupSelect } from './PeriodFilter';
import { RentHistoryModal } from './RentHistoryModal';
import PropertyLeaseCard from './PropertyLeaseCard';
import { CardInfoIcon, type TileInfo } from './Tile';
import {
    breakdown,
    currentMonthKey,
    filterRowsByPeriod,
    formatMonthKey,
    monthKey,
    type PropertyIncomeRow,
} from '@/lib/property-income';
import { groupMonthly, monthsBetween, periodLabel, periodRange, type ChartGroup, type PeriodFilterValue } from '@/lib/period-filter';
import type { PropertyInvestment, PropertyTransaction } from '@/lib/property-investment';
import { landlordIptuByMonth, landlordTaxTotals, type PropertyTax } from '@/lib/property-taxes';
import type { PropertyValuation } from '@/lib/property-valuations';

interface PropertyCostCenterDashboardProps {
    propertyIndex: number;
    /** `properties.id` — enables the real income ledger when present */
    dbId?: string;
    propertyType: 'single' | 'multi';
    details: PropertyDetails;
    subUnits: SubUnit[];
    address: {
        cep?: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        complement?: string;
        description?: string;
    };
    lang?: string;
    onBack: () => void;
    onQuickPublish: (mode: 'rent' | 'sale') => void;
    onUpdateDetails: (updatedDetails: PropertyDetails) => void;
}

const formatBRL = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const COLORS = ['#f43f5e', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4'];

export default function PropertyCostCenterDashboard({
    propertyIndex,
    dbId,
    propertyType,
    details,
    subUnits,
    address,
    lang = 'pt',
    onBack,
    onQuickPublish,
    onUpdateDetails,
}: PropertyCostCenterDashboardProps) {

    // Real monthly income from the ledger (fed by PropertyIncomeLedger)
    const [incomeRows, setIncomeRows] = useState<PropertyIncomeRow[]>([]);
    // True while the ledger fetches: KPIs and charts show a skeleton instead of estimates first
    const [incomeLoading, setIncomeLoading] = useState(Boolean(dbId));
    // Investment header + transactions (fed by PropertyInvestmentSection) and taxes (fed by PropertyTaxesSection) for the analysis
    const [investmentData, setInvestmentData] = useState<{ investment: PropertyInvestment | null; transactions: PropertyTransaction[]; loading: boolean }>({ investment: null, transactions: [], loading: Boolean(dbId) });
    const [taxRows, setTaxRows] = useState<PropertyTax[]>([]);
    // One request for every ledger of the property (auth + ownership once); sections fall back to their own fetches if it fails.
    type Overview = { income: PropertyIncomeRow[]; investment: PropertyInvestment | null; transactions: PropertyTransaction[]; taxes: PropertyTax[]; valuations: PropertyValuation[] };
    const [overview, setOverview] = useState<Overview | null | undefined>(dbId ? null : undefined);
    useEffect(() => {
        if (!dbId) { setOverview(undefined); return; }
        let cancelled = false;
        setOverview(null);
        fetch(`/api/properties/${dbId}/overview`)
            .then(async res => {
                const data = await res.json().catch(() => null);
                if (cancelled) return;
                if (!res.ok || !data) { setOverview(undefined); return; }
                setOverview({ income: data.income ?? [], investment: data.investment ?? null, transactions: data.transactions ?? [], taxes: data.taxes ?? [], valuations: data.valuations ?? [] });
            })
            .catch(() => { if (!cancelled) setOverview(undefined); });
        return () => { cancelled = true; };
    }, [dbId]);
    // Stable identity: a fresh object on every render would re-run the section's load effect and
    // overwrite edits the section already saved (rows only change when the overview is re-fetched).
    const preloadedInvestment = useMemo(
        () => (overview === undefined ? undefined : overview ? { investment: overview.investment, transactions: overview.transactions } : null),
        [overview]
    );
    useEffect(() => {
        setIncomeRows([]);
        setIncomeLoading(Boolean(dbId));
    }, [dbId]);
    // Period shared by the DRE chart and the income ledger (chart + table)
    const [period, setPeriod] = useState<PeriodFilterValue>({ kind: 'ytd' });   // DRE chart opens on the current year
    // YTD only: repeat the latest confirmed month until December so the chart shows the whole year
    const [forecastYear, setForecastYear] = useState(true);
    const [rentHistoryOpen, setRentHistoryOpen] = useState(false);
    /** Units of a multi-unit property: the income ledger then keeps one row per month and unit. */
    const ledgerUnits = useMemo(
        () => (propertyType === 'multi' ? subUnits.filter(u => u.id).map((u, i) => ({ id: u.id as string, name: u.name || `Kitnet ${i + 1}` })) : []),
        [propertyType, subUnits]
    );
    const formatBRL2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    /** Built area: Aquisição & financiamento, else the latest IPTU guide that has it. */
    const areaM2 = useMemo(() => {
        const own = Number(investmentData.investment?.built_area_m2) || 0;
        if (own > 0) return own;
        const fromIptu = [...taxRows].sort((a, b) => b.year - a.year).find(t => Number(t.area_construida) > 0);
        return fromIptu ? Number(fromIptu.area_construida) : null;
    }, [investmentData.investment, taxRows]);
    // DRE grouping: monthly bars, quarters, years, or one specific quarter of each year
    const [dreGroup, setDreGroup] = useState<ChartGroup>('month');


    const totalUnits = propertyType === 'multi'
        ? Math.max(details.numberOfUnits || 0, subUnits.length || 1)
        : 1;

    // Financial Analysis & Calculations
    const financials = useMemo(() => {
        let grossMonthlyRevenue = 0;
        let rentedUnitsCount = 0;

        if (propertyType === 'multi') {
            let sumRents = 0;
            subUnits.forEach((u) => {
                if (u.rentValue) {
                    const parsed = parseFloat(u.rentValue.replace(/[^\d.,]/g, '').replace(',', '.'));
                    if (!isNaN(parsed) && parsed > 0) {
                        sumRents += parsed;
                        rentedUnitsCount++;
                    }
                } else if (u.status === 'rented') {
                    rentedUnitsCount++;
                }
            });

            if (sumRents > 0) {
                grossMonthlyRevenue = sumRents;
            } else if (details.monthlyRentEstimate) {
                const parsed = parseFloat(details.monthlyRentEstimate.replace(/[^\d.,]/g, '').replace(',', '.'));
                grossMonthlyRevenue = isNaN(parsed) ? totalUnits * 1100 : parsed;
                rentedUnitsCount = totalUnits;
            } else {
                grossMonthlyRevenue = totalUnits * 1100;
                rentedUnitsCount = totalUnits;
            }
        } else {
            if (details.monthlyRentEstimate) {
                const parsed = parseFloat(details.monthlyRentEstimate.replace(/[^\d.,]/g, '').replace(',', '.'));
                grossMonthlyRevenue = isNaN(parsed) ? 2200 : parsed;
            } else {
                const beds = parseInt(details.bedrooms || '2', 10);
                grossMonthlyRevenue = (isNaN(beds) ? 2 : beds) * 750 + 600;
            }
            rentedUnitsCount = 1;
        }

        // ── Real data from the income ledger ──
        // KPI cards and the donut show the CURRENT result: the latest confirmed month.
        // They do not follow the chart period; only the DRE chart does.
        const confirmedAll = incomeRows
            .filter(r => r.status === 'CONFIRMED')
            .sort((a, b) => (a.month < b.month ? -1 : 1));
        const latest = confirmedAll.length ? confirmedAll[confirmedAll.length - 1] : null;
        const current = latest ? breakdown(latest) : null;
        const hasRealIncome = current !== null;

        if (current) {
            grossMonthlyRevenue = Math.round(current.revenue);   // gross rent + energy income
            if (propertyType === 'single') rentedUnitsCount = 1;
        }

        const range = periodRange(period);
        const periodRows = filterRowsByPeriod(incomeRows, range).sort((a, b) => (a.month < b.month ? -1 : 1));

        // Operational Expenses (OPEX) — estimates from "Ajustar Custos", used only without ledger data
        const iptuMonthly = details.iptuMonthly
            ? (parseFloat(details.iptuMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || 140)
            : 140;

        const condoMonthly = details.condoMonthly
            ? (parseFloat(details.condoMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || (propertyType === 'multi' ? totalUnits * 75 : 0))
            : (propertyType === 'multi' ? totalUnits * 75 : 0);

        const maintenanceReserve = details.maintenanceMonthly
            ? (parseFloat(details.maintenanceMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || Math.round(grossMonthlyRevenue * 0.05))
            : Math.round(grossMonthlyRevenue * 0.05);

        const adminFee = Math.round(grossMonthlyRevenue * (parseFloat(details.managementFeePercent || '8') / 100));

        const insuranceAndOther = details.otherExpensesMonthly
            ? (parseFloat(details.otherExpensesMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || 65)
            : 65;

        const estimatedExpenses = iptuMonthly + condoMonthly + maintenanceReserve + adminFee + insuranceAndOther;

        // With ledger data: OPEX = agency fee + energy cost + other expenses + landlord IPTU paid in the month (taxes register)
        const iptuByMonth = landlordIptuByMonth(taxRows);   // recurring tax only: ITBI and other one-off taxes are investment, not a monthly cost
        const iptuNow = latest ? (iptuByMonth.get(monthKey(latest.month)) ?? 0) : 0;
        const totalExpenses = current ? Math.round(current.opex + iptuNow) : estimatedExpenses;
        const noi = current ? Math.round(current.noi - iptuNow) : Math.max(0, grossMonthlyRevenue - totalExpenses);
        const margin = grossMonthlyRevenue > 0 ? (noi / grossMonthlyRevenue) * 100 : 0;

        // Occupancy: lifetime, from the ledger — months with rent ÷ months since the first record
        let occupancyRate = totalUnits > 0 ? Math.round((rentedUnitsCount / totalUnits) * 100) : 100;
        let occupancyHint = propertyType === 'multi'
            ? `${rentedUnitsCount}/${totalUnits} unidades ativas`
            : 'Imóvel ativo (estimativa)';
        const lifetime = incomeRows
            .filter(r => r.status === 'CONFIRMED' && monthKey(r.month) <= currentMonthKey())
            .sort((a, b) => (a.month < b.month ? -1 : 1));
        if (lifetime.length > 0) {
            const firstKey = monthKey(lifetime[0].month);
            const lastKey = monthKey(lifetime[lifetime.length - 1].month);
            // span = calendar months between the first and the last recorded month (same count the ledger shows)
            const span = monthsBetween(firstKey, lastKey) + 1;
            const occupied = lifetime.filter(r => breakdown(r).netRent > 0).length;
            occupancyRate = span > 0 ? Math.round((occupied / span) * 100) : 0;
            occupancyHint = `${occupied} de ${span} meses com aluguel · ${formatMonthKey(firstKey)} a ${formatMonthKey(lastKey)}`;
        }

        // Breakdown for Donut Chart
        const expenseBreakdown = current
            ? [
                { name: 'Taxa da imobiliária', value: Math.round(current.feeAmount) },
                { name: 'Custo de energia', value: Math.round(current.other) },
                { name: 'Outras despesas', value: Math.round(current.otherExpenses) },
                { name: 'Condomínio', value: Math.round(current.condo) },
                { name: 'IPTU', value: Math.round(iptuNow) },
            ].filter(item => item.value > 0)
            : [
                { name: 'IPTU', value: iptuMonthly },
                { name: 'Manutenção Predial', value: maintenanceReserve },
                { name: 'Taxa Administrativa', value: adminFee },
                { name: 'Condomínio / Áreas Comuns', value: condoMonthly },
                { name: 'Seguro & Outros', value: insuranceAndOther },
            ].filter(item => item.value > 0);

        // DRE data: every ledger month in the period (expected months drawn lighter), else a 6-month projection
        const dreData: { month: string; key?: string; receita: number; despesas: number; noi: number; previsto: boolean }[] = [];

        if (periodRows.length > 0) {
            periodRows.forEach((r) => {
                const b = breakdown(r);
                const iptu = iptuByMonth.get(monthKey(r.month)) ?? 0;
                dreData.push({
                    month: formatMonthKey(monthKey(r.month)),
                    key: monthKey(r.month),
                    receita: Math.round(b.revenue),
                    despesas: Math.round(b.opex + iptu),
                    noi: Math.round(b.noi - iptu),
                    previsto: r.status === 'EXPECTED',
                });
            });
            // YTD forecast: repeat the latest confirmed month for the months left until December
            if (period.kind === 'ytd' && forecastYear && current) {
                const year = currentMonthKey().slice(0, 4);
                let m = monthKey(periodRows[periodRows.length - 1].month);
                while (m.slice(0, 4) === year && m < `${year}-12`) {
                    const [y, mm] = m.split('-').map(Number);
                    m = `${y}-${String(mm + 1).padStart(2, '0')}`;
                    dreData.push({ month: formatMonthKey(m), key: m, receita: Math.round(current.revenue), despesas: Math.round(current.opex), noi: Math.round(current.noi), previsto: true });
                }
            }
        } else {
            const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            const currentMonthIdx = new Date().getMonth();
            for (let i = 0; i < 6; i++) {
                const mIdx = (currentMonthIdx - 3 + i + 12) % 12;
                // Slight variance for realistic historical/projection view
                const variance = 1 + (i === 1 ? -0.04 : i === 4 ? 0.03 : 0);
                const rec = Math.round(grossMonthlyRevenue * variance);
                const exp = Math.round(totalExpenses * (1 + (i === 2 ? 0.08 : 0)));
                dreData.push({
                    month: months[mIdx],
                    receita: rec,
                    despesas: exp,
                    noi: Math.max(0, rec - exp),
                    previsto: false,
                });
            }
        }

        // Group the monthly DRE by quarter / year / a specific quarter (real data only: the estimate has no month keys)
        const groupedDre = dreData.every(d => d.key)
            ? groupMonthly(dreData.map(d => ({ ...d, key: d.key! })), dreGroup)
            : dreData;

        return {
            realIncomeMonth: latest && hasRealIncome ? formatMonthKey(monthKey(latest.month)) : null,
            occupancyHint,
            grossMonthlyRevenue,
            currentGrossRent: current ? current.grossRent : null,
            annualRevenue: grossMonthlyRevenue * 12,
            totalExpenses,
            annualExpenses: totalExpenses * 12,
            noi,
            annualNoi: noi * 12,
            margin,
            occupancyRate,
            rentedUnitsCount,
            expenseBreakdown,
            dreData: groupedDre,
            // only the components that actually cost something this month, e.g. "Taxa + custo de energia"
            opexLabel: current
                ? ([['Taxa', current.feeAmount], ['custo de energia', current.other], ['outros', current.otherExpenses], ['condomínio', current.condo], ['IPTU', iptuNow]] as Array<[string, number]>)
                    .filter(([, v]) => v > 0).map(([n]) => n).join(' + ')
                : '',
            energyIncome: current ? current.energy : null,
            energyCost: current ? current.other : null,
            energyNet: current ? Math.round((current.energy - current.other) * 100) / 100 : null,
        };
    }, [propertyType, details, subUnits, totalUnits, incomeRows, taxRows, period, forecastYear, dreGroup]);

    // ── explanations for the five KPI cards (icon popup) ─────────────────
    const brl = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const kpiInfo: Record<'revenue' | 'opex' | 'noi' | 'occupancy' | 'energy', TileInfo> = {
        revenue: {
            what: 'Tudo o que o inquilino pagou no mês mais recente confirmado: o aluguel bruto (valor de contrato, antes da taxa da administradora) mais a parcela de energia.',
            formula: <>Receita bruta = aluguel bruto + energia recebida + condomínio pago pelo inquilino<br />Aluguel bruto = (recebido − energia − condomínio no depósito) ÷ (1 − taxa)<br />Valor m² = aluguel bruto ÷ área construída</>,
            example: financials.realIncomeMonth ? <>{brl(financials.currentGrossRent)} + {brl(financials.energyIncome)} = {brl(financials.grossMonthlyRevenue)} em {financials.realIncomeMonth}</> : undefined,
            note: 'Este card mostra o mês mais recente e não segue o período do gráfico. Clique no card para ver o histórico do aluguel.',
        },
        opex: {
            what: 'Custos operacionais do mês mais recente: taxa da administradora, custo de energia, outras despesas, condomínio e o IPTU que você pagou naquele mês (do registro Tributos do imóvel). Prestações do financiamento e reformas não entram: são investimento.',
            formula: 'OPEX = taxa da imobiliária + custo de energia + outras despesas + condomínio + IPTU pago no mês',
            example: financials.realIncomeMonth ? <>{financials.expenseBreakdown.map(i => `${i.name} ${brl(i.value)}`).join(' + ') || 'sem custos no mês'} = {brl(financials.totalExpenses)}<br />{((financials.totalExpenses / (financials.grossMonthlyRevenue || 1)) * 100).toFixed(0)}% da receita bruta</> : undefined,
        },
        noi: {
            what: 'Resultado operacional líquido: o que sobra da receita depois dos custos operacionais do mês. É a renda que paga o investimento (payback) e a base do yield e do cap rate.',
            formula: <>NOI = receita bruta − OPEX<br />Margem líquida = NOI ÷ receita bruta</>,
            example: financials.realIncomeMonth ? <>{brl(financials.grossMonthlyRevenue)} − {brl(financials.totalExpenses)} = {brl(financials.noi)} · margem {financials.margin.toFixed(0)}%</> : undefined,
        },
        occupancy: {
            what: propertyType === 'multi'
                ? 'Unidades com contrato ativo em relação ao total de unidades do imóvel.'
                : 'Meses em que houve aluguel em relação aos meses desde o primeiro registro de receita. Vacâncias derrubam o percentual.',
            formula: propertyType === 'multi' ? 'Ocupação = unidades ativas ÷ total de unidades' : 'Ocupação = meses com aluguel ÷ meses desde o primeiro registro',
            example: <>{financials.occupancyRate}% · {financials.occupancyHint}</>,
        },
        energy: {
            what: 'Resultado da energia no mês mais recente: o que o inquilino pagou de energia menos a conta de luz que você pagou. Com geração solar, essa diferença é a economia que o sistema gera.',
            formula: 'Energia líquida = energia recebida − custo de energia',
            example: financials.energyNet !== null ? <>{brl(financials.energyIncome)} − {brl(financials.energyCost)} = {brl(financials.energyNet)}</> : undefined,
            note: 'O investimento no sistema solar e quanto dele já voltou estão no card Energia solar de Investimento no imóvel.',
        },
    };


    const propertyTitle = details.propertyName?.trim()
        || (address.street ? `${address.street}${address.number ? `, ${address.number}` : ''}` : `Propriedade ${propertyIndex + 1}`);

    return (
        <div className="space-y-6 pb-6 border-b border-border/80">
            {/* Top Navigation Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onBack}
                    className="gap-2 text-muted-foreground hover:text-foreground self-start pl-0"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar para Todos os Imóveis
                </Button>

                {/* Quick Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        onClick={() => onQuickPublish('rent')}
                        className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs font-medium shadow-xs"
                    >
                        <Home className="w-3.5 h-3.5" />
                        Anunciar Aluguel
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => onQuickPublish('sale')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-medium shadow-xs"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Anunciar Venda
                    </Button>
                    <Link href={dbId ? `/${lang}/dashboard/energy/${dbId}` : `/${lang}/dashboard/energy`}>
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs font-medium text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        >
                            <Sun className="w-3.5 h-3.5" />
                            Gestão de Energia
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Property Summary Header Banner */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">
                            {propertyTitle}
                        </h2>
                        {propertyType === 'multi' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
                                <Building2 className="w-3.5 h-3.5 text-violet-500" />
                                Multifamiliar ({totalUnits} unidades)
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                                <Home className="w-3.5 h-3.5 text-blue-500" />
                                Unifamiliar
                            </span>
                        )}
                        {details.solarEnergy && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                <Sun className="w-3.5 h-3.5 text-amber-500" />
                                {details.solarKwp ? `Solar GD • ${details.solarKwp} kWp` : 'Solar GD Ativa'}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {[address.street, address.number, address.neighborhood, address.city, address.state, address.cep].filter(Boolean).join(', ') || 'Endereço não cadastrado'}
                    </p>
                </div>

            </div>

            {incomeLoading ? (
                <div className="space-y-6" aria-busy="true" aria-label="Carregando resultados do imóvel">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {[0, 1, 2, 3, 4].map(i => (
                            <div key={`kpi-skeleton-${i}`} className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-3 animate-pulse">
                                <div className="flex items-center justify-between">
                                    <div className="h-3 w-24 rounded bg-muted" />
                                    <div className="h-8 w-8 rounded-lg bg-muted/70" />
                                </div>
                                <div className="h-7 w-28 rounded bg-muted" />
                                <div className="h-3 w-full rounded bg-muted/70" />
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4 animate-pulse">
                            <div className="h-4 w-64 max-w-full rounded bg-muted" />
                            <div className="h-3 w-96 max-w-full rounded bg-muted/70" />
                            <div className="h-64 rounded-xl bg-muted/50" />
                        </div>
                        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4 animate-pulse">
                            <div className="h-4 w-48 max-w-full rounded bg-muted" />
                            <div className="h-3 w-56 max-w-full rounded bg-muted/70" />
                            <div className="h-64 rounded-xl bg-muted/50" />
                        </div>
                    </div>
                </div>
            ) : (
            <>
            {/* Row of KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* 1. Receita Bruta — with ledger data the card opens the rent history */}
                <div
                    className={`p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2 ${financials.realIncomeMonth ? 'cursor-pointer transition-colors hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500' : ''}`}
                    {...(financials.realIncomeMonth ? {
                        role: 'button', tabIndex: 0, title: 'Ver o histórico do aluguel',
                        onClick: () => setRentHistoryOpen(true),
                        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRentHistoryOpen(true); } },
                    } : {})}
                >
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wider">Receita Bruta</span>
                        <CardInfoIcon label="Receita Bruta" info={kpiInfo.revenue} className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600" icon={<TrendingUp className="w-4 h-4" />} />
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-foreground block">
                            {formatBRL(financials.grossMonthlyRevenue)}
                        </span>
                        <span className="text-xs text-muted-foreground block leading-snug">
                            {financials.realIncomeMonth ? <>
                                {financials.realIncomeMonth}: aluguel + energia
                                <br />Aluguel bruto: {formatBRL2(financials.currentGrossRent ?? 0)}
                                <br />Valor m²: {areaM2 && financials.currentGrossRent ? formatBRL2(financials.currentGrossRent / areaM2) : <span title="Informe a área construída em Aquisição & financiamento">informe a área</span>}
                                <br />Anual: {formatBRL(financials.annualRevenue)}
                                <span className="mt-1 flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><TrendingUp className="w-3 h-3" /> Ver histórico</span>
                            </> : `Projeção anual: ${formatBRL(financials.annualRevenue)}`}
                        </span>
                    </div>
                </div>

                {/* 2. Despesas Operacionais (OPEX) */}
                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wider">Despesas (OPEX)</span>
                        <CardInfoIcon label="Despesas (OPEX)" info={kpiInfo.opex} className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600" icon={<DollarSign className="w-4 h-4" />} />
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-rose-600 dark:text-rose-400 block">
                            {formatBRL(financials.totalExpenses)}
                        </span>
                        <span className="text-xs text-muted-foreground block leading-snug">
                            {financials.realIncomeMonth && financials.opexLabel && <>{financials.opexLabel}<br /></>}
                            {((financials.totalExpenses / (financials.grossMonthlyRevenue || 1)) * 100).toFixed(0)}% da receita bruta
                        </span>
                    </div>
                </div>

                {/* 3. Resultado Operacional Líquido (NOI) */}
                <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            Resultado Líquido (NOI)
                        </span>
                        <CardInfoIcon label="Resultado Líquido (NOI)" info={kpiInfo.noi} className="p-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700" icon={<Percent className="w-4 h-4" />} />
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 block">
                            {formatBRL(financials.noi)}
                        </span>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            Margem Líquida: {financials.margin.toFixed(0)}%
                        </span>
                    </div>
                </div>

                {/* 4. Taxa de Ocupação */}
                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wider">Ocupação</span>
                        <CardInfoIcon label="Ocupação" info={kpiInfo.occupancy} className="p-2 bg-violet-50 dark:bg-violet-950/40 text-violet-600" icon={<Users className="w-4 h-4" />} />
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-foreground block">
                            {financials.occupancyRate}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {financials.occupancyHint}
                        </span>
                    </div>
                </div>

                {/* 5. Energia Solar & Utilidades */}
                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wider">Energia & Solar</span>
                        <CardInfoIcon label="Energia & Solar" info={kpiInfo.energy} className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600" icon={<Sun className="w-4 h-4" />} />
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-foreground block">
                            {financials.energyNet !== null
                                ? formatBRL(financials.energyNet)
                                : details.solarEnergy ? (details.solarKwp ? `${details.solarKwp} kWp` : 'Ativa') : 'Rede Padrão'}
                        </span>
                        <span className="text-xs text-muted-foreground block leading-snug">
                            {financials.energyNet !== null ? (
                                <>
                                    Energia recebida {formatBRL(financials.energyIncome ?? 0)}<br />
                                    Custo de energia {formatBRL(financials.energyCost ?? 0)}<br />
                                    <span className="text-sm text-foreground">{details.solarEnergy ? (details.solarKwp ? `${details.solarKwp} kWp` : 'Solar GD ativa') : 'Sem geração local'}</span>
                                </>
                            ) : details.solarEnergy ? 'Compensação GD ativa' : 'Sem geração local'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Visual Interactive Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart 1: DRE Mensal (Receita vs Despesa vs NOI) */}
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                    <div className="space-y-3">
                        <div className="space-y-0.5">
                            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-emerald-600" />
                                Demonstrativo de Resultados (DRE Mensal)
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {financials.realIncomeMonth
                                    ? `Receita (aluguel bruto + energia + condomínio pago pelo inquilino), despesas (taxa + custo de energia + outras + condomínio + IPTU pago por você no mês) e NOI reais · ${periodLabel(period)}; meses previstos em tom claro`
                                    : 'Histórico e projeção de Receitas, Despesas Operacionais e Lucro Líquido (NOI)'}
                            </p>
                        </div>
                        {/* toolbar on its own full-width row: the title never gets squeezed when the month pickers appear */}
                        <div className="flex flex-col items-start gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <PeriodFilter value={period} onChange={setPeriod} variant="compact" />
                                {financials.realIncomeMonth && (
                                    <GroupSelect value={dreGroup} onChange={setDreGroup} title="Agrupar o DRE" />
                                )}
                            </div>
                            {period.kind === 'ytd' && financials.realIncomeMonth && (
                                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                    <input type="checkbox" className="accent-emerald-600" checked={forecastYear} onChange={e => setForecastYear(e.target.checked)} />
                                    Projetar até dezembro (repete {financials.realIncomeMonth})
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="h-[280px] w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={financials.dreData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                                <YAxis
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={12}
                                    tickLine={false}
                                    tickFormatter={(val) => `R$ ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                                />
                                <RechartsTooltip
                                    formatter={(value: any, name: any) => [formatBRL(Number(value)), String(name ?? '')]}
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        borderRadius: '12px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                                <Bar dataKey="receita" name="Receita Bruta" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32}>
                                    {financials.dreData.map((d, i) => (
                                        <Cell key={`rec-${i}`} fill="#10b981" fillOpacity={d.previsto ? 0.35 : 1} />
                                    ))}
                                </Bar>
                                <Bar dataKey="despesas" name="Despesas (OPEX)" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={32}>
                                    {financials.dreData.map((d, i) => (
                                        <Cell key={`exp-${i}`} fill="#f43f5e" fillOpacity={d.previsto ? 0.35 : 1} />
                                    ))}
                                </Bar>
                                <Line
                                    type="monotone"
                                    dataKey="noi"
                                    name="Resultado Líquido (NOI)"
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    dot={financials.dreData.length > 24 ? false : { r: 4 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Chart 2: Composição do Centro de Custos (Donut) */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
                    <div className="space-y-0.5">
                        <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                            <PieChartIcon className="w-4 h-4 text-amber-600" />
                            Composição do Centro de Custos
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {financials.realIncomeMonth
                                ? `Despesas do mês atual (${financials.realIncomeMonth}) — não segue o período do gráfico`
                                : 'Distribuição percentual das despesas operacionais'}
                        </p>
                    </div>

                    <div className="h-[200px] w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={financials.expenseBreakdown}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={3}
                                    dataKey="value"
                                    nameKey="name"
                                >
                                    {financials.expenseBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    formatter={(value, name) => [formatBRL(Number(value)), String(name)]}   // the slice's cost description, e.g. Taxa da imobiliária
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        borderRadius: '12px',
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs">
                        {financials.expenseBreakdown.map((item, idx) => (
                            <div key={item.name} className="flex items-center justify-between text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                    {item.name}
                                </span>
                                <span className="font-semibold text-foreground">{formatBRL(item.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            </>
            )}

            {/* Lease at a glance: term, due date, adjustment index and links (below the DRE row) */}
            <PropertyLeaseCard propertyId={dbId} lang={lang} />

            {/* Real income ledger (monthly, editable, importable) */}
            <PropertyIncomeLedger
                propertyId={dbId}
                defaultAgencyFeePct={details.managementFeePercent ? parseFloat(details.managementFeePercent) || 0 : 0}
                onRowsChange={setIncomeRows}
                onLoadingChange={setIncomeLoading}
                preloadedRows={overview === undefined ? undefined : overview?.income ?? null}
                units={ledgerUnits}
            />

            {/* Payback, forecast, yields and IRR from the three ledgers */}
            <PropertyInvestmentAnalysis
                propertyId={dbId}
                bedrooms={details.bedrooms}
                investment={investmentData.investment}
                transactions={investmentData.transactions}
                incomeRows={incomeRows}
                taxes={taxRows}
                loading={incomeLoading || investmentData.loading}
                preloadedValuations={overview === undefined ? undefined : overview?.valuations ?? null}
            />

            {/* Investment ledger: acquisition, financing, capex, running costs, solar */}
            <PropertyInvestmentSection propertyId={dbId} incomeRows={incomeRows} landlordTaxes={landlordTaxTotals(taxRows)} onDataChange={setInvestmentData} preloaded={preloadedInvestment} />

            {/* Property taxes register: the source of IPTU (landlord payments count in the month paid) */}
            <RentHistoryModal isOpen={rentHistoryOpen} onClose={() => setRentHistoryOpen(false)} rows={incomeRows} areaM2={areaM2} />

            <PropertyTaxesSection propertyId={dbId} onRowsChange={setTaxRows} preloadedRows={overview === undefined ? undefined : overview?.taxes ?? null} />

            {/* Multifamily Units Summary (if applicable) */}
            {propertyType === 'multi' && subUnits.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-violet-600" />
                                Visão das Unidades & Contratos ({subUnits.length} Kitnets/Unidades)
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Status de locação e receita individual de cada kitnet/unidade deste centro de custos
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {subUnits.map((unit, uIdx) => {
                            const rentVal = unit.rentValue ? parseFloat(unit.rentValue.replace(/[^\d.,]/g, '').replace(',', '.')) : null;
                            const isRented = Boolean(rentVal && rentVal > 0) || unit.status === 'rented';

                            return (
                                <div
                                    key={uIdx}
                                    className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-2 hover:border-violet-300 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-sm text-foreground">{unit.name || `Kitnet ${uIdx + 1}`}</span>
                                        <span className={cn(
                                            "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                            isRented
                                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                        )}>
                                            {isRented ? 'Alugada' : 'Disponível'}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground space-y-0.5">
                                        <p>
                                            Aluguel:{' '}
                                            <span className="font-bold text-foreground">
                                                {rentVal ? formatBRL(rentVal) : 'R$ 1.100 (Est.)'}
                                            </span>
                                            /mês
                                        </p>
                                        <p className="text-[11px] truncate">
                                            {unit.sqMeters ? `${unit.sqMeters} m²` : 'Metragem a preencher'} · {unit.bedrooms || '1'} quarto(s)
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
    );
}
