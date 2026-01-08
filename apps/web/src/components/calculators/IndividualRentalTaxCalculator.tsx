
"use client";
"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Building2, Info, AlertTriangle } from "lucide-react";
import { calculateRentalTax, RentalTaxInput, RentalTaxResult } from '@/lib/rental-tax';

import { Dictionary } from "@/dictionaries";

interface IndividualRentalTaxCalculatorProps {
    content: Dictionary['rentalTaxCalculatorPage'];
}

export function IndividualRentalTaxCalculator({ content }: IndividualRentalTaxCalculatorProps) {
    const t = content;

    // Inputs
    const [numberOfProperties, setNumberOfProperties] = useState<number>(1);
    const [annualRentalRevenue, setAnnualRentalRevenue] = useState<number>(0);
    const [otherTaxableIncome, setOtherTaxableIncome] = useState<number>(0);
    const [dependents, setDependents] = useState<number>(0);
    const [deductibleExpenses, setDeductibleExpenses] = useState<number>(0);
    const [taxYear, setTaxYear] = useState<number>(2026);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatRate = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(value);
    };

    const formatCurrencyInput = (value: number) => {
        if (!value) return "";
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (value: number) => void) => {
        const value = e.target.value;
        const numericValue = value.replace(/\D/g, "");
        const floatValue = Number(numericValue) / 100;
        setter(floatValue);
    };

    const result: RentalTaxResult = useMemo(() => {
        const input: RentalTaxInput = {
            numberOfProperties: Number.isNaN(numberOfProperties) ? 0 : numberOfProperties,
            annualRentalRevenue,
            otherTaxableIncome,
            dependents: Number.isNaN(dependents) ? 0 : dependents,
            deductibleExpenses,
            taxYear: Number.isNaN(taxYear) ? 2026 : taxYear,
            referenceYear: (Number.isNaN(taxYear) ? 2026 : taxYear) - 1
        };
        return calculateRentalTax(input);
    }, [numberOfProperties, annualRentalRevenue, otherTaxableIncome, dependents, deductibleExpenses, taxYear]);

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Inputs */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            {t?.inputs?.calculate || "Dados para Cálculo"}
                        </CardTitle>
                        <CardDescription>{t?.subtitle}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="properties">{t?.inputs?.properties}</Label>
                            <Input
                                id="properties"
                                type="number"
                                min={0}
                                value={Number.isNaN(numberOfProperties) ? "" : numberOfProperties}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setNumberOfProperties(val === "" ? NaN : Number(val));
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="revenue">{t?.inputs?.revenue}</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                <Input
                                    id="revenue"
                                    type="text"
                                    className="pl-9"
                                    value={formatCurrencyInput(annualRentalRevenue)}
                                    onChange={(e) => handleCurrencyChange(e, setAnnualRentalRevenue)}
                                    placeholder="0,00"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="otherIncome">{t?.inputs?.otherIncome}</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                <Input
                                    id="otherIncome"
                                    type="text"
                                    className="pl-9"
                                    value={formatCurrencyInput(otherTaxableIncome)}
                                    onChange={(e) => handleCurrencyChange(e, setOtherTaxableIncome)}
                                    placeholder="0,00"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="dependents">{t?.inputs?.dependents}</Label>
                                <Input
                                    id="dependents"
                                    type="number"
                                    min={0}
                                    value={Number.isNaN(dependents) ? "" : dependents}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setDependents(val === "" ? NaN : Number(val));
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="taxYear">{t?.inputs?.taxYear}</Label>
                                <Input
                                    id="taxYear"
                                    type="number"
                                    min={2024}
                                    value={Number.isNaN(taxYear) ? "" : taxYear}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setTaxYear(val === "" ? NaN : Number(val));
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="deductions">{t?.inputs?.deductions}</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                <Input
                                    id="deductions"
                                    type="text"
                                    className="pl-9"
                                    value={formatCurrencyInput(deductibleExpenses)}
                                    onChange={(e) => handleCurrencyChange(e, setDeductibleExpenses)}
                                    placeholder="0,00"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Main Results / Status */}
                <div className="space-y-6">
                    <Card className={`${result.isLargeLandlord ? 'border-orange-500' : 'border-green-500'} border-2`}>
                        <CardHeader>
                            <CardTitle>{t?.results?.legalStatus}</CardTitle>
                            <CardDescription>{t?.results?.legalRef}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold mb-2">
                                {result.isLargeLandlord ? t?.results?.largeLandlord : t?.results?.smallLandlord}
                            </div>

                            <div className={`rounded-lg p-4 flex gap-3 ${result.isLargeLandlord ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                                <div>
                                    <h5 className="font-medium leading-none tracking-tight mb-1">{t?.alerts?.classification}</h5>
                                    <div className="text-sm opacity-90">
                                        {result.isLargeLandlord
                                            ? "Enquadrado como Grande Locador. Incidência de IBS e CBS cumulativa ao IRPF."
                                            : "Enquadrado como Pequeno Locador. Incidência exclusiva de IRPF."}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Total Burden Highlight */}
                    <Card className="bg-primary text-primary-foreground">
                        <CardHeader>
                            <CardTitle className="text-primary-foreground">{t?.results?.totalCard}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-sm opacity-90">{t?.results?.totalTax}</span>
                                <span className="text-3xl font-bold">{formatCurrency(result.totalTaxDue)}</span>
                            </div>
                            <Separator className="bg-primary-foreground/20" />
                            <div className="flex justify-between items-end">
                                <span className="text-sm opacity-90">{t?.results?.totalEffective}</span>
                                <span className="text-xl font-semibold">{formatRate(result.totalEffectiveRate)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* IRPF Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t?.results?.irpfCard}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t?.results?.irpfBase}</span>
                            <span className="font-medium">{formatCurrency(result.irpfBase)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t?.results?.irpfTax}</span>
                            <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(result.irpfTaxDue)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t?.results?.irpfEffective}</span>
                            <span>{formatRate(result.irpfEffectiveRate)}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* IBS/CBS Card */}
                <Card className={!result.ibsCbsApplicable ? "opacity-60 grayscale" : ""}>
                    <CardHeader>
                        <CardTitle className="flex justify-between">
                            <span>IBS + CBS</span>
                            {!result.ibsCbsApplicable && <span className="text-xs bg-muted px-2 py-1 rounded">Não Aplicável</span>}
                        </CardTitle>
                        <CardDescription>
                            {t?.results?.cbsCard} + {t?.results?.ibsCard}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t?.results?.vatBase}</span>
                            <span className="font-medium">{formatCurrency(result.vatBase)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t?.results?.vatRate} (Efetiva)</span>
                            <span>{formatRate(result.vatRate)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t?.results?.startYear}</span>
                            <span>{result.ibsCbsStartYear}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t?.results?.vatTax}</span>
                            <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(result.vatTaxDue)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="bg-muted p-4 rounded-lg flex gap-3 border">
                <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <h5 className="font-medium text-sm">Nota Importante</h5>
                    <p className="text-sm text-muted-foreground"> {t?.alerts?.cumulative} </p>
                    <p className="text-sm text-muted-foreground"> {t?.alerts?.credits} </p>
                </div>
            </div>
        </div>
    );
}
