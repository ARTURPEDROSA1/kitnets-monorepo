/**
 * The dashboard's text colours for money in, due, overdue and the agencies' fee: CSS variables set for the
 * light and the dark theme in globals.css (`--dash-*`), so they follow the app's theme class rather than the
 * system setting the `dark:` variant reads.
 */
export const INK = {
    in: "text-[hsl(var(--dash-in))]",
    due: "text-[hsl(var(--dash-due))]",
    late: "text-[hsl(var(--dash-late))]",
    fee: "text-[hsl(var(--dash-fee))]",
} as const;
