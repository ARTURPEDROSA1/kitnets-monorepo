"use client";

/**
 * Everything the owner keeps about an off-plan unit: the contract, the marketing material the
 * developer sent, photos of the site, the floor plans, and every payment receipt.
 *
 * The bucket is private, so each file arrives with a short-lived signed URL. Receipts are listed
 * here too, but they are created from the payment table — deleting one there removes it here.
 */
import React, { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { FileText, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { DOCUMENT_KIND_LABELS, type DocumentKind, type InvestmentDocument } from "@/lib/new-investments";
import { INVESTMENT_UPLOAD_ACCEPT, attachInvestmentDocument } from "@/lib/new-investment-upload-client";

export interface DocumentWithUrl extends InvestmentDocument {
    url: string | null;
}

interface Props {
    investmentId: string;
    documents: DocumentWithUrl[];
    onChanged: () => Promise<void> | void;
    /** Opens the file in the app's own viewer — never a new tab. */
    onView: (url: string, name: string) => void;
}

const UPLOADABLE: DocumentKind[] = ["CONTRACT", "MARKETING", "PHOTO", "LAYOUT", "OTHER"];

const isImage = (doc: InvestmentDocument) =>
    (doc.mime_type ?? "").startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(doc.storage_path);

function humanSize(bytes: number | null): string {
    if (!bytes || bytes <= 0) return "";
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function InvestmentDocuments({ investmentId, documents, onChanged, onView }: Props) {
    const [uploading, setUploading] = useState<DocumentKind | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const inputs = useRef<Partial<Record<DocumentKind, HTMLInputElement | null>>>({});

    const byKind = useMemo(() => {
        const map = new Map<DocumentKind, DocumentWithUrl[]>();
        for (const doc of documents) {
            const list = map.get(doc.kind) ?? [];
            list.push(doc);
            map.set(doc.kind, list);
        }
        return map;
    }, [documents]);

    const upload = async (kind: DocumentKind, files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(kind);
        setError(null);
        for (const file of Array.from(files)) {
            const result = await attachInvestmentDocument(investmentId, file, kind);
            if ("error" in result) {
                setError(result.error);
                break;
            }
        }
        setUploading(null);
        await onChanged();
    };

    const remove = async (doc: DocumentWithUrl) => {
        setDeleting(doc.id);
        setError(null);
        const res = await fetch(`/api/investments/${investmentId}/documents/${doc.id}`, { method: "DELETE" });
        setDeleting(null);
        if (!res.ok) {
            setError("Não foi possível excluir o arquivo.");
            return;
        }
        await onChanged();
    };

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">Arquivos do investimento</h2>
                    <p className="text-xs text-muted-foreground">Contrato, material de divulgação, fotos, plantas e comprovantes.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {UPLOADABLE.map(kind => (
                        <React.Fragment key={kind}>
                            <button
                                type="button"
                                onClick={() => inputs.current[kind]?.click()}
                                disabled={uploading !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:border-emerald-400 disabled:opacity-50"
                            >
                                {uploading === kind ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                {DOCUMENT_KIND_LABELS[kind]}
                            </button>
                            <input
                                ref={el => { inputs.current[kind] = el; }}
                                type="file"
                                multiple={kind === "PHOTO" || kind === "LAYOUT" || kind === "MARKETING"}
                                accept={INVESTMENT_UPLOAD_ACCEPT}
                                className="sr-only"
                                onChange={e => { const files = e.target.files; e.target.value = ""; upload(kind, files); }}
                            />
                        </React.Fragment>
                    ))}
                </div>
            </header>

            <div className="p-4 space-y-5">
                {documents.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Nenhum arquivo ainda. Comece pelo contrato — a IA lê o quadro resumo dele.
                    </p>
                )}

                {(Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).map(kind => {
                    const list = byKind.get(kind);
                    if (!list || list.length === 0) return null;
                    return (
                        <div key={kind} className="space-y-2">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {DOCUMENT_KIND_LABELS[kind]} ({list.length})
                            </h3>
                            <ul className={cn("grid gap-2", kind === "PHOTO" || kind === "LAYOUT" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-1 sm:grid-cols-2")}>
                                {list.map(doc => (
                                    <li key={doc.id} className="group relative rounded-lg border border-border/70 bg-muted/20 overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => { if (doc.url) onView(doc.url, doc.file_name ?? "Arquivo"); }}
                                            disabled={!doc.url}
                                            className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed"
                                            title={doc.url ? `Abrir ${doc.file_name ?? "arquivo"}` : "Arquivo indisponível"}
                                        >
                                            {isImage(doc) && doc.url ? (
                                                <span className="relative block h-28 w-full bg-muted">
                                                    <Image src={doc.url} alt={doc.file_name ?? "Arquivo"} fill sizes="200px" className="object-cover" unoptimized />
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-2 px-3 py-3 text-sm text-foreground">
                                                    {isImage(doc) ? <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" /> : <FileText className="w-4 h-4 text-rose-600 shrink-0" />}
                                                    <span className="line-clamp-1">{doc.file_name ?? "Arquivo"}</span>
                                                </span>
                                            )}
                                            <span className="block px-2 py-1 text-[10px] text-muted-foreground tabular-nums">
                                                {formatDateBR(doc.created_at.slice(0, 10))} {humanSize(doc.size_bytes)}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => remove(doc)}
                                            disabled={deleting === doc.id}
                                            title="Excluir arquivo"
                                            aria-label={`Excluir ${doc.file_name ?? "arquivo"}`}
                                            className="absolute top-1 right-1 p-1 rounded bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-600 disabled:opacity-50"
                                        >
                                            {deleting === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}

                {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>
        </section>
    );
}
