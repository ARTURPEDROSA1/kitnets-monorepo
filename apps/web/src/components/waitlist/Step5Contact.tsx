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

    // Mask for phone (optional but good)
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, "");
        val = val.replace(/^(\d{2})(\d)/g, "($1) $2");
        val = val.replace(/(\d)(\d{4})$/, "$1-$2");
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
                    <label className="text-sm font-medium text-muted-foreground ml-1">Nome Completo</label>
                    <div className="relative">
                        <User className="absolute left-3 top-4 h-5 w-5 text-zinc-500" />
                        <Input
                            value={name}
                            onChange={(e) => updateData({ contact: { ...state.data.contact, name: e.target.value } })}
                            placeholder="Seu nome"
                            className="pl-10 h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50"
                            disabled={isSubmitting}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground ml-1">E-mail Profissional</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-4 h-5 w-5 text-zinc-500" />
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => updateData({ contact: { ...state.data.contact, email: e.target.value } })}
                            placeholder="seu@email.com"
                            className="pl-10 h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50"
                            disabled={isSubmitting}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground ml-1">WhatsApp <span className="text-zinc-500 text-xs font-normal">(Opcional)</span></label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-4 h-5 w-5 text-zinc-500" />
                        <Input
                            value={whatsapp}
                            onChange={handlePhoneChange}
                            placeholder="(11) 99999-9999"
                            maxLength={15}
                            className="pl-10 h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50"
                            disabled={isSubmitting}
                        />
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
