"use client";

import { useState, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { getDictionary } from "@/dictionaries";
import {
    Plus,
    Trash2,
    Copy,
    Printer,
    Download,
    AlertCircle,
    Calculator,
    HelpCircle,
    Check,
    Calendar as CalendarIcon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

import CalculatorCta from "@/components/calculators/CalculatorCta";
import CalculatorContent from "@/components/calculators/CalculatorContent";
import dynamic from "next/dynamic";

const LeadCaptureModal = dynamic(() => import("@/components/calculators/LeadCaptureModal"), {
    ssr: false,
    loading: () => null,
});

// --- Helper Components ---

function CurrencyInput({
    value,
    onChange,
    className,
    placeholder,
    ...props
}: {
    value: number | string;
    onChange: (val: number | string) => void;
    className?: string;
    placeholder?: string;
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
            className={`${className} text-base md:text-sm`} // Prevent iOS zoom
            value={displayValue}
            onChange={handleChange}
            placeholder={placeholder}
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
                className={`${className} text-base md:text-sm`} // Prevent iOS zoom
                placeholder="dd/mm/aaaa"
                maxLength={10}
            />
            <div
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground p-1"
                onClick={triggerPicker}
            >
                <CalendarIcon className="w-4 h-4" />
            </div>
            <input
                type="date"
                ref={dateInputRef}
                className="invisible absolute bottom-0 right-0 w-0 h-0"
                onChange={(e) => onChange(e.target.value)}
                value={value || ""}
                tabIndex={-1}
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

const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString + 'T12:00:00'); // Fix TZ issues
    return new Intl.DateTimeFormat("pt-BR").format(date);
};

// --- Types ---

interface Installment {
    id: string;
    value: number | string;
    dueDate: string;
    paymentDate?: string; // Optional actual payment date
}

interface InstallmentResult {
    id: string;
    dueDate: string;
    value: number;
    delayDays: number;
    fineRef: number;
    interestRef: number;
    totalRef: number;
    isPaid: boolean;
}

// --- Page Component ---

export default function RentLateFineCalculatorClient() {
    const params = useParams();
    const lang = (params?.lang as string) || "pt";
    const dict = getDictionary(lang);
    const t = dict.rentLateFineCalculatorPage;

    // --- State ---

    // General Config
    const [calcType, setCalcType] = useState<"today" | "specific">("today");
    const [specificDate, setSpecificDate] = useState<string>("");
    const [gracePeriod, setGracePeriod] = useState<number | string>(0);

    // Fine Rules
    const [finePercent, setFinePercent] = useState<number | string>(10);
    const [applyFineOnlyIfDelayed, setApplyFineOnlyIfDelayed] = useState<boolean>(true);

    // Interest Rules
    const [interestMode, setInterestMode] = useState<"monthly" | "daily">("monthly");
    const [interestRate, setInterestRate] = useState<number | string>(1); // 1% default

    // Installments
    const [installments, setInstallments] = useState<Installment[]>([
        { id: "1", value: 1000, dueDate: "" }
    ]);

    const [isCopied, setIsCopied] = useState(false);


    // --- Lead Capture State ---
    const interactedFeatures = useRef<Set<string>>(new Set());
    const [showLeadModal, setShowLeadModal] = useState(false);
    const isLeadCapturedRef = useRef(false);

    const checkLeadCaptured = () => {
        if (isLeadCapturedRef.current) return true;
        if (typeof document !== 'undefined') {
            const match = document.cookie.match(new RegExp('(^| )kitnets_lead_captured=([^;]+)'));
            if (match) {
                isLeadCapturedRef.current = true;
                return true;
            }
        }
        return false;
    };

    const trackInteraction = (featureId: string) => {
        if (checkLeadCaptured()) return;

        // If already tracked, ignore
        if (interactedFeatures.current.has(featureId)) return;

        interactedFeatures.current.add(featureId);
        const newCount = interactedFeatures.current.size;
        console.log(`Tracking interaction: ${featureId}. Unique count: ${newCount}`); // Debug

        // Prompt on the 3rd distinct parameter change (User Request: "changes 3 parameters")
        if (newCount === 3) {
            setShowLeadModal(true);
        }
    };

    // Wrap state setters for interactions
    const handleSetCalcType = (v: "today" | "specific") => { trackInteraction('calc_type'); setCalcType(v); };
    const handleSetSpecificDate = (v: string) => { trackInteraction('specific_date'); setSpecificDate(v); };
    const handleSetGracePeriod = (v: string | number) => { trackInteraction('grace_period'); setGracePeriod(v); };
    const handleSetFinePercent = (v: string | number) => { trackInteraction('fine_percent'); setFinePercent(v); };
    const handleSetFineDelay = (v: boolean) => { trackInteraction('fine_delay_mode'); setApplyFineOnlyIfDelayed(v); };
    const handleSetInterestMode = (v: "monthly" | "daily") => { trackInteraction('interest_mode'); setInterestMode(v); };
    const handleSetInterestRate = (v: string | number) => { trackInteraction('interest_rate'); setInterestRate(v); };


    // Results
    // --- Results (Derived via useMemo below) ---


    // --- Logic ---

    // Add new installment
    const addInstallment = () => {
        trackInteraction('add_installment');
        const initialValue = installments.length > 0 ? installments[0].value : "";
        setInstallments([
            ...installments,
            { id: crypto.randomUUID(), value: initialValue, dueDate: "" }
        ]);
    };

    // Remove installment
    const removeInstallment = (id: string) => {
        trackInteraction('remove_installment');
        if (installments.length > 1) {
            setInstallments(installments.filter(i => i.id !== id));
        }
    };

    // Update installment
    const updateInstallment = (id: string, field: keyof Installment, value: string | number) => {
        if (field === 'value' || field === 'dueDate' || field === 'paymentDate') {
            trackInteraction(`update_installment_${field}`);
        }
        setInstallments(installments?.map(i => i.id === id ? { ...i, [field]: value } : i));
    };



    const { results, summary } = useMemo(() => {
        const baseDate = calcType === 'today' ? new Date() : (specificDate ? new Date(specificDate + 'T12:00:00') : new Date());
        // Reset hours for clean date diff
        baseDate.setHours(0, 0, 0, 0);

        const processed: InstallmentResult[] = installments.map(inst => {
            const val = Number(inst.value);
            if (!val || !inst.dueDate) {
                return {
                    id: inst.id,
                    dueDate: inst.dueDate,
                    value: 0,
                    delayDays: 0,
                    fineRef: 0,
                    interestRef: 0,
                    totalRef: 0,
                    isPaid: false
                };
            }

            const due = new Date(inst.dueDate + 'T12:00:00');
            due.setHours(0, 0, 0, 0);

            // Determine effective end date for calculation
            let endDate = baseDate;
            let isPaid = false;
            if (inst.paymentDate) {
                const paid = new Date(inst.paymentDate + 'T12:00:00');
                paid.setHours(0, 0, 0, 0);
                endDate = paid;
                isPaid = true;
            }

            // Diff in milliseconds
            const diffTime = endDate.getTime() - due.getTime();
            const daysRaw = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Check grace period
            const grace = Number(gracePeriod) || 0;
            const effectiveDelay = Math.max(0, daysRaw - grace);

            if (effectiveDelay <= 0) {
                return {
                    id: inst.id,
                    dueDate: inst.dueDate,
                    value: val,
                    delayDays: 0,
                    fineRef: 0,
                    interestRef: 0,
                    totalRef: val,
                    isPaid
                };
            }

            // Fine
            const fPercent = Number(finePercent) || 0;
            const fineVal = val * (fPercent / 100);

            // Interest
            let interestVal = 0;
            const iRate = Number(interestRate) || 0;

            if (interestMode === 'monthly') {
                const dailyRate = (iRate / 100) / 30; // Pro-rata default
                interestVal = val * dailyRate * effectiveDelay;
            } else {
                // Daily
                interestVal = val * (iRate / 100) * effectiveDelay;
            }

            const total = val + fineVal + interestVal;

            return {
                id: inst.id,
                dueDate: inst.dueDate,
                value: val,
                delayDays: effectiveDelay,
                fineRef: fineVal,
                interestRef: interestVal,
                totalRef: total,
                isPaid
            };
        });

        const newSummary = processed.reduce((acc, curr) => ({
            totalPrincipal: acc.totalPrincipal + curr.value,
            totalFine: acc.totalFine + curr.fineRef,
            totalInterest: acc.totalInterest + curr.interestRef,
            totalUpdated: acc.totalUpdated + curr.totalRef
        }), {
            totalPrincipal: 0,
            totalFine: 0,
            totalInterest: 0,
            totalUpdated: 0
        });

        return {
            results: processed,
            summary: newSummary
        };

    }, [installments, calcType, specificDate, gracePeriod, finePercent, interestMode, interestRate]);


    // Export functions
    const copyToClipboard = () => {
        const text = results.map(r =>
            `Venc: ${formatDate(r.dueDate)} | Valor: ${formatCurrency(r.value)} | Atraso: ${r.delayDays}d | Total: ${formatCurrency(r.totalRef)}`
        ).join('\n') + `\n\nTOTAL: ${formatCurrency(summary.totalUpdated)}`;
        navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handlePrint = () => {
        window.print();
    };

    const downloadCSV = () => {
        const headers = ["Vencimento", "Valor Original", "Dias Atraso", "Multa", "Juros", "Total"];
        const rows = results.map(r => [
            r.dueDate,
            r.value.toFixed(2),
            r.delayDays,
            r.fineRef.toFixed(2),
            r.interestRef.toFixed(2),
            r.totalRef.toFixed(2)
        ]);

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += headers.join(",") + "\n";
        rows.forEach((rowArray) => {
            const row = rowArray.join(",");
            csvContent += row + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "calculo_aluguel_atrasado.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-in fade-in space-y-8">
            {/* Header */}
            <div className="space-y-2 print:hidden">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.title}</h1>
                <p className="text-muted-foreground max-w-2xl">{t.description}</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 print:block">

                {/* CONFIGURATION COLUMN */}
                <div className="xl:col-span-4 space-y-6 print:hidden">

                    {/* General Settings */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Calculator className="w-5 h-5 text-primary" />
                                {t.inputs?.generalData}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">

                            {/* Calculation Date */}
                            <div className="space-y-2">
                                <Label>{t.inputs?.calculationDate}</Label>
                                <RadioGroup value={calcType} onValueChange={handleSetCalcType} className="flex gap-4">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="today" id="r-today" />
                                        <Label htmlFor="r-today">{t.inputs?.calculationDateOptionToday}</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="specific" id="r-spec" />
                                        <Label htmlFor="r-spec">{t.inputs?.calculationDateOptionSpecific}</Label>
                                    </div>
                                </RadioGroup>
                                {calcType === 'specific' && (
                                    <BrazilianDateInput
                                        value={specificDate}
                                        onChange={handleSetSpecificDate}
                                        className="mt-2"
                                    />
                                )}
                            </div>

                            <Separator />

                            {/* Grace Period */}
                            <div>
                                <Label>{t.inputs?.gracePeriod}</Label>
                                <Input
                                    type="number"
                                    value={gracePeriod}
                                    onChange={e => handleSetGracePeriod(e.target.value)}
                                    className="mt-1.5"
                                />
                            </div>

                        </CardContent>
                    </Card>

                    {/* Rules Settings */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-primary" />
                                {t.inputs?.fineRules} & {t.inputs?.interestRules}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            {/* Fine */}
                            <div className="space-y-3">
                                <Label className="font-semibold">{t.inputs?.fineRules}</Label>
                                <div className="grid grid-cols-2 gap-4 items-center">
                                    <Label className="text-xs text-muted-foreground">{t.inputs?.finePercent}</Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            className="pr-8 text-base md:text-sm"
                                            value={finePercent}
                                            onChange={e => handleSetFinePercent(e.target.value)}
                                        />
                                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">%</span>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="c-fine-delay"
                                        checked={applyFineOnlyIfDelayed}
                                        onCheckedChange={(c) => handleSetFineDelay(c as boolean)}
                                    />
                                    <Label htmlFor="c-fine-delay" className="text-xs font-normal leading-tight">
                                        {t.inputs?.applyFineOnlyIfDelayed}
                                    </Label>
                                </div>
                            </div>

                            <Separator />

                            {/* Interest */}
                            <div className="space-y-3">
                                <Label className="font-semibold">{t.inputs?.interestRules}</Label>
                                <RadioGroup value={interestMode} onValueChange={handleSetInterestMode} className="grid grid-cols-2 gap-2">
                                    <div className="flex items-center space-x-2 border rounded p-2 hover:bg-muted/50 transition cursor-pointer">
                                        <RadioGroupItem value="monthly" id="i-monthly" />
                                        <div className="grid gap-0.5">
                                            <Label htmlFor="i-monthly" className="cursor-pointer text-sm">{t.inputs?.interestMonthly}</Label>
                                            <span className="text-[10px] text-muted-foreground">{t.inputs?.interestMonthlyLabel}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 border rounded p-2 hover:bg-muted/50 transition cursor-pointer">
                                        <RadioGroupItem value="daily" id="i-daily" />
                                        <div className="grid gap-0.5">
                                            <Label htmlFor="i-daily" className="cursor-pointer text-sm">{t.inputs?.interestDaily}</Label>
                                            <span className="text-[10px] text-muted-foreground">{t.inputs?.interestDailyLabel}</span>
                                        </div>
                                    </div>
                                </RadioGroup>

                                <div className="flex items-center gap-4 mt-2">
                                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                                        {interestMode === 'monthly' ? t.inputs?.interestMonthlyLabel : t.inputs?.interestDailyLabel}
                                    </Label>
                                    <Input
                                        type="number"
                                        step={0.01}
                                        value={interestRate}
                                        onChange={e => handleSetInterestRate(e.target.value)}
                                        className="text-base md:text-sm"
                                    />
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger><HelpCircle className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                                            <TooltipContent>
                                                {interestMode === 'monthly' ? t.inputs?.interestMonthlyTooltip : t.inputs?.interestDailyTooltip}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>



                        </CardContent>
                    </Card>
                </div>

                {/* MAIN CONTENT COLUMN */}
                <div className="xl:col-span-8 space-y-6">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <Card>
                            <CardContent className="p-4 flex flex-col justify-between h-full">
                                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t.results?.totalPrincipal}</div>
                                <div className="text-lg md:text-2xl font-bold mt-1 max-w-full truncate" title={formatCurrency(summary.totalPrincipal)}>
                                    {formatCurrency(summary.totalPrincipal)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-primary text-primary-foreground shadow-lg shadow-primary/20 relative overflow-hidden">
                            <CardContent className="p-4 flex flex-col justify-between h-full relative z-10">
                                <div className="text-xs text-primary-foreground/80 font-medium uppercase tracking-wider">{t.results?.totalUpdated}</div>
                                <div className="text-xl md:text-3xl font-bold mt-1 tracking-tight max-w-full truncate">
                                    {formatCurrency(summary.totalUpdated)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4 flex flex-col justify-between h-full">
                                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t.results?.totalFine}</div>
                                <div className="text-xl md:text-2xl font-bold mt-1 text-amber-600 dark:text-amber-500 max-w-full truncate">
                                    {formatCurrency(summary.totalFine)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4 flex flex-col justify-between h-full">
                                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t.results?.totalInterest}</div>
                                <div className="text-xl md:text-2xl font-bold mt-1 text-red-600 dark:text-red-500 max-w-full truncate">
                                    {formatCurrency(summary.totalInterest)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Installments Table */}
                    <Card className="min-h-[400px] flex flex-col">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <CardTitle className="text-lg">{t.installments?.title}</CardTitle>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setInstallments([])} title={t.installments?.clearAll}>
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                                <Button size="sm" onClick={addInstallment} className="gap-2">
                                    <Plus className="w-4 h-4" />
                                    {t.installments?.addInstallment}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <div className="rounded-md border overflow-hidden">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="min-w-[170px]">{t.installments?.tableHeaderValue}</TableHead>
                                                <TableHead className="min-w-[150px]">{t.installments?.tableHeaderDueDate}</TableHead>
                                                <TableHead className="hidden md:table-cell">{t.installments?.tableHeaderPayDate}</TableHead>
                                                <TableHead className="text-right min-w-[80px]">{t.installments?.tableHeaderActions}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {installments.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                        Nenhuma parcela adicionada.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                installments.map((inst) => (
                                                    <TableRow key={inst.id} className="animate-in slide-in-from-left-2 duration-300">
                                                        <TableCell>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-2.5 text-muted-foreground text-xs">R$</span>
                                                                <CurrencyInput
                                                                    className="pl-8 h-9 text-base"
                                                                    value={inst.value}
                                                                    onChange={(v) => updateInstallment(inst.id, 'value', v)}
                                                                    placeholder="0,00"
                                                                />
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <BrazilianDateInput
                                                                className="h-9"
                                                                value={inst.dueDate}
                                                                onChange={(v) => updateInstallment(inst.id, 'dueDate', v)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="hidden md:table-cell">
                                                            <BrazilianDateInput
                                                                className="h-9 text-muted-foreground"
                                                                value={inst.paymentDate || ""}
                                                                onChange={(v) => updateInstallment(inst.id, 'paymentDate', v)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                onClick={() => removeInstallment(inst.id)}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Detailed Results Table (Visible only if results exist) */}
                    {results.length > 0 && results.some(r => r.totalRef > 0) && (
                        <div className="space-y-4 pt-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">{t.results?.detailedTableTitle}</h3>
                                <div className="flex gap-2 print:hidden">
                                    <Button variant="outline" size="sm" onClick={copyToClipboard} title={t.results?.actions?.copySummary} className="transition-all duration-200">
                                        {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={downloadCSV} title={t.results?.actions?.exportCsv}>
                                        <Download className="w-4 h-4" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handlePrint} title={t.results?.actions?.print}>
                                        <Printer className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-md border bg-card">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t.results?.colDueDate}</TableHead>
                                            <TableHead className="text-right">{t.results?.colValue}</TableHead>
                                            <TableHead className="text-center">{t.results?.colDelayDays}</TableHead>
                                            <TableHead className="text-right">{t.results?.colFine}</TableHead>
                                            <TableHead className="text-right">{t.results?.colInterest}</TableHead>
                                            <TableHead className="text-right font-bold">{t.results?.colTotal}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {results.map((r) => (
                                            <TableRow key={r.id}>
                                                <TableCell>{formatDate(r.dueDate)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(r.value)}</TableCell>
                                                <TableCell className="text-center">
                                                    {r.delayDays > 0 ? (
                                                        <span className="text-red-500 font-medium">{r.delayDays}</span>
                                                    ) : (
                                                        <span className="text-muted-foreground">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground">{formatCurrency(r.fineRef)}</TableCell>
                                                <TableCell className="text-right text-muted-foreground">{formatCurrency(r.interestRef)}</TableCell>
                                                <TableCell className="text-right font-bold">{formatCurrency(r.totalRef)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

            </div>

            <Separator className="my-8" />

            <div className="print:hidden space-y-12">
                <CalculatorContent content={t.pageContent} />
                <CalculatorCta dict={dict.calculatorCta} lang={lang} />
            </div>

            <Separator className="my-8" />

            {/* Disclaimer */}
            <div className="max-w-4xl text-xs text-muted-foreground mx-auto text-center leading-relaxed print:text-[10px]">
                <p>{t.results?.footerDisclaimer}</p>
            </div>

            <LeadCaptureModal
                open={showLeadModal}
                onOpenChange={(open) => {
                    setShowLeadModal(open);
                    if (!open) {
                        // Check if it was because of success (cookie set)
                        checkLeadCaptured();
                    }
                }}
                calculatorType="multa-atraso-aluguel"
            />

        </div >
    );
}
