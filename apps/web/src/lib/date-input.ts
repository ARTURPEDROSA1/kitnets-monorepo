/**
 * The pure half of `components/ui/DateInput`: ISO ↔ dd/mm/aaaa (or mm/aaaa), and the mask the
 * field applies while the user types. Kept out of the component so it can be unit-tested.
 */

export type DateInputMode = "date" | "month";

/** `2026-03-17` → `17/03/2026`; `2034-01` → `01/2034`; anything else → "". */
export function isoToBR(iso: string | null | undefined, mode: DateInputMode = "date"): string {
    if (!iso) return "";
    if (mode === "month") {
        const m = /^(\d{4})-(\d{2})/.exec(iso);
        return m ? `${m[2]}/${m[1]}` : "";
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Digits as the user types them, with the slashes put in: `1703` → `17/03`, `17032026` → `17/03/2026`. */
export function maskBR(raw: string, mode: DateInputMode = "date"): string {
    const digits = raw.replace(/\D/g, "").slice(0, mode === "month" ? 6 : 8);
    if (mode === "month") return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** A complete, real dd/mm/aaaa (or mm/aaaa) as ISO; null while incomplete or impossible. */
export function brToISO(text: string, mode: DateInputMode = "date"): string | null {
    if (mode === "month") {
        const m = /^(\d{2})\/(\d{4})$/.exec(text);
        if (!m) return null;
        const month = Number(m[1]);
        return month >= 1 && month <= 12 ? `${m[2]}-${m[1]}` : null;
    }
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (!m) return null;
    const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;   // 31/04, 30/02
    return `${m[3]}-${m[2]}-${m[1]}`;
}
