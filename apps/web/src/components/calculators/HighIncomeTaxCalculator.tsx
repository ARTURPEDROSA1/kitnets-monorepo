"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Info, HelpCircle, Gem, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

interface Dictionary {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

interface Props {
    dict: Dictionary;
}

// Input Helper Component moved outside to prevent re-creation on every render
const CurrencyInput = ({ id, label, value, onChange, tooltip }: { id: string, label: string, value: number, onChange: (val: number) => void, tooltip?: string }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        const numberValue = rawValue ? parseInt(rawValue, 10) / 100 : 0;
        onChange(numberValue);
    };

    const displayValue = value
        ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';

    return (
        <div className="space-y-2">
            <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
                {label}
                {tooltip && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-xs text-xs">{tooltip}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </Label>
            <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">R$</span>
                <Input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    placeholder="0,00"
                    className="pl-9"
                    value={displayValue}
                    onChange={handleChange}
                />
            </div>
        </div>
    );
};

export function HighIncomeTaxCalculator({ dict }: Props) {
    const t = dict.highIncomeTaxCalculatorPage;

    // --- State: Inputs ---
    // Gross Income
    const [salaries, setSalaries] = useState<number>(0);
    const [rent, setRent] = useState<number>(0);
    const [business, setBusiness] = useState<number>(0);
    const [financial, setFinancial] = useState<number>(0);
    const [dividends, setDividends] = useState<number>(0);
    const [other, setOther] = useState<number>(0);

    // Exclusions
    const [capitalGains, setCapitalGains] = useState<number>(0);
    const [rra, setRra] = useState<number>(0);
    const [inheritance, setInheritance] = useState<number>(0);

    // Deductions
    const [savings, setSavings] = useState<number>(0);
    const [accidentIndemnity, setAccidentIndemnity] = useState<number>(0);
    const [legalExemptions, setLegalExemptions] = useState<number>(0);
    const [exemptFinancial, setExemptFinancial] = useState<number>(0);

    // Offsets
    const [irpfPaid, setIrpfPaid] = useState<number>(0);
    const [withheldIr, setWithheldIr] = useState<number>(0);
    const [offshoreIr, setOffshoreIr] = useState<number>(0);
    const [definitiveIr, setDefinitiveIr] = useState<number>(0);
    const [dividendsWithheld, setDividendsWithheld] = useState<number>(0);
    const [redutor, setRedutor] = useState<number>(0);

    // --- Formatting ---
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatRate = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(value / 100);
    };

    // --- Calculation Logic ---
    const results = useMemo(() => {
        // 1. Total Gross Income
        const totalGross = salaries + rent + business + financial + dividends + other;

        // 2. Net Income for Threshold (REND)
        // Gross Income minus Exclusions
        const exclusions = capitalGains + rra + inheritance;
        const netIncomeThreshold = Math.max(0, totalGross - exclusions);

        // 3. Threshold Test
        const isSubject = netIncomeThreshold > 600000;

        // 4. Effective Rate Calculation
        // Formula: (REND / 60,000) - 10
        // If REND <= 600k, Rate = 0
        // If REND >= 1.2M, Rate = 10%
        let effectiveRate = 0;
        if (isSubject) {
            if (netIncomeThreshold >= 1200000) {
                effectiveRate = 10;
            } else {
                effectiveRate = (netIncomeThreshold / 60000) - 10;
            }
        }
        effectiveRate = Math.max(0, Math.min(10, effectiveRate));

        // 5. Tax Base for IRPFM
        // Start with Net Income for Threshold
        // Deduct specific items
        const deductions = savings + accidentIndemnity + legalExemptions + exemptFinancial;
        const taxBase = Math.max(0, netIncomeThreshold - deductions);

        // 6. Gross IRPFM
        const grossTax = taxBase * (effectiveRate / 100);

        // 7. Offsets
        const totalOffsets = irpfPaid + withheldIr + offshoreIr + definitiveIr + dividendsWithheld + redutor;

        // 8. Final Tax
        const finalTax = Math.max(0, grossTax - totalOffsets);

        return {
            totalGross,
            exclusions,
            netIncomeThreshold,
            isSubject,
            effectiveRate,
            deductions,
            taxBase,
            grossTax,
            totalOffsets,
            finalTax
        };
    }, [
        salaries, rent, business, financial, dividends, other,
        capitalGains, rra, inheritance,
        savings, accidentIndemnity, legalExemptions, exemptFinancial,
        irpfPaid, withheldIr, offshoreIr, definitiveIr, dividendsWithheld, redutor
    ]);

    return (
        <div className="w-full max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-muted/30 p-6 rounded-xl border border-border">
                <div>
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Gem className="h-6 w-6 text-primary" />
                        {t.title}
                    </h2>
                    <p className="text-muted-foreground mt-1">{t.subtitle}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Inputs Column */}
                <div className="xl:col-span-2 space-y-6">

                    {/* 1. Gross Income */}
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">{t.inputs.grossIncomeTitle}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid sm:grid-cols-2 gap-4">
                            <CurrencyInput id="salaries" label={t.inputs.salaries} value={salaries} onChange={setSalaries} />
                            <CurrencyInput id="rent" label={t.inputs.rent} value={rent} onChange={setRent} />
                            <CurrencyInput id="business" label={t.inputs.business} value={business} onChange={setBusiness} />
                            <CurrencyInput id="financial" label={t.inputs.financial} value={financial} onChange={setFinancial} />
                            <CurrencyInput id="dividends" label={t.inputs.dividends} value={dividends} onChange={setDividends} />
                            <CurrencyInput id="other" label={t.inputs.other} value={other} onChange={setOther} />
                        </CardContent>
                    </Card>

                    {/* 2. Exclusions */}
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">{t.inputs.exclusionsTitle}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid sm:grid-cols-2 gap-4">
                            <CurrencyInput id="capitalGains" label={t.inputs.capitalGains} value={capitalGains} onChange={setCapitalGains} />
                            <CurrencyInput id="rra" label={t.inputs.rra} value={rra} onChange={setRra} />
                            <CurrencyInput id="inheritance" label={t.inputs.inheritance} value={inheritance} onChange={setInheritance} />
                        </CardContent>
                    </Card>

                    {/* 3. Deductions */}
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">{t.inputs.deductionsTitle}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid sm:grid-cols-2 gap-4">
                            <CurrencyInput id="savings" label={t.inputs.savings} value={savings} onChange={setSavings} />
                            <CurrencyInput id="accidentIndemnity" label={t.inputs.accidentIndemnity} value={accidentIndemnity} onChange={setAccidentIndemnity} />
                            <CurrencyInput id="legalExemptions" label={t.inputs.legalExemptions} value={legalExemptions} onChange={setLegalExemptions} />
                            <CurrencyInput id="exemptFinancial" label={t.inputs.exemptFinancial} value={exemptFinancial} onChange={setExemptFinancial} />
                        </CardContent>
                    </Card>

                    {/* 4. Offsets */}
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">{t.inputs.offsetsTitle}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid sm:grid-cols-2 gap-4">
                            <CurrencyInput id="irpfPaid" label={t.inputs.irpfPaid} value={irpfPaid} onChange={setIrpfPaid} />
                            <CurrencyInput id="withheldIr" label={t.inputs.withheldIr} value={withheldIr} onChange={setWithheldIr} />
                            <CurrencyInput id="offshoreIr" label={t.inputs.offshoreIr} value={offshoreIr} onChange={setOffshoreIr} />
                            <CurrencyInput id="definitiveIr" label={t.inputs.definitiveIr} value={definitiveIr} onChange={setDefinitiveIr} />
                            <CurrencyInput id="dividendsWithheld" label={t.inputs.dividendsWithheld} value={dividendsWithheld} onChange={setDividendsWithheld} tooltip={t.tooltips.dividendsAnticipation} />
                            <CurrencyInput id="redutor" label={t.results.redutor} value={redutor} onChange={setRedutor} tooltip={t.tooltips.redutor} />
                        </CardContent>
                    </Card>
                </div>

                {/* Results Column */}
                <div className="space-y-6">
                    {/* Status Card */}
                    <Card className={`border-2 ${results.isSubject ? 'border-primary/50 bg-primary/5' : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'}`}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-medium text-muted-foreground uppercase tracking-wider">
                                {t.results.thresholdStatus}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                {results.isSubject ? <AlertTriangle className="h-8 w-8 text-primary" /> : <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />}
                                <div>
                                    <div className="text-xl font-bold text-foreground">
                                        {results.isSubject ? t.results.aboveThreshold : t.results.belowThreshold}
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1">
                                        {t.results.netIncome}: <span className="font-medium text-foreground">{formatCurrency(results.netIncomeThreshold)}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tax Due Card */}
                    <Card className="overflow-hidden">
                        <CardHeader className="bg-muted/50 pb-4">
                            <CardTitle className="flex justify-between items-center text-lg">
                                {t.results.finalTax}
                                <span className={`text-2xl font-bold ${results.finalTax > 0 ? 'text-primary' : 'text-foreground'}`}>
                                    {formatCurrency(results.finalTax)}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">{t.results.effectiveRate}:</span>
                                <span className="font-semibold">{formatRate(results.effectiveRate)}</span>
                            </div>
                            <Separator />
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>{t.results.grossTax}:</span>
                                    <span>{formatCurrency(results.grossTax)}</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>{t.inputs.offsetsTitle}:</span>
                                    <span className="text-green-600 dark:text-green-400">- {formatCurrency(results.totalOffsets)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Breakdown */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                Resumo da Base
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-3">
                            <div className="flex justify-between">
                                <span>Total Bruto:</span>
                                <span className="font-medium">{formatCurrency(results.totalGross)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Exclusões:</span>
                                <span>- {formatCurrency(results.exclusions)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Deduções da Base:</span>
                                <span>- {formatCurrency(results.deductions)}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between font-medium">
                                <span>Base IRPFM:</span>
                                <span>{formatCurrency(results.taxBase)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Disclaimer */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3 text-sm">
                        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <div>
                            <p className="font-medium text-blue-800 dark:text-blue-300">
                                {t.takeaway}
                            </p>
                            <p className="text-blue-600 dark:text-blue-400 mt-2 text-xs">
                                {t.disclaimer}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
