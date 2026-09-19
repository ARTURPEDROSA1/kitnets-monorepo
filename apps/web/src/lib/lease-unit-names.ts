/**
 * Keeps a lease in step with the name the owner gives its unit.
 *
 * A lease stores the unit's name twice: `unit_name` (a snapshot) and, usually, inside the
 * reference the app suggests ("SANTO ANTONIO · Kitnet 35C - Ana - 2026"). Units start as
 * "Unidade N" and get their real name later, so both go stale on a rename.
 */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What to store for a lease whose unit is now called `unit.name` (`position` = its 1-based place
 * among the property's units), or null when nothing changes.
 *
 * Only the app's own pattern is rewritten: "· <old name>" right before " - " or the end, where the
 * old name is the snapshot or the unit's default "Unidade N". A reference the user worded differently
 * is left alone.
 */
export function refreshedLeaseUnitNames(
    lease: { unit_name: string | null; reference_name: string | null },
    unit: { name: string; position: number }
): { unit_name: string; reference_name: string | null } | null {
    const current = unit.name.trim();
    if (!current) return null;

    let reference = lease.reference_name;
    if (reference) {
        const oldNames = [lease.unit_name?.trim(), `Unidade ${unit.position}`].filter((n): n is string => !!n && n !== current);
        for (const old of oldNames) {
            reference = reference.replace(new RegExp(`(·\\s*)${escapeRegExp(old)}(?=\\s*(?:-|$))`), (_match, sep: string) => sep + current);
        }
    }

    if (reference === lease.reference_name && lease.unit_name === current) return null;
    return { unit_name: current, reference_name: reference };
}
