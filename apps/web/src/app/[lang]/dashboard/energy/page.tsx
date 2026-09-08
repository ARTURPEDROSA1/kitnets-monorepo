"use client";

import React, { useEffect, useState, useMemo } from "react";
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
    ArrowLeft,
    Home,
    Users,
    Trash2,
    Sparkles,
    Calendar,
} from "lucide-react";
import { EnergyDistributorLogo } from "@/components/energy/EnergyDistributorLogo";
import { AddStandaloneUcModal } from "@/components/energy/AddStandaloneUcModal";
import type { OwnerPropertySummary } from "@/app/api/energy-bills/properties/route";

const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function formatDueDate(dateStr?: string | null): string {
    if (!dateStr) return "-";
    const clean = dateStr.slice(0, 10);
    const parts = clean.split("-");
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

export default function EnergyDashboardHubPage() {
    const params = useParams();
    const router = useRouter();
    const lang = (params.lang as string) || "pt";

    const [properties, setProperties] = useState<OwnerPropertySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [redirecting, setRedirecting] = useState(false);
    const [isAddUcOpen, setIsAddUcOpen] = useState(false);
    const [filterTab, setFilterTab] = useState<"all" | "rental" | "standalone">("all");
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadProperties = async () => {
        try {
            const res = await fetch("/api/energy-bills/properties");
            const data = await res.json();
            if (data.success && Array.isArray(data.properties)) {
                setProperties(data.properties);

                // If user has exactly 1 property (and it's not a standalone UC or already has bills), auto-redirect directly
                const solarProps = data.properties.filter(
                    (p: OwnerPropertySummary) => p.hasSolar || p.billsCount > 0
                );
                if (solarProps.length === 1 && data.properties.length === 1) {
                    setRedirecting(true);
                    router.replace(`/${lang}/dashboard/energy/${solarProps[0].id}`);
                    return;
                }
            }
        } catch (err) {
            console.error("[EnergyHub] Failed to fetch properties:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProperties();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lang, router]);

    const handleDeleteUc = async (id: string, name: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm(`Tem certeza que deseja remover a UC avulsa "${name}" e todo seu histórico de faturas?`)) {
            return;
        }

        setDeletingId(id);
        try {
            const res = await fetch(`/api/energy-bills/properties?id=${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setProperties((prev) => prev.filter((p) => p.id !== id));
            } else {
                const data = await res.json();
                alert(data.error || "Erro ao remover UC.");
            }
        } catch (err) {
            console.error("[EnergyHub] Delete error:", err);
            alert("Erro de conexão ao remover UC.");
        } finally {
            setDeletingId(null);
        }
    };

    const rentalCount = useMemo(
        () => properties.filter((p) => !p.isStandaloneUc).length,
        [properties]
    );
    const standaloneCount = useMemo(
        () => properties.filter((p) => p.isStandaloneUc).length,
        [properties]
    );

    const filteredProperties = useMemo(() => {
        if (filterTab === "rental") return properties.filter((p) => !p.isStandaloneUc);
        if (filterTab === "standalone") return properties.filter((p) => p.isStandaloneUc);
        return properties;
    }, [properties, filterTab]);

    if (loading || redirecting) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                <p className="text-sm font-medium text-muted-foreground">
                    {redirecting ? "Redirecionando para o painel de energia..." : "Carregando seus imóveis e UCs..."}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Top Navigation & Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link
                            href={`/${lang}/imoveis`}
                            className="inline-flex items-center font-medium hover:text-foreground transition-colors"
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
                                Selecione o imóvel ou a UC avulsa para visualizar a geração solar, balanço de créditos e faturas da concessionária
                            </p>
                        </div>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
                    <Button
                        onClick={() => setIsAddUcOpen(true)}
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-2 text-sm font-medium shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Adicionar UC Avulsa
                    </Button>

                    <Link href={`/${lang}/imoveis`}>
                        <Button variant="outline" className="gap-2 text-sm font-medium">
                            <Building2 className="w-4 h-4" />
                            Meus Imóveis
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filter Tabs if user has both rental properties and standalone UCs */}
            {standaloneCount > 0 && rentalCount > 0 && (
                <div className="flex items-center gap-2 border-b border-border pb-3">
                    <button
                        onClick={() => setFilterTab("all")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filterTab === "all"
                                ? "bg-foreground text-background shadow-xs"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                    >
                        Todas as Unidades ({properties.length})
                    </button>
                    <button
                        onClick={() => setFilterTab("rental")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            filterTab === "rental"
                                ? "bg-foreground text-background shadow-xs"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                    >
                        <Building2 className="w-3.5 h-3.5" />
                        Imóveis de Aluguel ({rentalCount})
                    </button>
                    <button
                        onClick={() => setFilterTab("standalone")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            filterTab === "standalone"
                                ? "bg-amber-600 text-white shadow-xs"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                    >
                        <Home className="w-3.5 h-3.5" />
                        UCs Avulsas / Família ({standaloneCount})
                    </button>
                </div>
            )}

            {/* Properties Grid */}
            {filteredProperties.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProperties.map((prop) => (
                        <div
                            key={prop.id}
                            className={`group relative flex flex-col justify-between rounded-2xl border bg-card p-6 shadow-xs transition-all duration-200 hover:shadow-md ${
                                prop.isStandaloneUc
                                    ? "border-emerald-500/40 dark:border-emerald-500/30 hover:border-emerald-500"
                                    : prop.hasSolar
                                    ? "border-amber-500/40 dark:border-amber-500/30 hover:border-amber-500"
                                    : "border-border hover:border-muted-foreground/40"
                            }`}
                        >
                            <div className="space-y-4">
                                {/* Header: Name + Badges + Delete Option for Standalone UCs */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1 flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-lg text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-1">
                                                {prop.name}
                                            </h3>

                                            {/* Standalone UC Delete Button */}
                                            {prop.isStandaloneUc && (
                                                <button
                                                    onClick={(e) => handleDeleteUc(prop.id, prop.name, e)}
                                                    disabled={deletingId === prop.id}
                                                    className="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors opacity-70 group-hover:opacity-100"
                                                    title="Excluir esta UC Avulsa"
                                                    aria-label="Excluir UC"
                                                >
                                                    {deletingId === prop.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            )}
                                        </div>

                                        {prop.address ? (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                                                <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                                {prop.address}
                                                {prop.city ? `, ${prop.city}` : ""}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                                Endereço não cadastrado
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Tags Row */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Standalone UC badge */}
                                    {prop.isStandaloneUc ? (
                                        <>
                                            {prop.ucCategory === "residencia_propria" && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                                                    <Home className="w-3.5 h-3.5 text-blue-500" />
                                                    Residência Própria
                                                </span>
                                            )}
                                            {prop.ucCategory === "parente" && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                                                    Casa de Parente (Fornecimento)
                                                </span>
                                            )}
                                            {prop.ucCategory === "beneficiaria" && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                                                    Unidade Beneficiária (GD)
                                                </span>
                                            )}
                                            {(!prop.ucCategory || prop.ucCategory === "outro") && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
                                                    <Building2 className="w-3.5 h-3.5 text-purple-500" />
                                                    UC Avulsa
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        /* Rental Property Solar Badge */
                                        prop.hasSolar ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
                                                <Sun className="w-3.5 h-3.5 text-amber-500" />
                                                {prop.solarKwp ? `Solar GD • ${prop.solarKwp} kWp` : "Microgeração Solar (GD)"}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-normal bg-muted text-muted-foreground">
                                                Sem energia solar cadastrada
                                            </span>
                                        )
                                    )}

                                    {prop.consumerUnit && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground">
                                            UC: {prop.consumerUnit}
                                        </span>
                                    )}
                                </div>

                                {prop.notes && (
                                    <p className="text-[11px] text-muted-foreground/80 line-clamp-1 italic">
                                        Obs: {prop.notes}
                                    </p>
                                )}

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
                                            <span className="text-muted-foreground flex items-center gap-1 justify-end">
                                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                                Pronta p/ importar
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Bloco: Conta a Vencer (Vencimento e Pagar) */}
                            <div className="pt-4 mt-4 border-t border-border/60 space-y-3">
                                {prop.latestDueDate || (prop.latestTotalAmount != null && prop.latestTotalAmount > 0) ? (
                                    <div className="p-3 bg-muted/40 dark:bg-muted/20 border border-border/80 rounded-xl flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-amber-500" />
                                                Vencimento
                                            </span>
                                            <span className="text-xs sm:text-sm font-semibold text-foreground block">
                                                {formatDueDate(prop.latestDueDate)}
                                            </span>
                                        </div>
                                        <div className="text-right space-y-0.5">
                                            <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground block">
                                                Pagar
                                            </span>
                                            <span className="text-sm sm:text-base font-bold text-foreground">
                                                {formatCurrency(prop.latestTotalAmount || 0)}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-2.5 bg-muted/20 border border-dashed border-border/60 rounded-xl flex items-center justify-between text-xs text-muted-foreground">
                                        <span className="text-[11px] italic">Sem fatura a vencer</span>
                                        <span className="text-[11px] font-medium">-</span>
                                    </div>
                                )}

                                {/* CTA Action */}
                                <Link href={`/${lang}/dashboard/energy/${prop.id}`} className="w-full block">
                                    <Button
                                        className={`w-full justify-between group-hover:bg-amber-600 group-hover:text-white transition-all ${
                                            prop.isStandaloneUc
                                                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                : prop.hasSolar
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
                            Nenhuma unidade encontrada nesta categoria
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Você pode cadastrar uma UC avulsa (sua própria residência ou casa de parente) ou cadastrar um imóvel de aluguel.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <Button
                            onClick={() => setIsAddUcOpen(true)}
                            className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            Adicionar UC Avulsa
                        </Button>
                        <Link href={`/${lang}/imoveis`}>
                            <Button variant="outline" className="gap-2 font-medium">
                                <Building2 className="w-4 h-4" />
                                Cadastrar Imóvel de Aluguel
                            </Button>
                        </Link>
                    </div>
                </div>
            )}

            {/* Modal to Add Standalone UC */}
            <AddStandaloneUcModal
                isOpen={isAddUcOpen}
                onClose={() => setIsAddUcOpen(false)}
                onSuccess={(newProperty) => {
                    setProperties((prev) => [newProperty, ...prev]);
                    router.push(`/${lang}/dashboard/energy/${newProperty.id}`);
                }}
            />
        </div>
    );
}
