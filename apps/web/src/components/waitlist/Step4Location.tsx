"use client";

import React, { useState } from "react";
import { useWaitlist } from "./WaitlistContext";
import { StepLayout } from "./StepLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@kitnets/ui";
import { MapPin, Loader2, Search } from "lucide-react";

export function Step4Location() {
    const { state, updateData, nextStep } = useWaitlist();
    const { city, state: uf, zip } = state.data.location;
    const [isLoading, setIsLoading] = useState(false);
    const [cepError, setCepError] = useState("");

    const formatCEP = (val: string) => {
        return val
            .replace(/\D/g, "")
            .replace(/^(\d{5})(\d)/, "$1-$2")
            .substr(0, 9);
    };

    const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const formatted = formatCEP(raw);

        // Update local state and context (keep user typing)
        updateData({ location: { ...state.data.location, zip: formatted } });
        setCepError("");

        // Auto-fetch when full CEP
        if (formatted.length === 9) {
            setIsLoading(true);
            try {
                const cleanCep = formatted.replace("-", "");
                const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                const data = await res.json();

                if (data.erro) {
                    setCepError("CEP não encontrado.");
                } else {
                    updateData({
                        location: {
                            ...state.data.location,
                            zip: formatted,
                            city: data.localidade,
                            state: data.uf,
                            street: data.logradouro,
                            neighborhood: data.bairro
                        }
                    });
                }
            } catch (err) {
                console.error(err);
                setCepError("Erro ao buscar CEP.");
            } finally {
                setIsLoading(false);
            }
        }
    };

    const isValid = city.length > 2 && uf.length === 2 && (zip?.length === 9);

    return (
        <StepLayout
            title="Onde estão seus imóveis hoje?"
            subtitle="Usado para benchmarks de mercado, preços e dados regionais."
        >
            <div className="space-y-6">

                {/* CEP Input */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground ml-1">CEP</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-4 h-5 w-5 text-muted-foreground" />
                        <Input
                            value={zip || ""}
                            onChange={handleCepChange}
                            placeholder="00000-000"
                            maxLength={9}
                            className={`pl-10 h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50 ${cepError ? "border-destructive" : ""}`}
                            inputMode="numeric"
                        />
                        {isLoading && (
                            <div className="absolute right-4 top-4">
                                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                            </div>
                        )}
                    </div>
                    {cepError && <p className="text-sm text-destructive ml-1">{cepError}</p>}
                </div>

                {/* City and State (Read-only/Auto-filled) */}
                <div className="grid grid-cols-[1fr,120px] gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground ml-1">Cidade Principal</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-4 h-5 w-5 text-muted-foreground" />
                            <Input
                                value={city}
                                readOnly
                                tabIndex={-1}
                                className="pl-10 h-14 text-lg bg-muted/50 dark:bg-zinc-900/30 border-input dark:border-white/5 text-muted-foreground dark:text-zinc-400 focus-visible:ring-0 cursor-not-allowed"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground ml-1">UF</label>
                        <Input
                            value={uf}
                            readOnly
                            tabIndex={-1}
                            className="h-14 text-lg text-center bg-muted/50 dark:bg-zinc-900/30 border-input dark:border-white/5 text-muted-foreground dark:text-zinc-400 focus-visible:ring-0 cursor-not-allowed"
                        />
                    </div>
                </div>

                {/* Additional Address Info */}
                {(state.data.location.street) && (
                    <div className="grid grid-cols-[100px,1fr] gap-4 animate-in fade-in slide-in-from-top-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground ml-1">Número</label>
                            <Input
                                value={state.data.location.number || ""}
                                onChange={(e) => updateData({ location: { ...state.data.location, number: e.target.value } })}
                                placeholder="123"
                                className="h-14 text-lg text-center bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50"
                                inputMode="numeric"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground ml-1">Complemento</label>
                            <Input
                                value={state.data.location.complement || ""}
                                onChange={(e) => updateData({ location: { ...state.data.location, complement: e.target.value } })}
                                placeholder="Apto 101"
                                className="h-14 text-lg bg-card/50 dark:bg-zinc-900/50 border-input dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground focus-visible:ring-emerald-500/50"
                            />
                        </div>
                    </div>
                )}

                <div className="bg-muted dark:bg-zinc-900/40 border border-border dark:border-white/5 rounded-xl p-4 text-sm text-muted-foreground dark:text-zinc-400">
                    <p>
                        Se você opera em múltiplas cidades, indique onde está a maior parte do seu portfólio.
                    </p>
                </div>
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-14 text-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98]"
                    disabled={!isValid || isLoading}
                    onClick={nextStep}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
