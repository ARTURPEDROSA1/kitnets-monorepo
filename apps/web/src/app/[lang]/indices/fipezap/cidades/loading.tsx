import { SectionSkeleton } from "@/components/indices/FipeZap/cities/ReportCard";

export default function Loading() {
    return (
        <div className="container mx-auto py-4 md:py-10 px-4 max-w-6xl space-y-6" aria-busy="true">
            <div className="space-y-3">
                <div className="h-4 w-32 rounded bg-muted/50 animate-pulse" />
                <div className="h-9 w-72 rounded bg-muted/60 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-muted/40 animate-pulse" />
            </div>
            <div className="h-12 rounded-lg border border-border bg-muted/20 animate-pulse" />
            <SectionSkeleton height={90} />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-xl border border-border/80 bg-muted/20 animate-pulse" />)}</div>
            <SectionSkeleton height={480} />
            <SectionSkeleton height={520} />
            <SectionSkeleton height={360} />
        </div>
    );
}
