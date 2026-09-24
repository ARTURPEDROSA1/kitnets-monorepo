/**
 * Socioeconomic facts of the 22 state capitals, as printed on the "resumo por cidade" slides of FIPE's
 * monthly FipeZap report (source IBGE; household income estimated by FIPE from IBGE data). Transcribed
 * from the July/2024 sale and June/2026 rental reports, which carry the same figures. Only the
 * capitals have them: FIPE does not publish the block for the other cities.
 */

export interface CityFacts {
    /** residents, Censo 2022 */
    population: number;
    populationYear: number;
    /** km², 2022 */
    areaKm2: number;
    /** R$ per resident per year */
    gdpPerCapita: number;
    gdpYear: number;
    /** households, Censo 2022 */
    households: number;
    /** apartments (a subset of households), Censo 2022 */
    apartments: number;
    /** R$ per household per month, FIPE's estimate from IBGE data */
    householdIncome: number;
    incomeYear: number;
}

type Row = [slug: string, populationK: number, areaKm2: number, gdpPerCapita: number, householdsK: number, apartmentsK: number, householdIncome: number];

// figures in thousands where the report prints "mil"
const ROWS: Row[] = [
    ["sao-paulo", 11452.0, 1521.2, 60750, 4307.7, 1436.0, 8994],
    ["rio-de-janeiro", 6211.2, 1200.3, 49094, 2437.0, 963.0, 8530],
    ["brasilia", 2817.4, 5760.8, 87016, 988.2, 338.3, 9257],
    ["salvador", 2417.7, 693.4, 20417, 958.6, 270.5, 4828],
    ["porto-alegre", 1332.8, 495.4, 51117, 558.3, 276.6, 8928],
    ["curitiba", 1773.7, 434.9, 45318, 685.9, 230.7, 8351],
    ["belo-horizonte", 2315.6, 331.4, 38670, 889.6, 345.7, 8258],
    ["recife", 1488.9, 218.8, 30428, 547.5, 165.6, 4867],
    ["fortaleza", 2428.7, 312.4, 24254, 860.1, 203.5, 5109],
    ["florianopolis", 537.2, 674.8, 41886, 219.7, 96.7, 10160],
    ["goiania", 1437.4, 729.3, 33827, 549.1, 153.0, 7434],
    ["vitoria", 322.9, 97.1, 69628, 128.6, 63.0, 9126],
    ["campo-grande", 898.1, 8083.0, 33244, 325.8, 37.9, 6736],
    ["cuiaba", 650.9, 4327.4, 42918, 232.2, 43.6, 6682],
    ["aracaju", 602.8, 182.2, 24736, 218.5, 66.6, 5932],
    ["joao-pessoa", 833.9, 210.0, 25402, 296.2, 122.4, 6618],
    ["maceio", 957.9, 509.3, 22307, 335.8, 77.4, 4229],
    ["natal", 751.3, 167.4, 25525, 270.0, 58.9, 5761],
    ["sao-luis", 1037.8, 583.1, 29824, 348.7, 62.6, 3908],
    ["teresina", 866.3, 1391.3, 24858, 279.9, 41.3, 6537],
    ["belem", 1303.4, 1059.5, 20562, 423.0, 69.4, 6381],
    ["manaus", 2063.7, 11401.1, 41345, 630.1, 105.1, 4425],
];

export const FIPEZAP_CITY_FACTS: Readonly<Record<string, CityFacts>> = Object.fromEntries(ROWS.map(([slug, pop, area, gdp, hh, apt, income]) => [slug, {
    population: Math.round(pop * 1000), populationYear: 2022, areaKm2: area, gdpPerCapita: gdp, gdpYear: 2020,
    households: Math.round(hh * 1000), apartments: Math.round(apt * 1000), householdIncome: income, incomeYear: 2023,
} satisfies CityFacts]));

export function cityFacts(slug: string): CityFacts | null {
    return FIPEZAP_CITY_FACTS[slug] ?? null;
}

/** Reference size used to turn a price per m² into "years of household income" / "share of income". */
export const REFERENCE_APARTMENT_M2 = 50;

/** How many years of household income a 50 m² apartment costs at the given sale price per m². */
export function yearsOfIncome(salePricePerM2: number | null, facts: CityFacts | null): number | null {
    if (salePricePerM2 === null || !facts || facts.householdIncome <= 0) return null;
    return (salePricePerM2 * REFERENCE_APARTMENT_M2) / (facts.householdIncome * 12);
}

/** Share of the monthly household income that renting 50 m² takes, in %. */
export function rentShareOfIncome(rentPerM2: number | null, facts: CityFacts | null): number | null {
    if (rentPerM2 === null || !facts || facts.householdIncome <= 0) return null;
    return ((rentPerM2 * REFERENCE_APARTMENT_M2) / facts.householdIncome) * 100;
}
