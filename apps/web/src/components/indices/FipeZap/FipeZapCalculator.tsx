"use client";

import { useState } from "react";
import { IPCACalculatorLazy } from "@/components/indices/IPCACalculatorLazy";
import { FIPEZAP_BUCKETS, fipezapCalculatorCode, isFipezapBucket, type FipezapBucket } from "@/lib/index-calculator";

type FipeZapSeries = "locacao" | "venda";

const OPTIONS: Array<{ value: FipeZapSeries; label: string; hint: string }> = [
    { value: "locacao", label: "Locação", hint: "Corrige um aluguel pela variação dos preços de locação" },
    { value: "venda", label: "Venda", hint: "Corrige o valor de um imóvel pela variação dos preços de venda" },
];

/**
 * Correction calculator for the FipeZap page. FipeZap has two series (rental and sale prices) and
 * publishes each for all units and per bedroom count, so a switch picks the series and a select the
 * bedroom bucket the calculator compounds; every figure is the national index.
 */
export function FipeZapCalculator({ initialType = "locacao", initialBedrooms }: { initialType?: FipeZapSeries; initialBedrooms?: string }) {
    const [series, setSeries] = useState<FipeZapSeries>(initialType);
    const [bucket, setBucket] = useState<FipezapBucket>(isFipezapBucket(initialBedrooms) ? initialBedrooms : "total");
    const current = OPTIONS.find(o => o.value === series)!;
    const indexCode = fipezapCalculatorCode(series, bucket);
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
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Dormitórios:</span>
                    <select
                        value={bucket}
                        onChange={e => setBucket(e.target.value as FipezapBucket)}
                        aria-label="Dormitórios da série do FipeZap para a calculadora"
                        className="h-8 px-2 rounded-md border border-input bg-background text-xs font-semibold text-foreground cursor-pointer
                            focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                    >
                        {FIPEZAP_BUCKETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                </label>
                <span className="text-xs text-muted-foreground">{current.hint} · índice nacional</span>
            </div>
            {/* the key remounts the calculator so its dates reset to the chosen series' range */}
            <IPCACalculatorLazy key={indexCode} indexCode={indexCode} />
        </div>
    );
}
