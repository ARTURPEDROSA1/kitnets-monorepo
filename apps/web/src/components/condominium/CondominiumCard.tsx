"use client";

/** Square card of a condominium on the Condomínio page: name, its property and the key figures. */
import { Building, Building2, MapPin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMonthKey } from "@/lib/property-income";
import type { Condominium } from "@/lib/condominium";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CondominiumCard({ condominium: c, onSelect, onDelete, deleting }: { condominium: Condominium; onSelect: () => void; onDelete: () => void; deleting?: boolean }) {
    const k = c.kpis;
    const latest = k.latest;
    return (
        <div
            role="button" tabIndex={0} onClick={onSelect}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
            className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs transition-all duration-200 hover:shadow-md hover:border-emerald-500/50 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors line-clamp-1 flex items-center gap-2">
                            <Building className="w-5 h-5 text-emerald-600 shrink-0" /> {c.name}
                        </h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                            <Building2 className="w-3.5 h-3.5 shrink-0" /> <span>{c.property_name}</span>
                        </p>
                        {c.property_address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                                <MapPin className="w-3.5 h-3.5 shrink-0" /> <span>{c.property_address}</span>
                            </p>
                        )}
                    </div>
                    <button
                        type="button" disabled={deleting} title="Excluir condomínio" aria-label="Excluir condomínio"
                        onClick={e => { e.stopPropagation(); onDelete(); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors opacity-70 group-hover:opacity-100 shrink-0 disabled:opacity-40"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
                        {c.units} {c.units === 1 ? "unidade" : "unidades"}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted text-muted-foreground">
                        {k.months} {k.months === 1 ? "mês" : "meses"} registrados{k.monthsWithCosts > 0 ? ` · ${k.monthsWithCosts} com custos` : ""}
                    </span>
                </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border/60 space-y-3">
                <div className="p-3 bg-muted/40 dark:bg-muted/20 border border-border/80 rounded-xl grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Receita {latest ? formatMonthKey(latest.month) : "do mês"}</span>
                        <span className="block text-base font-bold text-emerald-700 dark:text-emerald-400">{formatBRL(latest?.revenue ?? 0)}</span>
                        <span className="block text-[11px] text-muted-foreground">Custos {formatBRL(latest?.totalCost ?? 0)}</span>
                    </div>
                    <div className="text-right">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resultado do mês</span>
                        <span className={cn("block text-base font-bold", (latest?.result ?? 0) < 0 ? "text-rose-600" : "text-foreground")}>{formatBRL(latest?.result ?? 0)}</span>
                        <span className="block text-[11px] text-muted-foreground">{latest?.expected ? "previsto" : latest ? "confirmado" : "sem meses"}</span>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Receita {k.year}</span>
                        <span className="block font-semibold text-foreground tabular-nums">{formatBRL(k.ytd.revenue)}</span>
                    </div>
                    <div>
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Resultado {k.year}</span>
                        <span className={cn("block font-semibold tabular-nums", k.ytd.result < 0 ? "text-rose-600" : "text-foreground")}>{formatBRL(k.ytd.result)}</span>
                    </div>
                    <div>
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Margem {k.year}</span>
                        <span className="block font-semibold text-foreground tabular-nums">{k.ytd.marginPct !== null ? `${k.ytd.marginPct}%` : "—"}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
