"use client";

import { useState } from "react";
import { IPCACalculatorLazy } from "@/components/indices/IPCACalculatorLazy";

type FipeZapSeries = "locacao" | "venda";

const OPTIONS: Array<{ value: FipeZapSeries; label: string; hint: string }> = [
    { value: "locacao", label: "Locação", hint: "Corrige um aluguel pela variação dos preços de locação" },
    { value: "venda", label: "Venda", hint: "Corrige o valor de um imóvel pela variação dos preços de venda" },
];

/**
 * Correction calculator for the FipeZap page. FipeZap has two series (rental and sale prices), so a
 * small switch picks which one the calculator compounds; both use the national figure for all bedrooms.
 */
export function FipeZapCalculator({ initialType = "locacao" }: { initialType?: FipeZapSeries }) {
    const [series, setSeries] = useState<FipeZapSeries>(initialType);
    const current = OPTIONS.find(o => o.value === series)!;
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Série do FipeZap para a calculadora">
                    {OPTIONS.map(o => (
                        <button
                            key={o.value}
                            type="button"
                            onClick={() => setSeries(o.value)}
                            aria-pressed={series === o.value}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${series === o.value ? "bg-background text-foreground shadow-xs border border-border" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-muted-foreground">{current.hint} · índice nacional, todos os dormitórios</span>
            </div>
            {/* the key remounts the calculator so its dates reset to the chosen series' range */}
            <IPCACalculatorLazy key={series} indexCode={series === "venda" ? "FIPEZAP-VENDA" : "FIPEZAP-LOCACAO"} />
        </div>
    );
}
