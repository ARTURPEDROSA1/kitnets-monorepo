"use client";

/**
 * "Adicionar imobiliária": drop a lease agreement or a service agreement and the AI reads the
 * agency's registration (name, CNPJ, CRECI, address, responsável, fee, term) and its logo from the
 * document header (`POST /api/agencies/extract`); the form then opens filled in, with the document
 * attached as the service agreement. Or type it all by hand.
 */
import React, { useRef, useState } from "react";
import { AlertTriangle, Edit3, FileText, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { formatCEP, formatCNPJ, formatPhone, parseCEP, parseCNPJ } from "@/lib/validators";
import { emptyAgencyForm, type AgencyPrefill } from "./AgencyForm";

interface Props {
    onClose: () => void;
    onManual: () => void;
    onExtracted: (prefill: AgencyPrefill) => void;
}

const ALLOWED = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];

/** Crops the logo the vision model located (a normalized [ymin, xmin, ymax, xmax] box, 0–1000) out of an uploaded image. */
function cropLogoFromImage(imageFile: File, box: [number, number, number, number]): Promise<File | null> {
    return new Promise(resolve => {
        const img = new window.Image();
        const url = URL.createObjectURL(imageFile);
        const done = (file: File | null) => { URL.revokeObjectURL(url); resolve(file); };
        img.onload = () => {
            try {
                const [ymin, xmin, ymax, xmax] = box;
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                const sx = Math.max(0, (xmin / 1000) * w);
                const sy = Math.max(0, (ymin / 1000) * h);
                const sw = Math.min(w - sx, ((xmax - xmin) / 1000) * w);
                const sh = Math.min(h - sy, ((ymax - ymin) / 1000) * h);
                if (sw <= 20 || sh <= 20) return done(null);
                const canvas = document.createElement("canvas");
                canvas.width = sw;
                canvas.height = sh;
                const ctx = canvas.getContext("2d");
                if (!ctx) return done(null);
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                canvas.toBlob(blob => done(blob ? new File([blob], "logo-contrato.png", { type: "image/png" }) : null), "image/png");
            } catch {
                done(null);
            }
        };
        img.onerror = () => done(null);
        img.src = url;
    });
}

export default function AgencyAddModal({ onClose, onManual, onExtracted }: Props) {
    const [extracting, setExtracting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        if (!ALLOWED.includes(file.type)) { setError("Formato de arquivo não suportado. Use PDF, JPG, PNG ou WebP."); return; }
        if (file.size > 10 * 1024 * 1024) { setError("Arquivo muito grande. O limite máximo é 10MB."); return; }
        setExtracting(true);
        setError(null);
        try {
            const body = new FormData();
            body.append("file", file);
            const res = await fetch("/api/agencies/extract", { method: "POST", body });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(json.error || "Não foi possível extrair os dados. Tente outro arquivo ou digite manualmente."); return; }
            const data = json.data as Record<string, unknown>;
            const str = (v: unknown) => (v == null ? "" : String(v));

            const rawCnpj = data.cnpj ? parseCNPJ(str(data.cnpj)) : "";
            const rawCep = data.postal_code ? parseCEP(str(data.postal_code)) : "";
            const form = {
                ...emptyAgencyForm(),
                name: str(data.name),
                trade_name: str(data.trade_name),
                cnpj: rawCnpj.length === 14 ? formatCNPJ(rawCnpj) : str(data.cnpj),
                creci_number: str(data.creci_number),
                creci_state: str(data.creci_state).toUpperCase(),
                creci_type: str(data.creci_type).toUpperCase(),
                owner_name: str(data.owner_name),
                main_phone: data.main_phone ? formatPhone(str(data.main_phone)) : "",
                additional_phone: data.additional_phone ? formatPhone(str(data.additional_phone)) : "",
                main_phone_whatsapp: true,
                email: str(data.email),
                website: str(data.website).replace(/^https?:\/\//, ""),
                postal_code: rawCep.length === 8 ? formatCEP(rawCep) : str(data.postal_code),
                street: str(data.street),
                street_number: str(data.street_number),
                address_complement: str(data.address_complement),
                neighborhood: str(data.neighborhood),
                city: str(data.city),
                state: str(data.state).toUpperCase(),
                description: str(data.contract_notes),
                service_agreement_filename: file.name,
                management_fee: data.management_fee != null ? str(data.management_fee) : "",
                agreement_start_date: str(data.agreement_start_date),
                agreement_end_date: str(data.agreement_end_date),
            };

            // The logo: the server pulls it out of a PDF; for an image upload the model's box is cropped here
            let logoFile: File | null = null;
            let logoPreview: string | null = null;
            if (typeof data.logo_base64 === "string") {
                try {
                    const blob = await fetch(data.logo_base64).then(r => r.blob());
                    logoFile = new File([blob], "logo-extraido.png", { type: "image/png" });
                } catch { /* the preview still shows it */ }
                logoPreview = data.logo_base64;
            } else if (Array.isArray(data.logo_box_2d) && data.logo_box_2d.length === 4 && file.type.startsWith("image/")) {
                logoFile = await cropLogoFromImage(file, data.logo_box_2d as [number, number, number, number]).catch(() => null);
                logoPreview = logoFile ? URL.createObjectURL(logoFile) : null;
            }

            onExtracted({ form, logoFile, logoPreview, agreementFile: file, aiExtracted: true });
        } catch {
            setError("Erro de conexão ao processar documento. Verifique sua internet ou digite manualmente.");
        } finally {
            setExtracting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !extracting && onClose()} />
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-7">
                {!extracting && (
                    <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Fechar modal">
                        <X className="h-5 w-5" />
                    </button>
                )}
                <div className="mb-5 flex items-start gap-3.5">
                    <div className="shrink-0 rounded-xl bg-amber-100 p-2.5 text-amber-600 dark:bg-amber-900/40"><Sparkles className="h-6 w-6" /></div>
                    <div className="space-y-1 pr-6">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Adicionar imobiliária</h2>
                        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                            Envie um <strong className="text-foreground">contrato de locação</strong> ou de <strong className="text-foreground">prestação de serviços</strong>: a IA lê os dados da imobiliária e o logo do cabeçalho e preenche o cadastro. Ou digite manualmente.
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 sm:text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="flex-1 leading-snug">{error}</div>
                    </div>
                )}

                {extracting ? (
                    <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-8 text-center dark:bg-amber-950/20">
                        <div className="relative">
                            <div className="h-14 w-14 animate-spin rounded-full border-4 border-amber-500/20 border-t-amber-600" />
                            <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-amber-600" />
                        </div>
                        <div className="max-w-sm space-y-1">
                            <p className="text-sm font-semibold text-foreground">Analisando o documento com IA...</p>
                            <p className="text-xs text-muted-foreground">Localizando administradora, CNPJ, CRECI, endereço, responsável legal e logo</p>
                        </div>
                    </div>
                ) : (
                    <div
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={e => { e.preventDefault(); setDragging(false); }}
                        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
                        onClick={() => input.current?.click()}
                        className={cn("group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 sm:p-8", dragging ? "scale-[1.01] border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/60 hover:bg-muted/30")}
                    >
                        <input ref={input} type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleFile(f); }} className="hidden" />
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200/60 bg-amber-50 text-amber-600 transition-transform group-hover:scale-105 dark:border-amber-800/40 dark:bg-amber-950/40"><Upload className="h-6 w-6" /></div>
                        <p className="mb-1 text-sm font-semibold text-foreground">Arraste o documento aqui ou <span className="text-amber-600 underline underline-offset-2">clique para selecionar</span></p>
                        <p className="mb-3 text-xs text-muted-foreground">PDF, PNG, JPG ou WebP (máx. 10MB)</p>
                        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/80 px-2.5 py-1"><FileText className="h-3 w-3 text-amber-600" /> Contrato de Locação</span>
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/80 px-2.5 py-1"><FileText className="h-3 w-3 text-amber-600" /> Prestação de Serviços</span>
                        </div>
                    </div>
                )}

                <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-border/80 pt-5 sm:flex-row">
                    <span className="text-center text-xs text-muted-foreground sm:text-left">Prefere não enviar um documento agora?</span>
                    <Button type="button" variant="outline" onClick={onManual} disabled={extracting} className="w-full gap-2 text-xs font-medium hover:border-amber-500/60 hover:text-amber-600 sm:w-auto">
                        <Edit3 className="h-3.5 w-3.5" /> Digitar manualmente
                    </Button>
                </div>
            </div>
        </div>
    );
}
