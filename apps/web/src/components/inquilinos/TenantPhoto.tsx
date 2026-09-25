"use client";

/**
 * The tenant's photo as a round avatar. Editable on the dashboard: click to send a picture (JPG,
 * PNG or WebP up to 2 MB), a small button removes it. The bucket is private: `url` is the signed
 * URL the loaders hand out, and a fresh one comes back after each upload.
 */
import React, { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    tenantId: string;
    url: string | null;
    name: string;
    /** px */
    size?: number;
    editable?: boolean;
    onChanged?: () => Promise<void> | void;
    className?: string;
}

export default function TenantPhoto({ tenantId, url, name, size = 96, editable = false, onChanged, className }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);

    const upload = async (file: File) => {
        setBusy(true);
        setError(null);
        try {
            const body = new FormData();
            body.append("file", file);
            const res = await fetch(`/api/tenants/${tenantId}/photo`, { method: "POST", body });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(typeof json.error === "string" ? json.error : "Não foi possível enviar a foto."); return; }
            await onChanged?.();
        } catch {
            setError("Erro de conexão ao enviar a foto.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!window.confirm("Remover a foto deste inquilino?")) return;
        setBusy(true);
        setError(null);
        const res = await fetch(`/api/tenants/${tenantId}/photo`, { method: "DELETE" });
        setBusy(false);
        if (!res.ok) { setError("Não foi possível remover a foto."); return; }
        await onChanged?.();
    };

    return (
        <div className={cn("flex flex-col items-center gap-1", className)}>
            <div className="group relative" style={{ width: size, height: size }}>
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-border bg-muted">
                    {url ? (
                        <Image src={url} alt={`Foto de ${name}`} width={size} height={size} className="h-full w-full object-cover" unoptimized />
                    ) : (
                        <User className="h-1/2 w-1/2 text-muted-foreground/60" />
                    )}
                </div>
                {editable && (
                    <>
                        <button
                            type="button"
                            onClick={() => input.current?.click()}
                            disabled={busy}
                            title={url ? "Trocar a foto" : "Enviar uma foto"}
                            aria-label={url ? "Trocar a foto" : "Enviar uma foto"}
                            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-all hover:bg-black/40 hover:opacity-100 focus-visible:bg-black/40 focus-visible:opacity-100 focus-visible:outline-none disabled:opacity-100"
                        >
                            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                        </button>
                        {url && !busy && (
                            <button
                                type="button"
                                onClick={remove}
                                title="Remover a foto"
                                aria-label="Remover a foto"
                                className="absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1.5 text-muted-foreground shadow hover:text-rose-600"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <input
                            ref={input}
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp"
                            className="sr-only"
                            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }}
                        />
                    </>
                )}
            </div>
            {editable && !url && !busy && <span className="text-[11px] text-muted-foreground">clique para enviar a foto</span>}
            {error && <span className="text-[11px] text-rose-600">{error}</span>}
        </div>
    );
}
