"use client";

/**
 * The files of one contract: the signed agreement, addenda, the inspection report, the tenant's
 * documents, the deposit receipt — and the old contracts of the same tenant, kept as history.
 * Pick the type, drop the files. The bucket is private, so each file arrives with a short-lived
 * signed URL; PDFs open in the app's viewer, pictures in the lightbox.
 */
import React, { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { FileText, Image as ImageIcon, Loader2, Star, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { LEASE_UPLOAD_ACCEPT, attachLeaseDocument } from "@/lib/lease-upload-client";
import type { DocumentType, LeaseDocument } from "@/types/lease";
import PhotoLightbox, { type LightboxPhoto } from "@/components/investments/PhotoLightbox";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
    CONTRACT: "Contrato",
    ADDENDUM: "Aditivo",
    INSPECTION: "Laudo de vistoria",
    TENANT_DOC: "Documento do inquilino",
    DEPOSIT_RECEIPT: "Recibo de caução",
    OTHER: "Outro",
};
const TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[];

interface Props {
    leaseId: string;
    documents: LeaseDocument[];
    onChanged: () => Promise<void> | void;
    /** Opens a PDF in the app's own viewer — never a new tab. */
    onView: (url: string, name: string) => void;
}

const isImage = (doc: LeaseDocument) => (doc.mime_type ?? "").startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(doc.file_name);

function humanSize(bytes: number | null): string {
    if (!bytes || bytes <= 0) return "";
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function LeaseDocuments({ leaseId, documents, onChanged, onView }: Props) {
    const [type, setType] = useState<DocumentType>("CONTRACT");
    const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [lightbox, setLightbox] = useState<number | null>(null);
    const input = useRef<HTMLInputElement>(null);

    const byType = useMemo(() => {
        const map = new Map<DocumentType, LeaseDocument[]>();
        for (const doc of documents) {
            const key = (TYPES.includes(doc.document_type) ? doc.document_type : "OTHER") as DocumentType;
            map.set(key, [...(map.get(key) ?? []), doc]);
        }
        return map;
    }, [documents]);

    /** The agreement itself: the oldest CONTRACT file (the one the lease was created from). */
    const mainContractId = useMemo(() => {
        const contracts = [...(byType.get("CONTRACT") ?? [])].sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
        return contracts[0]?.id ?? null;
    }, [byType]);

    const pictures: LightboxPhoto[] = useMemo(
        () => documents.filter(isImage).map(d => ({ id: d.id, url: d.file_url, name: d.file_name })),
        [documents]
    );

    const open = (doc: LeaseDocument) => {
        if (isImage(doc)) {
            const index = pictures.findIndex(p => p.id === doc.id);
            if (index >= 0) setLightbox(index);
            return;
        }
        onView(doc.file_url, doc.file_name);
    };

    const upload = async (files: File[]) => {
        if (files.length === 0) return;
        setError(null);
        setUploading({ done: 0, total: files.length });
        for (let i = 0; i < files.length; i++) {
            const result = await attachLeaseDocument(leaseId, files[i], type);
            if ("error" in result) {
                setError(`${files[i].name}: ${result.error}`);
                break;
            }
            setUploading({ done: i + 1, total: files.length });
        }
        setUploading(null);
        await onChanged();
    };

    const remove = async (doc: LeaseDocument) => {
        if (!window.confirm(`Excluir "${doc.file_name}"? O arquivo será apagado.`)) return;
        setDeleting(doc.id);
        setError(null);
        const res = await fetch(`/api/leases/${leaseId}/documents?doc_id=${doc.id}`, { method: "DELETE" });
        setDeleting(null);
        if (!res.ok) {
            setError("Não foi possível excluir o arquivo.");
            return;
        }
        await onChanged();
    };

    return (
        <section
            className={cn("rounded-xl border bg-card transition-colors", dragging ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20" : "border-border/80")}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setDragging(false); }}
            onDrop={e => {
                e.preventDefault();
                setDragging(false);
                void upload(Array.from(e.dataTransfer.files ?? []));
            }}
        >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">Arquivos do contrato</h2>
                    <p className="text-xs text-muted-foreground">
                        O contrato assinado, aditivos, vistoria, documentos do inquilino e os contratos antigos deste inquilino. PDF, JPG, PNG ou WebP até 10 MB; arraste os arquivos aqui.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Enviar como
                        <select
                            value={type}
                            onChange={e => setType(e.target.value as DocumentType)}
                            className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                            aria-label="Tipo do arquivo"
                        >
                            {TYPES.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
                        </select>
                    </label>
                    <button
                        type="button"
                        onClick={() => input.current?.click()}
                        disabled={uploading !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                    >
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {uploading ? `Enviando ${uploading.done + 1} de ${uploading.total}…` : "Enviar arquivos"}
                    </button>
                    <input
                        ref={input}
                        type="file"
                        multiple
                        accept={LEASE_UPLOAD_ACCEPT}
                        className="sr-only"
                        onChange={e => {
                            // copy the File objects out BEFORE resetting the input: `files` is the input's live selection
                            const picked = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            void upload(picked);
                        }}
                    />
                </div>
            </header>

            <div className="space-y-5 p-4">
                {documents.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Nenhum arquivo ainda. Comece pelo contrato assinado — os contratos anteriores deste inquilino também ficam aqui, como &ldquo;Contrato&rdquo; ou &ldquo;Aditivo&rdquo;.
                    </p>
                )}

                {TYPES.map(kind => {
                    const list = byType.get(kind);
                    if (!list || list.length === 0) return null;
                    return (
                        <div key={kind} className="space-y-2">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {DOCUMENT_TYPE_LABELS[kind]} ({list.length})
                            </h3>
                            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {list.map(doc => {
                                    const image = isImage(doc);
                                    const main = doc.id === mainContractId;
                                    return (
                                        <li key={doc.id} className={cn("group relative overflow-hidden rounded-lg border bg-muted/20", main ? "border-emerald-400" : "border-border/70")}>
                                            <button
                                                type="button"
                                                onClick={() => open(doc)}
                                                className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                                title={`Abrir ${doc.file_name}`}
                                            >
                                                {image ? (
                                                    <span className="relative block h-28 w-full bg-muted">
                                                        <Image src={doc.file_url} alt={doc.file_name} fill sizes="240px" className="object-cover" unoptimized />
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-2 px-3 py-3 text-sm text-foreground">
                                                        <FileText className="h-4 w-4 shrink-0 text-rose-600" />
                                                        <span className="break-words leading-snug">{doc.file_name}</span>
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1 pr-10 text-[10px] tabular-nums text-muted-foreground">
                                                    {main && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 font-semibold text-white" title="O contrato assinado deste registro">
                                                            <Star className="h-3 w-3 fill-current" /> Contrato assinado
                                                        </span>
                                                    )}
                                                    {image && <ImageIcon className="h-3 w-3" />}
                                                    {formatDateBR(doc.uploaded_at)}{humanSize(doc.file_size) ? ` · ${humanSize(doc.file_size)}` : ""}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void remove(doc)}
                                                disabled={deleting === doc.id}
                                                title="Excluir arquivo"
                                                aria-label={`Excluir ${doc.file_name}`}
                                                className="absolute right-1 top-1 rounded bg-background/90 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                                            >
                                                {deleting === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}

                {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>

            <PhotoLightbox photos={pictures} index={lightbox} onClose={() => setLightbox(null)} onNavigate={setLightbox} coverId={null} />
        </section>
    );
}
