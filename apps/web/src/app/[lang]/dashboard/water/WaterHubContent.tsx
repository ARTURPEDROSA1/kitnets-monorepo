"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@kitnets/ui";
import { ArrowLeft, ArrowRight, Building2, Calendar, Droplets, FileText, Gauge, MapPin, Sparkles } from "lucide-react";
import type { WaterPropertySummary } from "@/lib/water-properties-server";

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatNumber = (v: number, decimals = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function formatMonth(ref: string | null): string {
    if (!ref) return "-";
    const [y, m] = ref.split("-");
    const idx = parseInt(m, 10) - 1;
    return MONTHS[idx] ? `${MONTHS[idx]}/${y}` : ref;
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-";
    const [y, m, d] = dateStr.slice(0, 10).split("-");
    return d && m && y ? `${d}/${m}/${y}` : dateStr;
}

export default function WaterHubContent({ lang, properties }: { lang: string; properties: WaterPropertySummary[] }) {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link href={`/${lang}/imoveis`} className="inline-flex items-center font-medium hover:text-foreground transition-colors">
                            <ArrowLeft className="w-4 h-4 mr-1.5" />
                            Gerenciar Imóveis
                        </Link>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 dark:bg-blue-900/50 rounded-xl text-blue-600">
                            <Droplets className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Gestão de Água</h1>
                            <p className="text-sm text-muted-foreground">
                                Imóveis com hidrômetro principal pago pelo proprietário. Selecione um imóvel para ver consumo, custo e as contas da concessionária
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
                    <Link href={`/${lang}/imoveis`}>
                        <Button variant="outline" className="gap-2 text-sm font-medium">
                            <Building2 className="w-4 h-4" />
                            Meus Imóveis
                        </Button>
                    </Link>
                </div>
            </div>

            {properties.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {properties.map(prop => (
                        <div
                            key={prop.id}
                            className="group relative flex flex-col justify-between rounded-2xl border border-blue-500/40 dark:border-blue-500/30 bg-card p-6 shadow-xs transition-all duration-200 hover:shadow-md hover:border-blue-500"
                        >
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <h3 className="font-semibold text-lg text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                                        {prop.name}
                                    </h3>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                        {prop.address ? `${prop.address}${prop.city ? `, ${prop.city}` : ""}` : <span className="italic">Endereço não cadastrado</span>}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60">
                                        <Droplets className="w-3.5 h-3.5 text-blue-500" />
                                        Água principal
                                    </span>
                                    {prop.connectionCode && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground">
                                            Ligação: {prop.connectionCode}
                                        </span>
                                    )}
                                    {prop.meterNumber && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground">
                                            <Gauge className="w-3 h-3" />
                                            {prop.meterNumber}
                                        </span>
                                    )}
                                </div>

                                {/* KPIs of the latest bill */}
                                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60">
                                    <div className="space-y-0.5">
                                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground block">Consumo</span>
                                        <span className="text-sm font-bold text-foreground block tabular-nums">
                                            {prop.latestConsumptionM3 !== null ? `${formatNumber(prop.latestConsumptionM3, 0)} m³` : "-"}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground block">{formatMonth(prop.latestMonth)}</span>
                                    </div>
                                    <div className="space-y-0.5">
                                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground block">Tarifa</span>
                                        <span className="text-sm font-bold text-foreground block tabular-nums">
                                            {prop.latestRatePerM3 !== null ? `R$ ${formatNumber(prop.latestRatePerM3, 2)}` : "-"}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground block">por m³</span>
                                    </div>
                                    <div className="space-y-0.5">
                                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground block">Média 12m</span>
                                        <span className="text-sm font-bold text-foreground block tabular-nums">
                                            {prop.avgTotalAmount !== null ? formatCurrency(prop.avgTotalAmount) : "-"}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground block">
                                            {prop.avgConsumptionM3 !== null ? `${formatNumber(prop.avgConsumptionM3, 0)} m³/mês` : "sem contas"}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    {prop.billsCount > 0 ? (
                                        <span className="flex items-center gap-1 text-foreground font-medium">
                                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                                            {prop.billsCount} {prop.billsCount === 1 ? "conta arquivada" : "contas arquivadas"}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                                            Pronto p/ importar contas
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 mt-4 border-t border-border/60 space-y-3">
                                {prop.latestDueDate || (prop.latestTotalAmount !== null && prop.latestTotalAmount > 0) ? (
                                    <div className="p-3 bg-muted/40 dark:bg-muted/20 border border-border/80 rounded-xl flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-blue-500" />
                                                Vencimento
                                            </span>
                                            <span className="text-xs sm:text-sm font-semibold text-foreground block">{formatDate(prop.latestDueDate)}</span>
                                        </div>
                                        <div className="text-right space-y-0.5">
                                            <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground block">Pagar</span>
                                            <span className="text-sm sm:text-base font-bold text-foreground">{formatCurrency(prop.latestTotalAmount || 0)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-2.5 bg-muted/20 border border-dashed border-border/60 rounded-xl flex items-center justify-between text-xs text-muted-foreground">
                                        <span className="text-[11px] italic">Sem conta a vencer</span>
                                        <span className="text-[11px] font-medium">-</span>
                                    </div>
                                )}
                                <Link href={`/${lang}/dashboard/billing/${prop.id}`} className="w-full block">
                                    <Button className="w-full justify-between bg-blue-600 hover:bg-blue-700 text-white transition-all">
                                        <span>Analisar Água & Contas</span>
                                        <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="border-2 border-dashed border-border rounded-3xl p-12 text-center bg-card space-y-4 max-w-xl mx-auto">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                        <Droplets className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-foreground">Nenhum imóvel com água principal</h3>
                        <p className="text-sm text-muted-foreground">
                            Em Imóveis → Dados do Imóvel, marque <span className="font-semibold text-foreground">Água</span> em &quot;Medidores Principais do Imóvel&quot; para o imóvel aparecer aqui.
                        </p>
                    </div>
                    <Link href={`/${lang}/imoveis`}>
                        <Button variant="outline" className="gap-2 font-medium">
                            <Building2 className="w-4 h-4" />
                            Ir para Imóveis
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
