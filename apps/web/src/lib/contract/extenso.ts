/**
 * Numbers and money written out in Portuguese, as contracts quote them: "R$ 1.324,31 (mil trezentos e
 * vinte e quatro reais e trinta e um centavos)", "30 (trinta) meses", "2 (duas) testemunhas".
 */

const UNITS_M = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS_M = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

export type Gender = "m" | "f";

const unit = (n: number, g: Gender): string => (g === "f" && n === 1 ? "uma" : g === "f" && n === 2 ? "duas" : UNITS_M[n]);
const hundred = (n: number, g: Gender): string => (g === "f" && n > 1 ? HUNDREDS_M[n].replace(/os$/, "as") : HUNDREDS_M[n]);

/** 0–999 in words; "cem" for exactly 100. */
function upTo999(n: number, g: Gender): string {
    if (n < 20) return unit(n, g);
    if (n < 100) {
        const t = Math.floor(n / 10), u = n % 10;
        return u ? `${TENS[t]} e ${unit(u, g)}` : TENS[t];
    }
    if (n === 100) return "cem";
    const h = Math.floor(n / 100), rest = n % 100;
    return rest ? `${hundred(h, g)} e ${upTo999(rest, g)}` : hundred(h, g);
}

/** A whole number in words: 1324 → "mil trezentos e vinte e quatro"; 1500000 → "um milhão e quinhentos mil". */
export function numberInWords(value: number, g: Gender = "m"): string {
    const n = Math.floor(Math.abs(value));
    if (n === 0) return "zero";
    const groups: { q: number; words: string }[] = [];
    const billions = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6), thousands = Math.floor((n % 1e6) / 1000), rest = n % 1000;
    if (billions) groups.push({ q: billions, words: billions === 1 ? "um bilhão" : `${upTo999(billions, "m")} bilhões` });
    if (millions) groups.push({ q: millions, words: millions === 1 ? "um milhão" : `${upTo999(millions, "m")} milhões` });
    if (thousands) groups.push({ q: thousands, words: thousands === 1 ? "mil" : `${upTo999(thousands, g)} mil` });
    if (rest) groups.push({ q: rest, words: upTo999(rest, g) });
    // the last group joins with "e" when it is under a hundred or a round hundred: "mil e cem", "mil e cinquenta",
    // "um milhão e quinhentos mil" — but "mil trezentos e vinte"
    return groups.map((gr, i) => (i > 0 && i === groups.length - 1 && (gr.q < 100 || gr.q % 100 === 0) ? `e ${gr.words}` : gr.words)).join(" ");
}

/** Money in words: 1324.31 → "mil trezentos e vinte e quatro reais e trinta e um centavos". */
export function moneyInWords(value: number): string {
    const totalCents = Math.round(Math.abs(value) * 100);
    const reais = Math.floor(totalCents / 100), centavos = totalCents % 100;
    const parts: string[] = [];
    if (reais > 0) {
        const words = numberInWords(reais);
        // "um milhão de reais", "dois milhões de reais"
        const de = reais % 1e6 === 0 ? " de" : "";
        parts.push(`${words}${de} ${reais === 1 ? "real" : "reais"}`);
    }
    if (centavos > 0) parts.push(`${numberInWords(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
    return parts.length ? parts.join(" e ") : "zero real";
}

/** "R$ 1.324,31" */
export const formatMoney = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/ /g, " ");

/** "R$ 1.324,31 (mil trezentos e vinte e quatro reais e trinta e um centavos)" */
export const moneyWithWords = (value: number): string => `${formatMoney(value)} (${moneyInWords(value)})`;

/** "30 (trinta)" — the number and its words, as a contract writes a quantity. */
export const countWithWords = (n: number, g: Gender = "m"): string => `${n} (${numberInWords(n, g)})`;

/** "10% (dez por cento)"; decimals as "2,5% (dois vírgula cinco por cento)". */
export function percentWithWords(pct: number): string {
    const rounded = Math.round(pct * 100) / 100;
    const [int, dec] = String(rounded).split(".");
    const decWords = dec ? (dec.startsWith("0") ? `zero ${numberInWords(Number(dec))}` : numberInWords(Number(dec))) : "";
    const words = dec ? `${numberInWords(Number(int))} vírgula ${decWords}` : numberInWords(Number(int));
    return `${String(rounded).replace(".", ",")}% (${words} por cento)`;
}
