"use client";

import * as React from "react";
import { Calculator, Coins, TrendingUp, AlertTriangle, Info, Printer, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis
} from "recharts";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useCalculatorLeadCapture } from "@/hooks/useCalculatorLeadCapture";
import LeadCaptureModal from "@/components/calculators/LeadCaptureModal";

import { Dictionary } from "@/dictionaries";

const MoneyInput = ({ value, onChange, className, ...props }: { value: number | string, onChange: (value: number | string) => void, className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) => {
    const displayValue = React.useMemo(() => {
        if (value === "" || value === undefined || value === null) return "";
        const num = Number(value);
        if (isNaN(num)) return "";
        return num.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, "");
        if (raw === "") {
            onChange("");
            return;
        }
        const val = Number(raw) / 100;
        onChange(val);
    };

    return (
        <div className={`relative w-full ${className || ''}`}>
            <span className="absolute left-3 top-0 h-full flex items-center text-muted-foreground pointer-events-none">R$</span>
            <Input
                type="text"
                inputMode="numeric"
                value={displayValue}
                onChange={handleChange}
                className="pl-9"
                {...props}
            />
        </div>
    );
};

export function FinancialIndependenceCalculator({ dict, lang }: { dict: Dictionary; lang: string }) {
    const t = dict.financialIndependenceCalculator?.inputs;
    const r = dict.financialIndependenceCalculator?.results;
    const v = dict.financialIndependenceCalculator?.validation;
    const tooltips = dict.financialIndependenceCalculator?.tooltips;
    const chartLabels = dict.financialIndependenceCalculator?.charts;
    const tableLabels = dict.financialIndependenceCalculator?.tables;
    const disclaimer = dict.financialIndependenceCalculator?.disclaimer;
    const edu = dict.financialIndependenceCalculator?.educationalContent;
    const tCapture = dict.leadCapture;



    // Lead Capture Hook
    const {
        isModalOpen,
        setIsModalOpen,
        leadMetadata,
        trackInteraction,
        checkAdvancedTrigger,
        checkExportTrigger
    } = useCalculatorLeadCapture({
        calculatorType: "calculadora-independencia-financeira",
        isSimpleCalculator: false
    });

    const interactionCountRef = React.useRef(0);
    const lastInteractedFieldRef = React.useRef<string | null>(null);

    const handleInteraction = (fieldId: string) => {
        trackInteraction();

        // Only increment counter if switching fields
        if (lastInteractedFieldRef.current !== fieldId) {
            interactionCountRef.current += 1;
            lastInteractedFieldRef.current = fieldId;
        }

        // Trigger on 4th interaction (allow 3 free)
        if (interactionCountRef.current >= 4) {
            checkAdvancedTrigger();
        }
    };


    // State
    const [initialCapital, setInitialCapital] = React.useState<string>("5000");
    const [monthlyContribution, setMonthlyContribution] = React.useState<string>("1000");
    const [annualContributionIncrease, setAnnualContributionIncrease] = React.useState<string>("5");
    const [years, setYears] = React.useState<string>("30");
    const [nominalReturn, setNominalReturn] = React.useState<string>("12");
    const [inflation, setInflation] = React.useState<string>("4");
    // taxRate state removed, now derived from years
    const [withdrawalYears, setWithdrawalYears] = React.useState<string>("30");

    // For Phase 2 input, prompt implies reusing return/inflation or asking for specific withdrawal return?
    // Current V1 implementation asks for "Retorno Real Aposentadoria".
    const [withdrawalRealReturnAnnual, setWithdrawalRealReturnAnnual] = React.useState<string>("4");

    // Toggle
    const [isRealMode, setIsRealMode] = React.useState<boolean>(true);
    const [sortConfig, setSortConfig] = React.useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [sortWithdrawalConfig, setSortWithdrawalConfig] = React.useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    // Parsed values
    const initialCapitalVal = parseFloat(initialCapital) || 0;
    const monthlyContributionVal = parseFloat(monthlyContribution) || 0;
    const yearsVal = parseFloat(years) || 0;
    const nominalReturnVal = parseFloat(nominalReturn) || 0;
    const inflationVal = parseFloat(inflation) || 0;

    // Derived Tax Rate (Regressive Table)
    const calculatedTaxRate = React.useMemo(() => {
        if (yearsVal <= 0.5) return 22.5; // Up to 180 days
        if (yearsVal <= 1.0) return 20.0; // 181 to 360 days
        if (yearsVal <= 2.0) return 17.5; // 361 to 720 days
        return 15.0; // Above 720 days
    }, [yearsVal]);

    const taxRateVal = calculatedTaxRate;
    const withdrawalYearsVal = parseFloat(withdrawalYears) || 0;
    const withdrawalRealReturnAnnualVal = parseFloat(withdrawalRealReturnAnnual) || 0;
    const annualContributionIncreaseVal = parseFloat(annualContributionIncrease) || 0;

    // Derived Rates
    const realAnnualRate = ((1 + nominalReturnVal / 100) / (1 + inflationVal / 100)) - 1;
    const realMonthlyRate = Math.pow(1 + realAnnualRate, 1 / 12) - 1;

    const nominalMonthlyRate = Math.pow(1 + nominalReturnVal / 100, 1 / 12) - 1;

    // Effective Rate for Accumulation Phase based on Mode
    const accumulationMonthlyRate = isRealMode ? realMonthlyRate : nominalMonthlyRate;

    // Effective Rate for Withdrawal Phase
    const withdrawalRealMonthlyInput = Math.pow(1 + withdrawalRealReturnAnnualVal / 100, 1 / 12) - 1;

    // Actually simpler: (1 + annualReal)*(1+annualInflation) - 1 = annualNominal
    const withdrawalNominalAnnualDerived = ((1 + withdrawalRealReturnAnnualVal / 100) * (1 + inflationVal / 100)) - 1;
    const withdrawalNominalMonthly = Math.pow(1 + withdrawalNominalAnnualDerived, 1 / 12) - 1;

    const withdrawalMonthlyRate = isRealMode ? withdrawalRealMonthlyInput : withdrawalNominalMonthly;

    // --- Calculations ---

    const months = yearsVal * 12;
    const wdMonths = withdrawalYearsVal * 12;

    // Accumulation Arrays
    const accumulationData: { month: number; year: number; balance: number; principal: number; contributions: number; interest: number }[] = [];
    let currentBalance = initialCapitalVal;
    let currentPrincipal = initialCapitalVal;

    accumulationData.push({
        month: 0,
        year: 0,
        balance: currentBalance,
        principal: currentPrincipal,
        contributions: 0,
        interest: 0
    });

    let currentMonthlyContribution = monthlyContributionVal;

    for (let i = 1; i <= months; i++) {
        // Apply annual increase at the start of each new year (every 12 months)
        if (i > 1 && (i - 1) % 12 === 0) {
            currentMonthlyContribution = currentMonthlyContribution * (1 + annualContributionIncreaseVal / 100);
        }

        currentBalance = currentBalance * (1 + accumulationMonthlyRate) + currentMonthlyContribution;
        currentPrincipal += currentMonthlyContribution;

        if (i % 12 === 0) {
            accumulationData.push({
                month: i,
                year: i / 12,
                balance: currentBalance,
                principal: currentPrincipal,
                contributions: currentPrincipal - initialCapitalVal,
                interest: currentBalance - currentPrincipal
            });
        }
    }

    const totalAccumulated = currentBalance;
    const totalContributed = currentPrincipal;
    // Unrealized Gains for Tax purposes
    const unrealizedGains = Math.max(0, totalAccumulated - totalContributed);
    const gainRatio = totalAccumulated > 0 ? unrealizedGains / totalAccumulated : 0;

    // Withdrawal Scenarios

    // Scenario A: Finite (Depletion)
    // PMT formula: P * (r / (1 - (1+r)^-n))
    let finiteWithdrawalGross = 0;
    if (withdrawalMonthlyRate > 0 && wdMonths > 0) {
        finiteWithdrawalGross = totalAccumulated * (withdrawalMonthlyRate / (1 - Math.pow(1 + withdrawalMonthlyRate, -wdMonths)));
    } else if (wdMonths > 0) {
        finiteWithdrawalGross = totalAccumulated / wdMonths;
    }
    const finiteTax = finiteWithdrawalGross * gainRatio * (taxRateVal / 100);
    const finiteWithdrawalNet = finiteWithdrawalGross - finiteTax;

    // Scenario A Data Generation
    const withdrawalDataA: { year: number; balance: number }[] = [];
    let balanceA = totalAccumulated;
    for (let i = 0; i <= wdMonths; i += 12) {
        if (i === 0) {
            withdrawalDataA.push({
                year: 0,
                balance: balanceA
            });
        } else {
            // 12 steps
            for (let j = 0; j < 12; j++) {
                balanceA = balanceA * (1 + withdrawalMonthlyRate) - finiteWithdrawalGross;
            }
            if (balanceA < 0) balanceA = 0;
            withdrawalDataA.push({
                year: i / 12,
                balance: balanceA
            });
        }
    }

    // Scenario B: Perpetual (Preservation)
    // Income = Balance * r
    const perpetualWithdrawalGross = totalAccumulated * withdrawalMonthlyRate;
    const perpetualTax = perpetualWithdrawalGross * gainRatio * (taxRateVal / 100);
    const perpetualWithdrawalNet = perpetualWithdrawalGross - perpetualTax;

    // Scenario B Data Generation
    const withdrawalDataB: { year: number; balance: number }[] = [];
    let balanceB = totalAccumulated;
    const inflationMonthly = Math.pow(1 + inflationVal / 100, 1 / 12) - 1;

    for (let i = 0; i <= wdMonths; i += 12) {
        if (i === 0) {
            withdrawalDataB.push({
                year: 0,
                balance: balanceB
            });
        } else {
            for (let j = 0; j < 12; j++) {
                if (isRealMode) {
                    // Capital is flat
                } else {
                    // Capital grows by inflation (since we only consume Real return)
                    balanceB = balanceB * (1 + inflationMonthly);
                }
            }
            withdrawalDataB.push({
                year: i / 12,
                balance: balanceB
            });
        }
    }


    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : lang === 'en' ? 'en-US' : 'es-ES', {
            style: 'currency',
            currency: 'BRL',
        }).format(val);
    };

    const isInflationError = inflationVal >= nominalReturnVal;

    const sortedAccumulationData = React.useMemo(() => {
        if (!sortConfig) return accumulationData;
        return [...accumulationData].sort((a: any, b: any) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [accumulationData, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <ArrowUpDown className="ml-2 h-3 w-3 text-muted-foreground" />;
        }
        if (sortConfig.direction === 'asc') {
            return <ArrowUp className="ml-2 h-3 w-3 text-primary" />;
        }
        return <ArrowDown className="ml-2 h-3 w-3 text-primary" />;
    };

    const combinedWithdrawalData = React.useMemo(() => {
        const netMultiplier = 1 - (gainRatio * (taxRateVal / 100));

        return withdrawalDataA.map((item, index) => {
            const balanceB = withdrawalDataB[index]?.balance || 0;
            // Income A is constant annuity as long as we have balance (simplified)
            // Or strictly, if previous balance was > 0.
            // For display, if balance is 0, we assume income stopped.
            const incomeA = item.balance > 0 ? finiteWithdrawalNet : 0;

            // Income B derives from the balance base of that year
            const incomeB = balanceB * withdrawalMonthlyRate * netMultiplier;

            return {
                year: item.year,
                balanceA: item.balance,
                balanceB: balanceB,
                incomeA,
                incomeB
            };
        });
    }, [withdrawalDataA, withdrawalDataB, finiteWithdrawalNet, withdrawalMonthlyRate, gainRatio, taxRateVal]);

    const sortedWithdrawalData = React.useMemo(() => {
        if (!sortWithdrawalConfig) return combinedWithdrawalData;
        return [...combinedWithdrawalData].sort((a: any, b: any) => {
            if (a[sortWithdrawalConfig.key] < b[sortWithdrawalConfig.key]) {
                return sortWithdrawalConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortWithdrawalConfig.key] > b[sortWithdrawalConfig.key]) {
                return sortWithdrawalConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [combinedWithdrawalData, sortWithdrawalConfig]);

    const requestWithdrawalSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortWithdrawalConfig && sortWithdrawalConfig.key === key && sortWithdrawalConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortWithdrawalConfig({ key, direction });
    };

    const getWithdrawalSortIcon = (key: string) => {
        if (!sortWithdrawalConfig || sortWithdrawalConfig.key !== key) {
            return <ArrowUpDown className="ml-2 h-3 w-3 text-muted-foreground" />;
        }
        if (sortWithdrawalConfig.direction === 'asc') {
            return <ArrowUp className="ml-2 h-3 w-3 text-primary" />;
        }
        return <ArrowDown className="ml-2 h-3 w-3 text-primary" />;
    };

    return (
        <div className="space-y-12">

            <LeadCaptureModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                calculatorType="calculadora-independencia-financeira"
                leadMetadata={leadMetadata}
            />

            {/* Disclaimer / Global Toggle */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border">
                <div className="text-sm text-muted-foreground max-w-2xl flex items-start gap-2">
                    <Info className="h-5 w-5 shrink-0 mt-0.5" />
                    <p>{disclaimer?.text || "Esta calculadora permite..."}</p>
                </div>

                <div className="flex bg-card border border-border rounded-lg p-1 shrink-0">
                    <button
                        onClick={() => setIsRealMode(true)}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${isRealMode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                        {t?.toggle?.real || "Real"}
                    </button>
                    <button
                        onClick={() => setIsRealMode(false)}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${!isRealMode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                        {t?.toggle?.nominal || "Nominal"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Inputs */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Phase 1 Inputs */}
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
                        <div className="flex items-center gap-2 pb-2 border-b border-border">
                            <Coins className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold">{t?.section1}</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>{t?.initialCapital}</Label>
                                <MoneyInput
                                    value={initialCapital}
                                    onChange={(val) => { handleInteraction('initialCapital'); setInitialCapital(val.toString()); }}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 items-start">
                                <div className="space-y-2">
                                    <Label>{t?.monthlyContribution}</Label>
                                    <MoneyInput
                                        value={monthlyContribution}
                                        onChange={(val) => { handleInteraction('monthlyContribution'); setMonthlyContribution(val.toString()); }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t?.annualContributionIncrease}</Label>
                                    <Input
                                        type="number"
                                        value={annualContributionIncrease}
                                        onChange={(e) => { handleInteraction('annualContributionIncrease'); setAnnualContributionIncrease(e.target.value); }}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>{t?.years}</Label>
                                <Input
                                    type="number"
                                    value={years}
                                    onChange={(e) => { handleInteraction('years'); setYears(e.target.value); }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 items-start">
                                <div className="space-y-2">
                                    <Label className="h-10 flex items-center">{t?.nominalReturn}</Label>
                                    <Input
                                        type="number"
                                        value={nominalReturn}
                                        onChange={(e) => { handleInteraction('nominalReturn'); setNominalReturn(e.target.value); }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="h-10 flex items-center gap-1 leading-tight">
                                        {t?.inflation}
                                        <span title={tooltips?.inflation} className="cursor-help shrink-0">
                                            <Info className="h-3 w-3 text-muted-foreground" />
                                        </span>
                                    </Label>
                                    <Input
                                        type="number"
                                        value={inflation}
                                        onChange={(e) => { handleInteraction('inflation'); setInflation(e.target.value); }}
                                        className={isInflationError ? "border-red-500" : ""}
                                    />
                                </div>
                            </div>
                            {isInflationError && (
                                <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 p-2 rounded">
                                    <AlertTriangle className="h-4 w-4" />
                                    {v?.inflationError}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    {t?.taxRate || "IR sobre Ganho de Capital"}
                                    <span title={tooltips?.tax} className="cursor-help">
                                        <Info className="h-3 w-3 text-muted-foreground" />
                                    </span>
                                </Label>
                                <div className="p-3 bg-muted/50 rounded-md border border-border text-sm font-medium flex justify-between items-center">
                                    <span>Alíquota do período ({yearsVal} {yearsVal === 1 ? 'ano' : 'anos'}):</span>
                                    <span className="font-bold text-primary">{calculatedTaxRate.toFixed(1).replace('.', ',')}%</span>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-1 mt-2 bg-muted/30 p-3 rounded-md border border-border/50">
                                    <p className="font-semibold mb-2">Tabela Regressiva de IR:</p>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                        <span>22,5%</span> <span className="text-right text-muted-foreground">até 180 dias</span>
                                        <span>20,0%</span> <span className="text-right text-muted-foreground">de 181 a 360 dias</span>
                                        <span>17,5%</span> <span className="text-right text-muted-foreground">de 361 a 720 dias</span>
                                        <span>15,0%</span> <span className="text-right text-muted-foreground">acima de 720 dias</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Phase 2 Inputs */}
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
                        <div className="flex items-center gap-2 pb-2 border-b border-border">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold">{t?.section2}</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 items-start">
                                <div className="space-y-2">
                                    <Label className="h-10 flex items-center">{t?.withdrawalYears}</Label>
                                    <Input
                                        type="number"
                                        value={withdrawalYears}
                                        onChange={(e) => { handleInteraction('withdrawalYears'); setWithdrawalYears(e.target.value); }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="h-10 flex items-center leading-tight">{t?.withdrawalRealReturn?.replace("Monthly", "Annual") || "Retorno Real (Anual %)"}</Label>
                                    <Input
                                        type="number"
                                        value={withdrawalRealReturnAnnual}
                                        onChange={(e) => { handleInteraction('withdrawalRealReturnAnnual'); setWithdrawalRealReturnAnnual(e.target.value); }}
                                        className="mt-auto"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Outputs */}
                <div className="lg:col-span-7 space-y-6">

                    {/* Summary Card */}
                    <div className="bg-blue-50 dark:bg-slate-900 text-foreground border border-blue-100 dark:border-blue-900 rounded-xl p-6 shadow-sm space-y-6">
                        <div className="flex justify-between items-start">
                            <h3 className="text-lg font-semibold flex items-center gap-2 text-blue-700 dark:text-blue-400">
                                <Calculator className="h-5 w-5" />
                                {r?.accumulationSummary}
                            </h3>
                            <span className={`text-xs px-2 py-1 rounded-full border ${isRealMode ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
                                {isRealMode ? "Real (IPCA)" : "Nominal"}
                            </span>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">{r?.totalAccumulated}</p>
                                <p className="text-2xl font-bold text-green-600 dark:text-green-500">{formatCurrency(totalAccumulated)}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">{r?.totalContributed}</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-slate-50">{formatCurrency(totalContributed)}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">{r?.unrealizedGains}</p>
                                <p className="text-xl font-bold text-blue-600 dark:text-blue-500">{formatCurrency(unrealizedGains)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Scenario Cards */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Scenario A */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col hover:border-orange-500 transition-colors">
                            <div className="mb-4">
                                <h4 className="font-semibold text-lg">{r?.scenarioA}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {r?.scenarioAPeriod?.replace("{years}", withdrawalYears)}
                                </p>
                            </div>

                            <div className="mt-auto space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">{r?.grossIncome}</span>
                                    <span className="font-medium">{formatCurrency(finiteWithdrawalGross)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm text-red-500">
                                    <span>{r?.taxPaid}</span>
                                    <span>- {formatCurrency(finiteTax)}</span>
                                </div>
                                <div className="pt-3 border-t border-border flex justify-between items-center">
                                    <span className="font-bold">{r?.netIncome}</span>
                                    <span className="text-xl font-bold text-green-600">{formatCurrency(finiteWithdrawalNet)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Scenario B */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col hover:border-green-500 transition-colors">
                            <div className="mb-4">
                                <h4 className="font-semibold text-lg">{r?.scenarioB}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {r?.scenarioBDesc}
                                </p>
                            </div>

                            <div className="mt-auto space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">{r?.grossIncome}</span>
                                    <span className="font-medium">{formatCurrency(perpetualWithdrawalGross)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm text-red-500">
                                    <span>{r?.taxPaid}</span>
                                    <span>- {formatCurrency(perpetualTax)}</span>
                                </div>
                                <div className="pt-3 border-t border-border flex justify-between items-center">
                                    <span className="font-bold">{r?.netIncome}</span>
                                    <span className="text-xl font-bold text-green-600">{formatCurrency(perpetualWithdrawalNet)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="space-y-8">
                {/* Accumulation Chart */}
                <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <h3 className="text-lg font-semibold mb-6 flex items-center justify-between">
                        {chartLabels?.accumulationTitle || "Evolução"}
                        <span className="text-xs font-normal text-muted-foreground px-2 py-1 bg-muted rounded">
                            {isRealMode ? t?.toggle?.real : t?.toggle?.nominal}
                        </span>
                    </h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={accumulationData}>
                                <defs>
                                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-zinc-800" />
                                <XAxis dataKey="year" stroke="#9CA3AF" tickFormatter={(val) => `${val}a`} />
                                <YAxis stroke="#9CA3AF" tickFormatter={(val) => new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { notation: "compact" }).format(val)} />
                                <RechartsTooltip
                                    formatter={(val: number | undefined) => formatCurrency(val || 0)}
                                    labelFormatter={(val) => `${tableLabels?.year} ${val}`}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="balance" name={chartLabels?.totalCapital} stroke="#22c55e" fill="url(#colorBalance)" strokeWidth={2} />
                                <Area type="monotone" dataKey="principal" name={chartLabels?.principal} stroke="#f97316" fill="none" strokeWidth={2} strokeDasharray="4 4" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Withdrawal Chart */}
                <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <h3 className="text-lg font-semibold mb-6">{chartLabels?.withdrawalTitle || "Usufruto"} (Cenário A vs B)</h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={withdrawalDataA}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-zinc-800" />
                                <XAxis dataKey="year" stroke="#9CA3AF" tickFormatter={(val) => `${val}a`} />
                                <YAxis stroke="#9CA3AF" tickFormatter={(val) => new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { notation: "compact" }).format(val)} />
                                <RechartsTooltip
                                    formatter={(val: number | undefined) => formatCurrency(val || 0)}
                                    labelFormatter={(val) => `${tableLabels?.year} ${val}`}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend
                                    wrapperStyle={{ paddingTop: '10px', width: '100%' }}
                                    iconSize={8}
                                    formatter={(value) => <span className="text-xs font-medium text-foreground mr-2">{value}</span>}
                                />
                                <Line type="monotone" dataKey="balance" name={`${chartLabels?.balance} (A)`} stroke="#f97316" strokeWidth={2} />
                                <Line type="monotone" data={withdrawalDataB} dataKey="balance" name={`${chartLabels?.balance} (B)`} stroke="#22c55e" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                        {isRealMode ? "Em modo Real, o Cenário B mantém o capital constante." : "Em modo Nominal, o Cenário B cresce pela inflação para manter o poder de compra."}
                    </p>
                </div>
            </div>

            {/* Tables Section */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="text-lg font-semibold">{tableLabels?.year} - {t?.section1}</h3>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { if (!checkExportTrigger('print')) window.print(); }}>
                            <Printer className="h-4 w-4 mr-2" />
                            PDF
                        </Button>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground font-medium sticky top-0 z-20">
                            <tr>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors sticky left-0 z-20 bg-muted" onClick={() => requestSort('year')}>
                                    <div className="flex items-center">
                                        {tableLabels?.year}
                                        {getSortIcon('year')}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('principal')}>
                                    <div className="flex items-center">
                                        {tableLabels?.initialCapital}
                                        {getSortIcon('principal')}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('contributions')}>
                                    <div className="flex items-center">
                                        {tableLabels?.contributions}
                                        {getSortIcon('contributions')}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('interest')}>
                                    <div className="flex items-center">
                                        {tableLabels?.yield}
                                        {getSortIcon('interest')}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('balance')}>
                                    <div className="flex items-center">
                                        {tableLabels?.finalCapital}
                                        {getSortIcon('balance')}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sortedAccumulationData.map((row) => (
                                <tr key={row.year} className="hover:bg-muted/50 group">
                                    <td className="px-6 py-3 sticky left-0 z-10 bg-card group-hover:bg-muted">{row.year}</td>
                                    <td className="px-6 py-3">{formatCurrency(initialCapitalVal)}</td>
                                    <td className="px-6 py-3">{formatCurrency(row.principal - initialCapitalVal)}</td>
                                    <td className="px-6 py-3 text-green-600">{formatCurrency(row.interest)}</td>
                                    <td className="px-6 py-3 font-medium">{formatCurrency(row.balance)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Withdrawal Table */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden mt-8">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="text-lg font-semibold">{t?.section2} - {isRealMode ? "Valores Reais (IPCA Ajustado)" : "Valores Nominais"}</h3>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { if (!checkExportTrigger('print')) window.print(); }}>
                            <Printer className="h-4 w-4 mr-2" />
                            PDF
                        </Button>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground font-medium sticky top-0 z-20">
                            <tr>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors sticky left-0 z-20 bg-muted" onClick={() => requestWithdrawalSort('year')}>
                                    <div className="flex items-center">
                                        {tableLabels?.year}
                                        {getWithdrawalSortIcon('year')}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestWithdrawalSort('incomeA')}>
                                    <div className="flex items-center justify-end">
                                        Renda Mensal (A)
                                        {getWithdrawalSortIcon('incomeA')}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestWithdrawalSort('balanceA')}>
                                    <div className="flex items-center justify-end">
                                        Saldo (A)
                                        {getWithdrawalSortIcon('balanceA')}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestWithdrawalSort('incomeB')}>
                                    <div className="flex items-center justify-end">
                                        Renda Mensal (B)
                                        {getWithdrawalSortIcon('incomeB')}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestWithdrawalSort('balanceB')}>
                                    <div className="flex items-center justify-end">
                                        Saldo (B)
                                        {getWithdrawalSortIcon('balanceB')}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sortedWithdrawalData.map((row) => (
                                <tr key={row.year} className="hover:bg-muted/50 group">
                                    <td className="px-6 py-3 sticky left-0 z-10 bg-card group-hover:bg-muted">{row.year}</td>
                                    <td className="px-6 py-3 font-medium text-right text-orange-600 dark:text-orange-500">{formatCurrency(row.incomeA)}</td>
                                    <td className="px-6 py-3 font-medium text-right text-muted-foreground">{formatCurrency(row.balanceA)}</td>
                                    <td className="px-6 py-3 font-medium text-right text-green-600 dark:text-green-500">{formatCurrency(row.incomeB)}</td>
                                    <td className="px-6 py-3 font-medium text-right text-muted-foreground">{formatCurrency(row.balanceB)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Educational Content Section */}
            {edu && (
                <div className="space-y-16 mt-16 border-t border-border pt-16">
                    {/* Intro */}
                    <div className="max-w-3xl mx-auto text-center space-y-6">
                        <h2 className="text-3xl font-bold tracking-tight">{edu.intro?.title}</h2>
                        <p className="text-lg text-muted-foreground leading-relaxed">{edu.intro?.text1}</p>
                        <p className="text-lg text-muted-foreground">{edu.intro?.text2}</p>
                        <blockquote className="text-xl italic font-medium text-primary border-l-4 border-primary pl-4 py-2 bg-muted/30 rounded-r-lg">
                            {edu.intro?.quote}
                        </blockquote>
                        <p className="text-base">{edu.intro?.text3}</p>
                    </div>

                    {/* What It Does */}
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="bg-card p-8 rounded-2xl border border-border shadow-sm">
                            <h3 className="text-xl font-bold mb-4 text-primary">{edu.whatItDoes?.phase1?.title}</h3>
                            <div className="space-y-4">
                                <div>
                                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">{edu.whatItDoes?.phase1?.inputTitle}</h4>
                                    <ul className="list-disc list-inside space-y-1 text-sm">
                                        {edu.whatItDoes?.phase1?.inputs?.map((item: string, i: number) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">{edu.whatItDoes?.phase1?.outputTitle}</h4>
                                    <ul className="list-disc list-inside space-y-1 text-sm">
                                        {edu.whatItDoes?.phase1?.outputs?.map((item: string, i: number) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                                <p className="text-sm italic text-muted-foreground border-t pt-4 mt-4">{edu.whatItDoes?.phase1?.note}</p>
                            </div>
                        </div>

                        <div className="bg-card p-8 rounded-2xl border border-border shadow-sm">
                            <h3 className="text-xl font-bold mb-4 text-primary">{edu.whatItDoes?.phase2?.title}</h3>
                            <p className="mb-6 text-muted-foreground">{edu.whatItDoes?.phase2?.intro}</p>

                            <div className="space-y-6">
                                <div>
                                    <h4 className="font-semibold text-lg mb-2">{edu.whatItDoes?.phase2?.scenarioA?.title}</h4>
                                    <p className="text-sm text-muted-foreground mb-2">{edu.whatItDoes?.phase2?.scenarioA?.description}</p>
                                    <ul className="list-disc list-inside text-sm space-y-1">
                                        {edu.whatItDoes?.phase2?.scenarioA?.items?.map((item: string, i: number) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-lg mb-2">{edu.whatItDoes?.phase2?.scenarioB?.title}</h4>
                                    <p className="text-sm text-muted-foreground mb-2">{edu.whatItDoes?.phase2?.scenarioB?.description}</p>
                                    <ul className="list-disc list-inside text-sm space-y-1">
                                        {edu.whatItDoes?.phase2?.scenarioB?.items?.map((item: string, i: number) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Nominal vs Real */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 rounded-2xl shadow-xl">
                        <div className="max-w-4xl mx-auto space-y-6">
                            <h2 className="text-2xl font-bold">{edu.nominalVsReal?.title}</h2>
                            <p className="text-lg opacity-90">{edu.nominalVsReal?.text}</p>

                            <div className="grid md:grid-cols-2 gap-6 my-8">
                                <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm">
                                    <p className="font-medium">{edu.nominalVsReal?.point1}</p>
                                </div>
                                <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-green-500/50">
                                    <p className="font-medium">{edu.nominalVsReal?.point2}</p>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold mb-3">{edu.nominalVsReal?.listTitle}</h3>
                                <div className="flex flex-wrap gap-4">
                                    {edu.nominalVsReal?.items?.map((item: string, i: number) => (
                                        <span key={i} className="px-3 py-1 bg-white/20 rounded-full text-sm">{item}</span>
                                    ))}
                                </div>
                            </div>
                            <p className="text-sm opacity-70 italic mt-6">{edu.nominalVsReal?.footer}</p>
                        </div>
                    </div>

                    {/* Market Role & Wealth Parking */}
                    <div className="space-y-12">
                        <div className="max-w-3xl mx-auto space-y-6">
                            <h2 className="text-2xl font-bold">{edu.marketRole?.title}</h2>
                            <p className="text-muted-foreground">{edu.marketRole?.text}</p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-8">
                            <div className="md:col-span-2 bg-card p-8 rounded-2xl border border-border">
                                <h3 className="text-xl font-bold mb-4">{edu.marketRole?.whyRealEstate?.title}</h3>
                                <ul className="space-y-3">
                                    {edu.marketRole?.whyRealEstate?.items?.map((item: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="text-green-500 mt-1">✓</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="bg-amber-50 dark:bg-amber-900/10 p-8 rounded-2xl border border-amber-100 dark:border-amber-900/20">
                                <h3 className="font-semibold mb-4 text-amber-800 dark:text-amber-200">{edu.marketRole?.comparison?.fixedIncome?.title}</h3>
                                <ul className="space-y-2 mb-6 text-sm">
                                    {edu.marketRole?.comparison?.fixedIncome?.items?.map((item: string, i: number) => (
                                        <li key={i} className="text-muted-foreground">• {item}</li>
                                    ))}
                                </ul>
                                <div className="pt-6 border-t border-amber-200 dark:border-amber-800/30">
                                    <p className="font-bold text-lg text-amber-900 dark:text-amber-100">{edu.marketRole?.comparison?.realEstate?.text}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Kitnets & Wealth Parking */}
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <h3 className="text-xl font-bold">{edu.wealthParking?.title}</h3>
                            <p className="text-muted-foreground">{edu.wealthParking?.text}</p>
                            <div className="bg-card p-6 rounded-xl border border-border">
                                <h4 className="font-semibold mb-3">{edu.wealthParking?.why?.title}</h4>
                                <ul className="space-y-2 text-sm">
                                    {edu.wealthParking?.why?.items?.map((item: string, i: number) => (
                                        <li key={i}>• {item}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="text-xl font-bold">{edu.kitnets?.title}</h3>
                            <p className="text-muted-foreground">{edu.kitnets?.text}</p>
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-100 dark:border-blue-900/20">
                                <ul className="space-y-2">
                                    {edu.kitnets?.items?.map((item: string, i: number) => (
                                        <li key={i} className="flex items-center gap-2">
                                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-sm font-medium mt-4 text-blue-700 dark:text-blue-300">{edu.kitnets?.footer}</p>
                            </div>
                        </div>
                    </div>

                    {/* Generational Wealth & Mindset */}
                    <div className="grid md:grid-cols-2 gap-8 bg-muted/30 p-8 rounded-3xl">
                        <div className="space-y-6">
                            <h3 className="text-xl font-bold">{edu.generationalWealth?.title}</h3>
                            <p className="text-muted-foreground">{edu.generationalWealth?.text}</p>

                            <div className="bg-card p-5 rounded-lg border border-border">
                                <h4 className="font-medium mb-2">{edu.generationalWealth?.propertyRole?.title}</h4>
                                <ul className="space-y-1 text-sm text-muted-foreground">
                                    {edu.generationalWealth?.propertyRole?.items?.map((item: string, i: number) => (
                                        <li key={i}>• {item}</li>
                                    ))}
                                </ul>
                            </div>
                            <p className="font-bold text-lg">{edu.generationalWealth?.conclusion}</p>
                        </div>

                        <div className="space-y-6 flex flex-col justify-center">
                            <h3 className="text-xl font-bold">{edu.mindset?.title}</h3>
                            <p className="text-muted-foreground">{edu.mindset?.text}</p>
                            <ul className="space-y-2">
                                {edu.mindset?.items?.map((item: string, i: number) => (
                                    <li key={i} className="flex items-center gap-2 font-medium">
                                        <span className="text-green-500">➜</span> {item}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-4 p-4 text-center bg-primary/10 rounded-lg text-primary font-bold text-lg">
                                {edu.mindset?.finalQuestion}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Structured Data for SEO */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": dict.financialIndependenceCalculator?.title || "Financial Independence Calculator",
                        "description": dict.financialIndependenceCalculator?.subtitle || "Simulate your financial freedom with real inflation and taxes.",
                        "applicationCategory": "FinanceApplication",
                        "operatingSystem": "WebBrowser",
                        "offers": {
                            "@type": "Offer",
                            "price": "0",
                            "priceCurrency": "BRL"
                        }
                    })
                }}
            />
        </div>
    );
}
