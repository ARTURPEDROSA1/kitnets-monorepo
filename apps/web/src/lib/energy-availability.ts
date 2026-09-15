/**
 * Custo de disponibilidade (ANEEL REN 1.000/2021, art. 291): the minimum
 * billable consumption for a low-voltage consumer depends on the connection.
 *
 *   monofásico  30 kWh
 *   bifásico    50 kWh
 *   trifásico  100 kWh
 */
export const AVAILABILITY_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 } as const;

/** Assumed when the bill states neither the minimum nor the connection type. */
export const DEFAULT_AVAILABILITY_KWH = AVAILABILITY_KWH.monofasico;

/** 30/50/100 from an installation class such as "Residencial Bifásico", or null. */
export function availabilityKwhForClass(installationClass: string | null | undefined): number | null {
    if (!installationClass) return null;
    const c = installationClass.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (/trifas/.test(c)) return AVAILABILITY_KWH.trifasico;
    if (/bifas/.test(c)) return AVAILABILITY_KWH.bifasico;
    if (/monofas/.test(c)) return AVAILABILITY_KWH.monofasico;
    return null;
}

/**
 * The value printed on the bill wins; otherwise the connection type decides;
 * otherwise the single-phase minimum, the common case for kitnets.
 */
export function resolveAvailabilityKwh(
    stated: number | string | null | undefined,
    installationClass: string | null | undefined
): number {
    const n = stated == null || stated === "" ? NaN : Number(stated);
    if (Number.isFinite(n) && n > 0) return n;
    return availabilityKwhForClass(installationClass) ?? DEFAULT_AVAILABILITY_KWH;
}
