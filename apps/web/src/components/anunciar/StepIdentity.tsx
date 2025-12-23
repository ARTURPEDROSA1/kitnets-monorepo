"use client";

import React from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function StepIdentity() {
    const { state, dispatch, nextStep } = useAnunciar();
    const { role } = state.data;
    const { identity } = state.data;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        dispatch({ type: "UPDATE_IDENTITY", payload: { [name]: value } });
    };

    const isPF = role === "owner" || role === "broker";
    const isPJ = role === "agency" || role === "builder";
    const isBroker = role === "broker";

    // Simple validation check
    const isValid = () => {
        if (isPF) {
            if (!identity.cpf || identity.cpf.length < 11) return false;
            if (!identity.fullName) return false;
        }
        if (isPJ) {
            if (!identity.cnpj || identity.cnpj.length < 14) return false;
        }
        if (isBroker) {
            if (!identity.creci) return false;
        }
        return true;
    };

    return (
        <StepLayout
            title="Identificação"
            subtitle="Precisamos de alguns dados para validar seu cadastro."
        >
            <div className="space-y-4">
                {isPF && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="cpf">CPF</Label>
                            <Input
                                id="cpf"
                                name="cpf"
                                placeholder="000.000.000-00"
                                value={identity.cpf}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="fullName">Nome Completo</Label>
                            <Input
                                id="fullName"
                                name="fullName"
                                placeholder="Seu nome completo"
                                value={identity.fullName}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="birthDate">Data de Nascimento</Label>
                            <Input
                                id="birthDate"
                                name="birthDate"
                                type="date"
                                value={identity.birthDate}
                                onChange={handleChange}
                            />
                        </div>
                    </>
                )}

                {isPJ && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="cnpj">CNPJ</Label>
                            <Input
                                id="cnpj"
                                name="cnpj"
                                placeholder="00.000.000/0000-00"
                                value={identity.cnpj}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="businessName">Razão Social</Label>
                            <Input
                                id="businessName"
                                name="businessName"
                                placeholder="Nome da empresa"
                                value={identity.businessName}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tradeName">Nome Fantasia (Opcional)</Label>
                            <Input
                                id="tradeName"
                                name="tradeName"
                                placeholder="Nome fantasia"
                                value={identity.tradeName}
                                onChange={handleChange}
                            />
                        </div>
                    </>
                )}

                {isBroker && (
                    <div className="space-y-2">
                        <Label htmlFor="creci">CRECI</Label>
                        <Input
                            id="creci"
                            name="creci"
                            placeholder="123456"
                            value={identity.creci}
                            onChange={handleChange}
                        />
                    </div>
                )}

                <div className="pt-6">
                    <Button
                        className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                        disabled={!isValid()}
                        onClick={nextStep}
                    >
                        Continuar
                    </Button>
                </div>
            </div>
        </StepLayout>
    );
}
