/**
 * Period filter shared by the DRE chart and the income ledger.
 * Months are `YYYY-MM` keys; ranges are inclusive.
 */

export type PeriodKind = "ytd" | "1y" | "2y" | "3y" | "4y" | "5y" | "all" | "custom";

export interface PeriodFilterValue {
    kind: PeriodKind;
    /** custom only — `YYYY-MM` */
    start?: string;
    /** custom only — `YYYY-MM` */
    end?: string;
}

export interface PeriodRange {
    start: string | null;   // null = no lower bound
    end: string | null;     // null = no upper bound
}

export const PERIOD_OPTIONS: Array<{ kind: PeriodKind; label: string; title: string }> = [
    { kind: "ytd", label: "Este ano", title: "Acumulado no ano: de janeiro até o mês atual" },
    { kind: "1y", label: "1 ano", title: "Últimos 12 meses" },
    { kind: "2y", label: "2 anos", title: "Últimos 24 meses" },
    { kind: "3y", label: "3 anos", title: "Últimos 36 meses" },
    { kind: "4y", label: "4 anos", title: "Últimos 48 meses" },
    { kind: "5y", label: "5 anos", title: "Últimos 60 meses" },
    { kind: "all", label: "Tudo", title: "Todos os meses, inclusive previstos" },
    { kind: "custom", label: "Personalizado", title: "Escolha o mês inicial e final" },
];

export const DEFAULT_PERIOD: PeriodFilterValue = { kind: "1y" };

const key = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, "0")}`;

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonthKey(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return key(d.getFullYear(), d.getMonth());
}

/** Whole months from `a` to `b` (`b − a`); negative when b is earlier. */
export function monthsBetween(a: string, b: string): number {
    const [ya, ma] = a.split("-").map(Number);
    const [yb, mb] = b.split("-").map(Number);
    return (yb - ya) * 12 + (mb - ma);
}

export function periodRange(p: PeriodFilterValue, now = new Date()): PeriodRange {
    const current = key(now.getFullYear(), now.getMonth());
    switch (p.kind) {
        case "ytd":
            return { start: `${now.getFullYear()}-01`, end: current };
        case "1y": case "2y": case "3y": case "4y": case "5y": {
            const years = Number(p.kind[0]);
            return { start: shiftMonthKey(current, -(years * 12 - 1)), end: current };
        }
        case "custom": {
            const start = p.start && /^\d{4}-\d{2}$/.test(p.start) ? p.start : null;
            const end = p.end && /^\d{4}-\d{2}$/.test(p.end) ? p.end : null;
            return start && end && start > end ? { start: end, end: start } : { start, end };
        }
        case "all":
        default:
            return { start: null, end: null };
    }
}

export function inPeriod(monthKey: string, range: PeriodRange): boolean {
    if (range.start && monthKey < range.start) return false;
    if (range.end && monthKey > range.end) return false;
    return true;
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmt = (k: string) => {
    const [y, m] = k.split("-");
    return `${MONTH_SHORT[Number(m) - 1] ?? m}/${y}`;
};

export function periodLabel(p: PeriodFilterValue, now = new Date()): string {
    const r = periodRange(p, now);
    if (p.kind === "all") return "todo o período";
    if (p.kind === "ytd") return `${now.getFullYear()} até ${fmt(r.end!)}`;
    if (p.kind === "custom") {
        if (r.start && r.end) return `${fmt(r.start)} – ${fmt(r.end)}`;
        if (r.start) return `desde ${fmt(r.start)}`;
        if (r.end) return `até ${fmt(r.end)}`;
        return "todo o período";
    }
    return `${fmt(r.start!)} – ${fmt(r.end!)}`;
}
