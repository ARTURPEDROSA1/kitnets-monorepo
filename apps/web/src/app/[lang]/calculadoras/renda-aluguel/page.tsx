"use client";

import { useState, useMemo } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceDot,
} from "recharts";
import { Calculator, Info, AlertTriangle, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, User, Mail, CheckCircle2, Lock, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ... (formatCurrency and formatMonthYear helpers remain the same) ...
// Helper to format currency
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

// Helper for labels
const formatMonthYear = (monthIndex: number) => {
    const years = Math.floor(monthIndex / 12);
    const months = monthIndex % 12;
    if (years === 0) return `${months} meses`;
    return `${years} anos e ${months} meses`;
};

// --- Components ---

// --- Components ---

function SuggestionForm() {
    const [suggestion, setSuggestion] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            setSuccess(true);
            setSuggestion("");
            setEmail("");
        }, 1500);
    };

    if (success) {
        return (
            <div className="bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-900 rounded-xl p-12 text-center animate-in fade-in space-y-4 max-w-2xl mx-auto mt-16">
                <div className="flex justify-center">
                    <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                        <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-500" />
                    </div>
                </div>
                <div className="space-y-2">
                    <h3 className="font-bold text-xl">Obrigado pela sugestão!</h3>
                    <p className="text-muted-foreground">Vamos analisar seu pedido com carinho. Em breve novidades no Kitnets.com.</p>
                </div>
                <Button variant="outline" onClick={() => setSuccess(false)}>
                    Enviar outra sugestão
                </Button>
            </div>
        );
    }

    return (
        <div className="mt-16 bg-muted/30 border rounded-2xl p-8 md:p-12">
            <div className="max-w-xl mx-auto space-y-8">
                <div className="text-center space-y-3">
                    <div className="flex justify-center">
                        <div className="bg-primary/10 p-3 rounded-xl">
                            <MessageSquarePlus className="w-8 h-8 text-primary" />
                        </div>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Sentiu falta de alguma calculadora?</h2>
                    <p className="text-muted-foreground text-lg">
                        Estamos construindo o Kitnets.com para você. Conte-nos qual ferramenta ajudaria na sua jornada imobiliária.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 bg-background p-6 rounded-xl shadow-sm border">
                    <div className="space-y-2">
                        <Label htmlFor="suggestion">Qual calculadora você gostaria de ver aqui?</Label>
                        <textarea
                            id="suggestion"
                            required
                            placeholder="Ex: Calculadora de ROI para Airbnb, Simulador de Reforma, Venda vs Aluguel..."
                            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                            value={suggestion}
                            onChange={(e) => setSuggestion(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email_suggestion">Seu e-mail (opcional)</Label>
                        <Input
                            id="email_suggestion"
                            type="email"
                            placeholder="Para avisarmos quando lançarmos"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <Button type="submit" size="lg" className="w-full font-semibold" disabled={loading}>
                        {loading ? "Enviando sugestão..." : "Enviar Sugestão"}
                    </Button>
                </form>
            </div>
        </div>
    );
}

function LeadCaptureModal({ isOpen, onCapture }: { isOpen: boolean; onCapture: () => void }) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            onCapture();
        }, 1000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-background rounded-xl shadow-2xl w-full max-w-md overflow-hidden border animate-in zoom-in-95 duration-300">
                <div className="bg-muted/30 p-6 border-b">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-primary/10 rounded-full">
                            <Lock className="w-5 h-5 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold">Desbloquear Análise Completa</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Identificamos que você está personalizando sua simulação. Para continuar explorando os resultados detalhados, precisamos confirmar que você não é um robô.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Seu Nome</Label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="name"
                                placeholder="Como podemos te chamar?"
                                className="pl-9"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Seu Melhor E-mail</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="exemplo@email.com"
                                className="pl-9"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button type="submit" className="w-full" size="lg" disabled={loading}>
                            {loading ? "Confirmando..." : "Confirmar e Continuar"}
                        </Button>
                    </div>

                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg mt-4">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                        <p>
                            Fique tranquilo! Você será adicionado à nossa newsletter para receber dicas de investimento, mas pode cancelar a inscrição a qualquer momento. Zero spam.
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function RentalIncomeCalculator() {
    const [simulationDate] = useState(() => new Date());

    // View State
    const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // Lead Capture State
    const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());
    const [isLeadCaptured, setIsLeadCaptured] = useState(false);

    const trackModification = (fieldId: string) => {
        if (isLeadCaptured) return;
        if (!modifiedFields.has(fieldId)) {
            setModifiedFields(prev => {
                const newSet = new Set(prev);
                newSet.add(fieldId);
                return newSet;
            });
        }
    };

    const showLeadModal = !isLeadCaptured && modifiedFields.size >= 3;

    // --- State: Mortgage ---
    const [propertyPrice, setPropertyPrice] = useState(500000); // 500k
    const [downPayment, setDownPayment] = useState(100000); // 100k
    const [interestRate, setInterestRate] = useState(12.0); // 12% a.a.
    const [loanTerm, setLoanTerm] = useState(360); // 30 years
    const [amortizationSystem, setAmortizationSystem] = useState<"SAC" | "PRICE">("SAC");

    // Insurance & Fees (Auto + Editable)
    const [insuranceRate] = useState(0.8); // 0.8% a.a.
    const [manualInsuranceFees, setManualInsuranceFees] = useState<number | null>(null);
    const [downPaymentWarning, setDownPaymentWarning] = useState<string | null>(null);

    // --- State: Rental Income ---
    const [initialRent, setInitialRent] = useState(2500);
    const [rentReadjustment, setRentReadjustment] = useState(5); // 5% a.a.
    const [vacancyRate, setVacancyRate] = useState(5); // 5%
    const [monthlyCosts, setMonthlyCosts] = useState(0); // Condomínio/IPTU etc
    const [incomeTax, setIncomeTax] = useState(15); // 15%

    // Derived
    const loanAmount = Math.max(0, propertyPrice - downPayment);

    // Auto-calculate insurance if not manual
    const autoInsuranceFees = (loanAmount * (insuranceRate / 100)) / 12;
    const monthlyInsuranceFees = manualInsuranceFees !== null ? manualInsuranceFees : autoInsuranceFees;
    const isInsuranceManual = manualInsuranceFees !== null;

    const handleInsuranceChange = (val: number) => {
        trackModification('insurance');
        setManualInsuranceFees(val);
    };

    const handleDownPaymentBlur = () => {
        const minDownPayment = propertyPrice * 0.20;
        if (downPayment < minDownPayment) {
            setDownPayment(minDownPayment);
            setDownPaymentWarning(`Entrada ajustada para 20% do valor do imóvel (${formatCurrency(minDownPayment)})`);
        } else {
            setDownPaymentWarning(null);
        }
    };

    // --- Calculation Logic ---
    const results = useMemo(() => {
        const data = [];
        let outstandingBalance = loanAmount;
        const monthlyRate = interestRate / 100 / 12;

        let breakEvenMonth = -1;
        let breakEvenData = null;

        // Price constant payment calc (without insurance)
        // PMT = P * i * (1+i)^n / ((1+i)^n - 1)
        let pricePmt = 0;
        if (monthlyRate > 0) {
            pricePmt = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / (Math.pow(1 + monthlyRate, loanTerm) - 1);
        } else {
            pricePmt = loanAmount / loanTerm;
        }

        // SAC constant amortization
        const sacAmort = loanAmount / loanTerm;

        for (let m = 1; m <= loanTerm; m++) {
            // 1. Mortgage Payment
            let interest = outstandingBalance * monthlyRate;
            let amortization = 0;
            let mortgagePayment = 0;

            if (amortizationSystem === "SAC") {
                amortization = sacAmort;
                mortgagePayment = amortization + interest + monthlyInsuranceFees;
            } else {
                // Price
                // In Price, PMT is constant (base), but interest reduces, amort increases.
                // Payment = BasePMT + Insurance
                mortgagePayment = pricePmt + monthlyInsuranceFees;
                interest = outstandingBalance * monthlyRate;
                amortization = pricePmt - interest;
            }

            outstandingBalance -= amortization;
            if (outstandingBalance < 0) outstandingBalance = 0; // Floating point safety

            // 2. Rental Income
            // Year index starting at 0
            const year = Math.floor((m - 1) / 12);

            const adjustedGrossRent = initialRent * Math.pow(1 + rentReadjustment / 100, year);
            const effectiveRent = adjustedGrossRent * (1 - vacancyRate / 100);
            const netRentBeforeTax = effectiveRent - monthlyCosts;
            const netRentAfterTax = netRentBeforeTax * (1 - incomeTax / 100);

            const cashFlowDiff = netRentAfterTax - mortgagePayment;

            // Check break-even
            if (breakEvenMonth === -1 && netRentAfterTax >= mortgagePayment) {
                breakEvenMonth = m;
                breakEvenData = {
                    month: m,
                    mortgagePayment,
                    netRent: netRentAfterTax,
                    difference: cashFlowDiff
                };
            }

            // Date Calculation: Simulation Date + month
            const paymentDate = new Date(simulationDate);
            paymentDate.setMonth(simulationDate.getMonth() + m);
            const dateLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(paymentDate);

            data.push({
                month: m,
                dateLabel,
                yearLabel: (m / 12).toFixed(1),
                mortgagePayment,
                netRent: netRentAfterTax,
                difference: cashFlowDiff,
                outstandingBalance
            });
        }

        return { data, breakEvenMonth, breakEvenData };
    }, [
        simulationDate,
        loanAmount,
        loanTerm,
        interestRate,
        amortizationSystem,
        monthlyInsuranceFees,
        initialRent,
        rentReadjustment,
        vacancyRate,
        monthlyCosts,
        incomeTax
    ]);

    const { data, breakEvenMonth, breakEvenData } = results;

    // ... (rest of the component)

    // Type definition for data rows
    interface CalculationResult {
        month: number;
        dateLabel: string;
        yearLabel: string;
        mortgagePayment: number;
        netRent: number;
        difference: number;
        outstandingBalance: number;
    }

    const sortedData = useMemo(() => {
        if (!sortConfig) return data;
        return [...data].sort((a: CalculationResult, b: CalculationResult) => {
            const key = sortConfig.key as keyof CalculationResult;
            if (a[key] < b[key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[key] > b[key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [data, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <ArrowUpDown className="ml-2 h-3 w-3" />;
        }
        if (sortConfig.direction === 'asc') {
            return <ArrowUp className="ml-2 h-3 w-3" />;
        }
        return <ArrowDown className="ml-2 h-3 w-3" />;
    };

    return (
        <div className="container mx-auto p-6 max-w-7xl animate-in fade-in space-y-8">
            <LeadCaptureModal isOpen={showLeadModal} onCapture={() => setIsLeadCaptured(true)} />

            <div className="space-y-4 max-w-4xl">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                    A renda do aluguel paga o financiamento? Descubra em quanto tempo
                </h1>
                <div className="text-muted-foreground text-lg leading-relaxed space-y-2">
                    <p>
                        Comprar um imóvel financiado para alugar é uma das decisões financeiras mais comuns — e também uma das mais mal compreendidas.
                    </p>
                    <p className="font-semibold text-foreground">
                        👉 A pergunta certa não é apenas “quanto é a parcela?”, mas sim: em quanto tempo a renda do aluguel passa a pagar o financiamento sozinha?
                    </p>
                    <p>
                        Esta calculadora responde exatamente isso, de forma clara, visual e baseada na realidade do mercado brasileiro.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* INPUTS */}
                <div className="lg:col-span-1 space-y-6">

                    {/* Card 1: Mortgage */}
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 space-y-4">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-primary" />
                            Financiamento
                        </h2>

                        <div className="space-y-3">
                            <div>
                                <Label>Valor do Imóvel</Label>
                                <div className="relative mt-1">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                    <Input
                                        type="number"
                                        className="pl-9"
                                        value={propertyPrice}
                                        onChange={e => setPropertyPrice(Number(e.target.value))}
                                        onBlur={() => trackModification('propertyPrice')}
                                    />
                                </div>
                            </div>

                            <div>
                                <Label>Entrada</Label>
                                <div className="relative mt-1">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                    <Input
                                        type="number"
                                        className="pl-9"
                                        value={downPayment}
                                        onChange={e => {
                                            setDownPayment(Number(e.target.value));
                                            setDownPaymentWarning(null);
                                        }}
                                        onBlur={() => {
                                            trackModification('downPayment');
                                            handleDownPaymentBlur();
                                        }}
                                    />
                                </div>
                                {downPaymentWarning && (
                                    <p className="text-xs text-amber-600 mt-1 font-medium">{downPaymentWarning}</p>
                                )}
                            </div>

                            <div className="p-3 bg-muted/50 rounded-lg text-sm flex flex-col gap-1">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Valor Financiado:</span>
                                    <span className="font-semibold">{formatCurrency(loanAmount)}</span>
                                </div>
                                {loanAmount <= 0 && (
                                    <p className="text-xs text-red-500 font-medium mt-1">
                                        A entrada não pode ser maior que o valor do imóvel.
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label>Taxa Juros (% a.a.)</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        className="mt-1"
                                        value={interestRate}
                                        onChange={e => setInterestRate(Number(e.target.value))}
                                        onBlur={() => trackModification('interestRate')}
                                    />
                                </div>
                                <div>
                                    <Label>Prazo (meses)</Label>
                                    <Input
                                        type="number"
                                        className="mt-1"
                                        value={loanTerm}
                                        onChange={e => setLoanTerm(Number(e.target.value))}
                                        onBlur={() => trackModification('loanTerm')}
                                    />
                                </div>
                            </div>

                            <div>
                                <Label>Sistema de Amortização</Label>
                                <div className="flex gap-2 mt-1">
                                    <Button
                                        type="button"
                                        variant={amortizationSystem === "SAC" ? "default" : "outline"}
                                        className="flex-1"
                                        onClick={() => {
                                            trackModification('amortizationSystem');
                                            setAmortizationSystem("SAC");
                                        }}
                                    >
                                        SAC
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={amortizationSystem === "PRICE" ? "default" : "outline"}
                                        className="flex-1"
                                        onClick={() => {
                                            trackModification('amortizationSystem');
                                            setAmortizationSystem("PRICE");
                                        }}
                                    >
                                        PRICE
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label className="flex items-center gap-1">
                                    Seguros e Taxas (Mensal)
                                    <span title="MIP, DFI e taxas bancárias">
                                        <Info className="w-3 h-3 text-muted-foreground" />
                                    </span>
                                </Label>
                                <div className="relative mt-1">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                    <Input
                                        type="number"
                                        className="pl-9"
                                        value={Math.round(monthlyInsuranceFees)}
                                        onChange={e => handleInsuranceChange(Number(e.target.value))}
                                        onBlur={() => trackModification('insurance')}
                                    />
                                </div>
                                {!isInsuranceManual && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Estimado em {insuranceRate}% a.a.
                                    </p>
                                )}
                            </div>

                        </div>
                    </div>

                    {/* Card 2: Rent */}
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 space-y-4">
                        <h2 className="font-semibold flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-green-600" />
                            Aluguel
                        </h2>

                        <div className="space-y-3">
                            <div>
                                <Label>Aluguel Bruto Inicial</Label>
                                <div className="relative mt-1">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                    <Input
                                        type="number"
                                        className="pl-9"
                                        value={initialRent}
                                        onChange={e => setInitialRent(Number(e.target.value))}
                                        onBlur={() => trackModification('initialRent')}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label>Reajuste Anual (%)</Label>
                                    <Input
                                        type="number"
                                        step="0.5"
                                        className="mt-1"
                                        value={rentReadjustment}
                                        onChange={e => setRentReadjustment(Number(e.target.value))}
                                        onBlur={() => trackModification('rentReadjustment')}
                                    />
                                </div>
                                <div>
                                    <Label>Vacância (%)</Label>
                                    <Input
                                        type="number"
                                        step="1"
                                        className="mt-1"
                                        value={vacancyRate}
                                        onChange={e => setVacancyRate(Number(e.target.value))}
                                        onBlur={() => trackModification('vacancyRate')}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label>Custos Mensais</Label>
                                    <div className="relative mt-1">
                                        <span className="absolute left-2 top-2.5 text-muted-foreground text-xs">R$</span>
                                        <Input
                                            type="number"
                                            className="pl-6"
                                            value={monthlyCosts}
                                            onChange={e => setMonthlyCosts(Number(e.target.value))}
                                            onBlur={() => trackModification('monthlyCosts')}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label>Imp. Renda (%)</Label>
                                    <Input
                                        type="number"
                                        className="mt-1"
                                        value={incomeTax}
                                        onChange={e => setIncomeTax(Number(e.target.value))}
                                        onBlur={() => trackModification('incomeTax')}
                                    />
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                {/* RESULTS & CHART */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Break-even Summary */}
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h3 className="text-lg font-semibold text-muted-foreground">O aluguel paga o imóvel em:</h3>
                                {breakEvenMonth > 0 ? (
                                    <div className="text-3xl font-bold text-primary mt-1">
                                        {formatMonthYear(breakEvenMonth)}
                                    </div>
                                ) : (
                                    <div className="text-3xl font-bold text-red-500 mt-1 flex items-center gap-2">
                                        <AlertTriangle className="w-8 h-8" />
                                        Nunca no prazo
                                    </div>
                                )}
                                <p className="text-sm text-muted-foreground mt-1">
                                    {breakEvenMonth > 0
                                        ? `No mês ${breakEvenMonth}, a renda líquida supera a parcela.`
                                        : "A renda líquida não supera a parcela dentro do prazo do financiamento."
                                    }
                                </p>
                            </div>

                            {breakEvenData && (
                                <div className="text-right hidden md:block">
                                    <div className="text-sm text-muted-foreground">Diferença no ponto de equilíbrio</div>
                                    <div className="text-xl font-semibold text-green-600">
                                        +{formatCurrency(breakEvenData.difference)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {/* Row 1: Parcela (Mortgage) */}
                        <div className="bg-muted/40 p-4 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Parcela Inicial</div>
                            <div className="font-semibold">{formatCurrency(data[0]?.mortgagePayment || 0)}</div>
                        </div>
                        <div className="bg-muted/40 p-4 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Parcela no Equilibrio</div>
                            <div className="font-semibold">
                                {breakEvenData ? formatCurrency(breakEvenData.mortgagePayment) : "-"}
                            </div>
                        </div>
                        <div className="bg-muted/40 p-4 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Parcela Final</div>
                            <div className="font-semibold">
                                {formatCurrency(data[data.length - 1]?.mortgagePayment || 0)}
                            </div>
                        </div>

                        {/* Row 2: Renda (Income) */}
                        <div className="bg-muted/40 p-4 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Renda Líq. Inicial</div>
                            <div className="font-semibold text-green-600">{formatCurrency(data[0]?.netRent || 0)}</div>
                        </div>
                        <div className="bg-muted/40 p-4 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Renda no Equilíbrio</div>
                            <div className="font-semibold text-green-600">
                                {breakEvenData ? formatCurrency(breakEvenData.netRent) : "-"}
                            </div>
                        </div>
                        <div className="bg-muted/40 p-4 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Renda Líq. Final</div>
                            <div className="font-semibold text-green-600">
                                {formatCurrency(data[data.length - 1]?.netRent || 0)}
                            </div>
                        </div>
                    </div>

                    {/* Chart / Table Toggle */}
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                            <h3 className="font-semibold text-lg leading-tight">Comparativo: Parcela vs. Renda Líquida</h3>
                            <div className="flex bg-muted rounded-lg p-1 gap-1 self-start sm:self-auto">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewMode('chart')}
                                    className={`h-7 px-3 text-xs rounded-md transition-all ${viewMode === 'chart'
                                        ? 'bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
                                        }`}
                                >
                                    Gráfico
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewMode('table')}
                                    className={`h-7 px-3 text-xs rounded-md transition-all ${viewMode === 'table'
                                        ? 'bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
                                        }`}
                                >
                                    Tabela
                                </Button>
                            </div>
                        </div>

                        {/* Custom Legend for better mobile responsiveness */}
                        {viewMode === 'chart' && (
                            <div className="flex flex-wrap gap-4 justify-center mb-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                                    <span className="text-muted-foreground">Parcela Financiamento</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-green-600" />
                                    <span className="text-muted-foreground">Renda Líquida Aluguel</span>
                                </div>
                            </div>
                        )}

                        {viewMode === 'chart' ? (
                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data} margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                        <XAxis
                                            dataKey="month"
                                            ticks={Array.from({ length: Math.floor(loanTerm / 60) }, (_, i) => (i + 1) * 60)}
                                            tickFormatter={(val) => `${val / 12}a`}
                                            tickMargin={10}
                                        />
                                        <YAxis
                                            tickFormatter={(val) => `R$${val / 1000}k`}
                                        />
                                        <Tooltip
                                            formatter={(value: any) => [formatCurrency(value), ""]}
                                            labelFormatter={(label: any, payload: any) => {
                                                if (payload && payload.length > 0) {
                                                    const item = payload[0].payload;
                                                    return `Mês ${label} (${item.dateLabel})`;
                                                }
                                                return `Mês ${label} (${formatMonthYear(Number(label))})`;
                                            }}
                                            contentStyle={{
                                                borderRadius: '8px',
                                                border: '1px solid #333',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                                backgroundColor: '#1e1e1e',
                                                color: '#fff'
                                            }}
                                        />
                                        <Line

                                            type="monotone"
                                            name="Parcela Financiamento"
                                            dataKey="mortgagePayment"
                                            stroke="#f97316"
                                            strokeWidth={3}
                                            dot={false}
                                        />
                                        <Line
                                            type="stepAfter"
                                            name="Renda Líquida Aluguel"
                                            dataKey="netRent"
                                            stroke="#16a34a"
                                            strokeWidth={3}
                                            dot={false}
                                        />
                                        {breakEvenData && (
                                            <ReferenceDot
                                                x={breakEvenData.month}
                                                y={breakEvenData.mortgagePayment}
                                                r={6}
                                                fill="#3b82f6"
                                                stroke="#fff"
                                            />
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-[400px] w-full overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left bg-muted sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="p-2 font-medium">
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => requestSort('month')}
                                                    className="h-8 p-0 hover:bg-transparent font-medium"
                                                >
                                                    Mês
                                                    {getSortIcon('month')}
                                                </Button>
                                            </th>
                                            <th className="p-2 font-medium">
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => requestSort('mortgagePayment')}
                                                    className="h-8 p-0 hover:bg-transparent font-medium"
                                                >
                                                    Parcela
                                                    {getSortIcon('mortgagePayment')}
                                                </Button>
                                            </th>
                                            <th className="p-2 font-medium">
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => requestSort('netRent')}
                                                    className="h-8 p-0 hover:bg-transparent font-medium"
                                                >
                                                    Renda Líq.
                                                    {getSortIcon('netRent')}
                                                </Button>
                                            </th>
                                            <th className="p-2 font-medium text-right">
                                                <div className="flex justify-end">
                                                    <Button
                                                        variant="ghost"
                                                        onClick={() => requestSort('difference')}
                                                        className="h-8 p-0 hover:bg-transparent font-medium"
                                                    >
                                                        Diferença
                                                        {getSortIcon('difference')}
                                                    </Button>
                                                </div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {sortedData.map((row) => (
                                            <tr key={row.month} className="hover:bg-muted/20">
                                                <td className="p-2">
                                                    <div className="font-medium">{row.dateLabel}</div>
                                                    <div className="text-xs text-muted-foreground">{row.month}º mês</div>
                                                </td>
                                                <td className="p-2 text-orange-600 font-medium">
                                                    {formatCurrency(row.mortgagePayment)}
                                                </td>
                                                <td className="p-2 text-green-600 font-medium">
                                                    {formatCurrency(row.netRent)}
                                                </td>
                                                <td className={`p-2 font-bold text-right ${row.difference >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {formatCurrency(row.difference)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* SEO / Editorial Content Section */}
                    <div className="mt-12 space-y-12 max-w-4xl">

                        {/* What This Calculator Does */}
                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold tracking-tight">Como funciona a Calculadora “A renda do aluguel paga o imóvel?”</h2>
                            <p className="text-muted-foreground leading-relaxed">
                                A calculadora simula, mês a mês, a relação entre:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                                <li><strong>A parcela do financiamento imobiliário</strong></li>
                                <li>
                                    <strong>A renda líquida do aluguel</strong>, já descontando:
                                    <ul className="list-circle pl-6 mt-1 space-y-1">
                                        <li>Vacância</li>
                                        <li>Custos mensais</li>
                                        <li>Imposto de renda</li>
                                        <li>Reajuste anual do aluguel</li>
                                    </ul>
                                </li>
                            </ul>
                            <p className="text-muted-foreground leading-relaxed">
                                O resultado mostra o mês e o ano exatos em que o aluguel supera a parcela, transformando o imóvel em um ativo que se paga sozinho.
                            </p>
                        </section>

                        {/* Financing Section */}
                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold tracking-tight">Financiamento imobiliário realista (SAC ou PRICE)</h2>
                            <p className="text-muted-foreground leading-relaxed">
                                Você pode escolher entre os dois principais sistemas usados no Brasil:
                            </p>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-muted/30 p-4 rounded-lg">
                                    <h3 className="font-semibold mb-2">SAC (Sistema de Amortização Constante)</h3>
                                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                        <li>Parcela começa mais alta e diminui ao longo do tempo</li>
                                        <li>Geralmente atinge o ponto de equilíbrio mais cedo</li>
                                    </ul>
                                </div>
                                <div className="bg-muted/30 p-4 rounded-lg">
                                    <h3 className="font-semibold mb-2">PRICE (Tabela Price)</h3>
                                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                        <li>Parcela fixa ao longo do financiamento</li>
                                        <li>Mais previsível, porém demora mais para o aluguel cobrir a parcela</li>
                                    </ul>
                                </div>
                            </div>
                            <p className="text-muted-foreground text-sm mt-2">
                                A simulação inclui seguros e taxas obrigatórias, estimados automaticamente, mas totalmente editáveis, como ocorre na prática com os bancos.
                            </p>
                        </section>

                        {/* Rental Income Section */}
                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold tracking-tight">Renda do aluguel ajustada à realidade</h2>
                            <p className="text-muted-foreground leading-relaxed">
                                A renda do aluguel não é tratada de forma simplista. O cálculo considera:
                            </p>
                            <ul className="grid sm:grid-cols-2 gap-2 text-muted-foreground">
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Aluguel bruto inicial</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Reajuste anual do aluguel (ex.: IPCA)</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Vacância média</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Custos mensais (condomínio, IPTU...)</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Imposto de renda sobre o aluguel</li>
                            </ul>
                            <p className="text-muted-foreground leading-relaxed">
                                O resultado é a renda líquida real, que cresce ao longo do tempo e é comparada diretamente com a parcela do financiamento.
                            </p>
                        </section>

                        {/* Chart Explanation Section */}
                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold tracking-tight">Visual claro: parcela vs. renda do aluguel</h2>
                            <p className="text-muted-foreground leading-relaxed">
                                O gráfico mostra duas linhas ao longo do tempo:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                                <li>
                                    <strong>Linha da parcela do financiamento:</strong> Decrescente no SAC ou constante no PRICE.
                                </li>
                                <li>
                                    <strong>Linha da renda líquida do aluguel:</strong> Crescente, com reajustes anuais.
                                </li>
                            </ul>
                            <p className="font-medium text-foreground flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                O ponto de cruzamento indica quando o aluguel passa a pagar o imóvel.
                            </p>
                        </section>

                        {/* Key Insights Section */}
                        <section className="space-y-4 bg-muted/20 p-6 rounded-xl border">
                            <h2 className="text-2xl font-bold tracking-tight">O que você aprende com esta simulação</h2>
                            <ul className="space-y-2">
                                <li className="flex gap-3">
                                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                                    <span className="text-muted-foreground">Em quantos anos o imóvel se torna autossustentável</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                                    <span className="text-muted-foreground">Qual sistema (SAC ou PRICE) faz mais sentido para você</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                                    <span className="text-muted-foreground">O impacto real de juros, seguros e impostos</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                                    <span className="text-muted-foreground">Como o reajuste do aluguel muda o jogo no longo prazo</span>
                                </li>
                            </ul>
                        </section>

                        {/* Trust & Disclaimer Section */}
                        <section className="space-y-4 border-t pt-8">
                            <h2 className="text-xl font-semibold tracking-tight">Importante saber</h2>
                            <div className="text-sm text-muted-foreground space-y-3">
                                <p>
                                    Esta calculadora tem caráter informativo e educacional.
                                    <strong> Não constitui oferta de crédito, recomendação de investimento ou garantia de rentabilidade.</strong>
                                </p>
                                <p>
                                    Os resultados dependem de premissas que podem variar conforme:
                                </p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Taxas de juros</li>
                                    <li>Condições de financiamento das instituições financeiras</li>
                                    <li>Mercado de aluguel local e vacância</li>
                                    <li>Regime tributário do investidor</li>
                                </ul>
                            </div>
                        </section>

                    </div>

                </div>
            </div>

            <SuggestionForm />
        </div>
    );
}
