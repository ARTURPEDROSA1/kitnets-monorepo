"use client";

/** The tenant sends back the PDF signed on gov.br (POST /api/assinar/[token]). */
import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { MAX_SIGNED_PDF_BYTES } from "@/lib/contract/document";

export default function SignedCopyUpload({ token, required }: { token: string; required: number }) {
    const router = useRouter();
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<{ count: number; complete: boolean } | null>(null);

    const send = async (file: File) => {
        setError(null);
        if (file.size > MAX_SIGNED_PDF_BYTES) return setError("Arquivo grande demais (máximo 4 MB).");
        if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setError("Envie o arquivo PDF que o gov.br baixou.");
        setBusy(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`/api/assinar/${token}`, { method: "POST", body: form });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return setError(json.error || "Não foi possível enviar. Tente novamente.");
            setDone({ count: json.count, complete: !!json.complete });
            router.refresh();
        } catch {
            setError("Erro de conexão. Tente novamente.");
        } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
        }
    };

    if (done) {
        return (
            <p className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {done.complete
                    ? "Recebido! O contrato está assinado por todas as partes."
                    : `Recebido! O contrato tem ${done.count} de ${required} assinaturas; o proprietário vê o envio no Kitnets e cuida das que faltam.`}
            </p>
        );
    }

    return (
        <div className="space-y-2">
            <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void send(f); }} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
                {busy ? "Enviando…" : "Escolher o PDF assinado"}
            </button>
            {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
    );
}
