"use client";

import React from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { SelectCard } from "./SelectCard";
import { Rocket, Tag, KeyRound } from "lucide-react";
import { ListingIntent } from "./types";
import { Button } from "@kitnets/ui";

export function Step2Intent() {
    const { state, updateData, nextStep } = useAnunciar();
    const { role } = state.data;

    // Logic: Highlight based on role
    // If Construtora -> Lançar highlighted (maybe order changed?)
    // If Proprietário -> Alugar highlighted

    // Implementation: We can just render them in a specific order or add a "Recommended" badge.
    // The spec says "highlighted first".

    const options: { value: ListingIntent; label: string; icon: React.ReactNode; recommendedFor?: string[] }[] = [
        {
            value: "launch",
            label: "Lançar (Empreendimento)",
            icon: <Rocket className="w-6 h-6" />,
            recommendedFor: ['builder']
        },
        {
            value: "sale",
            label: "Vender",
            icon: <Tag className="w-6 h-6" />
        },
        {
            value: "rent",
            label: "Alugar",
            icon: <KeyRound className="w-6 h-6" />,
            recommendedFor: ['owner']
        },
    ];

    // Reorder options based on role if needed, or just keep static.
    // Spec says "Highlighted first". Let's put the recommended one at the top if it matches.

    const sortedOptions = [...options].sort((a, b) => {
        if (role && a.recommendedFor?.includes(role)) return -1;
        if (role && b.recommendedFor?.includes(role)) return 1;
        return 0;
    });

    return (
        <StepLayout title="Qual é o seu objetivo?" subtitle="Escolha o que deseja fazer com este imóvel.">
            <div className="grid gap-3">
                {sortedOptions.map((option) => (
                    <SelectCard
                        key={option.value}
                        label={option.label}
                        icon={option.icon}
                        // Add a badge if recommended?
                        description={role && option.recommendedFor?.includes(role) ? "Recomendado para você" : undefined}
                        selected={state.data.intent === option.value}
                        onClick={() => updateData({ intent: option.value })}
                    />
                ))}
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    disabled={!state.data.intent}
                    onClick={nextStep}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
