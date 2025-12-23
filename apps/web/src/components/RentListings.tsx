"use client";
import { useState, useEffect } from "react";
import { Button } from "@kitnets/ui";
import { ChevronDown, Map, Bell, Loader2 } from "lucide-react";
import { Dictionary } from "../dictionaries";
import { createBrowserClient } from "@supabase/ssr";

interface Listing {
    id: string; // uuid
    title: string;
    location: string;
    price: string;
    priceValue: number;
    specs: string;
    sqm: number;
    bedrooms: number;
    bathrooms: number;
    parking: number;
    image: string;
    tags: string[];
}

interface RentListingsProps {
    t: Dictionary["rentPage"];
}

export function RentListings({ t }: RentListingsProps) {
    const [sortOption, setSortOption] = useState("relevant");
    const [listings, setListings] = useState<Listing[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchListings = async () => {
            setIsLoading(true);
            try {
                const sb = createBrowserClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );

                const { data, error } = await sb
                    .from('listings')
                    .select('*')
                    .eq('intent', 'rent'); // Only rent listings for now

                if (error) {
                    console.error("Error fetching listings:", error);
                    return;
                }

                if (data) {
                    const mapped: Listing[] = data.map((item: any) => ({
                        id: item.id,
                        title: item.title || "Imóvel sem título",
                        location: `${item.location?.city || ''} - ${item.location?.neighborhood || ''}`,
                        price: `R$ ${item.price?.toLocaleString('pt-BR')}`,
                        priceValue: item.price || 0,
                        specs: `${item.area}m² • ${item.bedrooms} Quarto${item.bedrooms > 1 ? 's' : ''} • ${item.bathrooms} Banheiro${item.bathrooms > 1 ? 's' : ''}`,
                        sqm: item.area || 0,
                        bedrooms: item.bedrooms || 0,
                        bathrooms: item.bathrooms || 0,
                        parking: item.parking || 0,
                        image: (item.photos && item.photos.length > 0) ? item.photos[0] : "/placeholder-kitnet.jpg",
                        tags: item.type ? [item.type] : []
                    }));
                    setListings(mapped);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchListings();
    }, []);

    const getSortedListings = () => {
        const sorted = [...listings];
        switch (sortOption) {
            case "newest":
                return sorted; // Assuming fetch is default order or created_at desc (todo: add sort to query)
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

    const sortedListings = getSortedListings();

    return (
        <div>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
                    <p className="text-muted-foreground">{t.subtitle}</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                        {sortedListings.length} {t.foundProperties}
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

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : sortedListings.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    Nenhum imóvel encontrado.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {sortedListings.map((listing) => (
                        <div key={listing.id} className="group overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:shadow-lg">
                            {/* Image Placeholder */}
                            <div className="relative h-48 bg-muted overflow-hidden">
                                <img src={listing.image} alt={listing.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white capitalize">
                                    {listing.tags[0] || 'Imóvel'}
                                </div>
                            </div>

                            <div className="p-4">
                                <p className="mb-1 text-xs tracking-wide text-muted-foreground uppercase">{t.rent}</p>
                                <h3 className="text-lg font-semibold transition-colors text-foreground group-hover:text-primary">
                                    {listing.price} <span className="text-sm font-normal text-muted-foreground">{t.perMonth}</span>
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
            )}
        </div>
    );
}
