"use client";

import dynamic from 'next/dynamic';

const IPCAAlertForm = dynamic(
    () => import('./IPCAAlertForm').then(mod => mod.IPCAAlertForm),
    {
        loading: () => (
            <div className="rounded-xl border bg-card shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-muted/40 animate-pulse" />
                    <div className="space-y-2 flex-1">
                        <div className="h-4 w-48 bg-muted/30 rounded animate-pulse" />
                        <div className="h-3 w-32 bg-muted/20 rounded animate-pulse" />
                    </div>
                </div>
                <div className="h-10 w-full bg-muted/20 rounded-lg animate-pulse" />
            </div>
        ),
        ssr: false,
    }
);

interface Props {
    indexCode: string;
    lang: string;
}

export function IPCAAlertFormLazy({ indexCode, lang }: Props) {
    return <IPCAAlertForm indexCode={indexCode} lang={lang} />;
}
