"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { getDictionary } from "@/dictionaries";
import {
    AlertTriangle,
    FileText,
    Info,
    CheckCircle2,
    XCircle,
    HelpCircle,
    Scale
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
import { Separator } from "@/components/ui/separator";

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

// --- Utils ---

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

// --- Types ---

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
                // Defaulting to "Proportional to Contract" as it's the most standard 'fallback' unless specified otherwise.
                // Spec says "multa (integral ou proporcional)". We will use Proportional as standard interpretation of law.
                // However, distinguishing it visually is important.
                finalFine = dailyFine * daysRemaining;
                conditionalStatus = 'applied_proportional';
                methodologyText = `${t.results?.conditionalApplied}. <br/> (Rescisão antes de ${minMonths} meses).`;
            } else {
                // Occurred AFTER min period. Check Notice.
                if (givenNotice >= reqNotice) {
                    finalFine = 0;
                    conditionalStatus = 'exempt';
                    methodologyText = t.results?.conditionalExemption;
                } else {
                    // Notice FAILED -> Full Fine (as per strict clause) OR Full Fine?
                    // Spec says: "prevalece multa cheia" (prevails full fine).
                    finalFine = baseFine;
                    conditionalStatus = 'applied_full';
                    methodologyText = `${t.results?.warningNotice} <br/> (Aviso prévio de ${reqNotice} dias não cumprido).`;
                }
            }
        }

        let status: 'active' | 'ended' | 'invalid_date' = 'active';
        if (daysUsed >= totalContractDays && path !== 'conditional') status = 'ended';
        // Conditional can have fine even after duration if notice not given? Unlikely for fixed term ending, but keeping logic simpler.
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
            const sC = calculateScenario('conditional'); // Uses current conditional inputs (defaults)
            if (sA && sB && sC) {
                setScenarios({ fixed: sA, proportional: sB, conditional: sC });
                setResult(null); // Clear single result
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
                        <CardContent>
                            <RadioGroup value={finePath} onValueChange={(v: FinePath) => setFinePath(v)} className="space-y-3">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="fixed" id="r-fixed" />
                                    <Label htmlFor="r-fixed" className="font-normal cursor-pointer">{t.inputs?.finePathFixed}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="proportional" id="r-prop" />
                                    <Label htmlFor="r-prop" className="font-normal cursor-pointer">{t.inputs?.finePathProportional}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="conditional" id="r-cond" />
                                    <Label htmlFor="r-cond" className="font-normal cursor-pointer">{t.inputs?.finePathConditional}</Label>
                                </div>
                                <Separator className="my-1" />
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="unknown" id="r-unk" />
                                    <Label htmlFor="r-unk" className="font-medium cursor-pointer text-primary">{t.inputs?.finePathUnknown}</Label>
                                </div>
                            </RadioGroup>
                        </CardContent>
                    </Card>

                    {/* Common Inputs */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <FileText className="w-5 h-5" />
                                {t.inputs?.contractData}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>{t.inputs?.rentValue}</Label>
                                <div className="relative mt-1.5">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                    <CurrencyInput className="pl-9" value={rentValue} onChange={setRentValue} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>{t.inputs?.duration}</Label>
                                    <Input type="number" className="mt-1.5" value={durationMonths} onChange={e => setDurationMonths(e.target.value)} />
                                </div>
                                <div className="flex items-end pb-2 text-sm text-muted-foreground">
                                    {(Number(durationMonths) / 12).toFixed(1)} anos
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>{t.inputs?.startDate}</Label>
                                    <Input type="date" className="mt-1.5" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                </div>
                                <div>
                                    <Label>{t.inputs?.keyReturnDate}</Label>
                                    <Input type="date" className="mt-1.5 border-primary/30" value={keyReturnDate} onChange={e => setKeyReturnDate(e.target.value)} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Fine Definition Inputs */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Scale className="w-5 h-5" />
                                {t.inputs?.fineClause}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <Label>{t.inputs?.fineType}</Label>
                                    <Select value={fineType} onValueChange={(v: FineType) => setFineType(v)}>
                                        <SelectTrigger className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="months">{t.inputs?.fineTypeMonths}</SelectItem>
                                            <SelectItem value="fixed">{t.inputs?.fineTypeFixed}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex-1">
                                    {fineType === 'months' ? (
                                        <>
                                            <Label>{t.inputs?.fineMonths}</Label>
                                            <Input type="number" step="0.5" className="mt-1.5" value={fineMonths} onChange={e => setFineMonths(e.target.value)} />
                                        </>
                                    ) : (
                                        <>
                                            <Label>{t.inputs?.fineFixedValue}</Label>
                                            <div className="relative mt-1.5">
                                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                                <CurrencyInput className="pl-9" value={fineFixedValue} onChange={setFineFixedValue} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Conditional Inputs - Show if Conditional OR Unknown */}
                            {(finePath === 'conditional' || finePath === 'unknown') && (
                                <div className="pt-4 border-t space-y-4 animate-in slide-in-from-top-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-500">
                                        <AlertTriangle className="w-4 h-4" />
                                        {t.inputs?.finePathConditional}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>{t.inputs?.minPeriod}</Label>
                                            <Input type="number" className="mt-1.5" value={minPeriodMonths} onChange={e => setMinPeriodMonths(e.target.value)} />
                                        </div>
                                        <div>
                                            <Label>{t.inputs?.noticeRequired}</Label>
                                            <Input type="number" className="mt-1.5" value={noticeRequiredDays} onChange={e => setNoticeRequiredDays(e.target.value)} />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-primary font-semibold">{t.inputs?.noticeGivenDays}</Label>
                                        <Input type="number" className="mt-1.5 border-primary/50 bg-primary/5" value={noticeGivenDays} onChange={e => setNoticeGivenDays(e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

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
                                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
                                    <div>
                                        <div className="text-white/70 text-sm font-medium uppercase tracking-wider mb-1">
                                            {t.results?.mainTitle}
                                        </div>
                                        <div className="text-4xl md:text-5xl font-bold">
                                            {formatCurrency(result.finalFine)}
                                        </div>
                                    </div>
                                    {result.rentDueForNotice > 0 && (
                                        <div className="bg-white/10 rounded-lg p-3 text-right">
                                            <div className="text-xs text-white/70">{t.results?.noticeRentDue}</div>
                                            <div className="text-xl font-bold text-amber-300">+ {formatCurrency(result.rentDueForNotice)}</div>
                                        </div>
                                    )}
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
                                            <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: result.methodologyText }} />
                                        </div>
                                    </div>

                                    {/* Breakdown */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div className="p-3 bg-muted/20 rounded">
                                            <div className="text-muted-foreground text-xs">{t.results?.daysUsed}</div>
                                            <div className="font-medium">{result.daysUsed} dias</div>
                                        </div>
                                        <div className="p-3 bg-muted/20 rounded">
                                            <div className="text-muted-foreground text-xs">{t.results?.daysRemaining}</div>
                                            <div className="font-medium">{result.daysRemaining} dias</div>
                                        </div>
                                        <div className="p-3 bg-muted/20 rounded">
                                            <div className="text-muted-foreground text-xs">{t.results?.totalFine} (Base)</div>
                                            <div className="font-medium">{formatCurrency(result.totalFine)}</div>
                                        </div>
                                        {result.path === 'conditional' && (
                                            <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded">
                                                <div className="text-amber-700 dark:text-amber-500 text-xs">Aviso Cumprido</div>
                                                <div className="font-bold text-amber-700 dark:text-amber-500">
                                                    {Number(noticeGivenDays)} de {Number(noticeRequiredDays)} dias
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Simulation Mode */}
                    {scenarios && !isInvalidDate && (
                        <div className="space-y-4 animate-in slide-in-from-bottom-4">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Scale className="w-5 h-5 text-primary" />
                                {t.results?.scenarioTitle}
                            </h3>

                            {/* Scenario A */}
                            <div className="group rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex gap-3 items-center w-full md:w-auto">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 shrink-0">A</div>
                                    <div className="text-left">
                                        <div className="font-semibold">{t.results?.scenarioFixed}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                                            {t.results?.warningFixed}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-2xl font-bold tracking-tight">{formatCurrency(scenarios.fixed.finalFine)}</div>
                            </div>

                            {/* Scenario B */}
                            <div className="group rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors flex flex-col md:flex-row justify-between items-center gap-4 border-l-4 border-l-blue-500">
                                <div className="flex gap-3 items-center w-full md:w-auto">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center font-bold text-blue-600 shrink-0">B</div>
                                    <div className="text-left">
                                        <div className="font-semibold text-blue-700 dark:text-blue-400">{t.results?.scenarioProportional}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Scale className="w-3 h-3 text-blue-500" />
                                            {t.results?.legalBaseProportional}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-2xl font-bold tracking-tight text-blue-700 dark:text-blue-400">{formatCurrency(scenarios.proportional.finalFine)}</div>
                            </div>

                            {/* Scenario C */}
                            <div className="group rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex gap-3 items-center w-full md:w-auto">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center font-bold text-amber-600 shrink-0">C</div>
                                    <div className="text-left">
                                        <div className="font-semibold">{t.results?.scenarioConditional}</div>
                                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                                            {scenarios.conditional.conditionalStatus === 'exempt' ? (
                                                <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Isenção Ativa</span>
                                            ) : (
                                                <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3" /> Multa aplicada</span>
                                            )}
                                            <span className="opacity-80 ml-1">(min {minPeriodMonths}m + aviso {noticeRequiredDays}d)</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold tracking-tight">{formatCurrency(scenarios.conditional.finalFine)}</div>
                                    {scenarios.conditional.rentDueForNotice > 0 && (
                                        <div className="text-xs font-medium text-amber-600">
                                            + {formatCurrency(scenarios.conditional.rentDueForNotice)} (Aviso)
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
            {/* Content Section */}
            {t.pageContent && (
                <div className="mt-16 mb-12 space-y-16">
                    <Separator />

                    {/* Intro */}
                    <div className="max-w-3xl space-y-6">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">Sobre a Calculadora</h2>
                        <div className="text-lg text-muted-foreground whitespace-pre-line leading-relaxed">
                            {t.pageContent.intro}
                        </div>
                    </div>

                    {/* Image CTA */}
                    <div className="rounded-2xl overflow-hidden shadow-2xl border bg-card max-w-4xl mx-auto transform hover:scale-[1.01] transition-transform duration-500">
                        <img
                            src="/images/cta-rescisao-aluguel.png"
                            alt="Kitnets.com - Gestão Inteligente"
                            className="w-full h-auto"
                        />
                    </div>

                    {/* Sections Grid */}
                    <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
                        {t.pageContent.sections?.map((section: any, idx: number) => (
                            <div key={idx} className="space-y-4">
                                <h3 className="text-xl font-bold flex items-center gap-2 text-foreground">
                                    {section.title}
                                </h3>
                                {section.text && <p className="text-muted-foreground leading-relaxed">{section.text}</p>}
                                {section.list && (
                                    <ul className="space-y-3 mt-4">
                                        {section.list.map((item: string, i: number) => (
                                            <li key={i} className="flex gap-3 text-muted-foreground">
                                                <div className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                                <span className="flex-1">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {section.conclusion && (
                                    <p className="text-base font-medium text-primary pt-2 border-t border-border/50 mt-4 inline-block">
                                        {section.conclusion}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Final CTA Text */}
                    {t.pageContent.cta && (
                        <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-3xl p-8 md:p-12 text-center space-y-6 border border-primary/10 max-w-3xl mx-auto">
                            <h3 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">{t.pageContent.cta.title}</h3>
                            <p className="text-lg text-muted-foreground leading-relaxed">{t.pageContent.cta.text}</p>
                        </div>
                    )}
                </div>
            )}

            <hr className="my-8 border-border" />

            {/* Legal Disclaimer */}
            <div className="max-w-4xl text-xs text-muted-foreground mx-auto text-center leading-relaxed">
                <p>{t?.legal?.text || "Aviso Legal: Calculadora informativa."}</p>
            </div>
        </div>
    );
}
