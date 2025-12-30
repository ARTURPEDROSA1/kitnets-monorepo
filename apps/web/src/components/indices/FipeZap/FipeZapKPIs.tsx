"use client";

import { FipeZapDataPoint } from "@/lib/fipezap";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FipeZapKPIsProps {
    data: {
        locacao: FipeZapDataPoint[];
        venda: FipeZapDataPoint[];
        yield: FipeZapDataPoint[];
    };
    currentYear: number;
    activeType: string;
}

export function FipeZapKPIs({ data, currentYear }: Omit<FipeZapKPIsProps, 'activeType'>) {
    const renderCard = (latest: FipeZapDataPoint | undefined, label: string, valueKey: keyof FipeZapDataPoint, type: string) => {
        const val = latest ? latest[valueKey] : null;
        const displayVal = val !== null && val !== undefined
            ? type === 'yield' && valueKey !== 'accumulated_12m' && valueKey !== 'accumulated_year' // Yield monthly is usually annualized in context or just raw %
                ? `${Number(val).toFixed(2)}%`
                : `${Number(val).toFixed(2)}%`
            : '--';


        // Yield is always neutral/positive color context, but for variations we might want colors. 
        // IPCA uses strictly primary color or text-foreground depending on context. 
        // We stick to standard card style to match IPCA screenshot.

        return (
            <Card className="rounded-xl border bg-card text-card-foreground shadow-sm">
                <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start p-4 md:p-6 pb-4 md:pb-2 gap-4">
                    <div className="flex flex-col space-y-1">
                        <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">{label}</h3>
                    </div>
                    <div className="md:pt-0 pt-0">
                        <div className="text-xl md:text-3xl font-bold text-primary text-right md:text-left">
                            {displayVal}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0 md:mt-1 text-right md:text-left">
                            {latest ? `Ref. ${latest.month.toString().padStart(2, '0')}/${latest.year}` : '--'}
                        </p>
                    </div>
                </div>
            </Card>
        );
    };

    const latestLocacao = data.locacao[data.locacao.length - 1];
    const latestVenda = data.venda[data.venda.length - 1];
    const latestYield = data.yield[data.yield.length - 1];

    const typeConfig: Record<string, { title: string, tooltip: string, data: FipeZapDataPoint, key: 'locacao' | 'venda' | 'yield', showYieldStyle?: boolean }> = {
        'locacao': {
            title: 'FIPEZAP – Locação Residencial',
            tooltip: 'Acompanha a variação do preço médio de locação de apartamentos prontos.',
            data: latestLocacao,
            key: 'locacao'
        },
        'venda': {
            title: 'FIPEZAP – Venda Residencial',
            tooltip: 'Acompanha a variação do preço médio de venda de apartamentos prontos.',
            data: latestVenda,
            key: 'venda'
        },
        'yield': {
            title: 'FIPEZAP – Yield Imobiliário',
            tooltip: 'Yield estimado = (Preço médio de aluguel / Preço médio de venda) anualizado',
            data: latestYield,
            key: 'yield',
            showYieldStyle: true
        }
    };

    const typesToRender = ['locacao', 'venda', 'yield'];

    return (
        <div className="space-y-8">
            {typesToRender.map((typeKey) => {
                const conf = typeConfig[typeKey];
                const { title: sectionTitle, tooltip: sectionTooltip, data: sectionData, key: sectionKey, showYieldStyle: isYield } = conf;

                return (
                    <div key={typeKey} className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
                                {sectionTitle}
                            </h3>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{sectionTooltip}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                            {renderCard(sectionData, isYield ? "Hoje (Yield Anualizado)" : "Hoje (Variação mensal)", "value_percent", sectionKey)}
                            {renderCard(sectionData, isYield ? "Média 12 meses" : "Acumulado em 12 meses", "accumulated_12m", sectionKey)}
                            {renderCard(sectionData, isYield ? `Média ${currentYear}` : `Acumulado em ${currentYear}`, "accumulated_year", sectionKey)}
                            {/* Next Release Date - Only show for the first section or maybe simpler placeholder for others to save space? 
                                User screenshot shows 3 cards per row, no 'Next Release Date' card visible in screenshot for Locacao/Venda rows?
                                Actually screenshot shows 3 cards. The 'Next Release Date' card was added by me in previous step context or existing code.
                                I'll keep it for all or remove if it feels too much? 
                                Screenshot shows 3 cards per row: "Hoje", "Acumulado 12 meses", "Acumulado em 2025".
                                It DOES NOT show "Next Release Date".
                                I will Remove "Next Release Date" card to match screenshot and "Bring back missing cards" (which implies matching the reference image).
                            */}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
