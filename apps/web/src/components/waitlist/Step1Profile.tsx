"use client";

import React from "react";
import { useWaitlist } from "./WaitlistContext";
import { StepLayout } from "./StepLayout";
import { SelectCard } from "./SelectCard";
import { User, Building, Handshake } from "lucide-react"; // Using similar icons
import { LegalProfile } from "./types";
import { Button } from "@kitnets/ui";

export function Step1Profile() {
    const { state, updateData, nextStep } = useWaitlist();

    const options: { value: LegalProfile; label: string; icon: React.ReactNode; desc: string }[] = [
        {
            value: "pf",
            label: "Pessoa Física (PF)",
            desc: "Proprietário(a) de imóveis",
            icon: <User className="w-6 h-6" />,
        },
        {
            value: "pj",
            label: "Pessoa Jurídica (PJ)",
            desc: "Holding, empresa ou investidor",
            icon: <Building className="w-6 h-6" />
        },
        {
            value: "imobiliaria",
            label: "Imobiliária / Corretor",
            desc: "Administração para terceiros",
            icon: <Handshake className="w-6 h-6" />
        },
    ];

    const handleSelect = (profile: LegalProfile) => {
        updateData({ profile });
    }

    return (
        <StepLayout
            title="Como você vai operar na plataforma?"
            subtitle="O Kitnets.com é uma plataforma profissional. Por isso, validamos o cadastro com CPF ou CNPJ."
            showBack={false}
        >
            <div className="grid gap-4">
                {options.map((option) => (
                    <SelectCard
                        key={option.value}
                        label={option.label}
                        description={option.desc}
                        icon={option.icon}
                        selected={state.data.profile === option.value}
                        onClick={() => handleSelect(option.value)}
                    />
                ))}
            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-14 text-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98]"
                    disabled={!state.data.profile}
                    onClick={nextStep}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
