"use client";

import React from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Button } from "@kitnets/ui";
import { MapPin, Image as ImageIcon } from "lucide-react";

export function Step9Review() {
    const { state, nextStep, dispatch } = useAnunciar();
    const { data } = state;

    return (
        <StepLayout title="Revisar e Publicar" subtitle="Confira se está tudo certo antes de colocar no ar.">
            <div className="space-y-6 bg-card border rounded-xl p-6 shadow-sm">

                {/* Summary Card */}
                <div className="flex items-start gap-4 pb-4 border-b">
                    <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden">
                        {data.media.photos.length > 0 ? (
                            <img src={URL.createObjectURL(data.media.photos[0])} alt="Property preview" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                <ImageIcon className="w-6 h-6" />
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg capitalize">{data.propertyType} para {data.intent === 'rent' ? 'Alugar' : data.intent === 'sale' ? 'Venda' : 'Lançamento'}</h3>
                        <div className="flex items-center text-muted-foreground text-sm mt-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            {data.location.city} - {data.location.neighborhood}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <div>
                        <span className="text-muted-foreground block">Área</span>
                        <span className="font-medium">{data.details.area} m²</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">Quartos</span>
                        <span className="font-medium">{data.details.bedrooms}</span>
                    </div>

                    {(data.intent === 'rent' || data.intent === 'sale') && (
                        <div className="col-span-2">
                            <span className="text-muted-foreground block">Valor</span>
                            <span className="font-semibold text-lg text-primary dark:text-emerald-500">
                                R$ {data.intent === 'rent' ? data.details.rentValue : data.details.salePrice}
                            </span>
                        </div>
                    )}
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => dispatch({ type: "GOTO_STEP", index: 0 })}
                >
                    Editar informações
                </Button>

            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    onClick={nextStep}
                >
                    Publicar Anúncio
                </Button>
            </div>
        </StepLayout>
    );
}
