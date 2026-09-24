import { Sparkles } from "lucide-react";

/** "Destaques do mês": the bullet insights FIPE opens its report with, generated from the data. */
export function FipezapHighlights({ title, items, source }: { title: string; items: string[]; source: string }) {
    if (items.length === 0) return null;
    return (
        <section className="rounded-xl border bg-card text-card-foreground shadow-sm p-4 md:p-6" aria-labelledby="fipezap-highlights-title">
            <p id="fipezap-highlights-title" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3"><Sparkles className="h-3.5 w-3.5" />{title}</p>
            <ul className="grid gap-2 md:grid-cols-2">
                {items.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-snug">
                        <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{s}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">{source}</p>
        </section>
    );
}
