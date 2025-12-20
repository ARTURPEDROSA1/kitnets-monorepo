"use client";

import React, { useState, useEffect } from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@kitnets/ui";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Step4Location() {
    const { state, updateData, nextStep } = useAnunciar();
    const { location } = state.data;
    const [isLoading, setIsLoading] = useState(false);
    const [cepError, setCepError] = useState("");
    const [addressFound, setAddressFound] = useState(false);

    // Initial check if we have data (e.g. came back from next step)
    useEffect(() => {
        if (location.street && location.city) {
            setAddressFound(true);
        }
    }, [location]);

    const formatCEP = (value: string) => {
        return value
            .replace(/\D/g, "")
            .replace(/^(\d{5})(\d)/, "$1-$2")
            .substr(0, 9);
    };

    const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const formatted = formatCEP(rawValue);
        updateData({ location: { ...location, zip: formatted } });
        setCepError("");

        // Auto-fetch if complete
        if (formatted.length === 9) {
            fetchAddress(formatted);
        } else {
            setAddressFound(false);
        }
    };

    const fetchAddress = async (cep: string) => {
        setIsLoading(true);
        setCepError("");
        const cleanCep = cep.replace("-", "");

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await response.json();

            if (data.erro) {
                setCepError("CEP não encontrado.");
                setAddressFound(false);
            } else {
                updateData({
                    location: {
                        ...location,
                        zip: cep,
                        street: data.logradouro,
                        neighborhood: data.bairro,
                        city: data.localidade,
                        state: data.uf,
                        address: `${data.logradouro}, ${location.number || ''}` // Update combined address
                    }
                });
                setAddressFound(true);
            }
        } catch (error) {
            setCepError("Erro ao buscar CEP. Tente novamente.");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNumberChange = (val: string) => {
        updateData({
            location: {
                ...location,
                number: val,
                address: `${location.street}, ${val}`
            }
        });
    }

    const handleNext = () => {
        if (location.city && location.street && location.number) {
            nextStep();
        }
    };

    return (
        <StepLayout title="Onde fica o imóvel?" subtitle="Comece pelo CEP para preenchermos o endereço.">
            <div className="space-y-6">

                {/* CEP Input */}
                <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">CEP <span className="text-destructive">*</span></label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder="00000-000"
                            value={location.zip}
                            onChange={handleCepChange}
                            className={cn("pl-10 text-lg tracking-wider", cepError && "border-destructive focus-visible:ring-destructive")}
                            maxLength={9}
                            inputMode="numeric"
                        />
                        {isLoading && (
                            <div className="absolute right-3 top-3.5">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            </div>
                        )}
                    </div>
                    {cepError && <p className="text-sm text-destructive">{cepError}</p>}
                </div>

                {/* Address Details (Revealed) */}
                <div className={cn(
                    "space-y-4 transition-all duration-500 ease-in-out overflow-hidden",
                    addressFound ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                )}>
                    <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-3">
                        <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Endereço Encontrado</span>
                            <p className="font-medium text-foreground mt-1">
                                {location.street}, {location.neighborhood}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {location.city} - {location.state}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">Número <span className="text-destructive">*</span></label>
                            <Input
                                placeholder="Ex: 123"
                                value={location.number}
                                onChange={(e) => handleNumberChange(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">Complemento</label>
                            <Input
                                placeholder="Checkout 202"
                                value={location.complement}
                                onChange={(e) => updateData({ location: { ...location, complement: e.target.value } })}
                            />
                        </div>
                    </div>
                </div>

            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    disabled={!addressFound || !location.number}
                    onClick={handleNext}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
