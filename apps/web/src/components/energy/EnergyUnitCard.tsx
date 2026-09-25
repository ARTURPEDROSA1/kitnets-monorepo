"use client";

/**
 * One square card per consumer unit on the Energia hub — the same shape as the project, property,
 * tenant, corretor and agency cards: the distributor's logo as the cover, what kind of unit it is,
 * the UC number, where it is, the newest bill's consumption and amount, and the credits or the
 * saving that solar brought. The card opens the unit's energy dashboard.
 */
import React from "react";
import Link from "next/link";
import { FileText, MapPin, Sun, Trash2, Upload, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverCarousel, useCoverCarousel } from "@/components/ui/CoverCarousel";
import { EnergyDistributorLogo } from "./EnergyDistributorLogo";
import { monthLabel, type EnergyUnitRow } from "@/lib/energy-hub";

interface Props {
    row: EnergyUnitRow;
    lang: string;
    onSelect: () => void;
    onDelete: (e: React.MouseEvent) => void;
    onViewPdf: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
}

const EMPTY: string[] = [];
const brl = (v: number, digits = 2) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
const kwh = (v: number, digits = 0) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} kWh`;
const brDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const iconLink = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:border-emerald-400 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

export default function EnergyUnitCard({ row, lang, onSelect, onDelete, onViewPdf, isDeleting = false }: Props) {
    const { unit, latest, category } = row;
    const carousel = useCoverCarousel(0);
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    const canDelete = row.kind !== "rental";
    const label = latest ? (latest.label ?? monthLabel(latest.month)) : null;

    const dueHint = latest?.dueDate
        ? row.dueState === "overdue" && row.daysToDue !== null
            ? `venceu em ${brDate(latest.dueDate)}`
            : row.dueState === "due_soon" && row.daysToDue !== null
                ? row.daysToDue === 0 ? "vence hoje" : `vence em ${row.daysToDue} ${row.daysToDue === 1 ? "dia" : "dias"}`
                : row.daysToDue !== null && row.daysToDue < 0 ? `venceu em ${brDate(latest.dueDate)}` : `vence ${brDate(latest.dueDate)}`
        : label ? `fatura de ${label}` : "";

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-all hover:border-emerald-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <CoverCarousel photos={EMPTY} alt={row.distributor} state={carousel} fit="contain" fallback={<EnergyDistributorLogo companyName={unit.utilityCompany} size="lg" />}>
                <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", category.pill)}>{category.short}</span>
                {row.solarLabel && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        <Sun className="h-3 w-3" /> {row.solarLabel}
                    </span>
                )}
                {canDelete && (
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={isDeleting}
                        title={row.kind === "orphaned" ? "Remover unidade desvinculada" : "Excluir esta UC avulsa"}
                        aria-label={`Excluir ${unit.name}`}
                        className="absolute right-2 top-2 rounded-lg bg-background/90 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                )}
            </CoverCarousel>

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="space-y-0.5">
                    <h3 className="break-words font-semibold leading-tight text-foreground">{unit.name}</h3>
                    <p className="break-words text-xs text-muted-foreground">
                        {unit.consumerUnit ? <span className="font-mono">UC {unit.consumerUnit}</span> : "UC não informada"} · {row.distributor}
                    </p>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="break-words">{[unit.address, unit.city].filter(Boolean).join(", ") || "endereço não informado"}</span>
                </p>

                <dl className="mt-auto grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><Zap className="h-3 w-3" /> Consumo</dt>
                        <dd className="font-semibold tabular-nums text-foreground">{latest ? kwh(latest.consumptionKwh) : "—"}</dd>
                        <dd className="leading-snug text-muted-foreground">{latest ? `${kwh(latest.dailyAvgKwh, 1)}/dia · ${label}` : "sem faturas"}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><FileText className="h-3 w-3" /> Fatura</dt>
                        <dd className={cn("font-semibold tabular-nums", row.dueState === "overdue" ? "text-rose-600" : "text-foreground")}>{latest && latest.total > 0 ? brl(latest.total, 0) : "—"}</dd>
                        <dd className={cn("leading-snug", row.dueState === "overdue" ? "text-rose-600" : row.dueState === "due_soon" ? "text-amber-600" : "text-muted-foreground")}>{latest ? (latest.total > 0 ? dueHint : "só histórico de consumo") : "importe a conta de luz"}</dd>
                    </div>
                </dl>

                <div className="flex flex-wrap items-start justify-between gap-2 border-t border-border/60 pt-2">
                    <div className="flex shrink-0 items-center gap-1" aria-label="Ações">
                        {unit.latestBillPdfUrl && (
                            <button type="button" onClick={onViewPdf} className={cn(iconLink, "text-emerald-600")} title="Ver a última fatura em PDF" aria-label="Ver a última fatura">
                                <FileText className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <Link href={`/${lang}/dashboard/energy/${unit.id}?upload=true`} onClick={stop} className={iconLink} title="Importar fatura" aria-label="Importar fatura">
                            <Upload className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                    <span className="min-w-0 break-words text-right text-[11px] leading-snug text-muted-foreground">
                        {latest && latest.balanceKwh > 0
                            ? <span className="text-emerald-700 dark:text-emerald-400">saldo {kwh(latest.balanceKwh)}</span>
                            : latest && latest.savingsAmount > 0
                                ? <span className="text-amber-700 dark:text-amber-400">economia {brl(latest.savingsAmount, 0)}{latest.savingsEstimated ? " (est.)" : ""}</span>
                                : unit.billsCount > 0
                                    ? `${unit.billsCount} ${unit.billsCount === 1 ? "registro" : "registros"}`
                                    : "pronta para importar"}
                    </span>
                </div>
            </div>
        </div>
    );
}
