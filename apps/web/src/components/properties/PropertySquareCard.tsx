"use client";

import React, { useMemo } from 'react';
import Image from 'next/image';
import {
    Building2,
    Home,
    MapPin,
    Sun,
    Trash2,
    ArrowRight,
    CheckCircle2,
    Zap,
    Droplets,
    Flame,
    FileText,
    DollarSign,
    Percent,
} from 'lucide-react';
import { Button } from '@kitnets/ui';
import { cn } from '@/lib/utils';
import type { PropertyDetails, SubUnit } from '@/components/profile/PropertyDetailsCard';

export interface PropertyCardData {
    index: number;
    propertyType: 'single' | 'multi';
    details: PropertyDetails;
    subUnits: SubUnit[];
    address: {
        cep?: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        complement?: string;
        description?: string;
    };
    savedPhotos: string[];
    profilePhotoUrl?: string | null;
    isComplete?: boolean;
}

interface PropertySquareCardProps {
    property: PropertyCardData;
    onSelect: () => void;
    onDelete: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
}

export function formatCurrencyBRL(value: number): string {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    });
}

export default function PropertySquareCard({
    property,
    onSelect,
    onDelete,
    isDeleting = false,
}: PropertySquareCardProps) {
    const { propertyType, details, subUnits, address, savedPhotos, profilePhotoUrl } = property;

    // Title calculation
    const title = details.propertyName?.trim()
        || (address.street ? `${address.street}${address.number ? `, ${address.number}` : ''}` : `Propriedade ${property.index + 1}`);

    // Formatted full address
    const fullAddress = useMemo(() => {
        const parts = [
            address.street ? `${address.street}${address.number ? `, ${address.number}` : ''}` : null,
            address.neighborhood,
            address.city ? `${address.city}${address.state ? `/${address.state}` : ''}` : null,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' - ') : 'Endereço em preenchimento';
    }, [address]);

    // Units count
    const totalUnits = propertyType === 'multi'
        ? Math.max(details.numberOfUnits || 0, subUnits.length || 1)
        : 1;

    // Financial calculations: Revenue, OPEX and NOI
    const financials = useMemo(() => {
        let monthlyRevenue = 0;
        let isEstimate = false;

        if (propertyType === 'multi') {
            const unitRentsSum = subUnits.reduce((acc, u) => {
                if (u.rentValue) {
                    const parsed = parseFloat(u.rentValue.replace(/[^\d.,]/g, '').replace(',', '.'));
                    return acc + (isNaN(parsed) ? 0 : parsed);
                }
                return acc;
            }, 0);

            if (unitRentsSum > 0) {
                monthlyRevenue = unitRentsSum;
            } else if (details.monthlyRentEstimate) {
                const parsed = parseFloat(details.monthlyRentEstimate.replace(/[^\d.,]/g, '').replace(',', '.'));
                monthlyRevenue = isNaN(parsed) ? 0 : parsed;
            } else {
                // Baseline realistic estimate: R$ 1.100 per kitnet
                monthlyRevenue = totalUnits * 1100;
                isEstimate = true;
            }
        } else {
            if (details.monthlyRentEstimate) {
                const parsed = parseFloat(details.monthlyRentEstimate.replace(/[^\d.,]/g, '').replace(',', '.'));
                monthlyRevenue = isNaN(parsed) ? 0 : parsed;
            } else {
                const beds = parseInt(details.bedrooms || '2', 10);
                monthlyRevenue = (isNaN(beds) ? 2 : beds) * 750 + 600;
                isEstimate = true;
            }
        }

        // Operating Expenses (OPEX): IPTU, maintenance reserve (5%), admin (8%), common utilities
        const iptuMonthly = details.iptuMonthly
            ? (parseFloat(details.iptuMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || 120)
            : 120;
        const condoMonthly = details.condoMonthly
            ? (parseFloat(details.condoMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || (propertyType === 'multi' ? totalUnits * 60 : 0))
            : (propertyType === 'multi' ? totalUnits * 60 : 0);
        const maintenanceReserve = details.maintenanceMonthly
            ? (parseFloat(details.maintenanceMonthly.replace(/[^\d.,]/g, '').replace(',', '.')) || Math.round(monthlyRevenue * 0.05))
            : Math.round(monthlyRevenue * 0.05);
        const adminFee = Math.round(monthlyRevenue * (parseFloat(details.managementFeePercent || '8') / 100));

        const totalExpenses = iptuMonthly + condoMonthly + maintenanceReserve + adminFee;
        const noi = Math.max(0, monthlyRevenue - totalExpenses);
        const margin = monthlyRevenue > 0 ? (noi / monthlyRevenue) * 100 : 0;

        return {
            monthlyRevenue,
            totalExpenses,
            noi,
            margin,
            isEstimate,
        };
    }, [propertyType, details, subUnits, totalUnits]);

    // Thumbnail photo
    const photoUrl = profilePhotoUrl || (savedPhotos.length > 0 ? savedPhotos[0] : null);

    return (
        <div
            onClick={onSelect}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect();
                }
            }}
            className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs transition-all duration-200 hover:shadow-md hover:border-amber-500/50 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
            <div className="space-y-4">
                {/* Header: Title + Delete button */}
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-1">
                            {title}
                        </h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <span>{fullAddress}</span>
                        </p>
                    </div>

                    {/* Delete action button */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(e);
                        }}
                        disabled={isDeleting}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors opacity-70 group-hover:opacity-100 flex-shrink-0"
                        title="Excluir imóvel"
                        aria-label="Excluir imóvel"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Badges Row */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Typology Badge */}
                    {propertyType === 'multi' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
                            <Building2 className="w-3.5 h-3.5 text-violet-500" />
                            Multifamiliar ({totalUnits} {totalUnits === 1 ? 'unidade' : 'unidades'})
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                            <Home className="w-3.5 h-3.5 text-blue-500" />
                            Unifamiliar
                        </span>
                    )}

                    {/* Status Badge */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Cadastro Ativo
                    </span>

                    {/* Solar Energy Badge */}
                    {details.solarEnergy ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
                            <Sun className="w-3.5 h-3.5 text-amber-500" />
                            {details.solarKwp ? `Solar GD • ${details.solarKwp} kWp` : 'Solar GD Ativa'}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-normal bg-muted text-muted-foreground">
                            Sem energia solar
                        </span>
                    )}
                </div>

                {/* Identification & Meters Preview */}
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 truncate">
                        {details.inscricaoImobiliaria || details.matricula ? (
                            <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded truncate">
                                Matrícula / IPTU: {details.inscricaoImobiliaria || details.matricula}
                            </span>
                        ) : (
                            <span className="text-[11px] italic">
                                {property.isComplete ? 'Documentos verificados' : 'Documentação em análise'}
                            </span>
                        )}
                    </div>

                    {/* Utility meter icons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-muted-foreground">
                        {details.mainMeters?.energy && (
                            <span title="Medidor de Energia"><Zap className="w-3.5 h-3.5 text-amber-500" /></span>
                        )}
                        {details.mainMeters?.water && (
                            <span title="Medidor de Água"><Droplets className="w-3.5 h-3.5 text-blue-500" /></span>
                        )}
                        {details.mainMeters?.gas && (
                            <span title="Medidor de Gás"><Flame className="w-3.5 h-3.5 text-orange-500" /></span>
                        )}
                    </div>
                </div>

                {/* Middle Info & Thumbnail Row */}
                <div className="flex items-center gap-3 pt-1">
                    {photoUrl ? (
                        <div className="w-12 h-12 rounded-xl overflow-hidden border border-border flex-shrink-0 bg-muted">
                            <Image
                                src={photoUrl}
                                alt={title}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                        </div>
                    ) : (
                        <div className="w-12 h-12 rounded-xl border border-border bg-muted/40 flex items-center justify-center flex-shrink-0 text-muted-foreground">
                            {propertyType === 'multi' ? <Building2 className="w-6 h-6" /> : <Home className="w-6 h-6" />}
                        </div>
                    )}

                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">
                            {propertyType === 'multi'
                                ? `${totalUnits} Kitnets / Unidades cadastradas`
                                : `${details.areaEdificada || details.totalSqMeters || 'Área'} m² · ${details.bedrooms || '2'} quartos`}
                        </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <FileText className="w-3 h-3 text-emerald-600" />
                            Centro de custos ativo
                        </p>
                    </div>
                </div>
            </div>

            {/* Financial / Cost Center Preview Block */}
            <div className="pt-4 mt-4 border-t border-border/60 space-y-3">
                <div className="p-3 bg-muted/40 dark:bg-muted/20 border border-border/80 rounded-xl grid grid-cols-2 gap-2 text-xs">
                    <div className="space-y-0.5">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-1">
                            <DollarSign className="w-3 h-3 text-emerald-500" />
                            Receita Mensal
                        </span>
                        <span className="text-sm font-bold text-foreground block truncate">
                            {formatCurrencyBRL(financials.monthlyRevenue)}
                            <span className="text-[10px] font-normal text-muted-foreground">/mês</span>
                        </span>
                        {financials.isEstimate && (
                            <span className="text-[9px] text-muted-foreground italic">(Estimativa base)</span>
                        )}
                    </div>

                    <div className="text-right space-y-0.5">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground flex items-center justify-end gap-1">
                            <Percent className="w-3 h-3 text-blue-500" />
                            Resultado Líquido (NOI)
                        </span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block truncate">
                            {formatCurrencyBRL(financials.noi)}
                            <span className="text-[10px] font-normal text-muted-foreground">/mês</span>
                        </span>
                        <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                            Margem {financials.margin.toFixed(0)}%
                        </span>
                    </div>
                </div>

                {/* Bottom CTA Action Button */}
                <Button
                    className="w-full justify-between bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl shadow-xs transition-all group-hover:shadow-md"
                >
                    <span>Gerenciar Imóvel & Métricas</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
            </div>
        </div>
    );
}
