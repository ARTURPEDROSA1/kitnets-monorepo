/**
 * A contract's title carries the tenant's name ("SANTO ANTONIO · Kitnet 35 - Robson Mesquita - 2024",
 * lib/lease-dashboard.ts `referenceNameFor`). The eye toggle (components/privacy) must blur that name
 * without hiding the place, so the title is split around it and only the match is wrapped.
 */
export interface SplitTitle {
    before: string;
    /** the tenant's name as it appears in the title */
    match: string;
    after: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The title around the tenant's name (accents and case ignored), or null when the name is not in it. */
export function splitTitle(title: string, tenant: string | null | undefined): SplitTitle | null {
    const name = tenant?.trim();
    if (!name) return null;
    const at = fold(title).indexOf(fold(name));
    // folding keeps the length (one code point per character after stripping the marks), so the
    // indexes line up with the original title
    if (at < 0 || fold(title).length !== title.length) return at < 0 ? null : slowSplit(title, name);
    return { before: title.slice(0, at), match: title.slice(at, at + name.length), after: title.slice(at + name.length) };
}

/** When folding changed the length (rare: a decomposed character), find the match by scanning. */
function slowSplit(title: string, name: string): SplitTitle | null {
    const target = fold(name);
    for (let start = 0; start < title.length; start++) {
        for (let end = start + 1; end <= title.length; end++) {
            const piece = fold(title.slice(start, end));
            if (piece === target) return { before: title.slice(0, start), match: title.slice(start, end), after: title.slice(end) };
            if (piece.length > target.length) break;
        }
    }
    return null;
}
