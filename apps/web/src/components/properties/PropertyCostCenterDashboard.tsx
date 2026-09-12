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
    Settings,
    CheckCircle2,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PropertyDetails, SubUnit } from '@/components/profile/PropertyDetailsCard';
import PropertyIncomeLedger from './PropertyIncomeLedger';
import { breakdown, formatMonthKey, monthKey, summarize, type PropertyIncomeRow } from '@/lib/property-income';

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
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    // Real monthly income from the ledger (fed by PropertyIncomeLedger)
    const [incomeRows, setIncomeRows] = useState<PropertyIncomeRow[]>([]);
    useEffect(() => setIncomeRows([]), [dbId]);
    const incomeSummary = useMemo(() => summarize(incomeRows), [incomeRows]);

    // Form state for configuring cost center parameters
    const [configForm, setConfigForm] = useState({
        monthlyRentEstimate: details.monthlyRentEstimate || '',
        iptuMonthly: details.iptuMonthly || '',
        condoMonthly: details.condoMonthly || '',
        maintenanceMonthly: details.maintenanceMonthly || '',
        managementFeePercent: details.managementFeePercent || '8',
        otherExpensesMonthly: details.otherExpensesMonthly || '',
    });

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

        // Real income (latest confirmed month in the ledger) overrides the estimate
        const real = incomeSummary.latest;
        const hasRealIncome = Boolean(real && real.grossRent > 0);
        if (real && hasRealIncome) {
            grossMonthlyRevenue = real.grossRent;
            if (propertyType === 'single') rentedUnitsCount = 1;
        }

        // Operational Expenses (OPEX)
        const iptuMonthly = details.iptuMonthly
            ? (parseFloat(details.iptuMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || 140)
            : 140;

        const condoMonthly = details.condoMonthly
            ? (parseFloat(details.condoMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || (propertyType === 'multi' ? totalUnits * 75 : 0))
            : (propertyType === 'multi' ? totalUnits * 75 : 0);

        const maintenanceReserve = details.maintenanceMonthly
            ? (parseFloat(details.maintenanceMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || Math.round(grossMonthlyRevenue * 0.05))
            : Math.round(grossMonthlyRevenue * 0.05);

        const adminFee = real && hasRealIncome
            ? Math.round(real.feeAmount)
            : Math.round(grossMonthlyRevenue * (parseFloat(details.managementFeePercent || '8') / 100));

        const insuranceAndOther = details.otherExpensesMonthly
            ? (parseFloat(details.otherExpensesMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || 65)
            : 65;

        const totalExpenses = iptuMonthly + condoMonthly + maintenanceReserve + adminFee + insuranceAndOther;
        const noi = Math.max(0, grossMonthlyRevenue - totalExpenses);
        const margin = grossMonthlyRevenue > 0 ? (noi / grossMonthlyRevenue) * 100 : 0;
        const occupancyRate = totalUnits > 0 ? Math.round((rentedUnitsCount / totalUnits) * 100) : 100;

        // Breakdown for Donut Chart
        const expenseBreakdown = [
            { name: 'IPTU', value: iptuMonthly },
            { name: 'Manutenção Predial', value: maintenanceReserve },
            { name: 'Taxa Administrativa', value: adminFee },
            { name: 'Condomínio / Áreas Comuns', value: condoMonthly },
            { name: 'Seguro & Outros', value: insuranceAndOther },
        ].filter(item => item.value > 0);

        // DRE data: real months from the income ledger when available, else a 6-month projection
        const dreData: { month: string; receita: number; despesas: number; noi: number }[] = [];
        const confirmedIncome = incomeRows
            .filter(r => r.status === 'CONFIRMED')
            .sort((a, b) => (a.month < b.month ? -1 : 1))
            .slice(-6);

        if (confirmedIncome.length > 0) {
            const fixedExpenses = totalExpenses - adminFee;
            confirmedIncome.forEach((r) => {
                const b = breakdown(r);
                const rec = Math.round(b.grossRent);
                const exp = Math.round(fixedExpenses + b.feeAmount);
                dreData.push({
                    month: formatMonthKey(monthKey(r.month)),
                    receita: rec,
                    despesas: exp,
                    noi: rec - exp,
                });
            });
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
                });
            }
        }

        return {
            realIncomeMonth: real && hasRealIncome ? formatMonthKey(monthKey(real.month)) : null,
            grossMonthlyRevenue,
            annualRevenue: grossMonthlyRevenue * 12,
            totalExpenses,
            annualExpenses: totalExpenses * 12,
            noi,
            annualNoi: noi * 12,
            margin,
            occupancyRate,
            rentedUnitsCount,
            expenseBreakdown,
            dreData,
        };
    }, [propertyType, details, subUnits, totalUnits, incomeSummary, incomeRows]);

    const handleSaveConfig = () => {
        const updated = {
            ...details,
            monthlyRentEstimate: configForm.monthlyRentEstimate,
            iptuMonthly: configForm.iptuMonthly,
            condoMonthly: configForm.condoMonthly,
            maintenanceMonthly: configForm.maintenanceMonthly,
            managementFeePercent: configForm.managementFeePercent,
            otherExpensesMonthly: configForm.otherExpensesMonthly,
        };
        onUpdateDetails(updated);
        setIsConfigOpen(false);
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
                    <Link href={`/${lang}/dashboard/energy`}>
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs font-medium text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        >
                            <Sun className="w-3.5 h-3.5" />
                            Gestão de Energia
                        </Button>
                    </Link>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsConfigOpen(true)}
                        className="gap-1.5 text-xs font-medium"
                    >
                        <Settings className="w-3.5 h-3.5" />
                        Ajustar Custos
                    </Button>
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

                <div className="flex items-center gap-4 bg-muted/40 dark:bg-muted/20 px-4 py-2.5 rounded-xl border border-border/80 self-start md:self-auto">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Centro de Custos
                        </span>
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ativo e Individualizado
                        </span>
                    </div>
                </div>
            </div>

            {/* Row of KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* 1. Receita Bruta */}
                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wider">Receita Bruta</span>
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-foreground block">
                            {formatBRL(financials.grossMonthlyRevenue)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {financials.realIncomeMonth ? `Real (${financials.realIncomeMonth}) · anual: ` : 'Projeção anual: '}
                            {formatBRL(financials.annualRevenue)}
                        </span>
                    </div>
                </div>

                {/* 2. Despesas Operacionais (OPEX) */}
                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wider">Despesas (OPEX)</span>
                        <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600">
                            <DollarSign className="w-4 h-4" />
                        </div>
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-rose-600 dark:text-rose-400 block">
                            {formatBRL(financials.totalExpenses)}
                        </span>
                        <span className="text-xs text-muted-foreground">
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
                        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700">
                            <Percent className="w-4 h-4" />
                        </div>
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
                        <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600">
                            <Users className="w-4 h-4" />
                        </div>
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-foreground block">
                            {financials.occupancyRate}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {propertyType === 'multi'
                                ? `${financials.rentedUnitsCount}/${totalUnits} unidades ativas`
                                : 'Imóvel ativo'}
                        </span>
                    </div>
                </div>

                {/* 5. Energia Solar & Utilidades */}
                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wider">Energia & Solar</span>
                        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600">
                            <Sun className="w-4 h-4" />
                        </div>
                    </div>
                    <div>
                        <span className="text-xl sm:text-2xl font-bold text-foreground block">
                            {details.solarEnergy ? (details.solarKwp ? `${details.solarKwp} kWp` : 'Ativa') : 'Rede Padrão'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {details.solarEnergy ? 'Compensação GD ativa' : 'Sem geração local'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Visual Interactive Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart 1: DRE Mensal (Receita vs Despesa vs NOI) */}
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-emerald-600" />
                                Demonstrativo de Resultados (DRE Mensal)
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {financials.realIncomeMonth
                                    ? 'Receita real dos últimos meses registrados; despesas conforme os parâmetros do centro de custos'
                                    : 'Histórico e projeção de Receitas, Despesas Operacionais e Lucro Líquido (NOI)'}
                            </p>
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
                                    formatter={(value: any) => [formatBRL(Number(value)), '']}
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        borderRadius: '12px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                                <Bar dataKey="receita" name="Receita Bruta" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                <Bar dataKey="despesas" name="Despesas (OPEX)" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                <Line type="monotone" dataKey="noi" name="Resultado Líquido (NOI)" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
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
                            Distribuição percentual das despesas operacionais
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
                                >
                                    {financials.expenseBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    formatter={(value: any) => [formatBRL(Number(value)), 'Valor Mensal']}
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

            {/* Real income ledger (monthly, editable, importable) */}
            <PropertyIncomeLedger
                propertyId={dbId}
                defaultAgencyFeePct={details.managementFeePercent ? parseFloat(details.managementFeePercent) || 0 : 0}
                onRowsChange={setIncomeRows}
            />

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

            {/* Modal: Configurar Centro de Custos */}
            <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Settings className="w-5 h-5 text-amber-600" />
                            Ajustar Centro de Custos do Imóvel
                        </DialogTitle>
                        <DialogDescription>
                            Personalize os valores financeiros deste imóvel para recalcular o NOI, projeções e métricas analíticas.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Receita de Aluguel Estimada / Base (R$/mês)</Label>
                            <Input
                                placeholder="Ex: 2400.00"
                                value={configForm.monthlyRentEstimate}
                                onChange={(e) => setConfigForm(prev => ({ ...prev, monthlyRentEstimate: e.target.value }))}
                            />
                            <span className="text-[11px] text-muted-foreground">
                                {propertyType === 'multi' ? 'Caso as kitnets não tenham valores individuais preenchidos' : 'Valor mensal total estimado'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>IPTU Mensal (R$)</Label>
                                <Input
                                    placeholder="Ex: 140.00"
                                    value={configForm.iptuMonthly}
                                    onChange={(e) => setConfigForm(prev => ({ ...prev, iptuMonthly: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Condomínio (R$)</Label>
                                <Input
                                    placeholder="Ex: 250.00"
                                    value={configForm.condoMonthly}
                                    onChange={(e) => setConfigForm(prev => ({ ...prev, condoMonthly: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Reserva Manutenção (R$)</Label>
                                <Input
                                    placeholder="Ex: 150.00"
                                    value={configForm.maintenanceMonthly}
                                    onChange={(e) => setConfigForm(prev => ({ ...prev, maintenanceMonthly: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Taxa Adm Imobiliária (%)</Label>
                                <Input
                                    placeholder="Ex: 8"
                                    value={configForm.managementFeePercent}
                                    onChange={(e) => setConfigForm(prev => ({ ...prev, managementFeePercent: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Seguro Predial / Outras Despesas (R$/mês)</Label>
                            <Input
                                placeholder="Ex: 65.00"
                                value={configForm.otherExpensesMonthly}
                                onChange={(e) => setConfigForm(prev => ({ ...prev, otherExpensesMonthly: e.target.value }))}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsConfigOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveConfig} className="bg-amber-600 hover:bg-amber-700 text-white">
                            Salvar Parâmetros
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
