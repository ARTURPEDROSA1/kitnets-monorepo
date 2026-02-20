"use client";

import { useState, useCallback } from "react";
import { Bell, CheckCircle, Send, Loader2 } from "lucide-react";
import { saveAlertLead } from "@/app/actions/save-alert-lead";
import Link from "next/link";

interface IPCAAlertFormProps {
    indexCode: string;
    lang: string;
    /** Compact variant for bottom CTA placement */
    variant?: "default" | "compact";
}

export function IPCAAlertForm({ indexCode, lang, variant = "default" }: IPCAAlertFormProps) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [consent, setConsent] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const applyPhoneMask = (value: string) => {
        const digits = value.replace(/\D/g, "");
        if (digits.length <= 2) return digits;
        if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
        if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    };

    const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setWhatsapp(applyPhoneMask(e.target.value));
    };

    // Grab UTM params from URL
    const getUtmParams = useCallback(() => {
        if (typeof window === "undefined") return {};
        const params = new URLSearchParams(window.location.search);
        return {
            utm_source: params.get("utm_source") || undefined,
            utm_medium: params.get("utm_medium") || undefined,
            utm_campaign: params.get("utm_campaign") || undefined,
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name || name.trim().length < 2) {
            setError("Informe seu nome (mínimo 2 caracteres).");
            return;
        }
        if (!email && !whatsapp) {
            setError("Informe pelo menos e-mail ou WhatsApp.");
            return;
        }

        setIsSubmitting(true);

        const utmParams = getUtmParams();
        const result = await saveAlertLead({
            name: name.trim(),
            email: email || undefined,
            whatsapp: whatsapp ? whatsapp.replace(/\D/g, "") : undefined,
            index_type: indexCode,
            locale: lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US",
            source_page: typeof window !== "undefined" ? window.location.pathname : `/${lang}/indices/${indexCode.toLowerCase()}`,
            consent,
            ...utmParams,
        });

        setIsSubmitting(false);

        if (result.success) {
            setSubmitted(true);
        } else {
            setError(result.error || "Erro ao salvar. Tente novamente.");
        }
    };

    // ── Success State ──
    if (submitted) {
        return (
            <div className={`rounded-xl border bg-card shadow-sm overflow-hidden ${variant === "compact" ? "" : "md:col-span-3 min-w-0"}`}>
                <div className="px-5 py-6 md:px-8 md:py-8 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="font-semibold text-foreground">Cadastro realizado!</p>
                            <p className="text-sm text-muted-foreground">
                                Você será avisado assim que o próximo {indexCode} for divulgado.
                            </p>
                        </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 border px-4 py-3">
                        <p className="text-sm text-muted-foreground">
                            Enquanto isso, simule a correção do seu aluguel pelo {indexCode}:
                        </p>
                        <Link
                            href={`/${lang}/calculadora-reajuste-aluguel`}
                            className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline mt-1 inline-block"
                        >
                            Calculadora de Reajuste de Aluguel →
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // ── Form ──
    return (
        <div className={`rounded-xl border bg-card shadow-sm overflow-hidden ${variant === "compact" ? "" : "md:col-span-3 min-w-0"}`}>
            <div className="px-5 py-6 md:px-8 md:py-8 bg-gradient-to-br from-amber-500/[0.03] via-transparent to-orange-500/[0.03] dark:from-amber-500/[0.06] dark:to-orange-500/[0.06]">
                {/* Header */}
                <div className="flex items-start gap-3 mb-5">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mt-0.5">
                        <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-base md:text-lg font-bold text-foreground">
                            🔔 Receba Alerta do Próximo {indexCode}
                        </h3>
                        <p className="text-xs md:text-sm text-muted-foreground">
                            Quer ser avisado assim que o novo {indexCode} for divulgado? Cadastre seu nome e receba gratuitamente:
                        </p>
                        <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {[
                                `${indexCode} do mês`,
                                `${indexCode} acumulado no ano`,
                                `${indexCode} acumulado em 12 meses`,
                                'Link direto para simulação de correção',
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="text-emerald-500">✓</span> {item}
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            Não perca a data de reajuste do seu aluguel.
                        </p>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className={`grid gap-3 ${variant === "compact" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
                        {/* Name */}
                        <div className="space-y-1.5">
                            <label htmlFor="alert-name" className="text-xs font-medium text-muted-foreground">
                                Nome *
                            </label>
                            <input
                                id="alert-name"
                                type="text"
                                placeholder="Seu nome"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm
                                    placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                                    focus:border-emerald-500 transition-colors"
                                required
                                minLength={2}
                            />
                        </div>

                        {/* Email */}
                        <div className="space-y-1.5">
                            <label htmlFor="alert-email" className="text-xs font-medium text-muted-foreground">
                                E-mail
                            </label>
                            <input
                                id="alert-email"
                                type="email"
                                placeholder="seu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm
                                    placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                                    focus:border-emerald-500 transition-colors"
                            />
                        </div>

                        {/* WhatsApp */}
                        <div className="space-y-1.5">
                            <label htmlFor="alert-whatsapp" className="text-xs font-medium text-muted-foreground">
                                WhatsApp
                            </label>
                            <input
                                id="alert-whatsapp"
                                type="tel"
                                placeholder="(11) 99999-9999"
                                value={whatsapp}
                                onChange={handleWhatsappChange}
                                maxLength={15}
                                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm
                                    placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                                    focus:border-emerald-500 transition-colors"
                            />
                        </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                        * Preencha pelo menos e-mail ou WhatsApp.
                    </p>

                    {/* Consent */}
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={consent}
                            onChange={(e) => setConsent(e.target.checked)}
                            className="mt-0.5 rounded border-input accent-emerald-600"
                        />
                        <span className="text-xs text-muted-foreground leading-relaxed">
                            Concordo em receber alertas econômicos e posso cancelar a qualquer momento.{" "}
                            <Link
                                href={`/${lang}/politica-de-privacidade`}
                                className="underline hover:text-foreground transition-colors"
                            >
                                Política de Privacidade
                            </Link>
                        </span>
                    </label>

                    {/* Error */}
                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-lg text-sm font-semibold
                            text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600
                            shadow-md shadow-amber-500/20 hover:shadow-lg hover:shadow-amber-500/30
                            disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <Send className="h-4 w-4" />
                                Quero receber alerta
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
