"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Info, HelpCircle, DollarSign, Calculator, FileText, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

import { calculateIrpf2026, CONSTANTS_2026_MONTHLY, CONSTANTS_2026_ANNUAL, CalculationResult } from '@/lib/irpf2026';

export function Irpf2026Calculator() {
    // Inputs
    const [grossIncome, setGrossIncome] = useState<number>(0);
    const [dependents, setDependents] = useState<number>(0);
    const [officialPension, setOfficialPension] = useState<number>(0);
    const [alimony, setAlimony] = useState<number>(0);
    const [otherDeductions, setOtherDeductions] = useState<number>(0);
    const [isOver65, setIsOver65] = useState<boolean>(false);
    const [mode, setMode] = useState<'monthly' | 'annual'>('monthly');

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatRate = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(value);
    };

    const calculate = useMemo((): CalculationResult => {
        return calculateIrpf2026({
            grossIncome,
            dependents,
            officialPension,
            alimony,
            otherDeductions,
            isOver65,
            mode
        });
    }, [grossIncome, dependents, officialPension, alimony, otherDeductions, isOver65, mode]);

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-muted/30 p-4 rounded-xl">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" />
                    Calculadora IRPF 2026
                </h2>
                <div className="flex bg-background border rounded-lg p-1">
                    <button
                        onClick={() => setMode('monthly')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'monthly' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                        Mensal 2026
                    </button>
                    <button
                        onClick={() => setMode('annual')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'annual' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                        Anual 2026
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Inputs */}
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle className="text-lg">Dados do contribuinte</CardTitle>
                        <CardDescription>
                            Preencha os dados dos seus rendimentos e deduções para {mode === 'monthly' ? 'o mês' : 'o ano'}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="grossIncome" className="flex items-center gap-2">
                                Rendimentos Tributáveis
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-xs">Salário bruto, aluguéis recebidos, pensões, etc.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </Label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="grossIncome"
                                    type="number"
                                    placeholder="0,00"
                                    className="pl-9"
                                    value={grossIncome || ''}
                                    onChange={(e) => setGrossIncome(Number(e.target.value))}
                                />
                            </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="dependents">Dependentes</Label>
                                <Input
                                    id="dependents"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={dependents || ''}
                                    onChange={(e) => setDependents(Math.floor(Number(e.target.value)))}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {formatCurrency(dependents * (mode === 'monthly' ? CONSTANTS_2026_MONTHLY.dependentDeduction : CONSTANTS_2026_ANNUAL.dependentDeduction))} de dedução
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="officialPension">Previdência Oficial (INSS)</Label>
                                <Input
                                    id="officialPension"
                                    type="number"
                                    placeholder="0,00"
                                    value={officialPension || ''}
                                    onChange={(e) => setOfficialPension(Number(e.target.value))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="alimony">Pensão Alimentícia (Judicial)</Label>
                                <Input
                                    id="alimony"
                                    type="number"
                                    placeholder="0,00"
                                    value={alimony || ''}
                                    onChange={(e) => setAlimony(Number(e.target.value))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="otherDeductions">Outras Deduções</Label>
                                <Input
                                    id="otherDeductions"
                                    type="number"
                                    placeholder="0,00"
                                    value={otherDeductions || ''}
                                    onChange={(e) => setOtherDeductions(Number(e.target.value))}
                                />
                                <p className="text-xs text-muted-foreground">Livro Caixa, Previdência Privada...</p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 border p-3 rounded-lg bg-muted/10">
                            <Input
                                id="over65"
                                type="checkbox"
                                className="h-5 w-5 accent-primary cursor-pointer w-auto"
                                checked={isOver65}
                                onChange={(e) => setIsOver65(e.target.checked)}
                            />
                            <Label htmlFor="over65" className="cursor-pointer">
                                65 anos ou mais
                                <span className="block text-xs text-muted-foreground font-normal">
                                    Aplica parcela isenta de {formatCurrency(mode === 'monthly' ? CONSTANTS_2026_MONTHLY.exemption65 : CONSTANTS_2026_ANNUAL.exemption65)}
                                </span>
                            </Label>
                        </div>
                    </CardContent>
                </Card>

                {/* Results - Summary */}
                <div className="space-y-6">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center justify-between">
                                Imposto Devido
                                <span className="text-3xl font-bold text-primary">
                                    {formatCurrency(calculate.dueTax)}
                                </span>
                            </CardTitle>
                            <CardDescription>
                                Alíquota Efetiva: <span className="font-semibold text-foreground">{formatRate(calculate.effectiveRate)}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground">Rendimentos Tributáveis:</span>
                                    <span>{formatCurrency(calculate.grossIncome)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground flex items-center gap-1">
                                        Deduções
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <Info className="h-3 w-3" />
                                                </TooltipTrigger>
                                                <TooltipContent className="text-xs">
                                                    {calculate.deductionType === 'simplified'
                                                        ? 'Utilizado Desconto Simplificado'
                                                        : 'Utilizadas Deduções Legais'}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                        :
                                    </span>
                                    <span className="text-red-500">- {formatCurrency(calculate.usedDeduction)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/50 font-medium">
                                    <span>Base de Cálculo:</span>
                                    <span>{formatCurrency(calculate.baseCalculation)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground">Imposto (Tabela Progressiva):</span>
                                    <span>{formatCurrency(calculate.calculatedTax)}</span>
                                </div>
                                {calculate.reductionApplied > 0 && (
                                    <div className="flex justify-between py-1 bg-green-500/10 rounded px-1 -mx-1">
                                        <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Redução (Lei 15.270/25):
                                        </span>
                                        <span className="text-green-600 dark:text-green-400 font-bold">
                                            - {formatCurrency(calculate.reductionApplied)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Demonstrative Table */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Demonstrativo de Cálculo
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg overflow-hidden border text-sm">
                                <div className="grid grid-cols-4 bg-muted p-2 font-medium text-xs text-muted-foreground">
                                    <div>Faixa de Base</div>
                                    <div className="text-right">Alíquota</div>
                                    <div className="text-right">Parcela</div>
                                    <div className="text-right">Imposto</div>
                                </div>
                                {calculate.tableSteps.map((step, idx) => (
                                    <div key={idx} className="grid grid-cols-4 p-2 border-t border-border/50 items-center">
                                        <div className="text-xs">{step.range}</div>
                                        <div className="text-right">{formatRate(step.rate)}</div>
                                        <div className="text-right text-muted-foreground">{formatCurrency(step.base)}</div>
                                        <div className="text-right font-medium">{formatCurrency(step.tax)}</div>
                                    </div>
                                ))}
                                <div className="grid grid-cols-4 bg-muted/50 p-2 font-bold border-t border-border">
                                    <div className="col-span-3">Total Imposto Tabela</div>
                                    <div className="text-right">{formatCurrency(calculate.calculatedTax)}</div>
                                </div>
                            </div>

                            {calculate.reductionApplied > 0 && (
                                <div className="mt-4 space-y-2">
                                    <div className="flex justify-between text-sm items-center p-2 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                        <span className="font-medium text-green-700 dark:text-green-300">
                                            Redução Lei 15.270/2025
                                        </span>
                                        <span className="font-bold text-green-700 dark:text-green-300">
                                            - {formatCurrency(calculate.reductionApplied)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                    <h5 className="font-medium text-blue-800 dark:text-blue-300 mb-1">Nota Legal</h5>
                    <p className="text-blue-700 dark:text-blue-400 text-sm">
                        Esta calculadora segue estritamente a Lei nº 15.270/2025 e as orientações publicadas pela Receita Federal.
                        O resultado possui caráter informativo, não substituindo apuração oficial ou declaração anual.
                    </p>
                </div>
            </div>
        </div>
    );
}
