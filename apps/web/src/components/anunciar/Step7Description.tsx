"use client";

import React from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Button } from "@kitnets/ui";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Step7Description() {
    const { state, updateData, nextStep } = useAnunciar();
    const { description } = state.data;

    const [isGenerating, setIsGenerating] = React.useState(false);

    // AI Hook mock
    const generateDescription = async () => {
        setIsGenerating(true);
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        const { propertyType, location, details, media } = state.data;
        const typeLabel = {
            kitnet: "Kitnet/Studio",
            apartment: "Apartamento",
            house: "Casa",
            commercial: "Ponto Comercial",
            land: "Terreno",
            other: "Imóvel"
        }[propertyType || 'other'];

        const neighborhood = location.neighborhood || "bairro conceituado";
        const city = location.city || "cidade";
        const bedrooms = details.bedrooms ? `${details.bedrooms} quartos` : "";
        const parking = details.parking ? `${details.parking} vagas` : "";
        const area = details.area ? `${details.area}m²` : "";

        // Mocking "looking at photos" and "finding points of interest"
        let description = `Este excelente ${typeLabel} de ${area} está localizado no ${neighborhood}, em ${city}, uma região valorizada e próxima a diversos serviços essenciais. `;

        if (media.photos.length > 0) {
            description += `Com ${media.photos.length} fotos que demonstram o ótimo estado de conservação e acabamento impecável. `;
        }

        if (bedrooms) description += `O imóvel conta com ${bedrooms}, oferecendo conforto e privacidade. `;
        if (parking) description += `Possui também ${parking} de garagem. `;

        description += "A localização é estratégica, com fácil acesso a transporte público, escolas e comércio local. Ideal para quem busca qualidade de vida e praticidade. Agende agora mesmo sua visita e venha conhecer!";

        updateData({ description });
        setIsGenerating(false);
    };

    return (
        <StepLayout title="Descrição do Imóvel" subtitle="Opcional. Podemos ajudar você a criar um texto vendedor.">
            <div className="space-y-4">

                <div className="relative">
                    <textarea
                        className="w-full min-h-[200px] p-4 rounded-xl border border-input bg-background text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-y"
                        placeholder="Descreva seu imóvel ou cole um texto aqui. Não se preocupe com formatação."
                        value={description}
                        onChange={(e) => updateData({ description: e.target.value })}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={isGenerating}
                        className="absolute bottom-3 right-3 text-primary hover:text-primary/80 hover:bg-primary/5 gap-2"
                        onClick={generateDescription}
                    >
                        <Wand2 className={cn("w-4 h-4", isGenerating && "animate-spin")} />
                        {isGenerating ? "Gerando..." : "Gerar com IA"}
                    </Button>
                </div>

            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    // Description is optional? "Optional CTA". Prompt says "Step 7 - Description (AI-Assisted, Optional)"
                    // So we can continue even if empty.
                    onClick={nextStep}
                >
                    Continuar
                </Button>
            </div>
        </StepLayout>
    );
}
