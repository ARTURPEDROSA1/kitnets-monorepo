import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { INCOME_DIRECT_COLUMNS } from "./property-income";

/**
 * Every query that reads the income ledger's deposit selects what the tenant paid by invoice next to it
 * (`INCOME_DIRECT_COLUMNS`). A reader that forgets it does not fail: it silently computes the month as if no
 * invoice had been paid. This test is the fence.
 */
const SRC = join(__dirname, "..");

/** Reads the deposit of one row to add a bank credit to it; it never feeds `breakdown`. */
const DEPOSIT_ONLY = new Set(["app/api/bank/statement/commit/route.ts"]);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "database.types.ts" ? [path] : [];
    });
}

/** String literals that are a list of ledger columns with the deposit in it. */
const COLUMN_LIST = /(["`])((?:(?!\1)[^\n])*\breceived_amount,[^\n]*?)\1/g;

describe("readers of the income ledger", () => {
    it("the direct columns are the ones the migration created", () => {
        expect(INCOME_DIRECT_COLUMNS).toBe("direct_rent, direct_condo, direct_energy, direct_other, condo_direct");
    });

    it("select what the tenant paid by invoice wherever they select the deposit", () => {
        const missing: string[] = [];
        let lists = 0;
        for (const file of sourceFiles(SRC)) {
            const rel = relative(SRC, file).replace(/\\/g, "/");
            if (DEPOSIT_ONLY.has(rel)) continue;
            const text = readFileSync(file, "utf8");
            if (!text.includes("property_income_months")) continue;
            for (const match of text.matchAll(COLUMN_LIST)) {
                lists++;
                if (!match[2].includes("${INCOME_DIRECT_COLUMNS}")) missing.push(`${rel}: "${match[2].slice(0, 60)}…"`);
            }
        }
        expect(missing).toEqual([]);
        // the fence is looking at something: the routes, the dashboards and the books all read the ledger
        expect(lists).toBeGreaterThanOrEqual(10);
    });
});
