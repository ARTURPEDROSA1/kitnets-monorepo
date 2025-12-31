"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { getDictionary } from "@/dictionaries";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from "recharts";
import {
    Calculator,
    Calendar,
    CreditCard,
    TrendingUp,
    AlertTriangle,
    Info,
    CheckCircle2,
    ArrowRight,
    BarChart3,
    Table,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { CalculatorSuggestion } from "@/components/calculators/CalculatorSuggestion";
import LeadCaptureModal from "@/components/calculators/LeadCaptureModal";
import { useCalculatorLeadCapture } from "@/hooks/useCalculatorLeadCapture";

import { getEconomicData } from "@/app/actions/get-economic-data";
import { IndexValue } from "@/lib/indexes";

const INDEX_COLORS: Record<string, string> = {
    IPCA: "#16a34a", // green-600
    IGPM: "#ea580c", // orange-600
    INPC: "#2563eb", // blue-600
    IVAR: "#9333ea", // purple-600
    FipeZap: "#db2777", // pink-600
};

// Helper: Format Currency
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

// Helper: Format Percent
const formatPercent = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value / 100);
};




export default function RentAdjustmentCalculatorClient() {
    const params = useParams();
    const lang = (params?.lang as string) || "pt";
    // cast to any to avoid type check issues if dictionary types aren't perfectly up to date with the new key immediately
    const dict = getDictionary(lang) as any;

    // --- State ---
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [currentRent, setCurrentRent] = useState<number>(1000);
    const [method, setMethod] = useState<"index" | "fixed">("index");
    const [selectedIndex, setSelectedIndex] = useState<string>("IPCA");
    const [fixedPercent, setFixedPercent] = useState<number | string>(5);

    // Results State
    // Results State
    const [isCalculated, setIsCalculated] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    // Lead Capture State
    // Lead Capture Hook
    const {
        isModalOpen,
        setIsModalOpen,
        leadMetadata,
        trackInteraction,
        checkAdvancedTrigger,
        hasVerifiedCookie
    } = useCalculatorLeadCapture({
        calculatorType: "calculadora-reajuste-aluguel"
    });

    // View State
    const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // --- Computed Values ---

    // Calculate contract duration/anniversary
    const contractInfo = useMemo(() => {
        if (!startDate) return null;
        const start = new Date(startDate + "T12:00:00"); // Avoid timezone issues
        const today = new Date();

        // Diff in months
        let months = (today.getFullYear() - start.getFullYear()) * 12;
        months -= start.getMonth();
        months += today.getMonth();

        // Exact Anniversary (Month/Year)
        const nextAnniversary = new Date(start);
        nextAnniversary.setFullYear(today.getFullYear());
        if (nextAnniversary < today) {
            nextAnniversary.setFullYear(today.getFullYear() + 1);
        }

        return {
            monthsElapsed: months,
            nextAnniversary,
            anniversaryMonthStr: nextAnniversary.toLocaleDateString("pt-BR", { month: 'long', year: 'numeric' }),
            nextAdjustmentFullDate: nextAnniversary.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit', year: 'numeric' })
        };
    }, [startDate]);

    // Validation: Is eligible for index calc?
    const isEligibleForIndex = useMemo(() => {
        if (!contractInfo) return false;
        return contractInfo.monthsElapsed >= 10;
        // In real app, we might check if < 12 but > 10 to allow forecast
    }, [contractInfo]);

    // Validation: Form ready?
    const isFormValid = useMemo(() => {
        if (!startDate || !currentRent) return false;
        if (method === 'index' && !isEligibleForIndex) return false;
        if (method === 'fixed' && (!fixedPercent || Number(fixedPercent) <= 0)) return false;
        return true;
    }, [startDate, currentRent, method, isEligibleForIndex, fixedPercent]);

    interface AdjustmentHistory {
        year: number;
        date: string;
        oldRent: number;
        newRent: number;
        increase: number;
        percent: number;
        isForecast?: boolean;
    }

    interface MonthlyData {
        month: string;
        fullDate: string;
        value: number;
        accumulated: number;
    }

    interface CalculationResult {
        totalFinalRent: number;
        history: AdjustmentHistory[];
        monthlyData: MonthlyData[];
    }

    // --- Calculation Engine ---
    const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);

    // Replaces the useMemo calculation with an async effect triggered by handleCalculate
    // We keep this hook for sync validation or simple computed values if needed
    // but the heavy lifting moves to handleCalculate



    // Sorting Logic
    const sortedData = useMemo(() => {
        if (!calculationResult?.monthlyData) return [];
        const sortableItems = [...calculationResult.monthlyData];

        if (sortConfig !== null) {
            sortableItems.sort((a: MonthlyData, b: MonthlyData) => {
                const aValue = (a as any)[sortConfig.key];
                const bValue = (b as any)[sortConfig.key];

                // Handle different types if necessary, currently mostly numbers/strings
                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [calculationResult, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const performCalculation = async () => {
        setIsAnimating(true);

        try {
            let finalResult = null;

            if (method === 'fixed') {
                const rentValue = Number(currentRent);
                const pct = Number(fixedPercent);
                const accumulatedRate = pct / 100;

                // Fixed method logic - simplified for single step, could be expanded if needed
                // For now, consistent with existing behavior but structured for potential future expansion
                const finalRent = rentValue * (1 + accumulatedRate);

                finalResult = {
                    totalFinalRent: finalRent,
                    history: [{
                        year: new Date().getFullYear(),
                        date: new Date().toLocaleDateString("pt-BR"),
                        oldRent: rentValue,
                        newRent: finalRent,
                        increase: finalRent - rentValue,
                        percent: pct
                    }],
                    monthlyData: []
                };
            } else {
                // Fetch real data
                const fetchedData = await getEconomicData(selectedIndex);

                // Perform Multi-Year Calculation
                const start = new Date(startDate + "T12:00:00");
                const today = new Date();
                let currentCalculationRent = Number(currentRent);

                const checkDate = new Date(start);
                checkDate.setFullYear(checkDate.getFullYear() + 1); // First adjustment

                const adjustments: AdjustmentHistory[] = [];
                const allMonthlyData: MonthlyData[] = []; // Accumulate all monthly points here

                // Loop through anniversaries until we reach a forecast limit
                // Allow forecast up to 1 year ahead of Today
                const limitDate = new Date(today);
                limitDate.setFullYear(limitDate.getFullYear() + 1);

                // Limit max loop to minimize infinite loop risk (e.g. 10 years)
                let loopCount = 0;

                while (checkDate <= limitDate && loopCount < 10) {
                    loopCount++;

                    const windowStart = new Date(checkDate);
                    windowStart.setFullYear(windowStart.getFullYear() - 1);

                    let accRate = 1;

                    // Generate expected months for this year's window
                    for (let i = 0; i < 12; i++) {
                        const targetMonthDate = new Date(windowStart);
                        targetMonthDate.setMonth(windowStart.getMonth() + i);

                        const y = targetMonthDate.getFullYear();
                        const m = targetMonthDate.getMonth() + 1;

                        // Find value in fetchedData
                        const found = fetchedData.find((d: IndexValue) => d.year === y && d.month === m);

                        let val = 0;
                        if (found) {
                            val = found.value_percent;
                        } else {
                            // Forecast logic: use last known value
                            const lastKnown = fetchedData[fetchedData.length - 1];
                            val = lastKnown ? lastKnown.value_percent : 0.5; // fallback
                        }

                        accRate *= (1 + (val / 100));

                        // Unique Key Generation (important for chart if months repeat but distinct periods)
                        // We use Full Date as visual X-Axis label or tooltip header

                        allMonthlyData.push({
                            // Format: "mm/yy" for chart X-Axis
                            month: `${(targetMonthDate.getMonth() + 1).toString().padStart(2, '0')}/${targetMonthDate.getFullYear().toString().slice(-2)}`,
                            fullDate: targetMonthDate.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit', year: 'numeric' }),
                            value: val,
                            // Accumulated since start of THIS period (standard display)
                            accumulated: (accRate - 1) * 100
                        });
                    }

                    const accumulatedPercent = (accRate - 1) * 100;
                    const increase = currentCalculationRent * (accRate - 1);
                    const newRent = currentCalculationRent * accRate;

                    // Determine if this is a forecast (future) or past/present
                    const isForecast = checkDate > today;

                    adjustments.push({
                        date: checkDate.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit', year: 'numeric' }),
                        year: checkDate.getFullYear(),
                        oldRent: currentCalculationRent,
                        newRent: newRent,
                        increase,
                        percent: accumulatedPercent,
                        isForecast
                    });

                    currentCalculationRent = newRent; // Base for next year

                    // Move to next year
                    checkDate.setFullYear(checkDate.getFullYear() + 1);
                }

                finalResult = {
                    totalFinalRent: currentCalculationRent,
                    history: adjustments,
                    monthlyData: allMonthlyData
                };
            }

            setCalculationResult(finalResult);
            setIsCalculated(true);

            // Scroll
            setTimeout(() => {
                const resultsElement = document.getElementById("results-section");
                if (resultsElement) resultsElement.scrollIntoView({ behavior: "smooth" });
            }, 100);

        } catch (err) {
            console.error("Calculation failed", err);
        } finally {
            setIsAnimating(false);
        }
    };

    const handleCalculate = () => {
        trackInteraction();
        if (!hasVerifiedCookie) {
            checkAdvancedTrigger();
            return;
        }
        performCalculation();
    };

    const handleRentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, ''); // Remove non-numeric
        const value = rawValue ? parseInt(rawValue, 10) / 100 : 0;
        setCurrentRent(value);
    };

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-8 animate-in fade-in duration-500">
            <LeadCaptureModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                calculatorType="calculadora-reajuste-aluguel"
                leadMetadata={leadMetadata}
            />

            {/* Header / SEO Area */}
            <div className="space-y-4 max-w-3xl">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                    Calculadora de Reajuste de Aluguel
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                    Atualize o valor do aluguel de forma justa e correta. Utilize índices oficiais (IPCA, IGP-M, IVAR) ou taxas fixas para calcular o novo valor do contrato.
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                    <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Atualizado Mensalmente
                    </span>
                    <span className="px-3 py-1 bg-muted text-muted-foreground text-xs font-medium rounded-full">
                        Lei do Inquilinato (8.245/91)
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* --- Left Column: Inputs --- */}
                <div className="lg:col-span-5 space-y-6">

                    {/* Card 1: Contract Info */}
                    <div className="bg-card border rounded-xl shadow-sm p-6 space-y-5">
                        <div className="flex items-center gap-2 border-b pb-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <Calendar className="w-5 h-5 text-primary" />
                            </div>
                            <h2 className="font-semibold text-lg">Dados do Contrato</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Label className="text-sm font-medium mb-1.5 block">
                                    Início do Contrato (ou último reajuste)
                                </Label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    min="2023-01-01"
                                    className="w-full"
                                />
                                {contractInfo && (
                                    <div className="mt-2 text-xs p-2 bg-muted/50 rounded flex items-center justify-between">
                                        <span className="text-muted-foreground">Próximo Reajuste:</span>
                                        <span className="font-medium text-primary">{contractInfo.nextAdjustmentFullDate}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Current Rent */}
                    <div className="bg-card border rounded-xl shadow-sm p-6 space-y-5">
                        <div className="flex items-center gap-2 border-b pb-3">
                            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                <CreditCard className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <h2 className="font-semibold text-lg">Valor Atual</h2>
                        </div>

                        <div>
                            <Label className="text-sm font-medium mb-1.5 block">Aluguel Mensal Atual</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                <Input
                                    type="text"
                                    inputMode="numeric"
                                    className="pl-9 text-lg font-medium"
                                    value={currentRent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    onChange={handleRentChange}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Adjustment Method */}
                    <div className="bg-card border rounded-xl shadow-sm p-6 space-y-5">
                        <div className="flex items-center gap-2 border-b pb-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="font-semibold text-lg">Método de Reajuste</h2>
                        </div>

                        <RadioGroup
                            defaultValue="index"
                            value={method}
                            onValueChange={(val) => setMethod(val as "index" | "fixed")}
                            className="grid grid-cols-2 gap-4"
                        >
                            <label className={`flex flex-col items-center justify-between rounded-xl border-2 p-4 hover:bg-muted/50 cursor-pointer transition-all ${method === 'index' ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/20'}`}>
                                <RadioGroupItem value="index" className="sr-only" />
                                <BarChart3 className={`mb-3 w-6 h-6 ${method === 'index' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <span className="text-sm font-medium">Por Índice</span>
                            </label>

                            <label className={`flex flex-col items-center justify-between rounded-xl border-2 p-4 hover:bg-muted/50 cursor-pointer transition-all ${method === 'fixed' ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/20'}`}>
                                <RadioGroupItem value="fixed" className="sr-only" />
                                <Calculator className={`mb-3 w-6 h-6 ${method === 'fixed' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <span className="text-sm font-medium">% Fixo</span>
                            </label>
                        </RadioGroup>

                        <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                            {method === 'index' ? (
                                <div className="space-y-4">
                                    <div>
                                        <Label className="mb-1.5 block">Selecione o Índice</Label>
                                        <Select value={selectedIndex} onValueChange={setSelectedIndex}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="IPCA">IPCA (Recomendado)</SelectItem>
                                                <SelectItem value="IGPM">IGP-M (Mais Volátil)</SelectItem>
                                                <SelectItem value="INPC">INPC (Renda Familiar)</SelectItem>
                                                <SelectItem value="IVAR">IVAR (Residencial FGV)</SelectItem>
                                                <SelectItem value="FipeZap">FipeZap (Mercado)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground mt-2">
                                            {selectedIndex === "IPCA" && "O IPCA é o índice oficial de inflação e o mais utilizado em contratos recentes devido à sua estabilidade."}
                                            {selectedIndex === "IGPM" && "Historicamente utilizado, mas pode sofrer grandes oscilações cambiais."}
                                            {selectedIndex === "INPC" && "Mede a variação para famílias com renda de 1 a 5 salários mínimos."}
                                            {selectedIndex === "IVAR" && "Índice específico da FGV para variação de aluguéis residenciais."}
                                        </p>
                                    </div>

                                    {/* Warning if contract < 10 months */}
                                    {startDate && !isEligibleForIndex && (
                                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs flex gap-2 text-amber-800 dark:text-amber-400">
                                            <AlertTriangle className="w-4 h-4 shrink-0" />
                                            <span>
                                                Seu contrato parece ter menos de 10 meses. Reajustes por índice geralmente acumulam 12 meses.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <Label className="mb-1.5 block">Percentual Acordado (%)</Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={fixedPercent}
                                            onChange={(e) => setFixedPercent(e.target.value)}
                                            className="pr-8"
                                        />
                                        <span className="absolute right-3 top-2.5 text-muted-foreground">%</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Utilizado em negociações diretas entre proprietário e inquilino.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CTA */}
                    <Button
                        size="lg"
                        className="w-full text-lg font-semibold shadow-lg"
                        disabled={!isFormValid || isAnimating}
                        onClick={handleCalculate}
                    >
                        {isAnimating ? "Calculando..." : "Calcular Reajuste"}
                        {!isAnimating && <ArrowRight className="ml-2 w-5 h-5" />}
                    </Button>

                </div>

                {/* --- Right Column: Results --- */}
                <div className="lg:col-span-7 space-y-6" id="results-section">

                    {!isCalculated ? (
                        /* Empty State / Placeholder */
                        <div className="h-full min-h-[400px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/10">
                            <Calculator className="w-16 h-16 mb-4 opacity-20" />
                            <h3 className="text-xl font-semibold mb-2">Aguardando Dados</h3>
                            <p className="max-w-xs">Preencha os dados do contrato ao lado para visualizar a estimativa de reajuste.</p>
                        </div>
                    ) : calculationResult && (
                        /* Results Display */
                        <div className="animate-in slide-in-from-bottom-4 duration-700 space-y-6">

                            {/* Result Lists */}
                            <div className="space-y-8">
                                {calculationResult.history.map((item: AdjustmentHistory, index: number) => (
                                    <div key={index} className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-full ${item.isForecast ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                                                {item.isForecast ? <TrendingUp className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                            </div>
                                            <h3 className="font-semibold text-lg">
                                                Reajuste {item.year}
                                                <span className="text-sm font-normal text-muted-foreground ml-2">
                                                    ({item.date}) {item.isForecast && "- Previsão"}
                                                </span>
                                            </h3>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* Result Card 1 */}
                                            <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 p-3 opacity-10">
                                                    <TrendingUp className="w-12 h-12 text-primary" />
                                                </div>
                                                <p className="text-sm text-muted-foreground font-medium mb-1">Novo Aluguel</p>
                                                <h3 className="text-2xl font-bold text-primary">
                                                    {formatCurrency(item.newRent)}
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-2">Valor atualizado</p>
                                            </div>

                                            {/* Result Card 2 */}
                                            <div className="bg-card border rounded-xl p-5">
                                                <p className="text-sm text-muted-foreground font-medium mb-1">Aumento</p>
                                                <h3 className="text-2xl font-bold text-foreground">
                                                    +{formatCurrency(item.increase)}
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-2">Diferença mensal</p>
                                            </div>

                                            {/* Result Card 3 */}
                                            <div className="bg-card border rounded-xl p-5">
                                                <p className="text-sm text-muted-foreground font-medium mb-1">
                                                    {method === 'fixed' ? 'Reajuste Fixo' : `Acumulado (${selectedIndex})`}
                                                </p>
                                                <h3 className="text-2xl font-bold text-foreground">
                                                    {formatPercent(item.percent)}
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    {method === 'index' ? 'Neste período' : 'Taxa aplicada'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Chart / Table Section */}
                            {method === 'index' && calculationResult.monthlyData.length > 0 && (
                                <div className="bg-card border rounded-xl shadow-sm p-6">
                                    <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                                        <div>
                                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                                <BarChart3 className="w-5 h-5 text-muted-foreground" />
                                                Evolução do Índice ({selectedIndex})
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Comportamento mensal do índice no período analisado.
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setViewMode("chart")}
                                                className={`h-8 px-3 rounded-md text-xs font-medium ${viewMode === 'chart' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-transparent'}`}
                                            >
                                                <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                                                Gráfico
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setViewMode("table")}
                                                className={`h-8 px-3 rounded-md text-xs font-medium ${viewMode === 'table' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-transparent'}`}
                                            >
                                                <Table className="w-3.5 h-3.5 mr-1.5" />
                                                Tabela
                                            </Button>
                                        </div>
                                    </div>

                                    {viewMode === "chart" ? (
                                        <div className="h-[300px] w-full animate-in fade-in zoom-in-95 duration-300">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={calculationResult.monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorIndex" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={INDEX_COLORS[selectedIndex] || INDEX_COLORS.IPCA} stopOpacity={0.2} />
                                                            <stop offset="95%" stopColor={INDEX_COLORS[selectedIndex] || INDEX_COLORS.IPCA} stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                                    <XAxis
                                                        dataKey="month"
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 12, fill: '#888' }}
                                                        dy={10}
                                                    />
                                                    <YAxis
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 12, fill: '#888' }}
                                                    />
                                                    <Tooltip
                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                        formatter={(val: number | string | undefined) => [`${Number(val || 0).toFixed(2)}%`, `Variação`]}
                                                    />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="value"
                                                        stroke={INDEX_COLORS[selectedIndex] || INDEX_COLORS.IPCA}
                                                        fillOpacity={1}
                                                        fill="url(#colorIndex)"
                                                        strokeWidth={2}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto animate-in fade-in zoom-in-95 duration-300">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                                                    <tr>
                                                        <th scope="col" className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('fullDate')}>
                                                            <div className="flex items-center gap-1">
                                                                Mês/Ano
                                                                {sortConfig?.key === 'fullDate' ? (
                                                                    sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                                                            </div>
                                                        </th>
                                                        <th scope="col" className="px-4 py-3 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('value')}>
                                                            <div className="flex items-center justify-end gap-1">
                                                                Variação Mensal
                                                                {sortConfig?.key === 'value' ? (
                                                                    sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                                                            </div>
                                                        </th>
                                                        <th scope="col" className="px-4 py-3 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('accumulated')}>
                                                            <div className="flex items-center justify-end gap-1">
                                                                Acumulado
                                                                {sortConfig?.key === 'accumulated' ? (
                                                                    sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                                                            </div>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {sortedData.map((item: MonthlyData, index: number) => (
                                                        <tr key={index} className="hover:bg-muted/20 transition-colors">
                                                            <td className="px-4 py-3 font-medium">{item.fullDate}</td>
                                                            <td className={`px-4 py-3 text-right font-medium ${item.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                                {item.value > 0 ? '+' : ''}{formatPercent(item.value)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-muted-foreground">
                                                                {formatPercent(item.accumulated)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Warning High Adjustment */}
                            {calculationResult.history.some((h: AdjustmentHistory) => h.percent > 20) && (
                                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/20 p-4 rounded-xl flex gap-3 text-amber-800 dark:text-amber-400">
                                    <AlertTriangle className="w-5 h-5 shrink-0 mt-1" />
                                    <div>
                                        <h4 className="font-semibold text-sm">Atenção: Reajuste Elevado</h4>
                                        <p className="text-sm mt-1 opacity-90">
                                            Um ou mais reajustes calcularam acima de 20%. Valores muito altos podem ser questionados judicialmente. Considere negociar um percentual intermediário.
                                        </p>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>

            {/* Disclaimer & Educational */}
            <div className="mt-16 pt-8 border-t space-y-8">
                <div className="bg-muted/30 rounded-2xl p-8 md:p-10 space-y-4">
                    <h3 className="font-bold text-xl flex items-center gap-2">
                        <Info className="w-6 h-6 text-primary" />
                        Entenda o Reajuste de Aluguel
                    </h3>
                    <div className="grid md:grid-cols-2 gap-8 text-muted-foreground leading-relaxed text-sm md:text-base">
                        <p>
                            O reajuste do aluguel é previsto na Lei do Inquilinato (Lei nº 8.245/91) e deve ocorrer anualmente, baseado em um índice oficial acordado em contrato. O objetivo é recompor o valor da moeda frente à inflação, mantendo o equilíbrio financeiro do contrato.
                        </p>
                        <p>
                            Embora o contrato estipule um índice (comumente o IPCA ou IGP-M), locador e locatário podem livremente negociar um índice diferente ou um valor fixo no momento da renovação, especialmente em cenários econômicos atípicos onde o índice contratual dispara.
                        </p>
                    </div>
                </div>

                <div className="text-center text-xs text-muted-foreground max-w-2xl mx-auto pb-8">
                    <p className="font-semibold mb-1">Aviso Legal</p>
                    <p>
                        Esta calculadora é uma ferramenta estimativa para fins informativos. O Kitnets.com não se responsabiliza por eventuais imprecisões ou pelo uso dos dados aqui apresentados em disputas legais. Recomenda-se a conferência dos índices nos sites oficiais (IBGE, FGV).
                    </p>
                </div>
            </div>

            {/* CTA Section */}
            <div className="mt-16 text-center space-y-8 bg-muted/30 p-8 md:p-12 rounded-[2.5rem] border relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-black/5 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))]" />
                <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight whitespace-pre-line text-foreground">
                        {dict.calculatorCta?.title}
                    </h2>
                    <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                        {dict.calculatorCta?.description}
                    </p>
                    <div className="pt-2">
                        <Link href={`/${lang}/lista-vip?step=landing`}>
                            <Button size="lg" className="h-14 px-8 text-lg rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all border-0">
                                {dict.calculatorCta?.button}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Feedback Section */}
            <div className="mt-16">
                <CalculatorSuggestion />
            </div>

        </div>
    );
}
