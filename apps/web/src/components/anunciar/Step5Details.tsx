"use client";

import React from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@kitnets/ui";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function Counter({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
    return (
        <div className="flex items-center justify-between p-3 border rounded-xl bg-card">
            <span className="font-medium text-foreground">{label}</span>
            <div className="flex items-center gap-3">
                <button
                    onClick={() => onChange(Math.max(0, value - 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/80"
                >
                    <Minus className="w-4 h-4 text-secondary-foreground" />
                </button>
                <span className="w-4 text-center">{value}</span>
                <button
                    onClick={() => onChange(value + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/80"
                >
                    <Plus className="w-4 h-4 text-secondary-foreground" />
                </button>
            </div>
        </div>
    )
}

function Toggle({ label, value, onChange }: { label: string, value: boolean, onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className={cn(
                "flex items-center justify-between p-3 border rounded-xl w-full transition-colors",
                value ? "border-primary bg-primary/10" : "bg-card hover:border-primary/50"
            )}
        >
            <span className={cn("font-medium", value ? "text-primary" : "text-foreground")}>{label}</span>
            <div className={cn(
                "w-6 h-6 rounded-full border flex items-center justify-center",
                value ? "bg-primary border-primary text-primary-foreground" : "bg-secondary border-transparent"
            )}>
                {value && <Check className="w-4 h-4" />}
            </div>
        </button>
    )
}

export function Step5Details() {
    const { state, updateData, nextStep } = useAnunciar();
    const { details } = state.data;
    const { intent } = state.data;

    const handleNext = () => {
        // Basic validation
        if (!details.area) return; // Add more error handling
        nextStep();
    };

    return (
        <StepLayout title="Detalhes do imóvel" subtitle="Conte mais sobre o que você está oferecendo.">
            <div className="space-y-6">

                {/* Common Fields */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">Área (m²)</label>
                        <Input
                            type="number"
                            placeholder="Ex: 45"
                            value={details.area}
                            onChange={(e) => updateData({ details: { ...details, area: e.target.value } })}
                        />
                    </div>
                    {/* Conditional fields based on intent could go here too if layout requires, but sticking to flow */}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Counter label="Quartos" value={details.bedrooms || 0} onChange={(v) => updateData({ details: { ...details, bedrooms: v } })} />
                    <Counter label="Banheiros" value={details.bathrooms || 0} onChange={(v) => updateData({ details: { ...details, bathrooms: v } })} />
                    <Counter label="Vagas" value={details.parking || 0} onChange={(v) => updateData({ details: { ...details, parking: v } })} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Toggle label="Mobiliado" value={details.furnished || false} onChange={(v) => updateData({ details: { ...details, furnished: v } })} />
                    <Toggle label="Aceita Pets" value={details.pets || false} onChange={(v) => updateData({ details: { ...details, pets: v } })} />
                </div>

                <div className="h-px bg-gray-200 dark:bg-gray-800 my-4" />

                {/* Conditional Fields */}

                {intent === 'rent' && (
                    <div className="space-y-4 fade-in">
                        <h3 className="font-semibold text-lg">Valores de Locação</h3>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Valor do Aluguel (R$)</label>
                            <Input
                                type="number"
                                placeholder="0,00"
                                value={details.rentValue}
                                onChange={(e) => updateData({ details: { ...details, rentValue: e.target.value } })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">Condomínio</label>
                                <Input
                                    type="number"
                                    placeholder="0,00"
                                    value={details.condoFee}
                                    onChange={(e) => updateData({ details: { ...details, condoFee: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">IPTU</label>
                                <Input
                                    type="number"
                                    placeholder="0,00"
                                    value={details.tax}
                                    onChange={(e) => updateData({ details: { ...details, tax: e.target.value } })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {intent === 'sale' && (
                    <div className="space-y-4 fade-in">
                        <h3 className="font-semibold text-lg">Valores de Venda</h3>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Preço de Venda (R$)</label>
                            <Input
                                type="number"
                                placeholder="0,00"
                                value={details.salePrice}
                                onChange={(e) => updateData({ details: { ...details, salePrice: e.target.value } })}
                            />
                        </div>
                        <Toggle label="Aceita Financiamento" value={details.financing || false} onChange={(v) => updateData({ details: { ...details, financing: v } })} />
                    </div>
                )}

                {intent === 'launch' && (
                    <div className="space-y-4 fade-in">
                        <h3 className="font-semibold text-lg">Detalhes do Lançamento</h3>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Data Prevista de Entrega</label>
                            <Input
                                type="date"
                                value={details.deliveryDate}
                                onChange={(e) => updateData({ details: { ...details, deliveryDate: e.target.value } })}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Número de Unidades</label>
                            <Input
                                type="number"
                                value={details.units}
                                onChange={(e) => updateData({ details: { ...details, units: e.target.value } })}
                            />
                        </div>
                    </div>
                )}

            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    disabled={!details.area || (intent === 'rent' && !details.rentValue) || (intent === 'sale' && !details.salePrice)}
                    // Basic validation check
                    onClick={handleNext}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
