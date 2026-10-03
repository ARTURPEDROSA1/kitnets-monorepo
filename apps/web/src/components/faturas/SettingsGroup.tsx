/**
 * One subject of Fatura's Configuração and Conexões: its own card, a coloured edge, an icon tile and a
 * header saying what it is about, so it cannot be mistaken for the next. The header may carry status
 * pills beside the title and actions on the right.
 */
import React from "react";
import { cn } from "@/lib/utils";

export const SETTINGS_GROUP_TONES = {
    orange: { bar: "border-l-orange-400", icon: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" },
    violet: { bar: "border-l-violet-400", icon: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
    sky: { bar: "border-l-sky-400", icon: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
    emerald: { bar: "border-l-emerald-500", icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
} as const;

interface Props {
    tone: keyof typeof SETTINGS_GROUP_TONES;
    icon: React.ReactNode;
    title: string;
    /** status pills beside the title */
    badges?: React.ReactNode;
    description: React.ReactNode;
    /** buttons on the right of the header */
    actions?: React.ReactNode;
    bodyClassName?: string;
    children: React.ReactNode;
}

export default function SettingsGroup({ tone, icon, title, badges, description, actions, bodyClassName = "p-4", children }: Props) {
    const t = SETTINGS_GROUP_TONES[tone];
    return (
        <section className={cn("overflow-hidden rounded-xl border border-l-4 border-border/80 bg-card", t.bar)}>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", t.icon)}>{icon}</span>
                    <div className="min-w-0">
                        <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">{title}{badges}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                    </div>
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </header>
            <div className={bodyClassName}>{children}</div>
        </section>
    );
}
