"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { getDictionary } from "@/dictionaries";
import {
    AlertTriangle,
    FileText,
    Info,
    CheckCircle2,
    HelpCircle,
    Scale,
    Calendar,
    Settings2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CalculatorCta from "@/components/calculators/CalculatorCta";
import CalculatorContent from "@/components/calculators/CalculatorContent";
import LeadCaptureModal from "@/components/calculators/LeadCaptureModal";
import { useCalculatorLeadCapture } from "@/hooks/useCalculatorLeadCapture";

// --- Helper Components ---

function CurrencyInput({
    value,
    onChange,
    className,
    ...props
}: {
    value: number | string;
    onChange: (val: number | string) => void;
    className?: string;
} & Omit<React.ComponentProps<typeof Input>, "onChange" | "value">) {
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
        <Input
            {...props}
            type="text"
            inputMode="numeric"
            className={className}
            value={displayValue}
            onChange={handleChange}
        />
    );
}

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

// --- Utils ---

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

// --- Types ---

type FinePath = 'fixed' | 'proportional' | 'conditional' | 'unknown';
type FineType = 'months' | 'fixed';

interface CalculationResult {
    path: FinePath;
    totalFine: number; // The base full fine amount
    finalFine: number; // The actual payable fine
    fineFormulaDisplay: string;
    methodologyText: string;
    daysRemaining: number;
    monthsUsed: number;
    daysUsed: number;
    totalDays: number;
    dailyFine: number;
    rentDueForNotice: number; // For conditional logic (default 0)
    status: 'active' | 'ended' | 'invalid_date'; // Basic status
    conditionalStatus?: 'exempt' | 'applied_full' | 'applied_proportional';
}

// --- Page Component ---

export default function RentFineCalculator() {
    const params = useParams();
    const lang = (params?.lang as string) || "pt";
    const dict = getDictionary(lang) as any;
    const t = dict.rentFineCalculatorPage;

    // --- State ---

    // Contract Data
    const [rentValue, setRentValue] = useState<number | string>(2000);
    const [startDate, setStartDate] = useState<string>("");
    const [durationMonths, setDurationMonths] = useState<number | string>(30); // Default 30 months
    const [keyReturnDate, setKeyReturnDate] = useState<string>("");

    // Path Selection
    const [finePath, setFinePath] = useState<FinePath>("unknown"); // Default to unknown/simulation

    // Fine Definition (Base)
    const [fineType, setFineType] = useState<FineType>("months");
    const [fineMonths, setFineMonths] = useState<number | string>(3);
    const [fineFixedValue, setFineFixedValue] = useState<number | string>(6000);

    // Conditional Specifics
    const [minPeriodMonths, setMinPeriodMonths] = useState<number | string>(12);
    const [noticeRequiredDays, setNoticeRequiredDays] = useState<number | string>(30);
    const [noticeGivenDays, setNoticeGivenDays] = useState<number | string>(30); // Default to full notice

    // Result State
    const [result, setResult] = useState<CalculationResult | null>(null);
    const [scenarios, setScenarios] = useState<Record<string, CalculationResult> | null>(null);

    // --- Logic ---

    // --- Lead Capture Hook ---
    const {
        isModalOpen,
        setIsModalOpen,
        leadMetadata,
        trackInteraction,
        checkAdvancedTrigger
    } = useCalculatorLeadCapture({
        calculatorType: "multa-rescisao-contrato-aluguel"
    });

    const interactionCountRef = useRef(0);

    const handleInteraction = () => {
        trackInteraction();
        interactionCountRef.current += 1;
        if (interactionCountRef.current > 5) {
            checkAdvancedTrigger();
        }
    };

    const calculateScenario = (path: FinePath): CalculationResult | null => {
        const start = new Date(startDate);
        const end = new Date(keyReturnDate);
        const rent = Number(rentValue);
        const duration = Number(durationMonths);

        if (isNaN(start.getTime()) || isNaN(end.getTime()) || !rent || !duration) {
            return null;
        }

        const DAY_FACTOR = 30.4167; // 365 / 12 approx
        const totalContractDays = Math.round(duration * DAY_FACTOR);
        const diffTime = end.getTime() - start.getTime();
        const daysUsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const monthsUsed = daysUsed / DAY_FACTOR;

        // Base Fine
        let baseFine = 0;
        let fineFormulaDisplay = "";
        if (fineType === "months") {
            const fMonths = Number(fineMonths);
            baseFine = rent * fMonths;
            fineFormulaDisplay = `${t.inputs?.fineMonths}: ${fMonths}`;
        } else {
            baseFine = Number(fineFixedValue);
            fineFormulaDisplay = `${t.inputs?.fineFixedValue}: ${formatCurrency(baseFine)}`;
        }

        // Logic branching
        let finalFine = 0;
        let methodologyText = "";
        let dailyFine = 0;
        let daysRemaining = 0;
        let conditionalStatus: CalculationResult['conditionalStatus'];
        let rentDueForNotice = 0;

        // Common Proportional Logic
        daysRemaining = totalContractDays - daysUsed;
        if (daysRemaining < 0) daysRemaining = 0;
        dailyFine = baseFine / totalContractDays;

        if (path === 'fixed') {
            // Case A: Fixed (Integral)
            finalFine = baseFine; // Always full, regardless of time
            methodologyText = t.results?.warningFixed || "Multa integral aplicada sem proporcionalidade.";
        }
        else if (path === 'proportional') {
            // Case B: Proportional (Standard Law)
            finalFine = dailyFine * daysRemaining;
            methodologyText = `${t.results?.legalBaseProportional}. <br/> ${formatCurrency(baseFine)} ÷ ${totalContractDays} dias × ${daysRemaining} dias restantes.`;
        }
        else if (path === 'conditional') {
            // Case C: Conditional
            const minMonths = Number(minPeriodMonths);
            const reqNotice = Number(noticeRequiredDays);
            const givenNotice = Number(noticeGivenDays);

            // Rent due for notice gap
            const noticeGap = Math.max(0, reqNotice - givenNotice);
            rentDueForNotice = rent * (noticeGap / 30); // Simple 30-day base for rent

            if (monthsUsed < minMonths) {
                // Occurred BEFORE min period.
                // Calculation matches the exemption period
                const minPeriodDays = Math.round(minMonths * DAY_FACTOR);
                const daysRemainingInMinPeriod = Math.max(0, minPeriodDays - daysUsed);

                // Update dailyFine to be effective for this calculation
                dailyFine = baseFine / minPeriodDays;

                finalFine = dailyFine * daysRemainingInMinPeriod;
                conditionalStatus = 'applied_proportional';
                methodologyText = `${t.results?.conditionalApplied}. <br/> (Proporcional ao período de carência de ${minMonths} meses). <br/> ${formatCurrency(baseFine)} ÷ ${minPeriodDays} dias × ${daysRemainingInMinPeriod} dias rest.`;
            } else {
                // Occurred AFTER min period. Check Notice.
                if (givenNotice >= reqNotice) {
                    finalFine = 0;
                    conditionalStatus = 'exempt';
                    methodologyText = t.results?.conditionalExemption;
                } else {
                    // Notice FAILED -> Full Fine
                    finalFine = baseFine;
                    conditionalStatus = 'applied_full';
                    methodologyText = `${t.results?.warningNotice} <br/> (Aviso prévio de ${reqNotice} dias não cumprido).`;
                }
            }
        }

        let status: 'active' | 'ended' | 'invalid_date' = 'active';
        if (daysUsed >= totalContractDays && path !== 'conditional') status = 'ended';
        if (end < start) status = 'invalid_date';

        return {
            path,
            totalFine: baseFine,
            finalFine,
            fineFormulaDisplay,
            methodologyText,
            daysRemaining,
            monthsUsed,
            daysUsed,
            totalDays: totalContractDays,
            dailyFine,
            rentDueForNotice,
            status,
            conditionalStatus
        };
    };

    // Main Calc Effect
    useEffect(() => {
        if (!startDate || !keyReturnDate || !rentValue || !durationMonths) {
            setResult(null);
            setScenarios(null);
            return;
        }

        if (finePath === 'unknown') {
            // Calculate all 3 for simulation
            const sA = calculateScenario('fixed');
            const sB = calculateScenario('proportional');
            const sC = calculateScenario('conditional');
            if (sA && sB && sC) {
                setScenarios({ fixed: sA, proportional: sB, conditional: sC });
                setResult(null);
            }
        } else {
            const res = calculateScenario(finePath);
            setResult(res);
            setScenarios(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rentValue, startDate, durationMonths, keyReturnDate, fineType, fineMonths, fineFixedValue, finePath, minPeriodMonths, noticeRequiredDays, noticeGivenDays]);

    // Helpers
    const isInvalidDate = result?.status === 'invalid_date' || scenarios?.fixed?.status === 'invalid_date';

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-5xl animate-in fade-in space-y-8">

            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.title}</h1>
                <p className="text-muted-foreground">{t.description}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* CONFIGURATION COLUMN */}
                <div className="lg:col-span-5 space-y-6">

                    {/* Path Selector */}
                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <HelpCircle className="w-5 h-5 text-primary" />
                                {t.inputs?.finePathLabel}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <RadioGroup value={finePath} onValueChange={(v) => { handleInteraction(); setFinePath(v as FinePath); }}>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="fixed" id="r1" />
                                    <Label htmlFor="r1">{t.inputs?.finePathFixed}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="proportional" id="r2" />
                                    <Label htmlFor="r2">{t.inputs?.finePathProportional}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="conditional" id="r3" />
                                    <Label htmlFor="r3">{t.inputs?.finePathConditional}</Label>
                                </div>
                                <div className="flex items-center space-x-2 mt-2 pt-2 border-t w-full">
                                    <RadioGroupItem value="unknown" id="r4" />
                                    <Label htmlFor="r4">{t.inputs?.finePathUnknown}</Label>
                                </div>
                            </RadioGroup>
                        </CardContent>
                    </Card>

                    <div className="animate-in slide-in-from-left-4 duration-500 space-y-6">
                        {/* Contract Data */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-primary" />
                                    {t.inputs?.contractData}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label>{t.inputs?.rentValue}</Label>
                                    <div className="relative mt-1.5">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                        <CurrencyInput className="pl-9" value={rentValue} onChange={(v) => { handleInteraction(); setRentValue(v); }} />
                                    </div>
                                </div>
                                <div>
                                    <Label>{t.inputs?.duration}</Label>
                                    <Input type="number" className="mt-1.5" value={durationMonths} onChange={e => { handleInteraction(); setDurationMonths(e.target.value); }} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label>{t.inputs?.startDate}</Label>
                                        <BrazilianDateInput
                                            className="mt-1.5"
                                            value={startDate}
                                            onChange={v => { handleInteraction(); setStartDate(v); }}
                                        />
                                    </div>
                                    <div>
                                        <Label>{t.inputs?.keyReturnDate}</Label>
                                        <BrazilianDateInput
                                            className="mt-1.5 border-primary/30"
                                            value={keyReturnDate}
                                            onChange={v => { handleInteraction(); setKeyReturnDate(v); }}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2">
                                    <Settings2 className="w-5 h-5 text-primary" />
                                    {t.inputs?.fineClause}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label>{t.inputs?.fineType}</Label>
                                    <Select value={fineType} onValueChange={(v: FineType) => { handleInteraction(); setFineType(v); }}>
                                        <SelectTrigger className="mt-1.5">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="months">{t.inputs?.fineTypeMonths}</SelectItem>
                                            <SelectItem value="fixed">{t.inputs?.fineTypeFixed}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    {fineType === "months" ? (
                                        <>
                                            <Label>{t.inputs?.fineMonths}</Label>
                                            <Input type="number" step="0.5" className="mt-1.5" value={fineMonths} onChange={e => { handleInteraction(); setFineMonths(e.target.value); }} />
                                        </>
                                    ) : (
                                        <>
                                            <Label>{t.inputs?.fineFixedValue}</Label>
                                            <div className="relative mt-1.5">
                                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                                <CurrencyInput className="pl-9" value={fineFixedValue} onChange={(v) => { handleInteraction(); setFineFixedValue(v); }} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </CardContent>

                            {(finePath === 'conditional' || finePath === 'unknown') && (
                                <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-500">
                                        <AlertTriangle className="w-4 h-4" />
                                        {t.inputs?.finePathConditional}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <Label>{t.inputs?.minPeriod}</Label>
                                            <Input type="number" className="mt-1.5" value={minPeriodMonths} onChange={e => { handleInteraction(); setMinPeriodMonths(e.target.value); }} />
                                        </div>
                                        <div>
                                            <Label>{t.inputs?.noticeRequired}</Label>
                                            <Input type="number" className="mt-1.5" value={noticeRequiredDays} onChange={e => { handleInteraction(); setNoticeRequiredDays(e.target.value); }} />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-primary font-semibold">{t.inputs?.noticeGivenDays}</Label>
                                        <Input type="number" className="mt-1.5 border-primary/50 bg-primary/5" value={noticeGivenDays} onChange={e => { handleInteraction(); setNoticeGivenDays(e.target.value); }} />
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>

                {/* RESULTS COLUMN */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Invalid Date Alert */}
                    {isInvalidDate && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md text-red-700">
                            <h4 className="font-bold">{t.alerts?.invalidDates}</h4>
                            <p className="text-sm">{t.alerts?.invalidDatesDesc}</p>
                        </div>
                    )}

                    {/* Single Result Mode */}
                    {result && !isInvalidDate && (
                        <div className="space-y-6 animate-in zoom-in-95 duration-300">
                            {/* Main Card */}
                            <div className="rounded-xl border shadow-lg bg-card overflow-hidden">
                                <div className={`p-6 text-white text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4 ${result.path === 'proportional' ? 'bg-gradient-to-r from-blue-900 to-blue-800' :
                                        result.path === 'conditional' ? 'bg-gradient-to-r from-emerald-900 to-emerald-800' :
                                            'bg-gradient-to-r from-slate-900 to-slate-800'
                                    }`}>
                                    <div className="flex-1">
                                        <div className="text-white/70 text-sm font-medium uppercase tracking-wider mb-1">
                                            {t.results?.mainTitle}
                                        </div>
                                        <div className="flex flex-col">
                                            {result.rentDueForNotice > 0 ? (
                                                <>
                                                    <div className="text-4xl md:text-5xl font-bold">
                                                        {formatCurrency(result.finalFine + result.rentDueForNotice)}
                                                    </div>
                                                    <div className="text-sm text-white/70 mt-1">
                                                        {formatCurrency(result.finalFine)} (Multa) + {formatCurrency(result.rentDueForNotice)} (Aviso)
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-4xl md:text-5xl font-bold">
                                                    {formatCurrency(result.finalFine)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-lg border">
                                        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                                        <div className="space-y-1">
                                            <div className="font-semibold text-foreground">
                                                {result.path === 'fixed' && t.inputs?.finePathFixed}
                                                {result.path === 'proportional' && t.inputs?.finePathProportional}
                                                {result.path === 'conditional' && t.inputs?.finePathConditional}
                                            </div>
                                            <div className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: result.methodologyText }} />
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 text-sm bg-muted/20 rounded-lg">
                                        <div>
                                            <div className="font-semibold">{t.results?.daysUsed}</div>
                                            <div>{result.daysUsed} dias</div>
                                        </div>
                                        <div>
                                            <div className="font-semibold">{t.results?.daysRemaining}</div>
                                            <div>{result.daysRemaining} dias</div>
                                        </div>
                                        <div>
                                            <div className="font-semibold">{t.results?.totalFine}</div>
                                            <div>{formatCurrency(result.totalFine)}</div>
                                        </div>
                                        {(result.path === 'proportional' || (result.path === 'conditional' && result.conditionalStatus === 'applied_proportional')) && (
                                            <div>
                                                <div className="font-semibold">{t.results?.dailyFine || "Valor Diário"}</div>
                                                <div className="font-medium">{formatCurrency(result.dailyFine)}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Scenarios Mode */}
                    {scenarios && !isInvalidDate && (
                        <div className="space-y-4 animate-in slide-in-from-bottom-4">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Scale className="w-5 h-5 text-primary" />
                                {t.results?.scenarioTitle}
                            </h3>

                            <div className="flex flex-col gap-6">
                                {/* Scenario A: Fixed */}
                                <div className="rounded-xl border shadow-lg bg-card overflow-hidden">
                                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 text-white flex flex-col md:flex-row justify-between items-center gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-lg shrink-0 border border-white/20">A</div>
                                            <div>
                                                <div className="text-white/70 text-xs font-medium uppercase tracking-wider">{t.results?.scenarioFixed}</div>
                                                <div className="text-2xl font-bold">{formatCurrency(scenarios.fixed.finalFine)}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border text-sm">
                                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                            <div className="font-semibold">{t.results?.warningFixed}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Scenario B: Proportional */}
                                <div className="rounded-xl border shadow-lg bg-card overflow-hidden ring-2 ring-blue-500/20">
                                    <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-4 text-white flex flex-col md:flex-row justify-between items-center gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-lg shrink-0 border border-white/20">B</div>
                                            <div>
                                                <div className="text-white/70 text-xs font-medium uppercase tracking-wider">{t.results?.scenarioProportional}</div>
                                                <div className="text-3xl font-bold text-blue-100">{formatCurrency(scenarios.proportional.finalFine)}</div>
                                            </div>
                                        </div>
                                        <div className="bg-blue-500/20 px-3 py-1 rounded-full text-xs font-medium border border-blue-400/30">
                                            Recomendado (Lei do Inquilinato)
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border text-sm">
                                            <Scale className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                            <div className="space-y-1">
                                                <div className="font-semibold">{t.results?.legalBaseProportional}</div>
                                                <div className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: scenarios.proportional.methodologyText }} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div className="p-2 bg-muted/30 rounded">
                                                <div className="text-xs text-muted-foreground">{t.results?.daysRemaining}</div>
                                                <div className="font-medium">{scenarios.proportional.daysRemaining} dias</div>
                                            </div>
                                            <div className="p-2 bg-muted/30 rounded">
                                                <div className="text-xs text-muted-foreground">Valor Diário</div>
                                                <div className="font-medium">{formatCurrency(scenarios.proportional.dailyFine)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Scenario C: Conditional */}
                                <div className="rounded-xl border shadow-lg bg-card overflow-hidden">
                                    <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 p-4 text-white flex flex-col md:flex-row justify-between items-center gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-lg shrink-0 border border-white/20">C</div>
                                            <div>
                                                <div className="text-white/70 text-xs font-medium uppercase tracking-wider">{t.results?.scenarioConditional}</div>
                                                <div className="flex flex-col">
                                                    {scenarios.conditional.rentDueForNotice > 0 ? (
                                                        <>
                                                            <div className="text-xs text-white/70 mb-0.5">
                                                                {formatCurrency(scenarios.conditional.finalFine)} (Multa) + {formatCurrency(scenarios.conditional.rentDueForNotice)} (Aviso) =
                                                            </div>
                                                            <div className="text-2xl font-bold">
                                                                {formatCurrency(scenarios.conditional.finalFine + scenarios.conditional.rentDueForNotice)}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="text-2xl font-bold">
                                                            {formatCurrency(scenarios.conditional.finalFine)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-white/10 px-3 py-1 rounded-full text-xs font-medium border border-white/20">
                                            {t.results?.marketPractice}
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border text-sm">
                                            {scenarios.conditional.conditionalStatus === 'exempt' ? (
                                                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                            ) : (
                                                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                            )}
                                            <div className="space-y-1">
                                                <div className="font-semibold">
                                                    {scenarios.conditional.conditionalStatus === 'exempt' ? 'Isenção aplicada' : 'Multa Aplicável'}
                                                </div>
                                                <div className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: scenarios.conditional.methodologyText }} />
                                            </div>
                                        </div>
                                        {scenarios.conditional.conditionalStatus === 'applied_proportional' && (
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div className="p-2 bg-muted/30 rounded">
                                                    <div className="text-xs text-muted-foreground">Valor Diário (Carência)</div>
                                                    <div className="font-medium">{formatCurrency(scenarios.conditional.dailyFine)}</div>
                                                </div>
                                            </div>
                                        )}
                                        {scenarios.conditional.rentDueForNotice > 0 && (
                                            <div className="p-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900 rounded text-xs text-amber-800 dark:text-amber-400">
                                                <strong>Aviso Prévio:</strong> O valor não pago do aluguel referente ao aviso prévio ({Number(noticeRequiredDays)} dias) deve ser somado à multa.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
            {/* Content Section */}
            <div className="print:hidden space-y-12 mt-16">
                <CalculatorContent content={t.pageContent} />
                <CalculatorCta dict={dict.calculatorCta} lang={lang} />
            </div>

            <hr className="my-8 border-border" />

            {/* Legal Disclaimer */}
            <div className="max-w-4xl text-xs text-muted-foreground mx-auto text-center leading-relaxed">
                <p>{t?.legal?.text || "Aviso Legal: Calculadora informativa."}</p>
            </div>

            <LeadCaptureModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                calculatorType="multa-rescisao-contrato-aluguel"
                leadMetadata={leadMetadata}
            />
        </div>
    );
}
