"use client";

/** A code the tenant pays with (Pix copia e cola, linha digitável) and a button that copies it. */
import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyCode({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // the browser refused the clipboard: the text is selectable anyway
        }
    };
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <div className="mt-1 flex items-start gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-md border border-border/70 bg-muted/30 px-2.5 py-2 font-mono text-xs text-foreground">{value}</code>
                <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground" aria-label={`Copiar ${label}`}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "copiado" : "copiar"}
                </button>
            </div>
        </div>
    );
}
