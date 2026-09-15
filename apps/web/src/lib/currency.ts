/**
 * Money parsing for values that arrive as text.
 *
 * Accepts what the UI's currency mask produces ("R$ 1.234,56"), what people
 * type by hand ("1234,56", "1.234"), and what other software sends
 * ("1234.56"). The previous implementation stripped every dot before
 * parsing, which silently turned "1234.56" into 123456.
 *
 * Rules, in order:
 * - numbers pass through unchanged;
 * - a comma is always the decimal separator (Brazilian notation), dots are
 *   thousands separators;
 * - with dots only: several dots, or exactly three digits after the single
 *   dot, mean thousands ("1.234", "1.234.567"); one or two digits after the
 *   dot mean a decimal point ("1234.5", "1234.56");
 * - several commas and a dot is English notation ("1,234,567.89").
 * Returns 0 for empty or unparseable input.
 */
export function parseCurrencyBR(value: string | number | null | undefined): number {
    if (value == null) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;

    let s = value.replace(/R\$|\s| /g, "");
    if (!s) return 0;

    const negative = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
    s = s.replace(/[()+-]/g, "");

    const commas = (s.match(/,/g) || []).length;
    const dots = (s.match(/\./g) || []).length;

    let normalized: string;
    if (commas > 1 && dots <= 1) {
        normalized = s.replace(/,/g, "");                    // 1,234,567.89
    } else if (commas === 1) {
        normalized = s.replace(/\./g, "").replace(",", "."); // 1.234,56 / 1234,5
    } else if (dots >= 1) {
        const parts = s.split(".");
        const decimals = parts[parts.length - 1];
        normalized = dots > 1 || decimals.length === 3 ? parts.join("") : s; // 1.234 vs 1234.56
    } else {
        normalized = s;
    }

    if (!/^\d*(\.\d+)?$/.test(normalized) || normalized === "") return 0;
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return negative ? -n : n;
}
