"use client";

import { Button } from "@kitnets/ui";
import { Search, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { getDictionary } from "../dictionaries";

export function RentFilters({ lang }: { lang?: string }) {
    const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
    const dict = getDictionary(lang || "pt");

    return (
        <div className="w-full border-b border-border bg-background py-4">
            <div className="container mx-auto px-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    {/* Location Search */}
                    <div className="relative flex-1 min-w-[300px]">
                        <div className="flex items-center rounded-lg border border-input bg-background px-3 py-2 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder={dict.filters.searchPlaceholder}
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            />
                            {/* Mocking a selected tag for visual reference */}
                            <div className="hidden sm:flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground ml-2">
                                Belo Horizonte <X className="h-3 w-3 cursor-pointer" />
                            </div>
                        </div>
                    </div>

                    {/* Filters Group */}
                    <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-2 lg:pb-0 no-scrollbar">
                        {/* Type */}
                        <div className="relative group">
                            <button className="flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                                {dict.filters.propertyType}
                                <ChevronDown className="h-4 w-4 opacity-50" />
                            </button>
                            {/* Dropdown Content Mock */}
                            <div className="absolute top-full left-0 z-50 mt-2 w-56 hidden group-focus-within:block border border-border bg-popover text-popover-foreground shadow-md rounded-md p-2">
                                <div className="space-y-1">
                                    <label className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer">
                                        <input type="checkbox" className="rounded border-gray-300" defaultChecked />
                                        {dict.filters.studio}
                                    </label>
                                    <label className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer">
                                        <input type="checkbox" className="rounded border-gray-300" />
                                        {dict.filters.apartment}
                                    </label>
                                    <label className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer">
                                        <input type="checkbox" className="rounded border-gray-300" />
                                        {dict.filters.house}
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Bedrooms */}
                        <div className="relative group">
                            <button className="flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                                {dict.filters.bedrooms}
                                <ChevronDown className="h-4 w-4 opacity-50" />
                            </button>
                            <div className="absolute top-full left-0 z-50 mt-2 w-48 hidden group-focus-within:block border border-border bg-popover text-popover-foreground shadow-md rounded-md p-4">
                                <div className="flex gap-2 justify-between">
                                    {[1, 2, 3, 4, '5+'].map((num) => (
                                        <button key={num} className="h-8 w-8 rounded-full border border-input text-sm hover:bg-accent flex items-center justify-center">
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Price */}
                        <div className="relative group">
                            <button className="flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                                {dict.filters.price}
                                <ChevronDown className="h-4 w-4 opacity-50" />
                            </button>
                            <div className="absolute top-full left-0 z-50 mt-2 w-72 hidden group-focus-within:block border border-border bg-popover text-popover-foreground shadow-md rounded-md p-4">
                                <div className="flex gap-4 items-center">
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">{dict.filters.min}</span>
                                        <input type="text" placeholder="R$ 0" className="w-full rounded border px-2 py-1 text-sm" />
                                    </div>
                                    <span className="text-muted-foreground">-</span>
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">{dict.filters.max}</span>
                                        <input type="text" placeholder="R$ Ilimitado" className="w-full rounded border px-2 py-1 text-sm" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* More Filters */}
                        <Button variant="outline" className="gap-2" onClick={() => setIsMoreFiltersOpen(!isMoreFiltersOpen)}>
                            <SlidersHorizontal className="h-4 w-4" />
                            {dict.filters.moreFilters}
                        </Button>

                        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                            {dict.filters.createAlert}
                        </Button>
                    </div>
                </div>

                {/* Expanded Filters Panel (Mockup based on screenshot) */}
                {isMoreFiltersOpen && (
                    <div className="mt-4 border-t border-border pt-4 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Area */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium">{dict.filters.areaUnit}</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="radio" name="areaType" defaultChecked className="text-primary" /> {dict.filters.useful}
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="radio" name="areaType" className="text-primary" /> {dict.filters.total}
                                    </label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="number" placeholder={dict.filters.from} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                                    <span className="text-muted-foreground">{dict.filters.to}</span>
                                    <input type="number" placeholder="Até" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                                </div>
                            </div>

                            {/* Bathrooms */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium">{dict.filters.bathrooms}</label>
                                <div className="flex rounded-md shadow-sm">
                                    {['1+', '2+', '3+', '4+', '5+'].map((num) => (
                                        <button
                                            key={num}
                                            className={`flex-1 border border-input py-2 text-sm first:rounded-l-md last:rounded-r-md hover:bg-accent -ml-px first:ml-0 focus:z-10 focus:ring-1`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Parking */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium">{dict.filters.parking}</label>
                                <div className="flex rounded-md shadow-sm">
                                    {['0', '1+', '2+', '3+', '4+'].map((num) => (
                                        <button
                                            key={num}
                                            className={`flex-1 border border-input py-2 text-sm first:rounded-l-md last:rounded-r-md hover:bg-accent -ml-px first:ml-0 focus:z-10 focus:ring-1`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Features Checkboxes - Extra value add */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium">Características</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded border-gray-300" /> {dict.filters.furnished}</label>
                                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded border-gray-300" /> {dict.filters.balcony}</label>
                                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded border-gray-300" /> {dict.filters.petFriendly}</label>
                                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded border-gray-300" /> {dict.filters.nearMetro}</label>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                            <Button variant="ghost" onClick={() => setIsMoreFiltersOpen(false)}>{dict.filters.clear}</Button>
                            <Button onClick={() => setIsMoreFiltersOpen(false)}>{dict.filters.seeResults}</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
