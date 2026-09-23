"use client";

import React, { useState } from "react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, Loader2, Mail, User } from "lucide-react";
import { submitWaitlist, type LeadSource } from "@/app/actions/waitlist";
import { cn } from "@/lib/utils";

export interface LeadFormLabels {
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    button: string;
    sending: string;
    successTitle: string;
    successText: string;
    alreadyText: string;
    privacy: string;
    errorName: string;
    errorEmail: string;
    errorGeneric: string;
}

/**
 * The whole waitlist: name + email, saved to Supabase (waitlist_leads) so the
 * person can be notified when the platform opens to everyone.
 */
export function LeadForm({ labels, source, lang, className, tone = "light" }: { labels: LeadFormLabels; source: LeadSource; lang: string; className?: string; tone?: "light" | "card" }) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "done" | "already">("idle");
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (status === "sending") return;
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        if (trimmedName.length < 2) { setError(labels.errorName); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError(labels.errorEmail); return; }
        setError(null);
        setStatus("sending");
        try {
            const result = await submitWaitlist({ name: trimmedName, email: trimmedEmail, source, lang });
            if (result.success) setStatus(result.already ? "already" : "done");
            else { setStatus("idle"); setError(result.error || labels.errorGeneric); }
        } catch (err) {
            console.error("[LeadForm] submit failed:", err);
            setStatus("idle");
            setError(labels.errorGeneric);
        }
    };

    if (status === "done" || status === "already") {
        return (
            <div className={cn("mx-auto max-w-xl rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-left flex gap-4 animate-in fade-in zoom-in-95 duration-300", className)} role="status" aria-live="polite">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-lg font-semibold text-foreground">{labels.successTitle}</p>
                    <p className="text-sm text-muted-foreground">{status === "already" ? labels.alreadyText : labels.successText}</p>
                </div>
            </div>
        );
    }

    const inputCls = cn(
        "pl-11 h-14 text-base rounded-xl border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500/50",
        tone === "card" ? "bg-background" : "bg-card/70 backdrop-blur-sm",
    );

    return (
        <form onSubmit={handleSubmit} noValidate className={cn("mx-auto w-full max-w-2xl space-y-3 text-left", className)}>
            <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative flex-1">
                    <span className="sr-only">{labels.nameLabel}</span>
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <Input
                        name="name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={labels.namePlaceholder}
                        autoComplete="name"
                        disabled={status === "sending"}
                        className={inputCls}
                    />
                </label>
                <label className="relative flex-1">
                    <span className="sr-only">{labels.emailLabel}</span>
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <Input
                        name="email"
                        type="email"
                        inputMode="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder={labels.emailPlaceholder}
                        autoComplete="email"
                        disabled={status === "sending"}
                        className={inputCls}
                    />
                </label>
                <Button
                    type="submit"
                    size="lg"
                    disabled={status === "sending"}
                    className="h-14 rounded-xl px-8 text-base font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all bg-emerald-600 hover:bg-emerald-700 text-white border-0 sm:shrink-0"
                >
                    {status === "sending" ? (
                        <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />{labels.sending}</span>
                    ) : labels.button}
                </Button>
            </div>
            {error ? (
                <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </p>
            ) : (
                <p className="text-xs text-muted-foreground">{labels.privacy}</p>
            )}
        </form>
    );
}
