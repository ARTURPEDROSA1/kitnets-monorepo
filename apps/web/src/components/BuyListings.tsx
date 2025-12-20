"use client";

import { useState } from "react";
import { Button } from "@kitnets/ui";
import { ChevronDown, Map, Bell } from "lucide-react";
import { Dictionary } from "../dictionaries";

// Mock Data for properties for sale
const INITIAL_LISTINGS = [
    {
        id: 1,
        title: "Kitnet Mobiliada Centro",
        location: "Centro, Belo Horizonte",
        price: "R$ 180.000",
        priceValue: 180000,
        specs: "30m² • 1 Quarto • 1 Banheiro",
        sqm: 30,
        bedrooms: 1,
        bathrooms: 1,
        parking: 0,
        image: "/placeholder-kitnet.jpg",
        tags: ["Mobiliado", "Metrô prox."]
    },
    {
        id: 2,
        title: "Studio Moderno Savassi",
        location: "Savassi, Belo Horizonte",
        price: "R$ 350.000",
        priceValue: 350000,
        specs: "45m² • 1 Quarto • 1 Banheiro • 1 Vaga",
        sqm: 45,
        bedrooms: 1,
        bathrooms: 1,
        parking: 1,
        image: "/placeholder-studio.jpg",
        tags: ["Portaria 24h", "Academia"]
    },
    {
        id: 3,
        title: "Apartamento 2 Quartos",
        location: "Floresta, Belo Horizonte",
        price: "R$ 450.000",
        priceValue: 450000,
        specs: "70m² • 2 Quartos • 2 Banheiros • 1 Vaga",
        sqm: 70,
        bedrooms: 2,
        bathrooms: 2,
        parking: 1,
        image: "/placeholder-apt.jpg",
        tags: ["Varanda", "Pet Friendly"]
    }
];

interface BuyListingsProps {
    t: Dictionary["buyPage"];
}

export function BuyListings({ t }: BuyListingsProps) {
    const [sortOption, setSortOption] = useState("relevant");

    const getSortedListings = () => {
        const sorted = [...INITIAL_LISTINGS];
        switch (sortOption) {
            case "newest":
                return sorted.sort((a, b) => b.id - a.id);
            case "price-asc":
                return sorted.sort((a, b) => a.priceValue - b.priceValue);
            case "price-desc":
                return sorted.sort((a, b) => b.priceValue - a.priceValue);
            case "sqm-desc":
                return sorted.sort((a, b) => b.sqm - a.sqm);
            case "sqm-asc":
                return sorted.sort((a, b) => a.sqm - b.sqm);
            default:
                return sorted;
        }
    };

    const listings = getSortedListings();

    return (
        <div>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
                    <p className="text-muted-foreground">{t.subtitle}</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                        {listings.length} {t.foundProperties}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" className="hidden sm:flex gap-2 border-border hover:bg-accent hover:text-accent-foreground">
                        <Map className="h-4 w-4" />
                        {t.map}
                    </Button>
                    <Button variant="outline" className="hidden sm:flex gap-2 border-border hover:bg-accent hover:text-accent-foreground">
                        <Bell className="h-4 w-4" />
                        {t.createAlert}
                    </Button>
                    <div className="h-6 w-px bg-border hidden sm:block mx-1"></div>
                    <span className="hidden text-sm text-muted-foreground sm:inline text-nowrap">{t.sortBy}</span>
                    <div className="relative min-w-[160px]">
                        <select
                            className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-4 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value)}
                        >
                            <option value="relevant">{t.sortOptions.relevant}</option>
                            <option value="newest">{t.sortOptions.newest}</option>
                            <option value="price-desc">{t.sortOptions.priceDesc}</option>
                            <option value="price-asc">{t.sortOptions.priceAsc}</option>
                            <option value="sqm-desc">{t.sortOptions.sqmDesc}</option>
                            <option value="sqm-asc">{t.sortOptions.sqmAsc}</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                    <div key={listing.id} className="group overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:shadow-lg">
                        {/* Image Placeholder */}
                        <div className="relative flex h-48 items-center justify-center bg-muted">
                            <span className="text-muted-foreground">{t.propertyImage}</span>
                            <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
                                {listing.tags[0]}
                            </div>
                        </div>

                        <div className="p-4">
                            <p className="mb-1 text-xs tracking-wide text-muted-foreground uppercase">{t.price}</p>
                            <h3 className="text-lg font-semibold transition-colors text-foreground group-hover:text-primary">
                                {listing.price}
                            </h3>
                            <p className="mt-1 font-medium text-foreground">{listing.title}</p>
                            <p className="truncate text-sm text-muted-foreground">{listing.location}</p>

                            <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                                <span>{listing.specs}</span>
                            </div>

                            <div className="mt-4">
                                <Button className="w-full" variant="outline">{t.seeDetails}</Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
