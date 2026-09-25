"use client";

/**
 * The agency's logo in a light rectangle, never cropped. Editable on the dashboard: click to send
 * a picture (JPG, PNG, WebP or SVG up to 2 MB), a small button removes it. The bucket is public,
 * so `url` is the stored URL and a new one comes back after each upload.
 */
import React, { useRef, useState } from "react";
import Image from "next/image";
import { Building2, Camera, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    agencyId: string;
    url: string | null;
    name: string;
    /** px */
    width?: number;
    height?: number;
    editable?: boolean;
    onChanged?: () => Promise<void> | void;
    className?: string;
    /** the logo route (POST multipart / DELETE); the agencies' one by default — the water utilities share this widget */
    endpoint?: string;
    /** what the confirmation names ("desta imobiliária") */
    subject?: string;
}

export default function AgencyLogo({ agencyId, url, name, width = 160, height = 96, editable = false, onChanged, className, endpoint: endpointProp, subject = "desta imobiliária" }: Props) {
    const endpoint = endpointProp ?? `/api/agencies/${agencyId}/logo`;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);

    const upload = async (file: File) => {
        setBusy(true);
        setError(null);
        try {
            const body = new FormData();
            body.append("file", file);
            const res = await fetch(endpoint, { method: "POST", body });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(typeof json.error === "string" ? json.error : "Não foi possível enviar o logo."); return; }
            await onChanged?.();
        } catch {
            setError("Erro de conexão ao enviar o logo.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!window.confirm(`Remover o logo ${subject}?`)) return;
        setBusy(true);
        setError(null);
        const res = await fetch(endpoint, { method: "DELETE" });
        setBusy(false);
        if (!res.ok) { setError("Não foi possível remover o logo."); return; }
        await onChanged?.();
    };

    return (
        <div className={cn("flex flex-col items-center gap-1", className)}>
            <div className="group relative" style={{ width, height }}>
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2 dark:bg-slate-100">
                    {url ? (
                        <Image src={url} alt={`Logo de ${name}`} width={width} height={height} className="h-full w-full object-contain" unoptimized />
                    ) : (
                        <Building2 className="h-1/2 w-1/2 text-slate-300" />
                    )}
                </div>
                {editable && (
                    <>
                        <button
                            type="button"
                            onClick={() => input.current?.click()}
                            disabled={busy}
                            title={url ? "Trocar o logo" : "Enviar o logo"}
                            aria-label={url ? "Trocar o logo" : "Enviar o logo"}
                            className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 text-white opacity-0 transition-all hover:bg-black/40 hover:opacity-100 focus-visible:bg-black/40 focus-visible:opacity-100 focus-visible:outline-none disabled:opacity-100"
                        >
                            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                        </button>
                        {url && !busy && (
                            <button
                                type="button"
                                onClick={remove}
                                title="Remover o logo"
                                aria-label="Remover o logo"
                                className="absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1.5 text-muted-foreground shadow hover:text-rose-600"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <input
                            ref={input}
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.svg"
                            className="sr-only"
                            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }}
                        />
                    </>
                )}
            </div>
            {editable && !url && !busy && <span className="text-[11px] text-muted-foreground">clique para enviar o logo</span>}
            {error && <span className="text-[11px] text-rose-600">{error}</span>}
        </div>
    );
}
