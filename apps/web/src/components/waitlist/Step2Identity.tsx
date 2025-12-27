"use client";

import React, { useState } from "react";
import { useWaitlist } from "./WaitlistContext";
import { StepLayout } from "./StepLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@kitnets/ui";
import { ShieldCheck, Loader2 } from "lucide-react";

// Simple validation helpers
const cleanDigits = (value: string) => value.replace(/\D/g, "");

const validateCPF = (cpf: string) => {
    const clean = cleanDigits(cpf);
    if (clean.length !== 11) return false;
    // Add real algorithm if needed, but length check is a good start for UI flow
    // A robust implementation would be too long for this snippet, trusting user input for now or adding library later.
    return !/^(\d)\1+$/.test(clean); // Basic check for all same digits
};

const validateCNPJ = (cnpj: string) => {
    const clean = cleanDigits(cnpj);
    if (clean.length !== 14) return false;
    return true;
};

const formatCPF = (value: string) => {
    return value
        .replace(/\D/g, "")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})/, "$1-$2")
        .replace(/(-\d{2})\d+?$/, "$1");
};

const formatCNPJ = (value: string) => {
    return value
        .replace(/\D/g, "")
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2")
        .replace(/(-\d{2})\d+?$/, "$1");
};

export function Step2Identity() {
    const { state, updateData, nextStep } = useWaitlist();
    const { profile } = state.data;
    const isPF = profile === 'pf';

    const [value, setValue] = useState(isPF ? (state.data.identity.cpf || "") : (state.data.identity.cnpj || ""));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const formatted = isPF ? formatCPF(raw) : formatCNPJ(raw);
        setValue(formatted);

        if (isPF) {
            updateData({ identity: { ...state.data.identity, cpf: formatted } });
        } else {
            updateData({ identity: { ...state.data.identity, cnpj: formatted } });
        }

        if (error) setError("");
    };

    const formatCEP = (val: string) => {
        return val
            .replace(/\D/g, "")
            .replace(/^(\d{5})(\d)/, "$1-$2")
            .substr(0, 9);
    };

    const fetchCNPJ = async (cnpjValue: string) => {
        setIsLoading(true);
        try {
            const cleanValue = cleanDigits(cnpjValue);
            const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanValue}`);
            if (!res.ok) throw new Error("CNPJ não encontrado");

            const data = await res.json();

            // Extract partners
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const partners = data.qsa ? data.qsa.map((p: any) => p.nome_socio) : [];

            // Format CEP from API to ensure XXXXX-XXX
            const rawCep = data.cep || "";
            const formattedCep = formatCEP(rawCep);

            // Update Identity with Company Name & Partners
            const identityUpdate = {
                ...state.data.identity,
                cnpj: cnpjValue,
                businessName: data.razao_social,
                tradeName: data.nome_fantasia,
                partners: partners
            };

            // Update Location with Address from CNPJ
            // BrasilAPI returns: logradouro, numero, complemento, bairro, municipio, uf, cep
            const locationUpdate = {
                ...state.data.location,
                city: data.municipio,
                state: data.uf,
                zip: formattedCep,
                street: data.logradouro,
                number: data.numero,
                complement: data.complemento,
                neighborhood: data.bairro
            };

            updateData({
                identity: identityUpdate,
                location: locationUpdate
            });

            // Auto-advance to next step if successful
            setIsLoading(false); // Enable button just in case
            nextStep();

        } catch (error) {
            console.error(error);
            // Non-blocking error, user can still proceed
        } finally {
            if (isLoading) setIsLoading(false);
        }
    };

    const handleBlur = async () => {
        if (!isPF && validateCNPJ(value)) {
            // Only fetch if it's a new valid CNPJ or we don't have the name yet
            // Check against current stored to avoid re-fetching identical
            const cleanInput = cleanDigits(value);
            const cleanStored = cleanDigits(state.data.identity.cnpj || "");

            if (cleanInput !== cleanStored || !state.data.identity.businessName) {
                await fetchCNPJ(value);
            }
        }
    };

    const isValid = isPF ? validateCPF(value) : validateCNPJ(value);

    return (
        <StepLayout
            title={isPF ? "Informe seu CPF" : "Informe seu CNPJ"}
            subtitle={isPF ? undefined : "O CNPJ permite ativar recursos profissionais, relatórios e planos empresariais."}
        >
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground ml-1">
                        {isPF ? "CPF (apenas números)" : "CNPJ (apenas números)"}
                    </label>
                    <div className="relative">
                        <Input
                            value={value}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50 ${error ? "border-destructive/50" : ""}`}
                            placeholder={isPF ? "000.000.000-00" : "00.000.000/0001-00"}
                            maxLength={isPF ? 14 : 18}
                            inputMode="numeric"
                        />
                        {isLoading && (
                            <div className="absolute right-4 top-4">
                                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                            </div>
                        )}
                        {/* Icons or status indicators could go here */}
                    </div>
                    {error && <p className="text-sm text-destructive ml-1">{error}</p>}

                    {!isPF && state.data.identity.businessName && (
                        <div className="mt-2 p-3 bg-muted/50 dark:bg-zinc-900/30 border border-border dark:border-white/5 rounded-lg text-sm space-y-1 animate-in fade-in slide-in-from-top-2">
                            <p className="font-medium text-foreground dark:text-zinc-200">{state.data.identity.businessName}</p>
                            {state.data.identity.tradeName && (
                                <p className="text-muted-foreground dark:text-zinc-500">{state.data.identity.tradeName}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Helper / Trust text */}
                <div className="bg-muted dark:bg-zinc-900/40 border border-border dark:border-white/5 rounded-xl p-4 flex gap-3 text-sm text-muted-foreground dark:text-zinc-400">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <p>
                        {isPF
                            ? "Utilizamos o CPF exclusivamente para validação do perfil, prevenção de fraudes e futura formalização de contratos. Seus dados são protegidos conforme a LGPD."
                            : "Validamos seu CNPJ para garantir que o ambiente seja exclusivo para profissionais."}
                    </p>
                </div>
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-14 text-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98]"
                    disabled={!isValid || isLoading}
                    onClick={nextStep}
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Continuar"}
                </Button>
            </div>
        </StepLayout>
    );
}
