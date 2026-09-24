import { Building2, Landmark, Map, Users, Wallet } from "lucide-react";
import { cityFacts, REFERENCE_APARTMENT_M2, rentShareOfIncome, yearsOfIncome } from "@/lib/fipezap-city-facts";
import { fill, fmtBRL, fmtInt, fmtPct } from "@/lib/fipezap-compare";
import type { FipezapTipo } from "@/lib/fipezap-cities-params";
import type { Dictionary } from "@/dictionaries";

type Facts = Dictionary["fipezapCitiesPage"]["facts"];

/**
 * The IBGE block of FIPE's city slide (population, area, GDP per capita, households, apartments,
 * household income), plus one derived line that ties it to the price: years of income a 50 m²
 * apartment costs, or the share of income its rent takes. Capitals only; null for other cities.
 */
export function FipezapCityFacts({ slug, tipo, priceM2, lang, t }: { slug: string; tipo: FipezapTipo; priceM2: number | null; lang: string; t: Facts }) {
    const f = cityFacts(slug);
    if (!f) return null;
    const thousands = (n: number) => fmtInt(Math.round(n / 1000), lang);
    const tiles: Array<{ label: string; value: string; unit: string; icon: React.ReactNode }> = [
        { label: t.population, value: thousands(f.population), unit: fill(t.unitThousandPeople, { year: f.populationYear }), icon: <Users className="h-3.5 w-3.5" /> },
        { label: t.area, value: fmtInt(Math.round(f.areaKm2), lang), unit: fill(t.unitKm2, { year: f.populationYear }), icon: <Map className="h-3.5 w-3.5" /> },
        { label: t.gdp, value: fmtBRL(f.gdpPerCapita, { lang, digits: 0 }), unit: fill(t.unitPerResident, { year: f.gdpYear }), icon: <Landmark className="h-3.5 w-3.5" /> },
        { label: t.households, value: thousands(f.households), unit: fill(t.unitThousandHouseholds, { year: f.populationYear }), icon: <Building2 className="h-3.5 w-3.5" /> },
        { label: t.apartments, value: thousands(f.apartments), unit: fill(t.unitThousandApartments, { year: f.populationYear }), icon: <Building2 className="h-3.5 w-3.5" /> },
        { label: t.income, value: fmtBRL(f.householdIncome, { lang, digits: 0 }), unit: fill(t.unitPerHousehold, { year: f.incomeYear }), icon: <Wallet className="h-3.5 w-3.5" /> },
    ];
    const years = tipo === "venda" ? yearsOfIncome(priceM2, f) : null;
    const share = tipo === "locacao" ? rentShareOfIncome(priceM2, f) : null;
    const derived = years !== null
        ? fill(t.affordabilitySale, { m2: REFERENCE_APARTMENT_M2, price: fmtBRL(priceM2! * REFERENCE_APARTMENT_M2, { lang, digits: 0 }), years: years.toLocaleString(lang === "pt" ? "pt-BR" : lang, { maximumFractionDigits: 1 }) })
        : share !== null
            ? fill(t.affordabilityRent, { m2: REFERENCE_APARTMENT_M2, rent: fmtBRL(priceM2! * REFERENCE_APARTMENT_M2, { lang, digits: 0 }), share: fmtPct(share, { lang, sign: false, digits: 0 }) })
            : null;

    return (
        <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.title}</p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {tiles.map(tile => (
                    <div key={tile.label} className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
                        <dt className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">{tile.icon}{tile.label}</dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums leading-tight">{tile.value}</dd>
                        <dd className="text-[10px] text-muted-foreground">{tile.unit}</dd>
                    </div>
                ))}
            </dl>
            {derived && <p className="text-sm">{derived}</p>}
            <p className="text-[11px] text-muted-foreground">{t.source}</p>
        </div>
    );
}
