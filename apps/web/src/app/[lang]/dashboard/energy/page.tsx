"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@kitnets/ui";
import {
    Sun,
    Zap,
    Building2,
    MapPin,
    ArrowRight,
    Loader2,
    FileText,
    Plus,
    CheckCircle2,
    ArrowLeft
} from "lucide-react";
import { EnergyDistributorLogo } from "@/components/energy/EnergyDistributorLogo";
import { OwnerPropertySummary } from "@/app/api/energy-bills/properties/route";

export default function EnergyDashboardHubPage() {
    const params = useParams();
    const router = useRouter();
    const lang = (params.lang as string) || "pt";

    const [properties, setProperties] = useState<OwnerPropertySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [redirecting, setRedirecting] = useState(false);

    useEffect(() => {
        let isMounted = true;
        async function loadProperties() {
            try {
                const res = await fetch("/api/energy-bills/properties");
                const data = await res.json();
                if (data.success && Array.isArray(data.properties)) {
                    if (!isMounted) return;
                    setProperties(data.properties);

                    // If user has exactly 1 property with solar or bills, auto-redirect directly to it
                    const solarProps = data.properties.filter((p: OwnerPropertySummary) => p.hasSolar || p.billsCount > 0);
                    if (solarProps.length === 1 && data.properties.length === 1) {
                        setRedirecting(true);
                        router.replace(`/${lang}/dashboard/energy/${solarProps[0].id}`);
                        return;
                    }
                }
            } catch (err) {
                console.error("[EnergyHub] Failed to fetch properties:", err);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        loadProperties();
        return () => {
            isMounted = false;
        };
    }, [lang, router]);

    if (loading || redirecting) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                <p className="text-sm font-medium text-muted-foreground">
                    {redirecting ? "Redirecionando para o painel de energia..." : "Carregando seus imóveis..."}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Top Navigation & Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <Link
                            href={`/${lang}/imoveis`}
                            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4 mr-1.5" />
                            Gerenciar Imóveis
                        </Link>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-600">
                            <Sun className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                                Gestão de Energia Solar
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Selecione o imóvel para visualizar a geração solar, balanço de créditos e faturas da concessionária
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Link href={`/${lang}/imoveis`}>
                        <Button variant="outline" className="gap-2 text-sm font-medium">
                            <Building2 className="w-4 h-4" />
                            Meus Imóveis
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Properties Grid */}
            {properties.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {properties.map((prop) => (
                        <div
                            key={prop.id}
                            className={`group relative flex flex-col justify-between rounded-2xl border bg-card p-6 shadow-xs transition-all duration-200 hover:shadow-md hover:border-amber-400/80 ${
                                prop.hasSolar ? "border-amber-500/30 dark:border-amber-500/20" : "border-border"
                            }`}
                        >
                            <div className="space-y-4">
                                {/* Header: Name + Badges */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <h3 className="font-semibold text-lg text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                            {prop.name}
                                        </h3>
                                        {prop.address && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                                                <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                                {prop.address}
                                                {prop.city ? `, ${prop.city}` : ""}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Solar Tag */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {prop.hasSolar ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
                                            <Sun className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                            {prop.solarKwp ? `Solar GD • ${prop.solarKwp} kWp` : "Microgeração Solar (GD)"}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-normal bg-muted text-muted-foreground">
                                            Sem energia solar cadastrada
                                        </span>
                                    )}

                                    {prop.consumerUnit && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground">
                                            UC: {prop.consumerUnit}
                                        </span>
                                    )}
                                </div>

                                {/* Utility Distributor & Stats */}
                                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        {prop.utilityCompany ? (
                                            <div className="px-2 py-1 bg-background border border-border rounded-lg flex items-center justify-center">
                                                <EnergyDistributorLogo companyName={prop.utilityCompany} size="sm" />
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <Zap className="w-3.5 h-3.5 text-amber-500" />
                                                <span>Concessionária</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="text-right">
                                        {prop.billsCount > 0 ? (
                                            <span className="text-foreground font-medium flex items-center gap-1 justify-end">
                                                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                                {prop.billsCount} {prop.billsCount === 1 ? "fatura arquivada" : "faturas arquivadas"}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">Nenhuma fatura</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* CTA Action */}
                            <div className="pt-5 mt-4 border-t border-border/60">
                                <Link href={`/${lang}/dashboard/energy/${prop.id}`} className="w-full block">
                                    <Button
                                        className={`w-full justify-between group-hover:bg-amber-600 group-hover:text-white transition-all ${
                                            prop.hasSolar
                                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                                : "bg-secondary hover:bg-secondary/80 text-foreground"
                                        }`}
                                    >
                                        <span>Analisar Energia & Faturas</span>
                                        <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* Empty state */
                <div className="border-2 border-dashed border-border rounded-3xl p-12 text-center bg-card space-y-4 max-w-xl mx-auto">
                    <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                        <Sun className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-foreground">
                            Nenhum imóvel encontrado
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Cadastre seu primeiro imóvel na plataforma e habilite a opção de Microgeração Solar para acompanhar o histórico de consumo, créditos e economia em tempo real.
                        </p>
                    </div>
                    <Link href={`/${lang}/imoveis`}>
                        <Button className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-medium">
                            <Plus className="w-4 h-4" />
                            Cadastrar Imóvel
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
