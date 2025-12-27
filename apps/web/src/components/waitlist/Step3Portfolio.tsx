"use client";

import React from "react";
import { useWaitlist } from "./WaitlistContext";
import { StepLayout } from "./StepLayout";
import { SelectCard } from "./SelectCard";
import { PortfolioSize } from "./types";
import { Button } from "@kitnets/ui";

export function Step3Portfolio() {
    const { state, updateData, nextStep } = useWaitlist();

    const options: { value: PortfolioSize; label: string }[] = [
        { value: "1", label: "1 imóvel" },
        { value: "2-5", label: "2 a 5 imóveis" },
        { value: "6-20", label: "6 a 20 imóveis" },
        { value: "21-100", label: "21 a 100 imóveis" },
        { value: "100+", label: "Mais de 100 imóveis" },
    ];

    return (
        <StepLayout
            title="Quantos imóveis você administra atualmente?"
            subtitle="A plataforma se adapta ao seu porte operacional."
        >
            <div className="grid gap-3">
                {options.map((option) => (
                    <SelectCard
                        key={option.value}
                        label={option.label}
                        selected={state.data.portfolioSize === option.value}
                        onClick={() => updateData({ portfolioSize: option.value })}
                        className="py-6" // Slightly larger for simple choices
                    />
                ))}
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-14 text-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98]"
                    disabled={!state.data.portfolioSize}
                    onClick={nextStep}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
