import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Drops everything cached for the index pages: the `indices` data tag (`lib/indexes.ts`) and the pages'
 * own hourly ISR copy. The index cron jobs call it when they finish, so new figures show at once and a
 * cached failure never outlives the next run. Never throws: a cache problem must not fail an import.
 */
export function refreshIndexPages(): void {
    try {
        revalidateTag("indices", { expire: 0 });
        revalidatePath("/[lang]/indices/[code]", "page");
        revalidatePath("/[lang]/indices/panorama", "page");
        revalidatePath("/api/indices/[code]/calculator-data", "page");   // the correction calculators' series
    } catch (err) {
        console.error("[index-cache] revalidation failed:", (err as Error).message);
    }
}
