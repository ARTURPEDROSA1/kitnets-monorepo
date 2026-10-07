/**
 * A tenant's status follows their contracts. Whoever has a contract in force lives there (ACTIVE, or
 * FUTURE while it has not started); whoever has every contract ended moved out (FORMER) on the day the
 * last one ended. Applied whenever a contract is created, edited or closed (lib/tenant-status-server.ts),
 * so an old contract imported as closed never leaves its tenant among the current ones. A tenant with no
 * contract, a draft in the works or only cancelled ones is left as the owner registered them.
 * Dates are `YYYY-MM-DD` strings compared as text, in Brasília.
 */
import type { LeaseStatus } from "@/types/lease";
import type { TenantStatus } from "@/types/tenant";
import { IN_FORCE } from "@/lib/lease-dashboard";

export interface TenantLeaseFacts {
    status: LeaseStatus;
    start_date: string | null;
    end_date: string | null;
    termination_date: string | null;
}

export interface TenantStatusFields {
    status: TenantStatus;
    move_out_date: string | null;
}

/** Contracts that ran (a cancelled one never did). */
const ENDED: ReadonlySet<LeaseStatus> = new Set<LeaseStatus>(["EXPIRED", "TERMINATED"]);

const day = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);

/** The day an ended contract was over: its termination (the keys returned), else its term. */
export const endedOn = (lease: TenantLeaseFacts): string | null => day(lease.termination_date) ?? day(lease.end_date);

/**
 * What changes on the tenant so their status agrees with their contracts, or null when it already does.
 * `termOf`: the term of the contract just closed — a move-out day equal to it was taken from that term
 * before the day it really ended was known (the import creates the lease closed, then records the day),
 * and gives way to it. Any other move-out day the owner typed stays.
 */
export function tenantStatusPatch(
    tenant: TenantStatusFields,
    leases: TenantLeaseFacts[],
    opts: { today: string; termOf?: string | null }
): TenantStatusFields | null {
    const inForce = leases.filter((l) => IN_FORCE.has(l.status));
    if (inForce.length > 0) {
        // back with a contract in force: living there, or about to
        if (tenant.status !== "FORMER") return null;
        const started = inForce.some((l) => !l.start_date || day(l.start_date)! <= opts.today);
        return { status: started ? "ACTIVE" : "FUTURE", move_out_date: null };
    }
    if (leases.some((l) => l.status === "DRAFT")) return null;

    const ended = leases.filter((l) => ENDED.has(l.status));
    if (ended.length === 0) return null;
    const lastDay = ended.map(endedOn).filter((d): d is string => !!d).sort().pop() ?? null;

    if (tenant.status !== "FORMER") return { status: "FORMER", move_out_date: tenant.move_out_date ?? lastDay };

    const fromTerm = !tenant.move_out_date || (!!opts.termOf && tenant.move_out_date === day(opts.termOf));
    return fromTerm && lastDay && lastDay !== tenant.move_out_date ? { status: "FORMER", move_out_date: lastDay } : null;
}
