"use client";

import React from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { SelectCard } from "./SelectCard";
import { Home, Building, Store, TreePine, HelpCircle, BedDouble } from "lucide-react";
import { PropertyType } from "./types";
import { Button } from "@kitnets/ui";

export function Step3Type() {
    const { state, updateData, nextStep } = useAnunciar();

    const options: { value: PropertyType; label: string; icon: React.ReactNode }[] = [
        { value: "kitnet", label: "Kitnet / Studio", icon: <BedDouble className="w-6 h-6" /> },
        { value: "apartment", label: "Apartamento", icon: <Building className="w-6 h-6" /> },
        { value: "house", label: "Casa", icon: <Home className="w-6 h-6" /> },
        { value: "commercial", label: "Comercial", icon: <Store className="w-6 h-6" /> },
        { value: "land", label: "Terreno", icon: <TreePine className="w-6 h-6" /> },
        { value: "other", label: "Outro", icon: <HelpCircle className="w-6 h-6" /> },
    ];

    return (
        <StepLayout title="Qual o tipo do imóvel?" subtitle="Selecione a categoria que melhor se encaixa.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {options.map((option) => (
                    <SelectCard
                        key={option.value}
                        label={option.label}
                        icon={option.icon}
                        selected={state.data.propertyType === option.value}
                        onClick={() => updateData({ propertyType: option.value })}
                        className="h-full"
                    />
                ))}
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    disabled={!state.data.propertyType}
                    onClick={nextStep}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
