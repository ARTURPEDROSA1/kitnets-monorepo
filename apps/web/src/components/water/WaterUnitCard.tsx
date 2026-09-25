"use client";

/**
 * One square card per property on the Água hub — the same shape as the other hubs' cards: the water
 * utility's logo as the cover (read from the header of the current bill, or uploaded by hand), the
 * connection and meter, where it is, the newest bill's consumption and amount, and what twelve
 * months average out to. The card opens the property's water dashboard.
 */
import React from "react";
import Link from "next/link";
import { Droplets, FileText, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverCarousel, useCoverCarousel } from "@/components/ui/CoverCarousel";
import { monthLabel, type WaterUnitRow } from "@/lib/water-hub";

interface Props {
    row: WaterUnitRow;
    lang: string;
    onSelect: () => void;
    onViewPdf: (e: React.MouseEvent) => void;
}

const EMPTY: string[] = [];
const brl = (v: number, digits = 2) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
const m3 = (v: number, digits = 0) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} m³`;
const brDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const iconLink = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:border-blue-400 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export default function WaterUnitCard({ row, lang, onSelect, onViewPdf }: Props) {
    const { unit, latest } = row;
    const photos = unit.logoUrl ? [unit.logoUrl] : EMPTY;
    const carousel = useCoverCarousel(photos.length);
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    const label = latest ? monthLabel(latest.month) : null;

    const dueHint = latest?.dueDate
        ? row.dueState === "overdue"
            ? `venceu em ${brDate(latest.dueDate)}`
            : row.dueState === "due_soon" && row.daysToDue !== null
                ? row.daysToDue === 0 ? "vence hoje" : `vence em ${row.daysToDue} ${row.daysToDue === 1 ? "dia" : "dias"}`
                : row.daysToDue !== null && row.daysToDue < 0 ? `venceu em ${brDate(latest.dueDate)}` : `vence ${brDate(latest.dueDate)}`
        : label ? `conta de ${label}` : "";

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-all hover:border-blue-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
            <CoverCarousel photos={photos} alt={`Concessionária de água de ${unit.name}`} state={carousel} fit="contain" fallback={<Droplets className="h-12 w-12 text-blue-300" />} unoptimized>
                <span className="absolute left-2 top-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">Água principal</span>
                {!unit.logoUrl && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground">logo lido do PDF da conta</span>
                )}
            </CoverCarousel>

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="space-y-0.5">
                    <h3 className="break-words font-semibold leading-tight text-foreground">{unit.name}</h3>
                    <p className="break-words text-xs text-muted-foreground">
                        {unit.connectionCode ? <span className="font-mono">Ligação {unit.connectionCode}</span> : "ligação não informada"}
                        {unit.meterNumber ? <> · <span className="font-mono">{unit.meterNumber}</span></> : null}
                    </p>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="break-words">{[unit.address, unit.city].filter(Boolean).join(", ") || "endereço não informado"}</span>
                </p>

                <dl className="mt-auto grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><Droplets className="h-3 w-3" /> Consumo</dt>
                        <dd className={cn("font-semibold tabular-nums", row.spike ? "text-amber-600" : "text-foreground")}>{latest ? m3(latest.consumptionM3, 1) : "—"}</dd>
                        <dd className="leading-snug text-muted-foreground">{latest ? `${latest.ratePerM3 != null ? `R$ ${latest.ratePerM3.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m³ · ` : ""}${label}` : "sem contas"}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><FileText className="h-3 w-3" /> Conta</dt>
                        <dd className={cn("font-semibold tabular-nums", row.dueState === "overdue" ? "text-rose-600" : "text-foreground")}>{latest ? brl(latest.total, 0) : "—"}</dd>
                        <dd className={cn("leading-snug", row.dueState === "overdue" ? "text-rose-600" : row.dueState === "due_soon" ? "text-amber-600" : "text-muted-foreground")}>{latest ? dueHint : "importe a conta"}</dd>
                    </div>
                </dl>

                <div className="flex flex-wrap items-start justify-between gap-2 border-t border-border/60 pt-2">
                    <div className="flex shrink-0 items-center gap-1" aria-label="Ações">
                        {unit.latestBillPdfUrl && (
                            <button type="button" onClick={onViewPdf} className={cn(iconLink, "text-blue-600")} title="Ver a conta vigente em PDF" aria-label="Ver a conta vigente">
                                <FileText className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <Link href={`/${lang}/dashboard/billing/${unit.id}/new`} onClick={stop} className={iconLink} title="Importar conta" aria-label="Importar conta">
                            <Plus className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                    <span className="min-w-0 break-words text-right text-[11px] leading-snug text-muted-foreground">
                        {row.last12.months > 1
                            ? `média ${brl(row.last12.avgAmount, 0)}/mês · ${m3(row.last12.avgConsumptionM3)}`
                            : unit.billsCount > 0
                                ? `${unit.billsCount} ${unit.billsCount === 1 ? "conta" : "contas"}`
                                : "pronto para importar"}
                    </span>
                </div>
            </div>
        </div>
    );
}
