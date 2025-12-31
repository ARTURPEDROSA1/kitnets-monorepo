"use client";

import React, { useState, useMemo } from 'react';
import { calculateMortgageWithComparisons, MortgageInputs, System, ExtraPayment, AmortizationEffect } from '@/lib/mortgage';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Trash2, Plus, Settings, TrendingDown, Maximize2, Minimize2, FileSpreadsheet, FileText, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useCalculatorLeadCapture } from "@/hooks/useCalculatorLeadCapture";
import LeadCaptureModal from "@/components/calculators/LeadCaptureModal";

// UI Helpers using Semantic Colors
const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    // bg-card and text-card-foreground automatically handle dark mode via CSS variables
    <div className={`rounded-xl border border-border bg-card text-card-foreground shadow-sm ${className}`}>{children}</div>
);

const Label = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground ${className}`}>{children}</label>
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
    return (
        <input
            className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground ${className}`}
            ref={ref}
            {...props}
        />
    );
});
Input.displayName = "Input";

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost' | 'destructive' }>(
    ({ className, variant = 'default', ...props }, ref) => {
        // Updated to use semantic colors
        // Fallback for primary if not defined (using orange as per brand)
        const brandVariants = {
            default: "bg-orange-600 text-white hover:bg-orange-700",
            outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground text-foreground",
            ghost: "hover:bg-accent hover:text-accent-foreground text-foreground",
            destructive: "bg-red-600 text-white hover:bg-red-700"
        }

        return (
            <button
                ref={ref}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 ${brandVariants[variant]} ${className}`}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const MoneyInput = ({ value, onChange, className, ...props }: { value: number | string, onChange: (value: number | string) => void, className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) => {
    const displayValue = useMemo(() => {
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



export function MortgageCalculator() {
    // State
    const [propertyValue, setPropertyValue] = useState<number | string>(500000);
    const [downPayment, setDownPayment] = useState<number | string>(100000);
    const [system, setSystem] = useState<System>('SAC');
    const [termMonths, setTermMonths] = useState<number | string>(360);
    const [annualInterestRate, setAnnualInterestRate] = useState<number | string>(9.99);
    const [mipRate, setMipRate] = useState<number | string>(0.000445); // 0.0445%
    const [dfiRate, setDfiRate] = useState<number | string>(0.0001); // 0.01%
    const [isTableExpanded, setIsTableExpanded] = useState(false);
    const [downPaymentWarning, setDownPaymentWarning] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    // Extra Payments
    const [extraPayments, setExtraPayments] = useState<ExtraPayment[]>([]);

    // UI State for Adding Extra Payment
    const [newExtraMonth, setNewExtraMonth] = useState<number | string>(12);
    const [newExtraAmount, setNewExtraAmount] = useState<number | string>(10000);
    const [newExtraEffect, setNewExtraEffect] = useState<AmortizationEffect>('reduce_term');
    const [newExtraSource, setNewExtraSource] = useState('Poupanca');

    // UI State for FGTS Plan
    const [fgtsSimulationAmount, setFgtsSimulationAmount] = useState<number | string>(8000);

    // Lead Capture Hook
    const {
        isModalOpen,
        setIsModalOpen,
        leadMetadata,
        trackInteraction,
        checkAdvancedTrigger,
        checkExportTrigger
    } = useCalculatorLeadCapture({
        calculatorType: "calculadora-amortizacao-financiamento-imobiliario",
        isSimpleCalculator: false
    });

    const interactionCountRef = React.useRef(0);

    const handleInteraction = () => {
        trackInteraction();
        interactionCountRef.current += 1;
        // Trigger lead capture after 5 interactions
        if (interactionCountRef.current > 5) {
            checkAdvancedTrigger();
        }
    };

    // Derived Input
    const financedAmount = Number(propertyValue) - Number(downPayment);

    // Computations
    const inputs: MortgageInputs = useMemo(() => ({
        propertyValue: Number(propertyValue),
        downPayment: Number(downPayment),
        system,
        termMonths: Number(termMonths),
        annualInterestRate: Number(annualInterestRate),
        mipRate: Number(mipRate),
        dfiRate: Number(dfiRate),
        extraPayments
    }), [propertyValue, downPayment, system, termMonths, annualInterestRate, mipRate, dfiRate, extraPayments]);

    const result = useMemo(() => calculateMortgageWithComparisons(inputs), [inputs]);

    const sortedSchedule = useMemo(() => {
        if (!sortConfig) return result.schedule;
        return [...result.schedule].sort((a: any, b: any) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            // Handle special case for 'insurance' which is a sum of mip + dfi
            if (sortConfig.key === 'insurance') {
                aValue = a.mip + a.dfi;
                bValue = b.mip + b.dfi;
            }

            if (aValue < bValue) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [result.schedule, sortConfig]);

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

    // Handlers
    const addExtraPayment = () => {
        setExtraPayments([...extraPayments, {
            month: Number(newExtraMonth),
            amount: Number(newExtraAmount),
            effect: newExtraEffect,
            source: newExtraSource
        }].sort((a, b) => a.month - b.month));
    };

    const removeExtraPayment = (index: number) => {
        const newPayments = [...extraPayments];
        newPayments.splice(index, 1);
        setExtraPayments(newPayments);
    };

    const addFgtsPlan = () => {
        const newEvts = [...extraPayments];
        for (let m = 24; m < Number(termMonths); m += 24) {
            if (!newEvts.find(e => e.month === m && e.source === 'FGTS')) {
                newEvts.push({
                    month: m,
                    amount: Number(fgtsSimulationAmount),
                    effect: 'reduce_term',
                    source: 'FGTS'
                });
            }
        }
        setExtraPayments(newEvts.sort((a, b) => a.month - b.month));
    };

    const handleDownPaymentBlur = () => {
        const minDownPayment = Number(propertyValue) * 0.20;
        if (Number(downPayment) < minDownPayment) {
            setDownPayment(minDownPayment);
            setDownPaymentWarning(`Entrada ajustada para 20% do valor do imóvel (${formatCurrency(minDownPayment)})`);
        } else {
            setDownPaymentWarning(null);
        }
    };

    const exportToCSV = () => {
        if (checkExportTrigger('csv')) return;
        const headers = ["Mês", "Parcela", "Amortização", "Juros", "Seguros", "Amort. Extra", "Saldo Devedor"];
        const rows = result.schedule.map(row => [
            row.month,
            row.payment.toFixed(2),
            row.amortization.toFixed(2),
            row.interest.toFixed(2),
            (row.mip + row.dfi).toFixed(2),
            row.extraAmortization.toFixed(2),
            row.balance.toFixed(2)
        ]);

        const csvContent = [
            headers.join(";"),
            ...rows.map(e => e.join(";"))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `simulacao_financiamento_${system}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrint = () => {
        if (checkExportTrigger('print')) return;
        window.print();
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <LeadCaptureModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                calculatorType="calculadora-amortizacao-financiamento-imobiliario"
                leadMetadata={leadMetadata}
            />
            {/* Left Column: Inputs */}
            <div className="lg:col-span-4 space-y-6">
                <Card className="p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Settings className="w-5 h-5 text-orange-600" />
                        <h2 className="text-xl font-semibold text-foreground">Dados do Financiamento</h2>
                    </div>

                    <div>
                        <Label>Valor do Imóvel</Label>
                        <MoneyInput
                            value={propertyValue}
                            onChange={setPropertyValue}
                            className="mt-1"
                            onBlur={() => handleInteraction()}
                        />

                    </div>

                    <div>
                        <Label>Entrada</Label>
                        <MoneyInput
                            value={downPayment}
                            onChange={(val) => {
                                setDownPayment(val);
                                setDownPaymentWarning(null);
                            }}
                            className="mt-1"
                            onBlur={() => {
                                handleInteraction();
                                handleDownPaymentBlur();
                            }}
                        />
                        {downPaymentWarning && (
                            <p className="text-xs text-amber-600 mt-1 font-medium">{downPaymentWarning}</p>
                        )}
                    </div>

                    <div className="p-3 bg-muted rounded-md">
                        <div className="flex justify-between text-sm text-foreground">
                            <span>Valor Financiado:</span>
                            <span className="font-bold">{formatCurrency(financedAmount)}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Sistema</Label>
                            <select
                                className="w-full mt-1 flex h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                                value={system}
                                onChange={(e) => setSystem(e.target.value as System)}
                                onBlur={() => handleInteraction()}
                            >
                                <option value="SAC">SAC</option>
                                <option value="PRICE">PRICE</option>
                            </select>
                        </div>
                        <div>
                            <Label>Prazo (Meses)</Label>
                            <Input
                                type="number"
                                value={termMonths}
                                onChange={e => setTermMonths(e.target.value === '' ? '' : Number(e.target.value))}
                                className="mt-1"
                                onBlur={() => handleInteraction()}
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Taxa de Juros (% a.a.)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            value={annualInterestRate}
                            onChange={e => setAnnualInterestRate(e.target.value === '' ? '' : Number(e.target.value))}
                            className="mt-1"
                            onBlur={() => handleInteraction()}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Mensal equivalente: {((Math.pow(1 + Number(annualInterestRate) / 100, 1 / 12) - 1) * 100).toFixed(4)}%
                        </p>
                    </div>

                    <details className="text-sm group">
                        <summary className="cursor-pointer text-muted-foreground font-medium list-none flex items-center gap-1">
                            <span className="border-b border-dashed border-input">Taxas de Seguro (MIP/DFI)</span>
                        </summary>
                        <div className="mt-4 space-y-4 pl-2 border-l-2 border-border">
                            <div>
                                <Label>MIP (% am sobre saldo)</Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    value={mipRate}
                                    onChange={e => setMipRate(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="mt-1"
                                    onBlur={() => handleInteraction()}
                                />
                            </div>
                            <div>
                                <Label>DFI (% am sobre valor imóvel)</Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    value={dfiRate}
                                    onChange={e => setDfiRate(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="mt-1"
                                    onBlur={() => handleInteraction()}
                                />
                            </div>
                        </div>
                    </details>
                </Card>

                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingDown className="w-5 h-5 text-green-600" />
                        <h2 className="text-xl font-semibold text-foreground">Amortizações Extras</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label>Mês</Label>
                                <Input type="number" value={newExtraMonth} onChange={e => setNewExtraMonth(e.target.value === '' ? '' : Number(e.target.value))} />
                            </div>
                            <div>
                                <Label>Valor</Label>
                                <MoneyInput value={newExtraAmount} onChange={setNewExtraAmount} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label>Tipo</Label>
                                <select
                                    className="w-full flex h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                                    value={newExtraSource}
                                    onChange={(e) => setNewExtraSource(e.target.value)}
                                >
                                    <option value="Poupanca">Poupança</option>
                                    <option value="FGTS">FGTS</option>
                                    <option value="13o Salario">13º Salário</option>
                                </select>
                            </div>
                            <div>
                                <Label>Efeito</Label>
                                <select
                                    className="w-full flex h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                                    value={newExtraEffect}
                                    onChange={(e) => setNewExtraEffect(e.target.value as AmortizationEffect)}
                                >
                                    <option value="reduce_term">Reduzir Prazo</option>
                                    <option value="reduce_installment">Reduzir Parcela</option>
                                </select>
                            </div>
                        </div>
                        <Button onClick={addExtraPayment} className="w-full" variant="outline">
                            <Plus className="w-4 h-4 mr-2" /> Adicionar Amortização
                        </Button>

                        {newExtraSource === 'FGTS' && (
                            <div className="pt-4 mt-4 border-t border-border">
                                <Label className="mb-2 block">Simulação Automática de FGTS</Label>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <Label className="text-xs text-muted-foreground">Valor (a cada 24 meses)</Label>
                                        <MoneyInput
                                            value={fgtsSimulationAmount}
                                            onChange={setFgtsSimulationAmount}
                                            className="mt-1"
                                        />
                                    </div>
                                    <Button onClick={addFgtsPlan} className="flex-1" variant="outline">
                                        Simular FGTS
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 space-y-2">
                        {extraPayments.length === 0 && (
                            <p className="text-sm text-muted-foreground italic text-center">Nenhuma amortização extra definida.</p>
                        )}
                        {extraPayments.map((payment, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded border border-border">
                                <div>
                                    <span className="font-bold text-orange-600">Mês {payment.month}</span>
                                    <span className="mx-2 text-muted-foreground">|</span>
                                    <span className="text-foreground">{payment.source}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground">{formatCurrency(payment.amount)}</span>
                                    <button onClick={() => removeExtraPayment(idx)} className="text-red-500 hover:text-red-700">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Right Column: Results & Charts */}
            <div className="lg:col-span-8 space-y-6 relative">

                <div className="transition-all duration-500">

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/30">
                            <Label className="text-orange-900 dark:text-orange-100/70">Total Pago</Label>
                            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400 mt-1">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(result.summary.totalPaid)}
                            </div>
                            <div className="text-xs text-orange-600/80 mt-1">
                                Total do Investimento
                            </div>
                        </Card>
                        <Card className="p-4">
                            <Label className="text-muted-foreground">Juros Totais</Label>
                            <div className="text-2xl font-bold text-foreground mt-1">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(result.summary.totalInterest)}
                            </div>
                        </Card>
                        <Card className="p-4">
                            <Label className="text-muted-foreground">Prazo Final</Label>
                            <div className="text-2xl font-bold text-foreground mt-1">
                                {result.summary.finalMonths} <span className="text-base font-normal text-muted-foreground">meses</span>
                            </div>
                            {result.summary.monthsSaved > 0 && (
                                <div className="text-xs text-green-600 font-medium mt-1">
                                    -{result.summary.monthsSaved} meses economizados
                                </div>
                            )}
                        </Card>
                        <Card className="p-4">
                            <Label className="text-muted-foreground">Economia Total</Label>
                            <div className="text-2xl font-bold text-green-600 mt-1">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(result.summary.interestSaved)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                Com amortizações
                            </div>
                        </Card>
                    </div>

                    {/* Charts */}
                    <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-6 text-foreground">Evolução do Saldo Devedor</h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={result.schedule}>
                                    <defs>
                                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="month"
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(value)}
                                        width={80}
                                    />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                                        formatter={(value: any) => formatCurrency(Number(value))}
                                        labelFormatter={(label) => `Mês ${label}`}
                                    />
                                    <Area type="monotone" dataKey="balance" stroke="#f97316" fillOpacity={1} fill="url(#colorBalance)" name="Saldo Devedor" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Detailed Table */}
                    <Card className={`p-6 overflow-hidden transition-all duration-300 ${isTableExpanded ? 'fixed inset-4 z-50 h-[calc(100vh-2rem)] shadow-2xl overflow-hidden flex flex-col' : ''} print:shadow-none print:border-none print:fixed print:inset-0 print:z-[100] print:h-auto print:bg-background`}>
                        <div className="flex justify-between items-center mb-4 print:hidden">
                            <h3 className="text-lg font-semibold text-foreground">Tabela {system === 'PRICE' ? 'Price' : 'SAC'} Detalhada</h3>
                            <div className="flex gap-1">
                                <Button
                                    variant="ghost"
                                    onClick={exportToCSV}
                                    className="h-8 w-8 !p-0"
                                    title="Exportar para Excel (CSV)"
                                >
                                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={handlePrint}
                                    className="h-8 w-8 !p-0"
                                    title="Imprimir / Salvar PDF"
                                >
                                    <FileText className="h-4 w-4 text-orange-600" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setIsTableExpanded(!isTableExpanded)}
                                    className="h-8 w-8 !p-0"
                                    title={isTableExpanded ? "Recolher" : "Expandir"}
                                >
                                    {isTableExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4 text-foreground" />}
                                </Button>
                            </div>
                        </div>
                        <div className={`overflow-x-auto overflow-y-auto ${isTableExpanded ? 'flex-1' : 'max-h-[500px]'} print:overflow-visible print:max-h-none`}>
                            <table className="w-full text-sm text-left text-foreground">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors text-center" onClick={() => requestSort('month')}>
                                            <div className="flex items-center justify-center">
                                                Mês
                                                {getSortIcon('month')}
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestSort('payment')}>
                                            <div className="flex items-center justify-end">
                                                Parcela
                                                {getSortIcon('payment')}
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestSort('amortization')}>
                                            <div className="flex items-center justify-end">
                                                Amort.
                                                {getSortIcon('amortization')}
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestSort('interest')}>
                                            <div className="flex items-center justify-end">
                                                Juros
                                                {getSortIcon('interest')}
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestSort('insurance')}>
                                            <div className="flex items-center justify-end">
                                                Seguros
                                                {getSortIcon('insurance')}
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors text-right font-bold" onClick={() => requestSort('extraAmortization')}>
                                            <div className="flex items-center justify-end">
                                                Extra
                                                {getSortIcon('extraAmortization')}
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors text-right" onClick={() => requestSort('balance')}>
                                            <div className="flex items-center justify-end">
                                                Saldo
                                                {getSortIcon('balance')}
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedSchedule.map((row) => (
                                        <tr key={row.month} className="border-b border-border hover:bg-muted/50">
                                            <td className="px-4 py-3 text-center text-muted-foreground">{row.month}</td>
                                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.payment)}</td>
                                            <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(row.amortization)}</td>
                                            <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(row.interest)}</td>
                                            <td className="px-4 py-3 text-right text-muted-foreground text-xs">{formatCurrency(row.mip + row.dfi)}</td>
                                            <td className={`px-4 py-3 text-right font-bold ${row.extraAmortization > 0 ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-zinc-300 dark:text-zinc-700'}`}>
                                                {row.extraAmortization > 0 ? formatCurrency(row.extraAmortization) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.balance)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                </div>
            </div >
        </div >
    );
}
