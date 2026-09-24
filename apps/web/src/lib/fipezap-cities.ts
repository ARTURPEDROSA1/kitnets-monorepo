/**
 * FipeZap city catalogue — the places whose series the app stores.
 *
 * FIPE's workbook has one sheet per city, named by the city alone (no UF). The app keeps the national
 * index plus the 36 cities that publish all three series (venda, locação, rentabilidade): the 22 state
 * capitals and 14 other cities. Sales-only cities and the commercial segment are not imported.
 *
 * `sheetTitle` is the text of cell B1, which is how a sheet is recognised (exceljs' streaming reader
 * does not reliably expose sheet names). Coordinates are the municipal seat, for a dot map.
 */
import type { FipezapDorm } from "./fipezap-import";

export type FipezapRegion = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";

export interface FipezapCity {
    /** URL and database key: 'sao-paulo'; 'brasil' for the national index */
    slug: string;
    name: string;
    uf: string | null;
    region: FipezapRegion | null;
    isCapital: boolean;
    /** metropolitan area, when the city belongs to one the report groups */
    metro: string | null;
    lat: number | null;
    lng: number | null;
    /** exact text of the sheet's title cell (B1) */
    sheetTitle: string;
    /** the plain name exists in several states: matching by name needs the UF too */
    requiresUf?: true;
}

export const FIPEZAP_NATIONAL_SLUG = "brasil";

const REGION_BY_UF: Record<string, FipezapRegion> = {
    PA: "Norte", AM: "Norte",
    SE: "Nordeste", CE: "Nordeste", PB: "Nordeste", AL: "Nordeste", RN: "Nordeste", PE: "Nordeste", BA: "Nordeste", MA: "Nordeste", PI: "Nordeste",
    DF: "Centro-Oeste", GO: "Centro-Oeste", MS: "Centro-Oeste", MT: "Centro-Oeste",
    SP: "Sudeste", RJ: "Sudeste", MG: "Sudeste", ES: "Sudeste",
    RS: "Sul", PR: "Sul", SC: "Sul",
};

type Row = [slug: string, name: string, uf: string, capital: 0 | 1, metro: string | null, lat: number, lng: number, requiresUf?: 1];

// in the workbook's sheet order
const ROWS: Row[] = [
    ["sao-paulo", "São Paulo", "SP", 1, "Grande São Paulo", -23.5505, -46.6333],
    ["barueri", "Barueri", "SP", 0, "Grande São Paulo", -23.5106, -46.8761],
    ["campinas", "Campinas", "SP", 0, "Região Metropolitana de Campinas", -22.9099, -47.0626],
    ["guarulhos", "Guarulhos", "SP", 0, "Grande São Paulo", -23.4543, -46.5337],
    ["praia-grande", "Praia Grande", "SP", 0, "Baixada Santista", -24.0058, -46.4028],
    ["ribeirao-preto", "Ribeirão Preto", "SP", 0, null, -21.1704, -47.8103],
    ["santo-andre", "Santo André", "SP", 0, "Grande São Paulo", -23.6639, -46.5383],
    ["santos", "Santos", "SP", 0, "Baixada Santista", -23.9608, -46.3336],
    ["sao-bernardo-do-campo", "São Bernardo do Campo", "SP", 0, "Grande São Paulo", -23.6914, -46.5646],
    ["sao-jose-do-rio-preto", "São José do Rio Preto", "SP", 0, null, -20.8113, -49.3758],
    ["sao-jose-dos-campos", "São José dos Campos", "SP", 0, "Vale do Paraíba", -23.1791, -45.8872],
    ["rio-de-janeiro", "Rio de Janeiro", "RJ", 1, "Grande Rio", -22.9068, -43.1729],
    ["niteroi", "Niterói", "RJ", 0, "Grande Rio", -22.8832, -43.1034],
    ["belo-horizonte", "Belo Horizonte", "MG", 1, "Grande BH", -19.9167, -43.9345],
    ["porto-alegre", "Porto Alegre", "RS", 1, "Grande Porto Alegre", -30.0346, -51.2177],
    ["pelotas", "Pelotas", "RS", 0, null, -31.7654, -52.3376],
    ["curitiba", "Curitiba", "PR", 1, "Grande Curitiba", -25.4284, -49.2733],
    ["florianopolis", "Florianópolis", "SC", 1, "Grande Florianópolis", -27.5954, -48.548],
    ["joinville", "Joinville", "SC", 0, null, -26.3045, -48.8487],
    ["sao-jose", "São José", "SC", 0, "Grande Florianópolis", -27.6136, -48.6366, 1],
    ["vitoria", "Vitória", "ES", 1, "Grande Vitória", -20.3155, -40.3128],
    ["brasilia", "Brasília", "DF", 1, null, -15.7939, -47.8828],
    ["goiania", "Goiânia", "GO", 1, null, -16.6869, -49.2648],
    ["campo-grande", "Campo Grande", "MS", 1, null, -20.4697, -54.6201],
    ["cuiaba", "Cuiabá", "MT", 1, null, -15.6014, -56.0979],
    ["aracaju", "Aracaju", "SE", 1, null, -10.9472, -37.0731],
    ["fortaleza", "Fortaleza", "CE", 1, null, -3.7319, -38.5267],
    ["joao-pessoa", "João Pessoa", "PB", 1, null, -7.1195, -34.845],
    ["maceio", "Maceió", "AL", 1, null, -9.6658, -35.7353],
    ["natal", "Natal", "RN", 1, null, -5.7945, -35.211],
    ["recife", "Recife", "PE", 1, "Grande Recife", -8.0476, -34.877],
    ["salvador", "Salvador", "BA", 1, null, -12.9777, -38.5016],
    ["sao-luis", "São Luís", "MA", 1, null, -2.5307, -44.3068],
    ["teresina", "Teresina", "PI", 1, null, -5.0892, -42.8019],
    ["belem", "Belém", "PA", 1, null, -1.4558, -48.4902],
    ["manaus", "Manaus", "AM", 1, null, -3.119, -60.0217],
];

export const FIPEZAP_NATIONAL: FipezapCity = {
    slug: FIPEZAP_NATIONAL_SLUG, name: "Brasil", uf: null, region: null, isCapital: false, metro: null, lat: null, lng: null, sheetTitle: "Índice FipeZAP",
};

/** National index first, then the 36 cities in the workbook's order. */
export const FIPEZAP_CITIES: readonly FipezapCity[] = [
    FIPEZAP_NATIONAL,
    ...ROWS.map(([slug, name, uf, capital, metro, lat, lng, requiresUf]): FipezapCity => ({
        slug, name, uf, region: REGION_BY_UF[uf], isCapital: capital === 1, metro, lat, lng, sheetTitle: name, ...(requiresUf ? { requiresUf: true as const } : {}),
    })),
];

/** The 36 cities without the national row. */
export const FIPEZAP_CITY_LIST: readonly FipezapCity[] = FIPEZAP_CITIES.filter(c => c.slug !== FIPEZAP_NATIONAL_SLUG);
export const FIPEZAP_CAPITALS: readonly FipezapCity[] = FIPEZAP_CITY_LIST.filter(c => c.isCapital);

/** Accent- and case-insensitive key: "São José (SC)" → "sao jose sc". */
export function normalizeCityKey(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const BY_SLUG = new Map(FIPEZAP_CITIES.map(c => [c.slug, c]));
const BY_TITLE = new Map(FIPEZAP_CITIES.map(c => [normalizeCityKey(c.sheetTitle), c]));

export function fipezapCityBySlug(slug: string | null | undefined): FipezapCity | undefined {
    return slug ? BY_SLUG.get(slug) : undefined;
}

/** Recognises a sheet by its title cell. Tolerates a trailing "(UF)" or " - UF" should FIPE add one. */
export function fipezapCityBySheetTitle(title: string | null | undefined): FipezapCity | undefined {
    if (!title) return undefined;
    const key = normalizeCityKey(title);
    return BY_TITLE.get(key) ?? BY_TITLE.get(key.replace(/\s+[a-z]{2}$/, ""));
}

/**
 * The catalogue city an address belongs to, or null. Matches the normalised name exactly; a city
 * marked `requiresUf` (São José exists in several states) also needs the matching UF. Never guesses.
 */
export function matchFipezapCity(city: string | null | undefined, uf?: string | null): FipezapCity | null {
    if (!city) return null;
    const key = normalizeCityKey(city);
    if (!key) return null;
    const ufKey = uf ? uf.trim().toUpperCase() : null;
    const found = FIPEZAP_CITY_LIST.find(c => normalizeCityKey(c.name) === key);
    if (!found) return null;
    if (ufKey && found.uf !== ufKey) return null;
    if (found.requiresUf && !ufKey) return null;
    return found;
}

const DORM_LABEL: Record<FipezapDorm, string> = { total: "todos", "1": "1 dorm.", "2": "2 dorm.", "3": "3 dorm.", "4": "4+ dorm." };

/** "FipeZap São Paulo (2 dorm.)" / "FipeZap Brasil (todos)". Unknown slugs fall back to the slug itself. */
export function fipezapCityLabel(slug: string, dorm?: FipezapDorm): string {
    const city = fipezapCityBySlug(slug);
    const name = city ? city.name : slug;
    return dorm ? `FipeZap ${name} (${DORM_LABEL[dorm]})` : `FipeZap ${name}`;
}
