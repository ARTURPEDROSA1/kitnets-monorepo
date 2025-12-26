"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { ArrowUpDown, Info, Lock } from "lucide-react";
import { Dictionary } from "../../../../dictionaries";
import { useUser } from "@clerk/nextjs";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "../../../../components/ui/accordion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";

type InterestRateConverterProps = {
    dict: Dictionary;
};

export function InterestRateConverter({ dict }: InterestRateConverterProps) {
    const t = dict.interestRateConverterPage;
    const tCapture = dict.leadCapture;
    const { user } = useUser();

    // States for inputs (string to allow formatting)
    const [monthlyStr, setMonthlyStr] = useState("1,0000");
    const [annualStr, setAnnualStr] = useState("12,6825");

    // Track which field was last edited to drive the conversion direction
    const [lastEdited, setLastEdited] = useState<"monthly" | "annual">("monthly");

    // Usage tracking
    const [usageCount, setUsageCount] = useState(0);
    const [showCapture, setShowCapture] = useState(false);
    const [hasCaptured, setHasCaptured] = useState(false);

    // Capture Form State
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    // Debounce timer
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Initial check for captured cookie
    useEffect(() => {
        const capturedCookie = document.cookie.split('; ').find(row => row.startsWith('lead_captured='));
        if (capturedCookie) {
            setHasCaptured(true);
        }
    }, []);

    // Helper to parse localized string to number
    const parseNumber = (val: string): number | null => {
        if (!val) return null;
        // Verify it is a valid partial number. 
        // Allow comma or dot. Normalize to dot.
        const normalized = val.replace(",", ".");
        const num = parseFloat(normalized);
        if (isNaN(num)) return null;
        return num;
    };

    // Helper to format number to localized string (4 decimal places)
    const formatNumber = (num: number): string => {
        return num.toLocaleString("pt-BR", {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
        });
    };

    // Pre-fill user data
    useEffect(() => {
        if (user) {
            if (user.fullName) setName(user.fullName);
            if (user.primaryEmailAddress?.emailAddress) setEmail(user.primaryEmailAddress.emailAddress);
        }
    }, [user]);

    // Calculation logic
    const calculateAnnual = (monthly: number): number => {
        // i_a = (1 + i_m)^12 - 1
        // Rates are in %. So 1% is 0.01.
        const i_m = monthly / 100;
        const i_a = Math.pow(1 + i_m, 12) - 1;
        return i_a * 100;
    };

    const calculateMonthly = (annual: number): number => {
        // i_m = (1 + i_a)^(1/12) - 1
        const i_a = annual / 100;
        const i_m = Math.pow(1 + i_a, 1 / 12) - 1;
        return i_m * 100;
    };

    // Effect to handle conversion with debounce
    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        // "play with converter 2 times on the 3rd time ask"
        // Interactions 1 and 2 are free. 3rd triggers capture.
        if (!hasCaptured && usageCount >= 2) {
            setShowCapture(true);
            return;
        }

        debounceTimer.current = setTimeout(() => {
            if (lastEdited === "monthly") {
                const monthlyVal = parseNumber(monthlyStr);
                if (monthlyVal !== null) {
                    const annualVal = calculateAnnual(monthlyVal);
                    const newAnnualStr = formatNumber(annualVal);

                    if (newAnnualStr !== annualStr) {
                        setAnnualStr(newAnnualStr);
                        // increment usage only if actual change happened (user typed something new)
                        // and not just initial render or loop
                        if (!hasCaptured) setUsageCount(prev => prev + 1);
                    }
                } else if (monthlyStr === "") {
                    setAnnualStr("");
                }
            } else {
                const annualVal = parseNumber(annualStr);
                if (annualVal !== null) {
                    const monthlyVal = calculateMonthly(annualVal);
                    const newMonthlyStr = formatNumber(monthlyVal);

                    if (newMonthlyStr !== monthlyStr) {
                        setMonthlyStr(newMonthlyStr);
                        // increment usage only if actual change happened
                        if (!hasCaptured) setUsageCount(prev => prev + 1);
                    }
                } else if (annualStr === "") {
                    setMonthlyStr("");
                }
            }
        }, 300); // 300ms debounce

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [monthlyStr, annualStr, lastEdited, hasCaptured]); // Removed usageCount from dependency to avoid loop

    // Handlers
    const handleMonthlyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!hasCaptured && usageCount >= 2) {
            setShowCapture(true);
            return;
        }

        const val = e.target.value;
        if (!/^[0-9.,]*$/.test(val)) return;

        setLastEdited("monthly");
        setMonthlyStr(val);
    };

    const handleAnnualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!hasCaptured && usageCount >= 2) {
            setShowCapture(true);
            return;
        }

        const val = e.target.value;
        if (!/^[0-9.,]*$/.test(val)) return;

        setLastEdited("annual");
        setAnnualStr(val);
    };

    const handleCaptureSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Set cookie
        // Expires in 1 year
        const date = new Date();
        date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000));
        document.cookie = `lead_captured=true; expires=${date.toUTCString()}; path=/`;

        setHasCaptured(true);
        setShowCapture(false);
        setUsageCount(0); // Reset count so they can continue

        // Use the input they were trying to type? 
        // For now just letting them continue is enough.
    };

    return (
        <div className="w-full max-w-2xl mx-auto space-y-12">

            <Dialog open={showCapture} onOpenChange={setShowCapture}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{tCapture.title}</DialogTitle>
                        <DialogDescription>
                            {tCapture.description}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCaptureSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="lead-name" className="sr-only">Name</Label>
                            <Input
                                id="lead-name"
                                placeholder={tCapture.namePlaceholder}
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lead-email" className="sr-only">Email</Label>
                            <Input
                                id="lead-email"
                                type="email"
                                placeholder={tCapture.emailPlaceholder}
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3" />
                            <span>{tCapture.privacyNote}</span>
                        </div>
                        <DialogFooter>
                            <Button type="submit" className="w-full">{tCapture.submit}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <div className="text-center space-y-6">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{t.title}</h1>
                <p className="text-lg text-muted-foreground leading-relaxed">{t.intro}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-8 shadow-sm space-y-8">

                {/* Monthly Input */}
                <div className="space-y-3">
                    <Label htmlFor="monthly-rate" className="text-base">{t.monthlyRate}</Label>
                    <div className="relative">
                        <Input
                            id="monthly-rate"
                            type="text"
                            inputMode="decimal"
                            value={monthlyStr}
                            onChange={handleMonthlyChange}
                            className="text-xl font-medium pr-8 h-12"
                            placeholder="0,0000"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                    </div>
                </div>

                {/* Arrow / Divider */}
                <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                    <ArrowUpDown className="h-6 w-6 opacity-50" />
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-70">{t.conversionNote}</span>
                </div>

                {/* Annual Input */}
                <div className="space-y-3">
                    <Label htmlFor="annual-rate" className="text-base">{t.annualRate}</Label>
                    <div className="relative">
                        <Input
                            id="annual-rate"
                            type="text"
                            inputMode="decimal"
                            value={annualStr}
                            onChange={handleAnnualChange}
                            className="text-xl font-medium pr-8 h-12"
                            placeholder="0,0000"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                    </div>
                </div>

            </div>

            {/* Educational / Note */}
            <div className="space-y-4 rounded-lg bg-muted/40 p-6 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 shrink-0 text-blue-500 mt-0.5" />
                    <div className="space-y-2">
                        <p className="font-medium text-foreground">{t.educationalNote}</p>
                        <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>{t.example1}</li>
                            <li>{t.example2}</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Supporting Text */}
            <div className="space-y-4 text-left">
                <p className="text-muted-foreground leading-relaxed">
                    {t.supportingText}
                </p>
            </div>

            {/* FAQ */}
            {t.faq && (
                <div className="pt-8 border-t border-border space-y-8">
                    <h2 className="text-2xl font-bold text-center text-foreground">{t.faq.title}</h2>
                    <Accordion type="single" collapsible className="w-full">
                        {t.faq.items.map((item: { question: string; answer: string }, i: number) => (
                            <AccordionItem key={i} value={`item-${i}`}>
                                <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                                <AccordionContent className="text-muted-foreground leading-relaxed">
                                    {item.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            )}
        </div>
    );
}
