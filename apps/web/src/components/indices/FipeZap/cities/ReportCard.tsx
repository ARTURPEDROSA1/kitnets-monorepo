import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The card every section of the city dashboard uses: a title that states the takeaway (a sentence,
 * not a label), the metric's definition under it, the content, and a source line. Consulting-report
 * conventions: the reader gets the message before the chart.
 */
export function ReportCard({ id, title, eyebrow, definition, source, actions, children, className }: {
    id?: string;
    /** the insight, one sentence */
    title: string;
    /** small label above the title: the section name */
    eyebrow?: string;
    /** what the figures are */
    definition?: string;
    /** "Fonte: … · ago/2026" */
    source?: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section id={id} className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)} aria-labelledby={id ? `${id}-title` : undefined}>
            <header className="flex flex-col gap-3 p-4 md:p-6 pb-2 md:pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                    {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>}
                    <h2 id={id ? `${id}-title` : undefined} className="text-base md:text-lg font-semibold leading-snug text-balance">{title}</h2>
                    {definition && <p className="text-xs text-muted-foreground">{definition}</p>}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            </header>
            <div className="px-2 pb-3 md:px-6 md:pb-5">{children}</div>
            {source && <footer className="px-4 md:px-6 pb-3 text-[11px] text-muted-foreground">{source}</footer>}
        </section>
    );
}

/** Placeholder with the height of the real card so the page does not jump while a section streams in. */
export function SectionSkeleton({ height = 320, eyebrow }: { height?: number; eyebrow?: string }) {
    return (
        <div className="rounded-xl border bg-card shadow-sm p-4 md:p-6 space-y-3" aria-busy="true">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>}
            <div className="h-5 w-3/4 rounded bg-muted/60 animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted/40 animate-pulse" />
            <div className="rounded-lg bg-muted/30 animate-pulse" style={{ height }} />
        </div>
    );
}
