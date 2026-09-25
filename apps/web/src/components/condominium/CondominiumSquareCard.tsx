"use client";

/**
 * One square card per condominium on the Condomínio hub — the same shape as the project and property
 * cards: the property's photos as the cover carousel, the condominium's name and property, the newest
 * month's revenue and result, and the year to date. The card opens the condominium's cost centre.
 */
import React from "react";
import { Building, Building2, MapPin, Sun, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverCarousel, useCoverCarousel } from "@/components/ui/CoverCarousel";
import { monthLabel, type CondoRow } from "@/lib/condominium-hub";

interface Props {
    row: CondoRow;
    onSelect: () => void;
    onDelete: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
}

const brl = (v: number, digits = 0) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function CondominiumSquareCard({ row, onSelect, onDelete, isDeleting = false }: Props) {
    const { condo, latest } = row;
    const carousel = useCoverCarousel(row.photos.length);

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => { if (carousel.onKeyDown(e)) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
            onMouseEnter={carousel.pause}
            onMouseLeave={carousel.resume}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-all hover:border-emerald-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <CoverCarousel photos={row.photos} alt={condo.property_name} state={carousel} fallback={<Building className="h-12 w-12" />}>
                <span className="absolute left-2 top-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                    {condo.units} {condo.units === 1 ? "unidade" : "unidades"}
                </span>
                {condo.solar_payback_from_result && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" title="O resultado mensal conta como retorno da energia solar">
                        <Sun className="h-3 w-3" /> retorno solar
                    </span>
                )}
                <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    title="Excluir condomínio"
                    aria-label={`Excluir ${condo.name}`}
                    className="absolute right-2 top-2 rounded-lg bg-background/90 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </CoverCarousel>

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="space-y-0.5">
                    <h3 className="break-words font-semibold leading-tight text-foreground">{condo.name}</h3>
                    <p className="flex items-start gap-1 break-words text-xs text-muted-foreground"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{condo.property_name}</span></p>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="break-words">{condo.property_address || "endereço não informado"}</span>
                </p>

                <dl className="mt-auto grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="text-muted-foreground">Receita {latest ? monthLabel(latest.month) : "do mês"}</dt>
                        <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{latest ? brl(latest.revenue) : "—"}</dd>
                        <dd className="leading-snug text-muted-foreground">{latest ? `custos ${brl(latest.totalCost)}` : "sem meses"}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="text-muted-foreground">Resultado</dt>
                        <dd className={cn("font-semibold tabular-nums", latest && latest.result < 0 ? "text-rose-600" : "text-foreground")}>{latest ? brl(latest.result) : "—"}</dd>
                        <dd className={cn("leading-snug", latest?.expected ? "text-amber-600" : "text-muted-foreground")}>{latest ? (latest.expected ? "previsto" : latest.hasCosts ? "confirmado" : "custos a lançar") : "—"}</dd>
                    </div>
                </dl>

                <div className="flex flex-wrap items-start justify-between gap-2 border-t border-border/60 pt-2 text-[11px]">
                    <span className="text-muted-foreground">{row.ytdMonths > 0 ? `${row.year}: ${row.ytdMonths} ${row.ytdMonths === 1 ? "mês" : "meses"}` : `${row.year}: nenhum mês`}</span>
                    <span className={cn("min-w-0 break-words text-right", row.ytdResult < 0 ? "text-rose-600" : "text-foreground")}>
                        {row.ytdMonths > 0 ? <>resultado {brl(row.ytdResult)}{row.ytdMarginPct !== null ? ` · ${row.ytdMarginPct.toLocaleString("pt-BR")}%` : ""}</> : "—"}
                    </span>
                </div>
            </div>
        </div>
    );
}
