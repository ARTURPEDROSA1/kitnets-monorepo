"use client";

/**
 * What the owner keeps about an off-plan unit: the contract, the marketing material the developer
 * sent, photos of the site and the floor plans.
 *
 * Receipts are not here. They belong to their payment and are reached from its row in the ledger;
 * listing them again in a gallery only made a wall of PIX screenshots. The bucket is private, so
 * each file arrives with a short-lived signed URL. Pictures open in the lightbox — arrows, zoom,
 * thumbnails, "usar como capa" — and PDFs in the app's document viewer.
 *
 * A picture sent to the wrong section is sorted by the AI on upload (a floor plan under Fotos
 * goes to Plantas, and a notice says so); "mover para" on the file fixes the rest by hand.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { FileText, FolderInput, Image as ImageIcon, Loader2, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { readerLabel } from "@/lib/ai-reader-label";
import { DOCUMENT_KIND_LABELS, type DocumentKind, type InvestmentDocument } from "@/lib/new-investments";
import { INVESTMENT_UPLOAD_ACCEPT, attachInvestmentDocument } from "@/lib/new-investment-upload-client";
import PhotoLightbox, { type LightboxPhoto } from "./PhotoLightbox";

export interface DocumentWithUrl extends InvestmentDocument {
    url: string | null;
}

interface Props {
    investmentId: string;
    documents: DocumentWithUrl[];
    onChanged: () => Promise<void> | void;
    /** Opens a PDF in the app's own viewer — never a new tab. */
    onView: (url: string, name: string) => void;
    /** The object path of the picture on the card, if one was chosen. */
    coverPath: string | null;
    onSetCover: (storagePath: string) => Promise<boolean>;
}

const UPLOADABLE: DocumentKind[] = ["CONTRACT", "MARKETING", "PHOTO", "LAYOUT", "OTHER"];
/** Kinds shown as a grid of pictures and opened in the lightbox. */
const PICTURE_KINDS: DocumentKind[] = ["PHOTO", "LAYOUT"];
const NOTICE_MS = 20_000;

const isImage = (doc: InvestmentDocument) =>
    (doc.mime_type ?? "").startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(doc.storage_path);

function humanSize(bytes: number | null): string {
    if (!bytes || bytes <= 0) return "";
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function InvestmentDocuments({ investmentId, documents, onChanged, onView, coverPath, onSetCover }: Props) {
    const [uploading, setUploading] = useState<DocumentKind | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [moving, setMoving] = useState<string | null>(null);
    /** "«planta.png» foi para Plantas" — what the AI re-sorted on the last upload; leaves on its own. */
    const [notice, setNotice] = useState<string | null>(null);
    /** The lightbox: which kind's pictures, and which one is open. */
    const [lightbox, setLightbox] = useState<{ kind: DocumentKind; index: number } | null>(null);
    const inputs = useRef<Partial<Record<DocumentKind, HTMLInputElement | null>>>({});

    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), NOTICE_MS);
        return () => clearTimeout(timer);
    }, [notice]);

    // Receipts live on their payment row; everything else is the investment's own file.
    const files = useMemo(() => documents.filter(d => d.kind !== "RECEIPT" && !d.payment_id), [documents]);

    const byKind = useMemo(() => {
        const map = new Map<DocumentKind, DocumentWithUrl[]>();
        for (const doc of files) {
            const list = map.get(doc.kind) ?? [];
            list.push(doc);
            map.set(doc.kind, list);
        }
        return map;
    }, [files]);

    /** The pictures of a kind, in grid order, as the lightbox wants them. */
    const picturesOf = (kind: DocumentKind): LightboxPhoto[] =>
        (byKind.get(kind) ?? [])
            .filter(d => isImage(d) && d.url)
            .map(d => ({ id: d.id, url: d.url as string, name: d.file_name ?? "Foto" }));

    const openDocument = (kind: DocumentKind, doc: DocumentWithUrl) => {
        if (!doc.url) return;
        if (isImage(doc)) {
            const index = picturesOf(kind).findIndex(p => p.id === doc.id);
            if (index >= 0) setLightbox({ kind, index });
            return;
        }
        onView(doc.url, doc.file_name ?? "Arquivo");
    };

    const upload = async (kind: DocumentKind, list: File[]) => {
        if (list.length === 0) return;
        setUploading(kind);
        setError(null);
        const moved: string[] = [];
        let reader: string | null = null;
        for (const file of list) {
            const result = await attachInvestmentDocument(investmentId, file, kind);
            if ("error" in result) {
                setError(result.error);
                break;
            }
            if (result.classified) {
                moved.push(`«${file.name}» foi para ${DOCUMENT_KIND_LABELS[result.classified.to]}`);
                reader = readerLabel(result.classified.read_by) ?? reader;
            }
        }
        setUploading(null);
        if (moved.length > 0) {
            setNotice(`${moved.join(" · ")}${reader ? ` — classificado por ${reader}` : ""}. Se não for isso, use “mover para” no arquivo.`);
        }
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

    const move = async (doc: DocumentWithUrl, kind: DocumentKind) => {
        if (kind === doc.kind) return;
        setMoving(doc.id);
        setError(null);
        const res = await fetch(`/api/investments/${investmentId}/documents/${doc.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind }),
        });
        setMoving(null);
        if (!res.ok) {
            setError("Não foi possível mover o arquivo.");
            return;
        }
        await onChanged();
    };

    const lightboxPhotos = lightbox ? picturesOf(lightbox.kind) : [];
    const coverId = coverPath ? (files.find(d => d.storage_path === coverPath)?.id ?? null) : null;

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">Arquivos do projeto</h2>
                    <p className="text-xs text-muted-foreground">
                        Contrato, material de divulgação, fotos e plantas. A IA confere a seção de cada imagem enviada. Os comprovantes ficam em cada pagamento.
                    </p>
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
                                onChange={e => {
                                    // copy the File objects out BEFORE resetting the input: `files` is the
                                    // input's live selection, and clearing the value empties it
                                    const picked = Array.from(e.target.files ?? []);
                                    e.target.value = "";
                                    upload(kind, picked);
                                }}
                            />
                        </React.Fragment>
                    ))}
                </div>
            </header>

            <div className="p-4 space-y-5">
                {notice && (
                    <p
                        role="status"
                        aria-live="polite"
                        className="flex items-start gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300"
                    >
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span className="flex-1">{notice}</span>
                        <button
                            type="button"
                            onClick={() => setNotice(null)}
                            title="Fechar"
                            aria-label="Fechar aviso"
                            className="shrink-0 p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </p>
                )}

                {files.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Nenhum arquivo ainda. Comece pelo contrato — a IA lê o quadro resumo dele.
                    </p>
                )}

                {(Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).map(kind => {
                    const list = byKind.get(kind);
                    if (!list || list.length === 0) return null;
                    const pictures = PICTURE_KINDS.includes(kind);
                    return (
                        <div key={kind} className="space-y-2">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {DOCUMENT_KIND_LABELS[kind]} ({list.length})
                                {kind === "PHOTO" && list.length > 0 && (
                                    <span className="ml-2 normal-case font-normal tracking-normal">
                                        clique para abrir · a estrela marca a capa do card
                                    </span>
                                )}
                            </h3>
                            <ul className={cn("grid gap-2", pictures ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-1 sm:grid-cols-2")}>
                                {list.map(doc => {
                                    const isCover = coverPath !== null && doc.storage_path === coverPath;
                                    const busy = deleting === doc.id || moving === doc.id;
                                    return (
                                        <li key={doc.id} className={cn("group relative rounded-lg border bg-muted/20 overflow-hidden", isCover ? "border-amber-400" : "border-border/70", pictures && !isImage(doc) && "col-span-2")}>
                                            <button
                                                type="button"
                                                onClick={() => openDocument(kind, doc)}
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
                                                <span className="block px-2 py-1 pr-16 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                                                    {formatDateBR(doc.created_at.slice(0, 10))} · {humanSize(doc.size_bytes)}
                                                </span>
                                            </button>
                                            {isCover && (
                                                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950" title="Capa do card">
                                                    <Star className="w-3 h-3 fill-current" /> Capa
                                                </span>
                                            )}
                                            {!isCover && kind === "PHOTO" && isImage(doc) && (
                                                <button
                                                    type="button"
                                                    onClick={() => void onSetCover(doc.storage_path)}
                                                    title="Usar como capa do card"
                                                    aria-label={`Usar ${doc.file_name ?? "foto"} como capa do card`}
                                                    className="absolute left-1 top-1 p-1 rounded bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-amber-500"
                                                >
                                                    <Star className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {/* "mover para": the section picker sits over the footer, shown on hover like the other controls */}
                                            <label
                                                className="absolute bottom-0.5 right-1 inline-flex items-center gap-1 rounded bg-background/90 px-1 py-0.5 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                                                title="Mover para outra seção"
                                            >
                                                {moving === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderInput className="w-3 h-3" />}
                                                <select
                                                    value={doc.kind}
                                                    disabled={busy}
                                                    onChange={e => void move(doc, e.target.value as DocumentKind)}
                                                    aria-label={`Mover ${doc.file_name ?? "arquivo"} para outra seção`}
                                                    className="bg-transparent text-[10px] outline-none cursor-pointer disabled:opacity-50"
                                                >
                                                    {UPLOADABLE.map(k => <option key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</option>)}
                                                </select>
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => remove(doc)}
                                                disabled={busy}
                                                title="Excluir arquivo"
                                                aria-label={`Excluir ${doc.file_name ?? "arquivo"}`}
                                                className="absolute top-1 right-1 p-1 rounded bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-600 disabled:opacity-50"
                                            >
                                                {deleting === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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

            <PhotoLightbox
                photos={lightboxPhotos}
                index={lightbox?.index ?? null}
                onClose={() => setLightbox(null)}
                onNavigate={index => setLightbox(prev => (prev ? { ...prev, index } : prev))}
                coverId={coverId}
                onSetCover={lightbox?.kind === "PHOTO"
                    ? photo => {
                          const doc = files.find(d => d.id === photo.id);
                          return doc ? onSetCover(doc.storage_path) : undefined;
                      }
                    : undefined}
            />
        </section>
    );
}
