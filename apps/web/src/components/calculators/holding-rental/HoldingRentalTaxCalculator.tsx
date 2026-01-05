"use client";

import React, { useState, useMemo } from "react";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    ReferenceLine
} from "recharts";
import { Settings, AlertTriangle, Building2, ChevronDown, ChevronUp, Printer, Share2, Check, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dictionary } from "@/dictionaries";
import { useCalculatorLeadCapture } from "../../../hooks/useCalculatorLeadCapture";
import LeadCaptureModal from "../LeadCaptureModal";

// --- Types & Constants ---

type PeriodMode = 'monthly' | 'annual';

const COLORS = {
    irpjCsll: "#0ea5e9", // Sky 500
    cbs: "#f97316",      // Orange 500
    ibs: "#8b5cf6",      // Violet 500
    pis: "#f43f5e",      // Rose 500
    cofins: "#ef4444",   // Red 500
    effective: "#10b981" // Emerald 500
};

// Fixed rates for 2026-2028 (Law defined)
interface RateType {
    cbs: number;
    ibs: number;
    pis?: number;
    cofins?: number;
}

const FIXED_TRANSITION_RATES: Record<number, RateType> = {
    2026: { cbs: 0.9, ibs: 0.1, pis: 0.65, cofins: 3.00 },
    2027: { cbs: 8.7, ibs: 0.1, pis: 0, cofins: 0 },
    2028: { cbs: 8.7, ibs: 0.1, pis: 0, cofins: 0 },
};

// --- Helper Functions ---

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
};

const formatPercent = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value / 100);
};

export function HoldingRentalTaxCalculator({ lang }: { dict: Dictionary; lang: string }) {
    // --- State ---
    const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
    const [selectedYear, setSelectedYear] = useState<number>(2026);
    const [nominalIva, setNominalIva] = useState<number>(28.0);
    const [monthlyRevenues, setMonthlyRevenues] = useState<number[]>(Array(12).fill(0));
    const [annualRevenueInput, setAnnualRevenueInput] = useState<number>(0);
    const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);

    // Lead Capture Logic
    const {
        isModalOpen,
        setIsModalOpen,
        leadMetadata,
        checkAdvancedTrigger,
        checkExportTrigger,
        trackInteraction,
        hasVerifiedCookie
    } = useCalculatorLeadCapture({ isSimpleCalculator: false });

    const interactionCountRef = React.useRef(0);
    const [isCopied, setIsCopied] = useState(false);
    const [isTextCopied, setIsTextCopied] = useState(false);

    const handleInteraction = () => {
        if (hasVerifiedCookie) return;
        trackInteraction();
        interactionCountRef.current += 1;
        if (interactionCountRef.current === 6) {
            checkAdvancedTrigger();
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleCopyResults = () => {
        if (checkExportTrigger('copy')) return;

        const lines = [
            `RESUMO DA SIMULAÇÃO: HOLDING FAMILIAR (LUCRO PRESUMIDO)`,
            `Ano de Referência: ${selectedYear}`,
            ``,
            `RESULTADOS PRINCIPAIS`,
            `--------------------------------`,
            `Receita Bruta Anual: ${formatCurrency(annualTotals.revenue)}`,
            `Total de Impostos: ${formatCurrency(annualTotals.totalTax)}`,
            `Receita Líquida: ${formatCurrency(annualTotals.revenue - annualTotals.totalTax)}`,
            `Alíquota Efetiva: ${effectiveTaxRate.toFixed(2)}%`,
            ``,
            `DETALHAMENTO DOS IMPOSTOS`,
            `--------------------------------`,
            `1. IMPOSTOS SOBRE O LUCRO (IRPJ + CSLL)`,
            `   IRPJ Base (15%): ${formatCurrency(annualTotals.irpjBasic)}`,
            ...(annualTotals.irpjAdditional > 0 ? [`   IRPJ Adicional (10%): ${formatCurrency(annualTotals.irpjAdditional)}`] : []),
            `   CSLL (9%): ${formatCurrency(annualTotals.csll)}`,
            ``,
            `2. IVA DUAL (CONSUMO)`,
            `   CBS Federal (${rates.cbs.toFixed(2)}% nominal -> ${effectiveCbsRate.toFixed(2)}% efetiva): ${formatCurrency(annualTotals.cbs)}`,
            `   IBS Estadual/Mun. (${rates.ibs.toFixed(2)}% nominal -> ${effectiveIbsRate.toFixed(2)}% efetiva): ${formatCurrency(annualTotals.ibs)}`,
        ];

        if (showLegacy) {
            lines.push(
                ``,
                `3. TRIBUTOS LEGADOS (Transição 2026)`,
                `   PIS: ${formatCurrency(annualTotals.pis)}`,
                `   COFINS: ${formatCurrency(annualTotals.cofins)}`
            );
        }

        lines.push(
            ``,
            `TOTAL GERAL: ${formatCurrency(annualTotals.totalTax)} (${effectiveTaxRate.toFixed(2)}%)`,
            `--------------------------------`,
            `Calculado via kitnets.com.br`
        );

        const text = lines.join('\n');
        navigator.clipboard.writeText(text);
        setIsTextCopied(true);
        setTimeout(() => setIsTextCopied(false), 2000);
    };

    const handlePrint = () => {
        if (checkExportTrigger('print')) return;
        window.print();
    };

    // --- Logic ---

    // 1. Determine Nominal CBS/IBS for the selected year
    const getNominalRates = (year: number, targetTotalIva: number) => {
        // Target split for 2033 based on reference (CBS 8.8% / IBS 19.2% for 28% total)
        // We maintain the ratio if targetTotalIva changes.
        const refTotal = 28.0;
        const refCbs = 8.8;
        const refIbs = 19.2;

        const targetCbs2033 = (refCbs / refTotal) * targetTotalIva;
        const targetIbs2033 = (refIbs / refTotal) * targetTotalIva;

        if (year <= 2028) {

            return FIXED_TRANSITION_RATES[year];
        }

        if (year === 2033) {
            return { cbs: targetCbs2033, ibs: targetIbs2033 };
        }

        // Interpolation 2029-2032
        // Start (2028): CBS 8.7, IBS 0.1
        // End (2033): Target CBS, Target IBS
        const steps = 2033 - 2028; // 5 steps
        const currentStep = year - 2028;

        const startCbs = FIXED_TRANSITION_RATES[2028].cbs;
        const startIbs = FIXED_TRANSITION_RATES[2028].ibs;

        const cbs = startCbs + ((targetCbs2033 - startCbs) / steps) * currentStep;
        const ibs = startIbs + ((targetIbs2033 - startIbs) / steps) * currentStep;

        return { cbs, ibs, pis: 0, cofins: 0 };
    };

    const rates = useMemo(() => getNominalRates(selectedYear, nominalIva), [selectedYear, nominalIva]);

    // Check if Legacy Taxes are active (for UI logic)
    const showLegacy = (rates.pis || 0) > 0 || (rates.cofins || 0) > 0;

    // 2. Calculate Effective IVA Rates (70% reduction -> pay 30%)
    const EFFECTIVE_FACTOR = 0.30;
    const effectiveCbsRate = rates.cbs * EFFECTIVE_FACTOR;
    const effectiveIbsRate = rates.ibs * EFFECTIVE_FACTOR;

    // 3. Revenue Calculations
    const revenues = useMemo(() => {
        if (periodMode === 'annual') {
            const monthlyAvg = annualRevenueInput / 12;
            return Array(12).fill(monthlyAvg);
        }
        return monthlyRevenues;
    }, [periodMode, annualRevenueInput, monthlyRevenues]);

    const totalAnnualRevenue = revenues.reduce((a, b) => a + b, 0);

    // 4. Tax Calculations (Standard Presumed Profit)
    // Base Calculation: 32% of Gross Revenue
    const PRESUMED_PROFIT_BASE = 0.32;
    const IRPJ_RATE = 0.15;
    const CSLL_RATE = 0.09;
    const IRPJ_ADDITIONAL_RATE = 0.10;
    const IRPJ_ADDITIONAL_THRESHOLD = 20000; // Monthly

    const monthlyTaxes = revenues.map(revenue => {
        const presumedProfit = revenue * PRESUMED_PROFIT_BASE;

        // IRPJ Basic
        const irpjBasic = presumedProfit * IRPJ_RATE;

        // IRPJ Additional (Faixa 2)
        const excessRevenue = Math.max(0, revenue - IRPJ_ADDITIONAL_THRESHOLD);
        const excessPresumedProfit = excessRevenue * PRESUMED_PROFIT_BASE;
        const irpjAdditional = excessPresumedProfit * IRPJ_ADDITIONAL_RATE;

        // CSLL
        const csll = presumedProfit * CSLL_RATE;

        // PIS / COFINS (2026 Only)
        // PIS / COFINS (2026 Only)
        const pis = revenue * ((rates.pis || 0) / 100);
        const cofins = revenue * ((rates.cofins || 0) / 100);

        // IVA (IBS + CBS)
        const cbs = revenue * (effectiveCbsRate / 100);
        const ibs = revenue * (effectiveIbsRate / 100);

        return {
            revenue,
            irpjBasic,
            irpjAdditional,
            csll,
            cbs,
            ibs,
            pis,
            cofins,
            totalIva: cbs + ibs,
            totalIrpjCsll: irpjBasic + irpjAdditional + csll,
            totalLegacy: pis + cofins,
            totalTax: irpjBasic + irpjAdditional + csll + cbs + ibs + pis + cofins
        };
    });

    const annualTotals = monthlyTaxes.reduce((acc, curr) => ({
        revenue: acc.revenue + curr.revenue,
        irpjBasic: acc.irpjBasic + curr.irpjBasic,
        irpjAdditional: acc.irpjAdditional + curr.irpjAdditional,
        csll: acc.csll + curr.csll,
        cbs: acc.cbs + curr.cbs,
        ibs: acc.ibs + curr.ibs,
        pis: acc.pis + curr.pis,
        cofins: acc.cofins + curr.cofins,
        totalIva: acc.totalIva + curr.totalIva,
        totalIrpjCsll: acc.totalIrpjCsll + curr.totalIrpjCsll,
        totalLegacy: acc.totalLegacy + curr.totalLegacy,
        totalTax: acc.totalTax + curr.totalTax
    }), {
        revenue: 0, irpjBasic: 0, irpjAdditional: 0, csll: 0, cbs: 0, ibs: 0, pis: 0, cofins: 0, totalIva: 0, totalIrpjCsll: 0, totalLegacy: 0, totalTax: 0
    });

    // 5. Handlers
    const handleMonthlyRevenueChange = (index: number, value: string) => {
        const val = parseFloat(value.replace(/\D/g, '')) / 100;
        const newRevenues = [...monthlyRevenues];
        newRevenues[index] = val || 0;
        setMonthlyRevenues(newRevenues);
    };

    const handleAnnualRevenueChange = (value: string) => {
        const val = parseFloat(value.replace(/\D/g, '')) / 100;
        setAnnualRevenueInput(val || 0);
    };

    const effectiveTaxRate = annualTotals.revenue > 0 ? (annualTotals.totalTax / annualTotals.revenue) * 100 : 0;

    // Charts Data
    const taxCompositionData = [
        { name: 'IRPJ + CSLL', value: annualTotals.totalIrpjCsll, color: COLORS.irpjCsll },
        { name: 'CBS', value: annualTotals.cbs, color: COLORS.cbs },
        { name: 'IBS', value: annualTotals.ibs, color: COLORS.ibs },
        { name: 'PIS', value: annualTotals.pis, color: COLORS.pis },
        { name: 'COFINS', value: annualTotals.cofins, color: COLORS.cofins },
    ].filter(d => d.value > 0);

    // Timeline Data (2026-2033) for Line Chart
    const timelineData = Array.from({ length: 2033 - 2026 + 1 }, (_, i) => 2026 + i).map(year => {
        const r = getNominalRates(year, nominalIva);
        const effCbs = r.cbs * EFFECTIVE_FACTOR;
        const effIbs = r.ibs * EFFECTIVE_FACTOR;
        const nomPis = r.pis || 0;
        const nomCofins = r.cofins || 0;

        const ivaBurden = (effCbs + effIbs) / 100 * totalAnnualRevenue;
        const legacyBurden = (nomPis + nomCofins) / 100 * totalAnnualRevenue;

        const total = annualTotals.totalIrpjCsll + ivaBurden + legacyBurden;
        const rate = totalAnnualRevenue > 0 ? (total / totalAnnualRevenue) * 100 : 0;

        return {
            year,
            rate: parseFloat(rate.toFixed(2)),
            ivaRate: parseFloat((effCbs + effIbs).toFixed(2))
        };
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                        <Building2 className="h-6 w-6 text-primary shrink-0" />
                        <h2 className="text-2xl font-bold tracking-tight">Calculadora de Impostos: Holding Familiar (Lucro Presumido)</h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
                            {isCopied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                            {isCopied ? "Link Copiado" : "Link"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleCopyResults} className="gap-2">
                            {isTextCopied ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            {isTextCopied ? "Texto Copiado" : "Copiar Texto"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                            <Printer className="h-4 w-4" />
                            Imprimir
                        </Button>
                    </div>
                </div>
                <p className="text-muted-foreground">
                    Estime a carga tributária sobre aluguéis no novo sistema tributário (Reforma Tributária - IVA Dual).
                    Considera IRPJ, CSLL, IBS e CBS com as reduções legais.
                </p>

                <div className="mt-4 flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 p-3 rounded-md border border-yellow-200 dark:border-yellow-800">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Atenção: Simulador para fins educativos. Consulte seu contador antes de tomar decisões.</span>
                </div>
            </div>

            {/* Main Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* LEFT COLUMN: Controls & Scenario */}
                <div className="lg:col-span-4 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                Configuração do Cenário
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Timeline Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <Label>Ano de Referência: <span className="text-primary font-bold text-lg">{selectedYear}</span></Label>
                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                                        {selectedYear < 2029 ? "Transição Inicial" : selectedYear < 2033 ? "Transição Gradual" : "Implementação Total"}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="2026"
                                    max="2033"
                                    step="1"
                                    value={selectedYear}
                                    onChange={(e) => {
                                        setSelectedYear(parseInt(e.target.value));
                                        handleInteraction();
                                    }}
                                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>2026</span>
                                    <span>2033</span>
                                </div>
                            </div>

                            {/* Revenue Tabs */}
                            <div className="space-y-4">
                                <div className="flex p-1 bg-muted rounded-lg">
                                    <button
                                        onClick={() => {
                                            setPeriodMode('monthly');
                                            handleInteraction();
                                        }}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${periodMode === 'monthly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Receita Mensal
                                    </button>
                                    <button
                                        onClick={() => {
                                            setPeriodMode('annual');
                                            handleInteraction();
                                        }}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${periodMode === 'annual' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Receita Anual
                                    </button>
                                </div>

                                {periodMode === 'annual' ? (
                                    <div className="space-y-2">
                                        <Label>Receita Anual de Aluguel</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                                            <Input
                                                value={formatCurrency(annualRevenueInput).replace('R$', '').trim()}
                                                onChange={(e) => {
                                                    handleAnnualRevenueChange(e.target.value);
                                                    handleInteraction();
                                                }}
                                                className="pl-10"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            {monthlyRevenues.map((val, idx) => (
                                                <div key={idx} className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">{new Date(0, idx).toLocaleString(lang, { month: 'long' })}</Label>
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">R$</span>
                                                        <Input
                                                            value={formatCurrency(val).replace('R$', '').trim()}
                                                            onChange={(e) => {
                                                                handleMonthlyRevenueChange(idx, e.target.value);
                                                                handleInteraction();
                                                            }}
                                                            className="pl-6 h-8 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Advanced Toggle */}
                            <div className="pt-2">
                                <button
                                    onClick={() => {
                                        setShowAdvanced(!showAdvanced);
                                        handleInteraction();
                                    }}
                                    className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                                >
                                    {showAdvanced ? 'Ocultar Avançado' : 'Mostrar Avançado'}
                                    <Settings className="h-3 w-3" />
                                </button>

                                {showAdvanced && (
                                    <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4 animate-in slide-in-from-top-2">
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label>IVA Nominal (Padrão 28%)</Label>
                                                <span className="text-sm font-bold">{nominalIva.toFixed(1)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="26.5"
                                                max="28.0"
                                                step="0.1"
                                                value={nominalIva}
                                                onChange={(e) => {
                                                    setNominalIva(parseFloat(e.target.value));
                                                    handleInteraction();
                                                }}
                                                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                            />
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            <p>Divisão Nominal {selectedYear}:</p>
                                            <ul className="list-disc list-inside mt-1">
                                                <li>CBS: {rates.cbs.toFixed(2)}%</li>
                                                <li>IBS: {rates.ibs.toFixed(2)}%</li>
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>

                        </CardContent>
                    </Card>



                    {/* Scenario Summary - Fixed Panel */}
                    <div className="p-4 bg-muted/40 rounded-lg border text-sm text-muted-foreground">
                        <p className="font-semibold text-foreground mb-1">Cenário Atual:</p>
                        <p>Holding Familiar · Lucro Presumido · Locação</p>
                        <p>Ano de Referência: <span className="font-bold text-primary">{selectedYear}</span></p>
                    </div>
                </div>

                {/* RIGHT COLUMN: Results & Insights */}
                <div className="lg:col-span-8 space-y-8">

                    {/* Zone B: Key Results (KPIs) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 1. Receita Bruta */}
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Receita Bruta</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="text-xl font-bold">
                                    {formatCurrency(annualTotals.revenue)}
                                </div>
                            </CardContent>
                        </Card>

                        {/* 2. Total de Impostos */}
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Impostos</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
                                    {formatCurrency(annualTotals.totalTax)}
                                </div>
                            </CardContent>
                        </Card>

                        {/* 3. Receita Líquida (Highlighted) */}
                        <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-10">
                                <Building2 className="w-12 h-12 text-emerald-600" />
                            </div>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Receita Líquida</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight">
                                    {formatCurrency(annualTotals.revenue - annualTotals.totalTax)}
                                </div>
                            </CardContent>
                        </Card>

                        {/* 4. Alíquota Efetiva */}
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Alíquota Efetiva</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="text-2xl font-bold text-sky-600">
                                    {effectiveTaxRate.toFixed(2)}%
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Zone B.1: Grouped Tax Breakdown */}
                    <div className={showLegacy ? "grid grid-cols-1 md:grid-cols-3 gap-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
                        {/* Group 1: Taxes on Profit */}
                        <Card className="border-l-4 border-l-sky-500">
                            <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Sobre o Lucro</CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 pt-1 space-y-1">
                                <div className="text-lg font-bold text-sky-600">
                                    {formatCurrency(annualTotals.totalIrpjCsll)}
                                </div>
                                <div className="text-xs text-muted-foreground flex flex-col">
                                    <span>IRPJ: {formatCurrency(annualTotals.irpjBasic + annualTotals.irpjAdditional)}</span>
                                    <span>CSLL: {formatCurrency(annualTotals.csll)}</span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Group 2: Consumption Taxes (IVA) */}
                        <Card className="border-l-4 border-l-orange-500">
                            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Sobre Receita (IVA)</CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 pt-1 space-y-1">
                                <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                                    {formatCurrency(annualTotals.totalIva)}
                                </div>
                                <div className="text-xs text-muted-foreground flex flex-col">
                                    <div className="flex items-center gap-1">
                                        <span>CBS: {formatCurrency(annualTotals.cbs)}</span>
                                    </div>
                                    <span>IBS: {formatCurrency(annualTotals.ibs)}</span>
                                </div>
                                <span className="inline-flex items-center rounded-md bg-orange-50 dark:bg-orange-900/40 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-300 ring-1 ring-inset ring-orange-600/20">
                                    IVA Dual
                                </span>
                            </CardContent>
                        </Card>

                        {/* Group 3: Legacy Taxes */}
                        {showLegacy && (
                            <Card className="border-l-4 border-l-rose-500">
                                <CardHeader className="p-3 pb-1">
                                    <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Tributos Legados</CardTitle>
                                </CardHeader>
                                <CardContent className="p-3 pt-1 space-y-1">
                                    <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                                        {formatCurrency(annualTotals.totalLegacy)}
                                    </div>
                                    <div className="text-xs text-muted-foreground flex flex-col">
                                        <span>PIS: {formatCurrency(annualTotals.pis)}</span>
                                        <span>COFINS: {formatCurrency(annualTotals.cofins)}</span>
                                    </div>
                                    <span className="inline-flex items-center rounded-md bg-rose-50 dark:bg-rose-900/40 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20">
                                        Somente 2026
                                    </span>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Zone C: Charts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Composition Chart */}
                        <Card className="h-[280px]">
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm">Composição da Carga Tributária – {selectedYear}</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[220px] p-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={taxCompositionData}
                                            innerRadius={55}
                                            outerRadius={75}
                                            paddingAngle={4}
                                            dataKey="value"
                                        >
                                            {taxCompositionData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: number | undefined) => formatCurrency(value || 0)} />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        {/* Timeline Chart */}
                        <Card className="h-[280px]">
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm">Efeito da transição tributária (2026-2033)</CardTitle>
                                <p className="text-xs text-muted-foreground">Como a alíquota evolui com a substituição do PIS/COFINS pelo IVA</p>
                            </CardHeader>
                            <CardContent className="h-[200px] p-0 pr-4 mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={timelineData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.5} />
                                        <XAxis dataKey="year" fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                                        <YAxis unit="%" fontSize={11} domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                                            formatter={(value: number | undefined) => [formatPercent(value || 0), 'Alíquota Efetiva']}
                                            labelFormatter={(l) => `Ano ${l}`}
                                        />
                                        <ReferenceLine x={2026} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'top', value: 'Legacy', fontSize: 10, fill: '#ef4444' }} />
                                        <Line
                                            type="monotone"
                                            dataKey="rate"
                                            stroke={COLORS.effective}
                                            strokeWidth={3}
                                            dot={{ r: 4, strokeWidth: 0 }}
                                            activeDot={{ r: 6 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Contextual Alert */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4 flex gap-3 text-sm text-blue-800 dark:text-blue-300">
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold mb-1">Entenda a transição em 2026</p>
                            <p className="text-xs leading-relaxed opacity-90">
                                Em 2026, ocorre uma sobreposição de sistemas: o PIS/COFINS (Regime Antigo) ainda é cobrado integralmente,
                                enquanto o novo IVA (IBS + CBS) começa a ser aplicado com alíquotas reduzidas para teste.
                                A partir de 2027, PIS/COFINS são extintos para este regime, restando apenas o IVA progressivo.
                            </p>
                        </div>
                    </div>

                    {/* Zone D: Detailed Breakdown (Collapsible) */}
                    <div className="border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden">
                        <button
                            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                            className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
                        >
                            <span>Ver detalhamento completo dos impostos e base de cálculo</span>
                            {isDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {isDetailsOpen && (
                            <div className="p-0 border-t animate-in slide-in-from-top-2 duration-300">
                                <Table className="min-w-[1000px]">
                                    <TableHeader>
                                        <TableRow className="bg-muted/30 text-xs hover:bg-muted/30">
                                            <TableHead className="sticky left-0 z-20 bg-muted shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none">Tributo</TableHead>
                                            <TableHead>Base de Cálculo</TableHead>
                                            <TableHead>Alíquota Nominal</TableHead>
                                            <TableHead>Fator de Redução</TableHead>
                                            <TableHead>Alíquota Efetiva</TableHead>
                                            <TableHead className="text-right">Valor Anual</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="text-sm">
                                        {/* Group: Profit */}
                                        <TableRow className="bg-sky-50/50 dark:bg-sky-900/10">
                                            <TableCell className="py-2 text-xs font-semibold text-sky-700 dark:text-sky-400 sticky left-0 z-10 bg-sky-50 dark:bg-sky-900/20 shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">IMPOSTOS SOBRE O LUCRO (IRPJ + CSLL)</TableCell>
                                            <TableCell colSpan={5} />
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium sticky left-0 z-10 bg-card shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">IRPJ (Base)</TableCell>
                                            <TableCell>32% da Receita</TableCell>
                                            <TableCell>15%</TableCell>
                                            <TableCell>-</TableCell>
                                            <TableCell>4,80%</TableCell>
                                            <TableCell className="text-right">{formatCurrency(annualTotals.irpjBasic)}</TableCell>
                                        </TableRow>
                                        {annualTotals.irpjAdditional > 0 && (
                                            <TableRow>
                                                <TableCell className="font-medium sticky left-0 z-10 bg-card shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">IRPJ (Adicional)</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">Excedente R$ 20k/mês</TableCell>
                                                <TableCell>10%</TableCell>
                                                <TableCell>-</TableCell>
                                                <TableCell>-</TableCell>
                                                <TableCell className="text-right">{formatCurrency(annualTotals.irpjAdditional)}</TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow>
                                            <TableCell className="font-medium sticky left-0 z-10 bg-card shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">CSLL</TableCell>
                                            <TableCell>32% da Receita</TableCell>
                                            <TableCell>9%</TableCell>
                                            <TableCell>-</TableCell>
                                            <TableCell>2,88%</TableCell>
                                            <TableCell className="text-right">{formatCurrency(annualTotals.csll)}</TableCell>
                                        </TableRow>

                                        {/* Group: IVA */}
                                        <TableRow className="bg-orange-50/50 dark:bg-orange-900/10">
                                            <TableCell className="py-2 text-xs font-semibold text-orange-700 dark:text-orange-400 sticky left-0 z-10 bg-orange-50 dark:bg-orange-900/20 shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">IVA DUAL (CONSUMO)</TableCell>
                                            <TableCell colSpan={5} />
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium sticky left-0 z-10 bg-card shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">CBS (Federal)</TableCell>
                                            <TableCell>100% da Receita</TableCell>
                                            <TableCell>{rates.cbs.toFixed(2)}%</TableCell>
                                            <TableCell>Redução 70%</TableCell>
                                            <TableCell>{effectiveCbsRate.toFixed(2)}%</TableCell>
                                            <TableCell className="text-right">{formatCurrency(annualTotals.cbs)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium sticky left-0 z-10 bg-card shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">IBS (Estadual/Municipal)</TableCell>
                                            <TableCell>100% da Receita</TableCell>
                                            <TableCell>{rates.ibs.toFixed(2)}%</TableCell>
                                            <TableCell>Redução 70%</TableCell>
                                            <TableCell>{effectiveIbsRate.toFixed(2)}%</TableCell>
                                            <TableCell className="text-right">{formatCurrency(annualTotals.ibs)}</TableCell>
                                        </TableRow>

                                        {/* Group: Legacy */}
                                        {((rates.pis || 0) > 0 || (rates.cofins || 0) > 0) && (
                                            <>
                                                <TableRow className="bg-rose-50/50 dark:bg-rose-900/10">
                                                    <TableCell className="py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 sticky left-0 z-10 bg-rose-50 dark:bg-rose-900/20 shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">TRIBUTOS LEGADOS (TRANSICÃO 2026)</TableCell>
                                                    <TableCell colSpan={5} />
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell className="font-medium sticky left-0 z-10 bg-card shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">PIS</TableCell>
                                                    <TableCell>100% da Receita</TableCell>
                                                    <TableCell>{(rates.pis || 0).toFixed(2)}%</TableCell>
                                                    <TableCell>-</TableCell>
                                                    <TableCell>{(rates.pis || 0).toFixed(2)}%</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(annualTotals.pis)}</TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell className="font-medium sticky left-0 z-10 bg-card shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">COFINS</TableCell>
                                                    <TableCell>100% da Receita</TableCell>
                                                    <TableCell>{(rates.cofins || 0).toFixed(2)}%</TableCell>
                                                    <TableCell>-</TableCell>
                                                    <TableCell>{(rates.cofins || 0).toFixed(2)}%</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(annualTotals.cofins)}</TableCell>
                                                </TableRow>
                                            </>
                                        )}

                                        <TableRow className="font-bold border-t-2">
                                            <TableCell className="sticky left-0 z-10 bg-card shadow-[1px_0_0_0_rgba(0,0,0,0.1)] w-[160px] min-w-[160px] max-w-[160px] md:w-auto md:min-w-0 md:max-w-none whitespace-normal">TOTAL GERAL</TableCell>
                                            <TableCell>-</TableCell>
                                            <TableCell>-</TableCell>
                                            <TableCell>-</TableCell>
                                            <TableCell>{effectiveTaxRate.toFixed(2)}%</TableCell>
                                            <TableCell className="text-right">{formatCurrency(annualTotals.totalTax)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                                <div className="p-4 bg-muted/20 text-xs text-muted-foreground border-t">
                                    <p>* Base Presumida do IRPJ/CSLL é de 32% sobre a receita bruta na locação de imóveis.</p>
                                    <p>* A redução de 60% (original) passou para 70% no texto final da reforma para operações imobiliárias (redutor de ajuste).</p>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>
            <LeadCaptureModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                calculatorType="holding-rental-tax"
                leadMetadata={leadMetadata}
                forceCapture={true}
            />
        </div>
    );
}
