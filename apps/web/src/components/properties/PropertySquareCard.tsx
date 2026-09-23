"use client";

/**
 * One square card per property on /imoveis — the same shape as the project cards on /projetos:
 * a cover carousel over the property's photos, the name and address, the money line, two small
 * tiles and a footer. The whole card opens the property; nothing on it needs a button.
 *
 * What it answers at a glance: what the property brings in per month (the income ledger's latest
 * month when there is one, an estimate otherwise), what is left after costs, and how far the
 * investment has paid itself back.
 */
import React, { useMemo } from 'react';
import { Building2, Droplets, Flame, Home, PiggyBank, Sun, Trash2, TrendingUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CoverCarousel, useCoverCarousel } from '@/components/ui/CoverCarousel';
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
    /** Latest confirmed month from the income ledger (Receitas de Aluguel); null/undefined = no real data yet */
    realIncome?: PropertyRealIncome | null;
    /** True while the income summary is still being fetched and nothing is cached: show placeholders, not estimates */
    incomeLoading?: boolean;
    /** Payback / yield from the investment engine (portfolio metrics); null = no investment ledger yet */
    investment?: PropertyCardInvestment | null;
}

export interface PropertyCardInvestment {
    invested: number;
    /** % */
    paybackPct: number;
    paybackReachedOn: string | null;
    paybackForecastMonth: string | null;
    grossYieldOnPrice: number | null;
    netYieldOnCost: number | null;
    marketValue: number | null;
    appreciationPct: number | null;
}

export interface PropertyRealIncome {
    /** `YYYY-MM` */
    month: string;
    /** gross rent + energy income */
    revenue: number;
    /** agency fee + energy cost + other expenses */
    opex: number;
    noi: number;
    /** % */
    margin: number;
}

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatMonthShort(key: string): string {
    const [y, m] = key.split('-');
    return `${MONTH_SHORT[Number(m) - 1] ?? m}/${y}`;
}

export function formatCurrencyBRL(value: number): string {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    });
}

const parseMoney = (v: string | undefined | null): number => {
    if (!v) return 0;
    const n = parseFloat(v.replace(/[^\d.,]/g, '').replace(',', '.'));
    return Number.isNaN(n) ? 0 : n;
};

export interface CardFinancials {
    monthlyRevenue: number;
    totalExpenses: number;
    noi: number;
    /** % */
    margin: number;
    /** No rent typed anywhere: a baseline guess, not the owner's figure. */
    isEstimate: boolean;
    /** `mmm/aaaa` of the ledger month the figures come from; null when they are estimates. */
    realMonth: string | null;
}

/** Units of a multi property: what was typed, never less than the units actually listed. */
export function cardUnitCount(property: Pick<PropertyCardData, 'propertyType' | 'details' | 'subUnits'>): number {
    return property.propertyType === 'multi' ? Math.max(property.details.numberOfUnits || 0, property.subUnits.length || 1) : 1;
}

/**
 * The card's monthly figures. The income ledger's latest month wins; without it, the rents typed
 * on the units (or the property's estimate), less IPTU, condomínio, a maintenance reserve and the
 * management fee. Shared with the hub's totals so the strip adds up exactly what the cards show.
 */
export function cardFinancials(property: Pick<PropertyCardData, 'propertyType' | 'details' | 'subUnits' | 'realIncome'>): CardFinancials {
    const { propertyType, details, subUnits, realIncome } = property;
    if (realIncome && realIncome.revenue > 0) {
        return {
            monthlyRevenue: realIncome.revenue,
            totalExpenses: realIncome.opex,
            noi: realIncome.noi,
            margin: realIncome.margin,
            isEstimate: false,
            realMonth: formatMonthShort(realIncome.month),
        };
    }

    const totalUnits = cardUnitCount(property);
    let monthlyRevenue = 0;
    let isEstimate = false;
    if (propertyType === 'multi') {
        const unitRentsSum = subUnits.reduce((acc, u) => acc + parseMoney(u.rentValue), 0);
        if (unitRentsSum > 0) monthlyRevenue = unitRentsSum;
        else if (details.monthlyRentEstimate) monthlyRevenue = parseMoney(details.monthlyRentEstimate);
        else { monthlyRevenue = totalUnits * 1100; isEstimate = true; }   // baseline: R$ 1.100 per kitnet
    } else if (details.monthlyRentEstimate) {
        monthlyRevenue = parseMoney(details.monthlyRentEstimate);
    } else {
        const beds = parseInt(details.bedrooms || '2', 10);
        monthlyRevenue = (Number.isNaN(beds) ? 2 : beds) * 750 + 600;
        isEstimate = true;
    }

    // Operating expenses: IPTU, condomínio, a 5% maintenance reserve and the management fee
    const iptuMonthly = details.iptuMonthly ? (parseMoney(details.iptuMonthly) || 120) : 120;
    const condoDefault = propertyType === 'multi' ? totalUnits * 60 : 0;
    const condoMonthly = details.condoMonthly ? (parseMoney(details.condoMonthly) || condoDefault) : condoDefault;
    const maintenanceReserve = details.maintenanceMonthly ? (parseMoney(details.maintenanceMonthly) || Math.round(monthlyRevenue * 0.05)) : Math.round(monthlyRevenue * 0.05);
    const adminFee = Math.round(monthlyRevenue * (parseFloat(details.managementFeePercent || '8') / 100));
    const totalExpenses = iptuMonthly + condoMonthly + maintenanceReserve + adminFee;
    const noi = Math.max(0, monthlyRevenue - totalExpenses);
    return {
        monthlyRevenue,
        totalExpenses,
        noi,
        margin: monthlyRevenue > 0 ? (noi / monthlyRevenue) * 100 : 0,
        isEstimate,
        realMonth: null,
    };
}

/** The pictures the cover slides through: the chosen one first, then the rest in upload order. */
export function cardPhotos(property: Pick<PropertyCardData, 'savedPhotos' | 'profilePhotoUrl'>, limit = 12): string[] {
    const cover = property.profilePhotoUrl ?? null;
    const ordered = cover ? [cover, ...property.savedPhotos.filter(u => u !== cover)] : property.savedPhotos;
    return Array.from(new Set(ordered.filter(Boolean))).slice(0, limit);
}

interface PropertySquareCardProps {
    property: PropertyCardData;
    onSelect: () => void;
    onDelete: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
}

export default function PropertySquareCard({ property, onSelect, onDelete, isDeleting = false }: PropertySquareCardProps) {
    const { propertyType, details, address, investment } = property;

    const title = details.propertyName?.trim()
        || (address.street ? `${address.street}${address.number ? `, ${address.number}` : ''}` : `Propriedade ${property.index + 1}`);

    const fullAddress = useMemo(() => {
        const parts = [
            address.street ? `${address.street}${address.number ? `, ${address.number}` : ''}` : null,
            address.neighborhood,
            address.city ? `${address.city}${address.state ? `/${address.state}` : ''}` : null,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' - ') : 'Endereço em preenchimento';
    }, [address]);

    const totalUnits = cardUnitCount(property);
    const financials = useMemo(() => cardFinancials(property), [property]);
    const photos = useMemo(() => cardPhotos(property), [property]);
    const carousel = useCoverCarousel(photos.length);

    const payback = investment && investment.invested > 0 ? Math.min(100, Math.max(0, investment.paybackPct)) : null;
    const yieldPct = investment?.netYieldOnCost ?? investment?.grossYieldOnPrice ?? null;
    const loadingIncome = Boolean(property.incomeLoading && !property.realIncome);

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); return; }
                carousel.onKeyDown(e);
            }}
            onMouseEnter={carousel.pause}
            onMouseLeave={carousel.resume}
            className="group relative flex flex-col rounded-2xl border border-border/80 bg-card overflow-hidden text-left transition-all hover:border-emerald-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <CoverCarousel
                photos={photos}
                alt={title}
                state={carousel}
                fallback={propertyType === 'multi' ? <Building2 className="w-10 h-10" /> : <Home className="w-10 h-10" />}
            >
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {propertyType === 'multi'
                        ? <><Building2 className="w-3 h-3 text-violet-500" /> Multifamiliar · {totalUnits} {totalUnits === 1 ? 'unidade' : 'unidades'}</>
                        : <><Home className="w-3 h-3 text-blue-500" /> Unifamiliar</>}
                </span>
                {details.solarEnergy && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-400/95 px-2 py-0.5 text-[10px] font-semibold text-amber-950" title="Energia solar (geração distribuída)">
                        <Sun className="w-3 h-3" /> Solar{details.solarKwp ? ` ${details.solarKwp} kWp` : ''}
                    </span>
                )}
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onDelete(e); }}
                    disabled={isDeleting}
                    title="Excluir imóvel"
                    aria-label={`Excluir ${title}`}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-600 transition-opacity disabled:opacity-50"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </CoverCarousel>

            <div className="flex flex-col gap-3 p-4 flex-1">
                <div className="space-y-0.5">
                    <h3 className="font-semibold text-foreground leading-tight line-clamp-1" title={title}>{title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1" title={fullAddress}>{fullAddress}</p>
                </div>

                {payback !== null && investment ? (
                    <div className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="font-semibold tabular-nums text-foreground inline-flex items-center gap-1"><PiggyBank className="w-3 h-3 text-emerald-500" /> Payback {payback.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
                            <span className="text-muted-foreground tabular-nums">investido {formatCurrencyBRL(investment.invested)}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all', payback >= 100 ? 'bg-emerald-500' : 'bg-emerald-500/80')} style={{ width: `${payback}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                                {investment.paybackReachedOn
                                    ? `recuperado desde ${formatMonthShort(investment.paybackReachedOn)}`
                                    : investment.paybackForecastMonth ? `previsto para ${formatMonthShort(investment.paybackForecastMonth)}` : 'renda líquida ÷ investido'}
                            </span>
                            {investment.appreciationPct !== null && (
                                <span className={investment.appreciationPct >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                                    valor {investment.appreciationPct >= 0 ? '+' : ''}{investment.appreciationPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-[11px] text-muted-foreground">Sem registro de investimento — o payback aparece aqui quando a compra for lançada na análise do imóvel.</p>
                )}

                <dl className="grid grid-cols-2 gap-2 text-[11px] mt-auto">
                    <div className={cn('rounded-lg bg-muted/40 px-2 py-1.5', loadingIncome && 'animate-pulse')} aria-busy={loadingIncome}>
                        <dt className="text-muted-foreground">Receita mensal</dt>
                        <dd className="font-semibold text-foreground tabular-nums">{loadingIncome ? '…' : formatCurrencyBRL(financials.monthlyRevenue)}</dd>
                        <dd className={cn('line-clamp-1', financials.realMonth ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
                            {loadingIncome ? 'carregando' : financials.realMonth ? `real · ${financials.realMonth}` : financials.isEstimate ? 'estimativa base' : 'do cadastro'}
                        </dd>
                    </div>
                    <div className={cn('rounded-lg bg-muted/40 px-2 py-1.5', loadingIncome && 'animate-pulse')}>
                        <dt className="text-muted-foreground">Resultado líquido (NOI)</dt>
                        <dd className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{loadingIncome ? '…' : formatCurrencyBRL(financials.noi)}</dd>
                        <dd className="text-muted-foreground tabular-nums">{loadingIncome ? '' : `margem ${financials.margin.toFixed(0)}%`}</dd>
                    </div>
                </dl>

                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span className="truncate">
                            {propertyType === 'multi'
                                ? `${totalUnits} ${totalUnits === 1 ? 'unidade' : 'unidades'}`
                                : `${details.areaEdificada || details.totalSqMeters || '—'} m² · ${details.bedrooms || '2'} quartos`}
                        </span>
                        {details.mainMeters?.energy && <Zap className="w-3 h-3 text-amber-500 shrink-0" aria-label="Medidor de energia" />}
                        {details.mainMeters?.water && <Droplets className="w-3 h-3 text-blue-500 shrink-0" aria-label="Medidor de água" />}
                        {details.mainMeters?.gas && <Flame className="w-3 h-3 text-orange-500 shrink-0" aria-label="Medidor de gás" />}
                    </span>
                    {yieldPct !== null && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium shrink-0" title={investment?.netYieldOnCost !== null ? 'Yield líquido sobre o custo' : 'Yield bruto sobre o preço'}>
                            <TrendingUp className="w-3 h-3" /> {yieldPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% a.a.
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
