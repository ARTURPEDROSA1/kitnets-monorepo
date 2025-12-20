"use client";

import React from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { SelectCard } from "./SelectCard";
import { Building2, User, Key, Briefcase } from "lucide-react";
import { UserRole } from "./types";
import { Button } from "@kitnets/ui";

export function Step1Profile() {
    const { state, updateData, nextStep } = useAnunciar();

    const handleSelect = (role: UserRole) => {
        updateData({ role });
        // Auto-advance or wait for user to click continue?
        // UX spec says "Single primary action per screen" & "Clear CTA: Continuar"
        // But also "Fast path". Often choice -> auto-advance is faster.
        // However, specs say "Clear CTA: Continuar". I'll respect that, or allow double click.
        // For now, select then user clicks continue.
    };

    const options: { value: UserRole; label: string; icon: React.ReactNode; desc?: string }[] = [
        {
            value: "owner",
            label: "Proprietário(a)",
            icon: <User className="w-6 h-6" />,
            desc: "Anúncio direto, sem intermediários"
        },
        {
            value: "broker",
            label: "Corretor(a)",
            icon: <Key className="w-6 h-6" />
        },
        {
            value: "agency",
            label: "Imobiliária",
            icon: <Briefcase className="w-6 h-6" />
        },
        {
            value: "builder",
            label: "Construtora",
            icon: <Building2 className="w-6 h-6" />
        },
    ];

    return (
        <StepLayout title="Para começar, quem é você?" subtitle="Isso nos ajuda a personalizar sua experiência.">
            <div className="grid gap-3">
                {options.map((option) => (
                    <SelectCard
                        key={option.value}
                        label={option.label}
                        description={option.desc}
                        icon={option.icon}
                        selected={state.data.role === option.value}
                        onClick={() => handleSelect(option.value)}
                    />
                ))}
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    disabled={!state.data.role}
                    onClick={nextStep}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
