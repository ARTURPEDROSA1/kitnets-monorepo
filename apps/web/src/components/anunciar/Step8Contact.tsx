"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@kitnets/ui";
import { Mail, CheckCircle2 } from "lucide-react";

export function Step8Contact() {
    const { state, updateData, nextStep } = useAnunciar();
    const { email } = state.data.contact;
    const [isChecking, setIsChecking] = useState(false);
    const [magicLinkSent, setMagicLinkSent] = useState(false);
    const searchParams = useSearchParams();
    // Track if we've already tried to skip to avoid loops if user goes back
    const [hasSkipped, setHasSkipped] = useState(false);

    // Auto-skip ONLY if email is from URL param (homepage flow)
    React.useEffect(() => {
        const fromUrl = searchParams?.get('email');
        if (email && fromUrl && !hasSkipped) {
            setHasSkipped(true);
            nextStep();
        }
    }, [email, hasSkipped, nextStep, searchParams]);

    const handleNext = async () => {
        if (!email) return;
        localStorage.setItem('kitnets_user_email', email); // Remember for next time
        setIsChecking(true);

        // Simulate API check
        setTimeout(() => {
            setIsChecking(false);
            setMagicLinkSent(true);
        }, 1500);
    };

    const handleContinueAfterMagic = () => {
        nextStep();
    };

    if (magicLinkSent) {
        return (
            <StepLayout title="Verifique seu email" showBack={false}>
                <div className="text-center space-y-6 py-8">
                    <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold mb-2">Link de acesso enviado!</h3>
                        <p className="text-muted-foreground">Enviamos um link mágico para <strong>{email}</strong>. Clique nele para confirmar sua conta.</p>
                    </div>

                    <Button
                        className="w-full h-12 text-lg rounded-xl shadow-lg"
                        onClick={handleContinueAfterMagic}
                    >
                        Já confirmei, continuar
                    </Button>
                </div>
            </StepLayout>
        )
    }

    return (
        <StepLayout title="Quase lá! Qual seu email?" subtitle="Usaremos ele para enviar atualizações sobre seu anúncio.">
            <div className="space-y-4">
                <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => updateData({ contact: { ...state.data.contact, email: e.target.value } })}
                        className="pl-10"
                    />
                </div>
                <p className="text-xs text-muted-foreground text-center">Não enviaremos spam. Promessa.</p>
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    disabled={!email || isChecking}
                    onClick={handleNext}
                >
                    {isChecking ? "Verificando..." : "Continuar"}
                </Button>
            </div>
        </StepLayout>
    );
}
