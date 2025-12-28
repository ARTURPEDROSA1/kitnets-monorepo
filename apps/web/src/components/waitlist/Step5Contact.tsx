"use client";

import React, { useState } from "react";
import { useWaitlist } from "./WaitlistContext";
import { StepLayout } from "./StepLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@kitnets/ui";
import { Mail, Phone, User, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { submitWaitlist } from "@/app/actions/waitlist";

export function Step5Contact() {
    const { state, updateData, nextStep } = useWaitlist();
    const { name, email, whatsapp } = state.data.contact;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isValid = name.length > 2 && email.includes("@");

    // Mask for phone based on DDI
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const ddi = state.data.contact.ddi || "+55";
        let val = e.target.value.replace(/\D/g, "");

        if (ddi === "+55") {
            // Brazil: (XX) XXXXX-XXXX
            val = val.replace(/^(\d{2})(\d)/g, "($1) $2");
            val = val.replace(/(\d)(\d{4})$/, "$1-$2");
        } else if (ddi === "+1") {
            // US: (XXX) XXX-XXXX
            val = val.replace(/^(\d{3})(\d)/g, "($1) $2");
            val = val.replace(/(\d{3})(\d)/, "$1-$2");
        } else {
            // General International: XXX XXX XXX (groups of 3 or 4?)
            // Let's just do group of 3-4 for readability or leave raw
            val = val.replace(/(\d{3})(\d)/g, "$1 $2");
        }

        updateData({ contact: { ...state.data.contact, whatsapp: val } });
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            const result = await submitWaitlist(state.data);
            if (result.success) {
                nextStep();
            } else {
                setError(result.error || "Ocorreu um erro ao salvar sua solicitação.");
            }
        } catch (e) {
            console.error(e);
            setError("Erro de conexão. Tente novamente.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <StepLayout
            title="Dados de contato"
            subtitle="Para acesso antecipado ao SaaS."
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-muted-foreground ml-1">Nome Completo</label>
                    <div className="relative">
                        <User className="absolute left-3 top-4 h-5 w-5 text-zinc-500" />
                        <Input
                            id="name"
                            name="name"
                            value={name}
                            onChange={(e) => updateData({ contact: { ...state.data.contact, name: e.target.value } })}
                            placeholder="Seu nome"
                            className="pl-10 h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50"
                            disabled={isSubmitting}
                            autoComplete="name"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-muted-foreground ml-1">E-mail Profissional</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-4 h-5 w-5 text-zinc-500" />
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => updateData({ contact: { ...state.data.contact, email: e.target.value } })}
                            placeholder="seu@email.com"
                            className="pl-10 h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50"
                            disabled={isSubmitting}
                            autoComplete="email"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-medium text-muted-foreground ml-1">WhatsApp <span className="text-zinc-500 text-xs font-normal">(Opcional)</span></label>
                    <div className="flex gap-2">
                        <div className="relative w-[110px]">
                            <select
                                className="w-full h-14 pl-3 bg-card/50 dark:bg-zinc-900/50 border border-input dark:border-white/10 rounded-md text-foreground dark:text-white text-base focus-visible:ring-emerald-500/50 appearance-none bg-no-repeat bg-right pr-6"
                                value={state.data.contact.ddi || "+55"}
                                onChange={(e) => updateData({ contact: { ...state.data.contact, ddi: e.target.value } })}
                                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.5em 1.5em' }}
                            >
                                <option value="+55">🇧🇷 +55</option>
                                <option value="+1">🇺🇸 +1</option>
                                <option value="+351">🇵🇹 +351</option>
                                <option value="+34">🇪🇸 +34</option>
                                <option value="+54">🇦🇷 +54</option>
                                <option value="+598">🇺🇾 +598</option>
                                <option value="+595">🇵🇾 +595</option>
                                <option value="+56">🇨🇱 +56</option>
                            </select>
                        </div>
                        <div className="relative flex-1">
                            <Phone className="absolute left-3 top-4 h-5 w-5 text-zinc-500" />
                            <Input
                                id="phone"
                                name="phone"
                                type="tel"
                                value={whatsapp}
                                onChange={handlePhoneChange}
                                placeholder={
                                    (state.data.contact.ddi === "+1") ? "(555) 123-4567" :
                                        (state.data.contact.ddi === "+55" || !state.data.contact.ddi) ? "(11) 99999-9999" :
                                            "999 999 999"
                                }
                                maxLength={20}
                                className="pl-10 h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50"
                                disabled={isSubmitting}
                                inputMode="numeric"
                                autoComplete="tel"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex gap-3 text-sm text-emerald-100/80 mt-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="font-medium text-emerald-400">Compromisso de privacidade</p>
                        <p>
                            Você receberá acesso antecipado ao SaaS e comunicações relacionadas ao lançamento.
                            Não enviamos spam. Não compartilhamos seus dados.
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3 text-sm text-red-200 mt-2">
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-14 text-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98]"
                    disabled={!isValid || isSubmitting}
                    onClick={handleSubmit}
                >
                    {isSubmitting ? (
                        <div className="flex items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Enviando...</span>
                        </div>
                    ) : (
                        "Entrar na lista de espera"
                    )}
                </Button>
            </div>
        </StepLayout>
    );
}
