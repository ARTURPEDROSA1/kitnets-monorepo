"use client";

import { useState, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getDictionary } from "@/dictionaries";
import {
    Calculator,
    Calendar,
    CreditCard,
    ArrowRight,
    AlertTriangle,
    Info,
    Copy,
    Check,
} from "lucide-react";
import LeadCaptureModal from "@/components/calculators/LeadCaptureModal";
import { useCalculatorLeadCapture } from "@/hooks/useCalculatorLeadCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Helper: Format Currency
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

function BrazilianDateInput({
    value,
    onChange,
    className,
    ...props
}: {
    value: string;
    onChange: (val: string) => void;
    className?: string;
} & Omit<React.ComponentProps<typeof Input>, "onChange" | "value">) {
    const [text, setText] = useState("");
    const [lastValue, setLastValue] = useState(value);

    // Sync prop to text during render (derived state pattern)
    if (value !== lastValue) {
        setLastValue(value);
        if (value) {
            const [y, m, d] = value.split("-");
            if (y && m && d) {
                setText(`${d}/${m}/${y}`);
            } else {
                setText("");
            }
        } else {
            setText("");
        }
    }

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, "");
        if (val.length > 8) val = val.slice(0, 8);

        let formatted = val;
        if (val.length >= 3) {
            formatted = `${val.slice(0, 2)}/${val.slice(2)}`;
        }
        if (val.length >= 5) {
            formatted = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
        }
        setText(formatted);

        // Emit change if valid full date or empty
        if (val.length === 8) {
            const d = val.slice(0, 2);
            const m = val.slice(2, 4);
            const y = val.slice(4);
            // Basic validation (optional but good)
            const numD = parseInt(d);
            const numM = parseInt(m);
            if (numD > 0 && numD <= 31 && numM > 0 && numM <= 12) {
                onChange(`${y}-${m}-${d}`);
            }
        } else if (val.length === 0) {
            onChange("");
        }
    };

    const dateInputRef = useRef<HTMLInputElement>(null);
    const triggerPicker = () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (dateInputRef.current as any)?.showPicker();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="relative">
            <Input
                {...props}
                type="text"
                inputMode="numeric"
                value={text}
                onChange={handleTextChange}
                className={`${className} text-base md:text-sm pr-10`}
                placeholder="dd/mm/aaaa"
                maxLength={10}
            />
            <div
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground p-1"
                onClick={(e) => {
                    e.stopPropagation();
                    triggerPicker();
                }}
            >
                <Calendar className="w-4 h-4" />
            </div>
            <input
                type="date"
                ref={dateInputRef}
                className="opacity-0 absolute bottom-0 right-0 w-0 h-0 overflow-hidden pointer-events-none"
                onChange={(e) => onChange(e.target.value)}
                value={value || ""}
                tabIndex={-1}
                aria-hidden="true"
            />
        </div>
    );
}

export default function ProRataRentCalculatorClient() {
    const params = useParams();
    const lang = (params?.lang as string) || "pt";
    const dict = getDictionary(lang) as any;
    const t = dict.proRataRentCalculatorPage || {};
    const tInputs = t.inputs || {};
    const tResults = t.results || {};
    const tValidation = t.validation || {};

    // --- State ---
    const [rentValue, setRentValue] = useState<string>("");
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = '01'; // Default to start of month
        return `${year}-${month}-${day}`;
    });
    const [endDate, setEndDate] = useState<string>(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0'); // Today
        return `${year}-${month}-${day}`;
    });

    const [calculationMethod, setCalculationMethod] = useState<"commercial" | "real">("commercial");
    const [includeStartDate, setIncludeStartDate] = useState<boolean>(true);
    const [includeEndDate, setIncludeEndDate] = useState<boolean>(true);

    const [showBreakdown, setShowBreakdown] = useState(false);

    // --- Lead Capture Hook ---
    const {
        isModalOpen,
        setIsModalOpen,
        leadMetadata,
        trackInteraction,
        checkExportTrigger
    } = useCalculatorLeadCapture({
        calculatorType: "aluguel-proporcional",
        isSimpleCalculator: true
    });

    const handleInteraction = () => {
        trackInteraction();
    };

    // --- Derived Values & Validation ---

    // Parse rent
    const numericRent = useMemo(() => {
        if (!rentValue) return 0;
        // Remove currency symbols and non-numeric characters except comma/dot
        // Standardize Brazilian format (1.000,00) to JS (1000.00)
        // Simple approach: remove all non-digits, divide by 100 (assuming input is like "150000" for 1500.00)
        // OR standard input type="number"
        // Let's stick to standard numeric input for simplicity or clean the string
        return Number(rentValue);
    }, [rentValue]);

    const startD = useMemo(() => startDate ? new Date(startDate + "T00:00:00") : null, [startDate]);
    const endD = useMemo(() => endDate ? new Date(endDate + "T00:00:00") : null, [endDate]);

    const validationErrors = useMemo(() => {
        const errors: string[] = [];
        if (!numericRent || numericRent <= 0) errors.push(tValidation.rentZero);

        if (startD && endD) {
            if (endD < startD) {
                errors.push(tValidation.endDateBeforeStart);
            }
            if (startD.getMonth() !== endD.getMonth() || startD.getFullYear() !== endD.getFullYear()) {
                errors.push(tValidation.differentMonth);
            }
        }
        return errors;
    }, [numericRent, startD, endD, tValidation]);

    const isValid = validationErrors.length === 0 && startD && endD && numericRent > 0;

    // --- Calculation Logic ---
    const calculationResult = useMemo(() => {
        if (!isValid || !startD || !endD) return null;

        // 1. Determine Daily Rent
        let dailyRent = 0;
        let daysInMonth = 30; // Default commercial

        if (calculationMethod === "commercial") {
            daysInMonth = 30;
            dailyRent = numericRent / 30;
        } else {
            // Real days in month of start date (assuming same month)
            // Get last day of the month
            const year = startD.getFullYear();
            const month = startD.getMonth() + 1;
            daysInMonth = new Date(year, month, 0).getDate();
            dailyRent = numericRent / daysInMonth;
        }

        // 2. Determine Number of Chargeable Days
        // Formula: (Diff - 1) + (Start?1:0) + (End?1:0)
        const diffTime = endD.getTime() - startD.getTime();
        const diffDays = Math.round(diffTime / (1000 * 3600 * 24)); // Days difference

        // Base logic as derived: Contract inclusive diff is usually (End - Start + 1)
        // Using "Adjustments" logic:
        // Base range (exclusive end) = diffDays
        // Adjustments: 
        // If logic is: (End - Start) + adjustments...
        // Let's implement specific user rule: "Dias = (Data Final - Data Inicial) + Ajustes"
        // Base Diff (25 - 10 = 15).
        // If include Start: +1. If Include End: +0 (or +1? User said "Add +1 day if end date is included").
        // Wait, standard day diff (25-10=15). If we count start, we have 10..24 (15 days). If we count end too, we have 10..25 (16 days).
        // User rule: "Add +1 day if start date is included". "Add +1 day if end date is included".
        // This implies Base is -1? Or user rule is slightly redundant with standard subtraction.
        // Let's use the robust logic:
        // DaysList = [Start, Start+1, ..., End]
        // Filter based on include flags? No, range is contiguous.
        // Let's assume (End - Start) gives the magnitude. 
        // If we want [Start, End] inclusive: this is magnitude + 1. (15 + 1 = 16).
        // Matches User input "Include Start (+1)" and "Include End (+1)" IF base is magnitude - 1.

        let chargeableDays = diffDays - 1;
        if (includeStartDate) chargeableDays += 1;
        if (includeEndDate) chargeableDays += 1;

        // Edge case: Start=End. Diff=0. Base=-1. +1+1 = 1 day. Correct.
        // Edge case: Start=10, End=11, Exclude End. Diff=1. Base=0. +1(Start)+0 = 1 day. Correct.

        if (chargeableDays < 0) chargeableDays = 0; // Safety

        // 3. Pro-Rata Value
        const proRataValue = dailyRent * chargeableDays;

        return {
            dailyRent,
            daysInMonth,
            chargeableDays,
            proRataValue,
            period: `${startD.toLocaleDateString('pt-BR')} a ${endD.toLocaleDateString('pt-BR')}`
        };

    }, [isValid, numericRent, startD, endD, calculationMethod, includeStartDate, includeEndDate]);

    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        if (checkExportTrigger('copy')) return;
        if (!calculationResult) return;
        const text = `Cálculo de Aluguel Proporcional\nPeríodo: ${calculationResult.period}\nDias cobrados: ${calculationResult.chargeableDays}\nValor: ${formatCurrency(calculationResult.proRataValue)}`;
        navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="space-y-4 max-w-3xl">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                    {t.title || "Calculadora de Aluguel Proporcional"}
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                    {t.description || "Calcule o valor proporcional do aluguel para períodos incompletos."}
                </p>

                {/* Warnings */}
                {validationErrors.length > 0 && (numericRent > 0 || startDate || endDate) && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                        {validationErrors.map((err, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-amber-800 dark:text-amber-400 text-sm">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>{err}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* --- Inputs --- */}
                <div className="lg:col-span-5 space-y-6">
                    <Card className="border shadow-sm">
                        <CardHeader className="bg-muted/30 pb-4 border-b">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <Calendar className="w-5 h-5 text-primary" />
                                </div>
                                <CardTitle className="text-lg">{tInputs.contractDetails}</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">

                            {/* Rent Value */}
                            <div className="space-y-2">
                                <Label htmlFor="rent">{tInputs.monthlyRent}</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                    <Input
                                        id="rent"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0,00"
                                        className="pl-9 text-lg font-medium"
                                        value={rentValue}
                                        onChange={(e) => { handleInteraction(); setRentValue(e.target.value); }}
                                    />
                                </div>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="start">{tInputs.startDate}</Label>
                                    <BrazilianDateInput
                                        id="start"
                                        value={startDate}
                                        onChange={(v) => { handleInteraction(); setStartDate(v); }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="end">{tInputs.endDate}</Label>
                                    <BrazilianDateInput
                                        id="end"
                                        value={endDate}
                                        onChange={(v) => { handleInteraction(); setEndDate(v); }}
                                    />
                                </div>
                            </div>

                            {/* Advanced Options */}
                            <div className="pt-2 border-t">
                                <Label className="text-sm text-muted-foreground mb-4 block mt-4">
                                    {tInputs.advancedOptions}
                                </Label>

                                <RadioGroup
                                    value={calculationMethod}
                                    onValueChange={(v) => { handleInteraction(); setCalculationMethod(v as "commercial" | "real"); }}
                                    className="mb-6 space-y-2"
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="commercial" id="commercial" />
                                        <Label htmlFor="commercial" className="flex items-center gap-1 font-normal cursor-pointer">
                                            {tInputs.commercialMonth || "Mês Comercial (30 dias)"}
                                            <TooltipProvider delayDuration={0}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-muted-foreground opacity-70" /></TooltipTrigger>
                                                    <TooltipContent><p className="max-w-[200px]">{tInputs.commercialMonthTooltip}</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="real" id="real" />
                                        <Label htmlFor="real" className="flex items-center gap-1 font-normal cursor-pointer">
                                            {tInputs.realDays || "Dias Reais"}
                                            <TooltipProvider delayDuration={0}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-muted-foreground opacity-70" /></TooltipTrigger>
                                                    <TooltipContent><p className="max-w-[200px]">{tInputs.realDaysTooltip}</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </Label>
                                    </div>
                                </RadioGroup>

                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="incStart"
                                            checked={includeStartDate}
                                            onCheckedChange={(c) => { handleInteraction(); setIncludeStartDate(c as boolean); }}
                                        />
                                        <Label htmlFor="incStart" className="text-sm font-normal cursor-pointer">{tInputs.includeStartDate}</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="incEnd"
                                            checked={includeEndDate}
                                            onCheckedChange={(c) => { handleInteraction(); setIncludeEndDate(c as boolean); }}
                                        />
                                        <Label htmlFor="incEnd" className="text-sm font-normal cursor-pointer">{tInputs.includeEndDate}</Label>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* --- Results --- */}
                <div className="lg:col-span-7 space-y-6">
                    {calculationResult ? (
                        <Card className="border-2 border-primary/10 shadow-lg bg-card/50 backdrop-blur animate-in slide-in-from-bottom-2 duration-500">
                            <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                        <CreditCard className="w-5 h-5 text-green-600 dark:text-green-400" />
                                    </div>
                                    <CardTitle className="text-lg text-foreground">{tResults.title}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 md:p-8">
                                <p className="text-sm text-muted-foreground font-medium mb-2">{tResults.payTitle}</p>
                                <div className="flex items-baseline gap-2 mb-8">
                                    <h2 className="text-4xl md:text-5xl font-bold text-primary tracking-tight">
                                        {formatCurrency(calculationResult.proRataValue)}
                                    </h2>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                                    <div className="p-4 bg-muted/50 rounded-xl space-y-1">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">{tResults.dailyValue}</div>
                                        <div className="text-xl font-semibold">{formatCurrency(calculationResult.dailyRent)}</div>
                                    </div>
                                    <div className="p-4 bg-muted/50 rounded-xl space-y-1">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">{tResults.daysCharged}</div>
                                        <div className="text-xl font-semibold">{calculationResult.chargeableDays} dias</div>
                                    </div>
                                    <div className="p-4 bg-muted/50 rounded-xl space-y-1 sm:col-span-2">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">{tResults.period}</div>
                                        <div className="text-lg font-medium">{calculationResult.period}</div>
                                    </div>
                                </div>

                                {/* Flexible Detail View */}
                                <div className="space-y-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowBreakdown(!showBreakdown)}
                                        className="w-full justify-between"
                                    >
                                        {tResults.breakdownTitle}
                                        <ArrowRight className={cn("w-4 h-4 transition-transform", showBreakdown ? "rotate-90" : "")} />
                                    </Button>

                                    {showBreakdown && (
                                        <div className="p-4 border rounded-lg bg-card text-sm space-y-2 animate-in fade-in slide-in-from-top-2">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{tInputs.monthlyRent}</span>
                                                <span>{formatCurrency(numericRent)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{tResults.methodUsed}</span>
                                                <span>{calculationMethod === 'commercial' ? "Mês Comercial (30)" : "Dias Reais"}</span>
                                            </div>
                                            <div className="flex justify-between font-medium pt-2 border-t">
                                                <span>Total Proporcional</span>
                                                <span>{formatCurrency(calculationResult.proRataValue)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 mt-6">
                                    <Button
                                        variant={isCopied ? "default" : "secondary"}
                                        className={cn(
                                            "flex-1 transition-all duration-300",
                                            isCopied && "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg scale-[1.02]"
                                        )}
                                        onClick={handleCopy}
                                    >
                                        {isCopied ? (
                                            <>
                                                <Check className="w-4 h-4 mr-2" />
                                                Copiado!
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-4 h-4 mr-2" />
                                                {tResults.copy}
                                            </>
                                        )}
                                    </Button>
                                </div>

                            </CardContent>
                        </Card>
                    ) : (
                        /* Empty State */
                        <div className="h-full min-h-[300px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/10">
                            <Calculator className="w-16 h-16 mb-4 opacity-20" />
                            <h3 className="text-xl font-semibold mb-2">{tResults.title || "Resultado"}</h3>
                            <p className="max-w-xs">{tValidation.rentZero || "Preencha os valores para calcular."}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Content / SEO Block */}
            {/* Content / SEO Block */}
            <div className="mt-16 pt-8 border-t space-y-6 max-w-4xl text-foreground">
                <div className="prose dark:prose-invert max-w-none text-foreground">
                    <h2 className="text-2xl font-bold mb-4 text-foreground">{t.seo?.title || "Calculadora de Aluguel Proporcional"}</h2>
                    <p className="text-muted-foreground">{t.pageContent?.intro}</p>
                    {t.pageContent?.sections?.map((section: any, i: number) => (
                        <div key={i} className="mt-6">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{section.title}</h3>
                            <p className="whitespace-pre-line text-muted-foreground">{section.text}</p>
                            {section.list && (
                                <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                                    {section.list.map((li: string, j: number) => (
                                        <li key={j}>{li}</li>
                                    ))}
                                </ul>
                            )}
                            {section.conclusion && (
                                <p className="mt-2 whitespace-pre-line text-muted-foreground font-medium">{section.conclusion}</p>
                            )}
                            {section.links && (
                                <div className="mt-4 flex flex-col gap-2">
                                    {section.links.map((link: { text: string, url: string }, k: number) => (
                                        <Link
                                            key={k}
                                            href={`/${lang}${link.url}`}
                                            className="text-primary hover:underline flex items-center gap-1 font-medium"
                                        >
                                            <ArrowRight className="w-4 h-4" />
                                            {link.text}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
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

            <LeadCaptureModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                calculatorType="aluguel-proporcional"
                leadMetadata={leadMetadata}
            />
        </div>
    );
}
