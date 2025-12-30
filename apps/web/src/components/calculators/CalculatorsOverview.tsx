"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TrendingUp, AlertCircle, FileText, Coins, PiggyBank, ArrowLeftRight, Sun, Percent, Search, ArrowRight, Calculator } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dictionary } from '@/dictionaries';
import { cn } from '@/lib/utils';

type CalculatorCategory = 'rent' | 'finance' | 'indices' | 'interest' | 'planning';

interface CalculatorItem {
    id: string;
    icon: React.ElementType;
    route: (lang: string) => string;
    categories: CalculatorCategory[];
    dictKey: string;
    mostUsed?: boolean;
}

const CALCULATORS: CalculatorItem[] = [
    {
        id: 'rentAdjustment',
        icon: TrendingUp,
        route: (lang) => `/${lang}/calculadora-reajuste-aluguel`,
        categories: ['rent', 'indices'],
        dictKey: 'rentAdjustment',
        mostUsed: true
    },
    {
        id: 'lateFee',
        icon: AlertCircle,
        route: (lang) => `/${lang}/calculadoras/multa-atraso-aluguel`,
        categories: ['rent'],
        dictKey: 'lateFee'
    },
    {
        id: 'terminationFee',
        icon: FileText,
        route: (lang) => `/${lang}/calculadoras/multa-rescisao-contrato-aluguel`,
        categories: ['rent'],
        dictKey: 'terminationFee'
    },
    {
        id: 'proRataRent',
        icon: Calculator,
        route: (lang) => `/${lang}/calculadoras/aluguel-proporcional`,
        categories: ['rent'],
        dictKey: 'proRataRent'
    },
    {
        id: 'rentalIncome',
        icon: Coins,
        route: (lang) => `/${lang}/calculadoras/renda-aluguel`,
        categories: ['rent', 'finance'],
        dictKey: 'rentalIncome'
    },
    {
        id: 'amortization',
        icon: PiggyBank,
        route: (lang) => `/${lang}/calculadora-amortizacao-financiamento-imobiliario`,
        categories: ['finance'],
        dictKey: 'amortization',
        mostUsed: true
    },
    {
        id: 'monthlyAnnualInterest',
        icon: ArrowLeftRight,
        route: (lang) => `/${lang}/calculadoras/conversor-juros-mensal-anual`,
        categories: ['interest'],
        dictKey: 'monthlyAnnualInterest'
    },
    {
        id: 'compoundInterest',
        icon: Percent,
        route: (lang) => `/${lang}/calculadora-juros-compostos`,
        categories: ['interest', 'planning'],
        dictKey: 'compoundInterest',
        mostUsed: true
    },
    {
        id: 'financialIndependence',
        icon: Sun,
        route: (lang) => `/${lang}/calculadora-independencia-financeira`,
        categories: ['planning'],
        dictKey: 'financialIndependence'
    },
];

export function CalculatorsOverview({ lang, dict }: { lang: string; dict: Dictionary }) {
    const params = useParams();
    // Ensure we have a valid language, falling back to 'pt' if undefined
    const currentLang = lang || (params?.lang as string) || 'pt';

    const t = dict.calculatorsOverview;
    const [activeCategory, setActiveCategory] = useState<CalculatorCategory | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCalculators = CALCULATORS.filter(calc => {
        const matchesCategory = activeCategory === 'all' || calc.categories.includes(activeCategory);
        const calcTexts = (t.cards.items as any)[calc.dictKey];
        const title = calcTexts?.title || '';
        const desc = calcTexts?.description || '';
        const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            desc.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesCategory && matchesSearch;
    });

    const mostUsedCalculators = CALCULATORS.filter(calc => calc.mostUsed);

    const categories: { id: CalculatorCategory | 'all', label: string }[] = [
        { id: 'all', label: t.categories.all },
        { id: 'rent', label: t.categories.rent },
        { id: 'finance', label: t.categories.finance },
        { id: 'indices', label: t.categories.indices },
        { id: 'interest', label: t.categories.interest },
        { id: 'planning', label: t.categories.planning },
    ];

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header */}
            <div className="bg-muted/30 pt-12 pb-16 px-4 mb-8 border-b border-border">
                <div className="container mx-auto text-center max-w-3xl">
                    <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
                        {t.title}
                    </h1>
                </div>
            </div>

            <div className="container mx-auto px-4 max-w-6xl">
                {/* Search & Filter */}
                <div className="mb-12 space-y-6">
                    <div className="relative max-w-lg mx-auto">
                        <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder={t.searchPlaceholder}
                            className="pl-10 h-12 text-lg rounded-xl border-muted-foreground/20 shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap justify-center gap-2">
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={cn(
                                    "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border",
                                    activeCategory === cat.id
                                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                                        : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                                )}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Most Used (Only show when searching or filtering all) */}
                {activeCategory === 'all' && !searchQuery && (
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                            <TrendingUp className="h-6 w-6 text-primary" />
                            {t.mostUsed}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {mostUsedCalculators.map(calc => (
                                <CalculatorCard key={`most-used-${calc.id}`} calc={calc} lang={currentLang} dict={dict} />
                            ))}
                        </div>
                    </div>
                )}

                {/* All / Filtered Grid */}
                <div>
                    {activeCategory !== 'all' && (
                        <h2 className="text-2xl font-bold mb-6 capitalize">
                            {categories.find(c => c.id === activeCategory)?.label}
                        </h2>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {filteredCalculators.map(calc => (
                            <CalculatorCard key={calc.id} calc={calc} lang={currentLang} dict={dict} />
                        ))}
                    </div>

                    {filteredCalculators.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground">
                            <p className="text-xl">Nenhuma calculadora encontrada.</p>
                            <Button
                                variant="link"
                                onClick={() => { setActiveCategory('all'); setSearchQuery(''); }}
                                className="mt-2"
                            >
                                Limpar filtros
                            </Button>
                        </div>
                    )}
                </div>

                {/* Conversion Layer */}
                <div className="mt-20 mb-12 border bg-card rounded-[2rem] p-8 md:p-20 text-center max-w-5xl mx-auto shadow-sm">
                    <h3 className="text-3xl md:text-4xl font-bold mb-6 text-foreground tracking-tight text-balance">
                        {(dict as any).calculatorCtaStandard?.title}
                    </h3>

                    <div className="space-y-4 text-lg text-muted-foreground mb-10 text-balance max-w-3xl mx-auto leading-relaxed">
                        {((dict as any).calculatorCtaStandard?.description || '').split('\n\n').map((paragraph: string, index: number) => (
                            <p key={index}>{paragraph}</p>
                        ))}
                    </div>

                    <Link href={`/${currentLang}/lista-vip`}>
                        <Button size="lg" className="rounded-full px-10 h-14 text-base font-semibold bg-[#037A53] hover:bg-[#026142] text-white shadow-md transition-all">
                            {(dict as any).calculatorCtaStandard?.button}
                        </Button>
                    </Link>

                    <p className="mt-6 text-xs text-muted-foreground uppercase tracking-widest font-medium">
                        {(dict as any).calculatorCtaStandard?.microcopy}
                    </p>
                </div>
            </div>
        </div>
    );
}

function CalculatorCard({ calc, lang, dict }: { calc: CalculatorItem, lang: string, dict: Dictionary }) {
    const t = dict.calculatorsOverview.cards;
    const texts = (t.items as any)[calc.dictKey];
    const Icon = calc.icon;

    return (
        <Link href={calc.route(lang)} className="block group h-full">
            <Card className="h-full hover:shadow-lg transition-all duration-300 border-muted hover:border-primary/50 group-hover:-translate-y-1 overflow-hidden relative flex flex-col">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader className="pb-3 flex-none">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <Icon className="h-5 w-5" />
                        </div>
                    </div>
                    <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">
                        {texts?.title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                    <CardDescription className="text-sm line-clamp-3">
                        {texts?.description}
                    </CardDescription>
                </CardContent>
                <CardFooter className="pt-0 pb-6 flex-none mt-auto">
                    <span className="text-sm font-medium text-primary flex items-center gap-1 group-hover:underline">
                        {t.ctaPrimary} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                    </span>
                </CardFooter>
            </Card>
        </Link>
    );
}
