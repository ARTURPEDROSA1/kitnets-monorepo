"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ArrowLeftRight, ArrowRight, Building2, CalendarClock, CalendarRange, ChevronRight, CircleCheck, Compass, FileX,
    Flame, Gem, HandCoins, Hourglass, KeyRound, Landmark, LayoutGrid, Percent, Receipt, ReceiptText, Search, SearchX,
    Sparkles, Sprout, TreePalm, TrendingUp, User, Wallet, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dictionary } from '@/dictionaries';
import { cn } from '@/lib/utils';

/** The four themes of the sidebar's calculator menu; each one has its own colour on the hub. */
type CalculatorGroup = 'rent' | 'taxes' | 'finance' | 'investment';

interface CalculatorItem {
    id: string;
    icon: React.ElementType;
    route: (lang: string) => string;
    group: CalculatorGroup;
    dictKey: string;
    mostUsed?: boolean;
}

interface GroupTone {
    icon: React.ElementType;
    /** Gradient tile behind a white glyph; reads the same in light and dark. */
    tile: string;
    /** Translucent tints, so they sit on either theme's surface. */
    soft: string;
    wash: string;
    panel: string;
    hoverBorder: string;
    chipActive: string;
    /** Text colour: a light and a dark value in globals.css (--calc-ink-*). */
    ink: string;
}

const GROUP_ORDER: CalculatorGroup[] = ['rent', 'taxes', 'finance', 'investment'];

const GROUP_TONES: Record<CalculatorGroup, GroupTone> = {
    rent: {
        icon: KeyRound,
        tile: 'bg-gradient-to-br from-emerald-400 to-teal-600 shadow-emerald-500/30',
        soft: 'bg-emerald-500/10',
        wash: 'from-emerald-500/10',
        panel: 'border-emerald-500/20 bg-emerald-500/[0.06]',
        hoverBorder: 'hover:border-emerald-500/50',
        chipActive: 'border-emerald-500/50 bg-emerald-500/15',
        ink: 'text-[hsl(var(--calc-ink-rent))]',
    },
    taxes: {
        icon: Receipt,
        tile: 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/30',
        soft: 'bg-amber-500/10',
        wash: 'from-amber-500/10',
        panel: 'border-amber-500/20 bg-amber-500/[0.06]',
        hoverBorder: 'hover:border-amber-500/50',
        chipActive: 'border-amber-500/50 bg-amber-500/15',
        ink: 'text-[hsl(var(--calc-ink-taxes))]',
    },
    finance: {
        icon: Wallet,
        tile: 'bg-gradient-to-br from-sky-400 to-blue-600 shadow-sky-500/30',
        soft: 'bg-sky-500/10',
        wash: 'from-sky-500/10',
        panel: 'border-sky-500/20 bg-sky-500/[0.06]',
        hoverBorder: 'hover:border-sky-500/50',
        chipActive: 'border-sky-500/50 bg-sky-500/15',
        ink: 'text-[hsl(var(--calc-ink-finance))]',
    },
    investment: {
        icon: Sprout,
        tile: 'bg-gradient-to-br from-violet-400 to-purple-600 shadow-violet-500/30',
        soft: 'bg-violet-500/10',
        wash: 'from-violet-500/10',
        panel: 'border-violet-500/20 bg-violet-500/[0.06]',
        hoverBorder: 'hover:border-violet-500/50',
        chipActive: 'border-violet-500/50 bg-violet-500/15',
        ink: 'text-[hsl(var(--calc-ink-investment))]',
    },
};

/** Same grouping and order as the calculator menu in Sidebar.tsx. */
const CALCULATORS: CalculatorItem[] = [
    {
        id: 'rentAdjustment',
        icon: TrendingUp,
        route: (lang) => `/${lang}/calculadora-reajuste-aluguel`,
        group: 'rent',
        dictKey: 'rentAdjustment',
        mostUsed: true
    },
    {
        id: 'lateFee',
        icon: CalendarClock,
        route: (lang) => `/${lang}/calculadoras/multa-atraso-aluguel`,
        group: 'rent',
        dictKey: 'lateFee'
    },
    {
        id: 'terminationFee',
        icon: FileX,
        route: (lang) => `/${lang}/calculadoras/multa-rescisao-contrato-aluguel`,
        group: 'rent',
        dictKey: 'terminationFee'
    },
    {
        id: 'proRataRent',
        icon: CalendarRange,
        route: (lang) => `/${lang}/calculadoras/aluguel-proporcional`,
        group: 'rent',
        dictKey: 'proRataRent'
    },
    {
        id: 'rentOnIndividual',
        icon: User,
        route: (lang) => `/${lang}/calculadoras/imposto-aluguel-pessoa-fisica`,
        group: 'taxes',
        dictKey: 'rentOnIndividual'
    },
    {
        id: 'holdingRental',
        icon: Building2,
        route: (lang) => `/${lang}/calculadoras/aluguel-na-holding`,
        group: 'taxes',
        dictKey: 'holdingRental',
        mostUsed: true
    },
    {
        id: 'irpf2026',
        icon: ReceiptText,
        route: (lang) => `/${lang}/calculadoras/irpf-2026`,
        group: 'taxes',
        dictKey: 'irpf2026',
        mostUsed: true
    },
    {
        id: 'minTaxPF',
        icon: Gem,
        route: (lang) => `/${lang}/calculadoras/imposto-minimo-altas-rendas`,
        group: 'taxes',
        dictKey: 'minTaxPF'
    },
    {
        id: 'monthlyAnnualInterest',
        icon: ArrowLeftRight,
        route: (lang) => `/${lang}/calculadoras/conversor-juros-mensal-anual`,
        group: 'finance',
        dictKey: 'monthlyAnnualInterest'
    },
    {
        id: 'compoundInterest',
        icon: Percent,
        route: (lang) => `/${lang}/calculadora-juros-compostos`,
        group: 'finance',
        dictKey: 'compoundInterest',
        mostUsed: true
    },
    {
        id: 'paybackProperty',
        icon: Hourglass,
        route: (lang) => `/${lang}/calculadora-payback-imovel`,
        group: 'finance',
        dictKey: 'paybackProperty',
        mostUsed: true
    },
    {
        id: 'financialIndependence',
        icon: TreePalm,
        route: (lang) => `/${lang}/calculadora-independencia-financeira`,
        group: 'finance',
        dictKey: 'financialIndependence'
    },
    {
        id: 'rentalIncome',
        icon: HandCoins,
        route: (lang) => `/${lang}/calculadoras/renda-aluguel`,
        group: 'investment',
        dictKey: 'rentalIncome'
    },
    {
        id: 'amortization',
        icon: Landmark,
        route: (lang) => `/${lang}/calculadora-amortizacao-financiamento-imobiliario`,
        group: 'investment',
        dictKey: 'amortization',
        mostUsed: true
    },
];

/** "Feature on the hub" order: the most popular first, mixing the four colours. */
const MOST_USED_ORDER = ['rentAdjustment', 'holdingRental', 'paybackProperty', 'amortization', 'compoundInterest', 'irpf2026'];

type OverviewTexts = Dictionary['calculatorsOverview'];
type CardTexts = { title?: string; description?: string } | undefined;

const cardTexts = (t: OverviewTexts, calc: CalculatorItem): CardTexts =>
    (t.cards.items as Record<string, CardTexts>)[calc.dictKey];

/** Lower case without accents, so "imovel" finds "Imóvel". */
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const countLabel = (t: OverviewTexts, count: number) =>
    count === 1 ? t.hub.countOne : t.hub.count.replace('{count}', String(count));

export function CalculatorsOverview({ lang, dict }: { lang: string; dict: Dictionary }) {
    const params = useParams();
    // Ensure we have a valid language, falling back to 'pt' if undefined
    const currentLang = lang || (params?.lang as string) || 'pt';

    const t = dict.calculatorsOverview;
    const hub = t.hub;
    const [activeGroup, setActiveGroup] = useState<CalculatorGroup | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const query = normalize(searchQuery.trim());
    const filteredCalculators = CALCULATORS.filter(calc => {
        const matchesGroup = activeGroup === 'all' || calc.group === activeGroup;
        const texts = cardTexts(t, calc);
        const haystack = normalize(`${texts?.title ?? ''} ${texts?.description ?? ''} ${hub.groups[calc.group].title}`);
        return matchesGroup && haystack.includes(query);
    });

    const browsing = activeGroup === 'all' && !query;
    const mostUsedCalculators = MOST_USED_ORDER
        .map(id => CALCULATORS.find(calc => calc.id === id && calc.mostUsed))
        .filter((calc): calc is CalculatorItem => !!calc);

    const clearFilters = () => { setActiveGroup('all'); setSearchQuery(''); };

    return (
        <div className="min-h-screen bg-background pb-20">
            <div className="container mx-auto max-w-6xl px-0 sm:px-4">
                {/* Hero */}
                <section className="relative overflow-hidden rounded-3xl border border-border bg-card px-5 py-12 shadow-sm sm:px-10 md:py-16">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                        <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
                        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-sky-400/25 blur-3xl" />
                        <div className="absolute -bottom-32 right-1/4 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
                        <div className="absolute -bottom-28 -left-10 h-64 w-64 rounded-full bg-amber-300/25 blur-3xl" />
                    </div>
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
                        <FloatingTile group="rent" icon={TrendingUp} className="left-[7%] top-[18%] -rotate-12" />
                        <FloatingTile group="taxes" icon={ReceiptText} className="bottom-[16%] left-[11%] rotate-6" />
                        <FloatingTile group="finance" icon={Percent} className="right-[8%] top-[20%] rotate-12" />
                        <FloatingTile group="investment" icon={HandCoins} className="bottom-[18%] right-[12%] -rotate-6" />
                    </div>

                    <div className="relative mx-auto max-w-2xl text-center">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold', GROUP_TONES.rent.ink)}>
                            <Sparkles className="h-3.5 w-3.5" />
                            {hub.badge.replace('{count}', String(CALCULATORS.length))}
                        </span>
                        <h1 className="mt-5 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
                            {t.title}
                        </h1>
                        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground md:text-lg">
                            {t.subtitle}
                        </p>

                        <div className="relative mx-auto mt-8 max-w-xl">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                inputMode="search"
                                enterKeyHint="search"
                                aria-label={t.searchPlaceholder}
                                placeholder={t.searchPlaceholder}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-14 w-full rounded-2xl border border-border bg-background pl-12 pr-12 text-base text-foreground shadow-lg shadow-slate-900/5 outline-none transition placeholder:text-muted-foreground focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/15"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    aria-label={hub.clear}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                            {hub.perks.map((perk) => (
                                <li key={perk} className="inline-flex items-center gap-1.5">
                                    <CircleCheck className="h-4 w-4 text-emerald-500" />
                                    {perk}
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* Theme filter */}
                <div role="group" aria-label={hub.exploreTitle} className="mt-8 flex flex-wrap justify-center gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveGroup('all')}
                        aria-pressed={activeGroup === 'all'}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200',
                            activeGroup === 'all'
                                ? 'border-foreground bg-foreground text-background shadow-md'
                                : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground hover:shadow-sm'
                        )}
                    >
                        <LayoutGrid className="h-4 w-4" />
                        {t.categories.all}
                        <span className={cn('rounded-full px-1.5 text-xs tabular-nums', activeGroup === 'all' ? 'bg-background/20' : 'bg-muted')}>
                            {CALCULATORS.length}
                        </span>
                    </button>
                    {GROUP_ORDER.map((group) => {
                        const tone = GROUP_TONES[group];
                        const GroupIcon = tone.icon;
                        const active = activeGroup === group;
                        return (
                            <button
                                key={group}
                                type="button"
                                onClick={() => setActiveGroup(active ? 'all' : group)}
                                aria-pressed={active}
                                className={cn(
                                    'inline-flex items-center gap-2 rounded-full border py-2 pl-2 pr-4 text-sm font-medium transition-all duration-200',
                                    active
                                        ? cn(tone.chipActive, tone.ink, 'shadow-sm')
                                        : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground hover:shadow-sm'
                                )}
                            >
                                <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-white', tone.tile)}>
                                    <GroupIcon className="h-3.5 w-3.5" />
                                </span>
                                {hub.groups[group].title}
                                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-background/60' : 'bg-muted')}>
                                    {CALCULATORS.filter(calc => calc.group === group).length}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {browsing ? (
                    <>
                        {/* Most used */}
                        <section className="mt-14" aria-labelledby="calc-most-used">
                            <SectionHeading
                                id="calc-most-used"
                                icon={Flame}
                                tile="bg-gradient-to-br from-rose-400 to-orange-500 shadow-orange-500/30"
                                title={t.mostUsed}
                                subtitle={hub.mostUsedSubtitle}
                            />
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {mostUsedCalculators.map(calc => (
                                    <CalculatorCard key={`most-used-${calc.id}`} calc={calc} lang={currentLang} t={t} />
                                ))}
                            </div>
                        </section>

                        {/* Browse by theme */}
                        <section className="mt-16" aria-labelledby="calc-explore">
                            <SectionHeading
                                id="calc-explore"
                                icon={Compass}
                                tile="bg-gradient-to-br from-emerald-400 via-sky-500 to-violet-500 shadow-sky-500/30"
                                title={hub.exploreTitle}
                                subtitle={hub.exploreSubtitle}
                            />
                            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                                {GROUP_ORDER.map(group => (
                                    <GroupPanel
                                        key={group}
                                        group={group}
                                        items={CALCULATORS.filter(calc => calc.group === group)}
                                        lang={currentLang}
                                        t={t}
                                    />
                                ))}
                            </div>
                        </section>
                    </>
                ) : (
                    <section className="mt-12" aria-live="polite">
                        {query ? (
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                                    {hub.resultsFor.replace('{query}', searchQuery.trim())}
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">{countLabel(t, filteredCalculators.length)}</p>
                            </div>
                        ) : activeGroup !== 'all' && (
                            <SectionHeading
                                icon={GROUP_TONES[activeGroup].icon}
                                tile={GROUP_TONES[activeGroup].tile}
                                title={hub.groups[activeGroup].title}
                                subtitle={hub.groups[activeGroup].description}
                            />
                        )}

                        {filteredCalculators.length > 0 ? (
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredCalculators.map(calc => (
                                    <CalculatorCard key={calc.id} calc={calc} lang={currentLang} t={t} />
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
                                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                                    <SearchX className="h-7 w-7" />
                                </span>
                                <p className="mt-4 text-lg font-medium text-foreground">{hub.empty}</p>
                                <Button variant="outline" onClick={clearFilters} className="mt-4 rounded-full">
                                    {hub.clear}
                                </Button>
                            </div>
                        )}
                    </section>
                )}

                {/* Conversion Layer */}
                <div className="relative mx-auto mb-12 mt-20 max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#037A53] via-emerald-700 to-teal-800 p-8 text-center text-white shadow-xl shadow-emerald-900/20 md:p-20">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
                        <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />
                    </div>
                    <div className="relative">
                        <h3 className="mb-6 text-balance text-3xl font-bold tracking-tight md:text-4xl">
                            {dict.calculatorCtaStandard.title}
                        </h3>

                        <div className="mx-auto mb-10 max-w-3xl space-y-4 text-balance text-lg leading-relaxed text-white/90">
                            {(dict.calculatorCtaStandard.description || '').split('\n\n').map((paragraph: string, index: number) => (
                                <p key={index}>{paragraph}</p>
                            ))}
                        </div>

                        <Link href={`/${currentLang}/lista-vip`}>
                            <Button size="lg" className="h-14 gap-2 rounded-full bg-white px-10 text-base font-semibold text-[#037A53] shadow-lg transition-all hover:bg-emerald-50 hover:shadow-xl">
                                {dict.calculatorCtaStandard.button}
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>

                        <p className="mt-6 text-xs font-medium uppercase tracking-widest text-white/80">
                            {dict.calculatorCtaStandard.microcopy}
                        </p>
                    </div>
                </div>

                {/* SEO Content Section */}
                <div className="mx-auto mt-24 max-w-4xl space-y-16 pb-20 text-left">
                    {/* Intro */}
                    <div className="space-y-6">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                            {t.seoContent.intro.title}
                        </h2>
                        <p className="whitespace-pre-line text-lg leading-relaxed text-muted-foreground">
                            {t.seoContent.intro.text}
                        </p>
                    </div>

                    {/* Updated */}
                    <div className="space-y-6">
                        <SeoHeading accent="from-emerald-400 to-teal-600">{t.seoContent.updated.title}</SeoHeading>
                        <div className="space-y-4 text-lg text-muted-foreground">
                            <p>{t.seoContent.updated.text}</p>
                            <ul className="list-disc space-y-3 pl-6 marker:text-emerald-500">
                                {t.seoContent.updated.items.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                            <p className="font-medium text-foreground">{t.seoContent.updated.conclusion}</p>
                        </div>
                    </div>

                    {/* Ecosystem */}
                    <div className="space-y-6">
                        <SeoHeading accent="from-sky-400 to-blue-600">{t.seoContent.ecosystem.title}</SeoHeading>
                        <div className="space-y-4 text-lg text-muted-foreground">
                            <p>{t.seoContent.ecosystem.text}</p>
                            <ul className="list-disc space-y-3 pl-6 marker:text-sky-500">
                                {t.seoContent.ecosystem.items.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                            <p className="font-medium text-foreground">{t.seoContent.ecosystem.conclusion}</p>
                        </div>
                    </div>

                    {/* Innovation */}
                    <div className="space-y-6">
                        <SeoHeading accent="from-violet-400 to-purple-600">{t.seoContent.innovation.title}</SeoHeading>
                        <div className="space-y-4 text-lg text-muted-foreground">
                            <p>{t.seoContent.innovation.text}</p>
                            <ul className="list-disc space-y-3 pl-6 marker:text-violet-500">
                                {t.seoContent.innovation.items.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                            <p className="font-medium text-foreground">{t.seoContent.innovation.conclusion}</p>
                        </div>
                    </div>

                    {/* Target Audience */}
                    <div className="space-y-6">
                        <SeoHeading accent="from-amber-400 to-orange-500">{t.seoContent.targetAudience.title}</SeoHeading>
                        <div className="space-y-4 text-lg text-muted-foreground">
                            <ul className="list-disc space-y-3 pl-6 marker:text-amber-500">
                                {t.seoContent.targetAudience.items.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                            <p className="font-medium text-foreground">{t.seoContent.targetAudience.conclusion}</p>
                        </div>
                    </div>

                    {/* Final CTA */}
                    <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-sky-500/5 to-violet-500/10 p-8 md:p-12">
                        <h3 className="mb-4 text-2xl font-bold text-foreground">{t.seoContent.cta.title}</h3>
                        <p className="whitespace-pre-line text-lg leading-relaxed text-muted-foreground">
                            {t.seoContent.cta.text}
                        </p>
                    </div>
                </div>
            </div>
            {/* Structured Data for SEO */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "CollectionPage",
                        "name": t.title,
                        "description": t.seoContent.intro.text,
                        "hasPart": CALCULATORS.map(calc => {
                            const texts = cardTexts(t, calc);
                            return {
                                "@type": "SoftwareApplication",
                                "name": texts?.title,
                                "description": texts?.description,
                                "applicationCategory": "FinanceApplication",
                                "operatingSystem": "WebBrowser",
                                "offers": {
                                    "@type": "Offer",
                                    "price": "0",
                                    "priceCurrency": "BRL"
                                }
                            };
                        })
                    })
                }}
            />
        </div>
    );
}

function FloatingTile({ group, icon: Icon, className }: { group: CalculatorGroup; icon: React.ElementType; className: string }) {
    return (
        <span className={cn('absolute flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl', GROUP_TONES[group].tile, 'shadow-slate-900/15', className)}>
            <Icon className="h-7 w-7" />
        </span>
    );
}

function SectionHeading({ id, icon: Icon, tile, title, subtitle }: { id?: string; icon: React.ElementType; tile: string; title: string; subtitle?: string }) {
    return (
        <div className="mb-6 flex items-center gap-3">
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-lg', tile)}>
                <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
                <h2 id={id} className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
        </div>
    );
}

function SeoHeading({ accent, children }: { accent: string; children: React.ReactNode }) {
    return (
        <h3 className="flex items-center gap-3 text-2xl font-bold text-foreground">
            <span aria-hidden="true" className={cn('h-7 w-1.5 shrink-0 rounded-full bg-gradient-to-b', accent)} />
            {children}
        </h3>
    );
}

function CalculatorCard({ calc, lang, t }: { calc: CalculatorItem; lang: string; t: OverviewTexts }) {
    const texts = cardTexts(t, calc);
    const tone = GROUP_TONES[calc.group];
    const Icon = calc.icon;

    return (
        <Link
            href={calc.route(lang)}
            className={cn(
                'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl',
                tone.hoverBorder
            )}
        >
            <div aria-hidden="true" className={cn('pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent', tone.wash)} />
            <div className="relative flex items-start justify-between gap-3">
                <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110', tone.tile)}>
                    <Icon className="h-6 w-6" />
                </span>
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', tone.soft, tone.ink)}>
                    {t.hub.groups[calc.group].title}
                </span>
            </div>
            <h3 className="relative mt-5 text-lg font-semibold leading-snug text-foreground">
                {texts?.title}
            </h3>
            <p className="relative mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {texts?.description}
            </p>
            <span className={cn('relative mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold', tone.ink)}>
                {t.cards.ctaPrimary}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
        </Link>
    );
}

function GroupPanel({ group, items, lang, t }: { group: CalculatorGroup; items: CalculatorItem[]; lang: string; t: OverviewTexts }) {
    const tone = GROUP_TONES[group];
    const texts = t.hub.groups[group];
    const GroupIcon = tone.icon;

    return (
        <section aria-labelledby={`calc-group-${group}`} className={cn('relative overflow-hidden rounded-3xl border p-6 sm:p-8', tone.panel)}>
            <GroupIcon aria-hidden="true" className={cn('pointer-events-none absolute -bottom-8 -right-8 h-44 w-44 opacity-[0.07]', tone.ink)} />
            <div className="relative flex items-start gap-4">
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg', tone.tile)}>
                    <GroupIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 id={`calc-group-${group}`} className="text-xl font-bold text-foreground">{texts.title}</h3>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', tone.soft, tone.ink)}>
                            {countLabel(t, items.length)}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{texts.description}</p>
                </div>
            </div>
            <ul className="relative mt-6 space-y-2">
                {items.map(calc => {
                    const Icon = calc.icon;
                    return (
                        <li key={calc.id}>
                            <Link
                                href={calc.route(lang)}
                                className={cn(
                                    'group flex items-center gap-3 rounded-xl border border-border/60 bg-card/90 px-3 py-3 shadow-sm transition-all duration-200 hover:translate-x-1 hover:shadow-md',
                                    tone.hoverBorder
                                )}
                            >
                                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone.soft, tone.ink)}>
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{cardTexts(t, calc)?.title}</span>
                                <ChevronRight className={cn('h-4 w-4 shrink-0 opacity-50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100', tone.ink)} />
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
