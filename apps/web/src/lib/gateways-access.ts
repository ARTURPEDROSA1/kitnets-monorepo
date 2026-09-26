/**
 * Who sees the IoT gateways on the dashboard. The gateway is a founder-only pilot, not a product of
 * Kitnets.com, so the block is hidden for everyone except the accounts listed in GATEWAY_PILOT_EMAILS
 * (comma-separated; the founder's address when the variable is absent). Pure: the loader passes the
 * profile's e-mail and the raw variable.
 *
 * Trust boundary: the e-mail compared is `profiles.email`, which the owner can write (the profile row is
 * saved from the browser). The comparison is exact apart from case — no trimming — and the unique index on
 * lower(email) keeps a second account from holding a listed address, so a padded or re-cased variant does
 * not pass. The gate is cosmetic all the same: it hides a block and guards no data (the gateway queries are
 * owner-scoped and the gateway pages stay reachable). Never gate data on it.
 */
export const DEFAULT_GATEWAY_PILOT_EMAILS = ["pedrosa.ac@gmail.com"];

export function gatewayPilotEmails(raw: string | null | undefined): string[] {
    const list = (raw ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    return list.length > 0 ? list : DEFAULT_GATEWAY_PILOT_EMAILS;
}

export function canSeeGateways(email: string | null | undefined, raw?: string | null): boolean {
    if (!email) return false;
    return gatewayPilotEmails(raw).includes(email.toLowerCase());
}
