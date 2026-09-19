/**
 * Which leases the property page shows in "Contrato(s) de Aluguel".
 *
 * A single-unit property, or a multi-unit one rented as a whole, has one lease. A multi-unit
 * property rented unit by unit has one per unit. For each unit (and for the property as a whole)
 * the lease in force wins, else the most recent one.
 */

export interface LeasePick {
    id: string;
    unit_id: string | null;
    status: string;
    start_date: string;
}

/** ACTIVE and EXPIRING_SOON are the leases in force. */
const IN_FORCE = new Set(["ACTIVE", "EXPIRING_SOON"]);

/**
 * `rows` newest first (start_date desc). `unitOrder` is the units' order on the Imóveis page;
 * units that no longer exist go last. → `shown` in display order and how many leases were left out.
 */
export function pickPropertyLeases<T extends LeasePick>(rows: T[], unitOrder: string[]): { shown: T[]; others: number } {
    const chosen = new Map<string | null, T>();
    for (const row of rows) {
        const current = chosen.get(row.unit_id);
        if (!current || (!IN_FORCE.has(current.status) && IN_FORCE.has(row.status))) chosen.set(row.unit_id, row);
    }

    const whole = chosen.get(null);
    const units = [...chosen.entries()]
        .filter((entry): entry is [string, T] => entry[0] !== null)
        .sort(([a], [b]) => {
            const ia = unitOrder.indexOf(a);
            const ib = unitOrder.indexOf(b);
            return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
        })
        .map(([, lease]) => lease);

    // Rented unit by unit: a whole-property lease only joins the list while it is in force
    const shown = units.length === 0
        ? (whole ? [whole] : [])
        : [...(whole && IN_FORCE.has(whole.status) ? [whole] : []), ...units];

    return { shown, others: rows.length - shown.length };
}
