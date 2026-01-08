"use client";

import * as React from "react";
import { Search, ChevronDown, Bell } from "lucide-react";
import { Button } from "@kitnets/ui";
import Link from "next/link";
import { Dictionary } from "../dictionaries";

interface PropertyFiltersProps {
    dict: Dictionary;
    sidebarView: 'rent-filters' | 'buy-filters' | 'launches-filters';
    lang: string;
    backToMain: () => void;
    expandedSections: Record<string, boolean>;
    toggleSection: (section: string) => void;
}

export function PropertyFilters({
    dict,
    sidebarView,
    lang,
    backToMain,
    expandedSections,
    toggleSection
}: PropertyFiltersProps) {
    const targetLink = React.useMemo(() => {
        if (sidebarView === 'buy-filters') return '/comprar';
        if (sidebarView === 'launches-filters') return '/lancamentos';
        return '/alugar';
    }, [sidebarView]);

    const targetLinkWithLang = lang === 'pt' ? targetLink : `/${lang}${targetLink}`;

    return (
        <div className="space-y-4">
            <button onClick={backToMain} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                <span className="mr-1">←</span> {dict.menu.back}
            </button>

            <h2 className="text-lg font-semibold text-foreground">{dict.filters.title}</h2>

            <div className="space-y-6">
                {/* Location */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">{dict.filters.location}</label>
                    <div className="relative">
                        <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Belo Horizonte (MG)"
                            className="w-full rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-1 rounded bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 text-xs text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                            Belo Horizonte MG <span className="cursor-pointer font-bold ml-1">×</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">{dict.filters.propertyType}</label>
                    <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="">{dict.filters.selectPlaceholder}</option>
                        <option value="kitnet">{dict.filters.kitnet}</option>
                        <option value="studio">{dict.filters.studio}</option>
                        <option value="luxuryStudio">{dict.filters.luxuryStudio}</option>
                        <option value="flat">{dict.filters.flat}</option>
                        <option value="apartment">{dict.filters.apartment}</option>
                        {sidebarView !== 'launches-filters' && (
                            <option value="barracao">{dict.filters.barracao}</option>
                        )}
                        <option value="house">{dict.filters.house}</option>
                        <option value="penthouse">{dict.filters.penthouse}</option>
                        <option value="duplex">{dict.filters.duplex}</option>
                        <option value="pilotis">{dict.filters.pilotis}</option>
                        <option value="townhouse">{dict.filters.townhouse}</option>
                    </select>
                </div>

                {/* Price */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">{dict.filters.price}</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder={dict.filters.min}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <input
                            type="text"
                            placeholder={dict.filters.max}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>
                </div>

                {/* Area */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">{dict.filters.area}</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder={dict.filters.min}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <input
                            type="text"
                            placeholder={dict.filters.max}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>
                </div>

                {/* Bedrooms */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">{dict.filters.bedrooms}</label>
                    <div className="flex gap-1">
                        {['1+', '2+', '3+'].map((num) => (
                            <button key={num} className="flex-1 rounded border border-input py-1 text-sm bg-muted/50 hover:bg-accent hover:text-accent-foreground font-medium text-muted-foreground">
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Parking */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">{dict.filters.parking}</label>
                    <div className="flex gap-1">
                        {['1+', '2+', '3+'].map((num) => (
                            <button key={num} className="flex-1 rounded border border-input py-1 text-sm bg-muted/50 hover:bg-accent hover:text-accent-foreground font-medium text-muted-foreground">
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Bathrooms */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">{dict.filters.bathrooms}</label>
                    <div className="flex gap-1">
                        {['1+', '2+', '3+'].map((num) => (
                            <button key={num} className="flex-1 rounded border border-input py-1 text-sm bg-muted/50 hover:bg-accent hover:text-accent-foreground font-medium text-muted-foreground">
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Listing Has */}
                <div className="space-y-2">
                    <button
                        onClick={() => toggleSection("listingHas")}
                        className="flex w-full items-center justify-between text-xs font-semibold text-foreground"
                    >
                        {dict.filters.listingHas}
                        <ChevronDown
                            className={`h-4 w-4 transition-transform ${expandedSections.listingHas ? "rotate-180" : ""}`}
                        />
                    </button>
                    {expandedSections.listingHas && (
                        <div className="space-y-2">
                            {[dict.filters.virtualTour, dict.filters.video, dict.filters.floorPlan].map((item, idx) => (
                                <div key={idx} className="flex items-center space-x-2">
                                    <input type="checkbox" id={`listingHas-${idx}`} className="rounded border-gray-300" />
                                    <label
                                        htmlFor={`listingHas-${idx}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        {item}
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Features */}
                <div className="space-y-3">
                    <button
                        onClick={() => toggleSection('features')}
                        className="flex w-full items-center justify-between text-xs font-semibold text-foreground hover:text-primary focus:outline-none"
                    >
                        {dict.filters.features}
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedSections['features'] ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedSections['features'] && (
                        <div className="space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                            {dict.lists.features.map((item: string) => (
                                <label key={item} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                    <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" />
                                    {item}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Amenities */}
                <div className="space-y-3">
                    <button
                        onClick={() => toggleSection('amenities')}
                        className="flex w-full items-center justify-between text-xs font-semibold text-foreground hover:text-primary focus:outline-none"
                    >
                        {dict.filters.amenities}
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedSections['amenities'] ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedSections['amenities'] && (
                        <div className="space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                            {dict.lists.amenities.map((item: string) => (
                                <label key={item} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                    <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" />
                                    {item}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Location Options */}
                <div className="space-y-3">
                    <button
                        onClick={() => toggleSection('locationOpts')}
                        className="flex w-full items-center justify-between text-xs font-semibold text-foreground hover:text-primary focus:outline-none"
                    >
                        {dict.filters.locationOptions}
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedSections['locationOpts'] ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedSections['locationOpts'] && (
                        <div className="space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                            {dict.lists.locationOptions.map((item: string) => (
                                <label key={item} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                    <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" />
                                    {item}
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="pt-6 flex flex-col gap-4">
                <Link href={targetLinkWithLang}>
                    <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white">{dict.filters.seeResults}</Button>
                </Link>

                <Button variant="outline" className="w-full border-orange-600 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30">
                    <Bell className="mr-2 h-4 w-4" />
                    {dict.filters.createAlert}
                </Button>
            </div>
        </div>
    );
}
