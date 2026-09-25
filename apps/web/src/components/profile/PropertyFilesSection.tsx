"use client";

/**
 * "Arquivos do imóvel" — the property's documents, photos and videos in one flat section, the way
 * the projects keep theirs: one upload button per kind, then every kind's files grouped under its
 * label. Documents open in the app's viewer (signed URL from the private bucket), photos in the
 * lightbox with "usar como capa", videos in a small player. Nothing is hidden behind folders.
 */
import React, { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, FileText, Image as ImageIcon, Loader2, Play, Star, Trash2, Upload, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import PhotoLightbox, { type LightboxPhoto } from "@/components/investments/PhotoLightbox";
import { DOCUMENT_CATEGORIES, formatDocumentDisplayName, formatFileSize, getProofCategory, getProofYear, type DocCategory } from "@/components/profile/PropertyDocumentsCard";
import type { ProofData } from "@/app/[lang]/profile/ProfileContent";

export const MAX_PROPERTY_PHOTOS = 10;
export const MAX_PROPERTY_VIDEOS = 2;

interface Props {
    proofs: ProofData[];
    /** files picked before the property had a row: still to be sent */
    pendingFiles: File[];
    fileAnalysisStatus: Record<string, string>;
    photos: string[];
    pendingPhotos: File[];
    videos: string[];
    pendingVideos: File[];
    /** the picture on the property's card */
    coverUrl: string | null;
    onUploadDocuments: (files: File[], category: DocCategory) => Promise<void>;
    onRemoveProof: (proofId: string) => Promise<void>;
    onRemovePendingFile: (index: number) => void;
    onUploadPhotos: (files: File[]) => Promise<void>;
    onRemovePhoto: (url: string) => Promise<void> | void;
    onRemovePendingPhoto: (index: number) => void;
    onSetCover: (url: string) => void;
    onUploadVideos: (files: File[]) => Promise<void>;
    onRemoveVideo: (url: string) => Promise<void> | void;
    onRemovePendingVideo: (index: number) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabase: () => Promise<any>;
}

type UploadKind = DocCategory | "photos" | "videos";

interface DocItem {
    id: string;
    name: string;
    category: DocCategory;
    year: number;
    size?: number;
    createdAt: string;
    status: "saved" | "pending" | "analyzing" | "success" | "error";
    path?: string;
    file?: File;
    proofId?: string;
    pendingIndex?: number;
}

const isImageName = (name: string) => /\.(jpe?g|png|webp|gif)$/i.test(name);
const btn = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:border-emerald-400 disabled:opacity-50";

/** Object URLs of files not yet sent, freed when they leave. */
function ObjectPreview({ file, kind, onRemove }: { file: File; kind: "photo" | "video"; onRemove: () => void }) {
    const url = useMemo(() => URL.createObjectURL(file), [file]);
    React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
    return (
        <li className="group relative aspect-square overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
            {kind === "photo" ? <Image src={url} alt={file.name} fill sizes="200px" className="object-cover" unoptimized /> : <video src={url} muted className="h-full w-full object-cover" />}
            <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">pendente · salva ao gravar</span>
            <button type="button" onClick={onRemove} title="Remover" aria-label={`Remover ${file.name}`} className="absolute right-1 top-1 rounded bg-background/90 p-1 text-muted-foreground opacity-0 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </li>
    );
}

export default function PropertyFilesSection({ proofs, pendingFiles, fileAnalysisStatus, photos, pendingPhotos, videos, pendingVideos, coverUrl, onUploadDocuments, onRemoveProof, onRemovePendingFile, onUploadPhotos, onRemovePhoto, onRemovePendingPhoto, onSetCover, onUploadVideos, onRemoveVideo, onRemovePendingVideo, getSupabase }: Props) {
    const [uploading, setUploading] = useState<UploadKind | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewer, setViewer] = useState<{ url: string; title: string; fileName: string } | null>(null);
    const [docLightbox, setDocLightbox] = useState<{ photos: LightboxPhoto[]; index: number } | null>(null);
    const [photoIndex, setPhotoIndex] = useState<number | null>(null);
    const [video, setVideo] = useState<string | null>(null);
    const inputs = useRef<Partial<Record<UploadKind, HTMLInputElement | null>>>({});

    const docs = useMemo<DocItem[]>(() => [
        ...proofs.filter(Boolean).map(p => ({
            id: `saved-${p.id}`, name: formatDocumentDisplayName(p.original_name), category: getProofCategory(p.original_name, p.document_type), year: getProofYear(p.original_name, p.created_at, p.year),
            size: p.file_size, createdAt: p.created_at, status: "saved" as const, path: p.file_url, proofId: p.id,
        })),
        ...pendingFiles.map((f, i) => {
            const a = fileAnalysisStatus[f.name];
            return {
                id: `pending-${f.name}-${i}`, name: formatDocumentDisplayName(f.name), category: getProofCategory(f.name), year: getProofYear(f.name),
                size: f.size, createdAt: new Date(f.lastModified || Date.now()).toISOString(), status: (a === "analyzing" || a === "success" || a === "error" ? a : "pending") as DocItem["status"], file: f, pendingIndex: i,
            };
        }),
    ], [proofs, pendingFiles, fileAnalysisStatus]);

    const byCategory = useMemo(() => {
        const map = new Map<DocCategory, DocItem[]>();
        for (const d of docs) map.set(d.category, [...(map.get(d.category) ?? []), d]);
        return map;
    }, [docs]);

    const coverEffective = coverUrl && photos.includes(coverUrl) ? coverUrl : photos[0] ?? null;
    const lightboxPhotos: LightboxPhoto[] = photos.map((url, i) => ({ id: url, url, name: `Foto ${i + 1}` }));
    const total = docs.length + photos.length + pendingPhotos.length + videos.length + pendingVideos.length;

    const pick = async (kind: UploadKind, list: File[]) => {
        if (list.length === 0) return;
        setUploading(kind);
        setError(null);
        try {
            if (kind === "photos") await onUploadPhotos(list);
            else if (kind === "videos") await onUploadVideos(list);
            else await onUploadDocuments(list, kind);
        } catch {
            setError("Não foi possível enviar o arquivo.");
        } finally {
            setUploading(null);
        }
    };

    const openDocument = async (doc: DocItem) => {
        let url: string | null = null;
        if (doc.file) url = URL.createObjectURL(doc.file);
        else if (doc.path?.startsWith("http")) url = doc.path;
        else if (doc.path) {
            try {
                const sb = await getSupabase();
                const { data } = await sb.storage.from("documents").createSignedUrl(doc.path, 3600);
                url = data?.signedUrl ?? null;
            } catch { url = null; }
        }
        if (!url) { setError("Não foi possível abrir o arquivo."); return; }
        if (isImageName(doc.name)) { setDocLightbox({ photos: [{ id: doc.id, url, name: doc.name }], index: 0 }); return; }
        setViewer({ url, title: doc.name, fileName: doc.name.toLowerCase().endsWith(".pdf") ? doc.name : `${doc.name}.pdf` });
    };

    const removeDoc = async (doc: DocItem) => {
        if (!window.confirm(`Remover “${doc.name}”?`)) return;
        setBusy(doc.id);
        try {
            if (doc.proofId) await onRemoveProof(doc.proofId);
            else if (typeof doc.pendingIndex === "number") onRemovePendingFile(doc.pendingIndex);
        } finally {
            setBusy(null);
        }
    };

    const removePhoto = async (url: string) => {
        if (!window.confirm("Remover esta foto?")) return;
        setBusy(url);
        try { await onRemovePhoto(url); } finally { setBusy(null); }
    };
    const removeVideo = async (url: string) => {
        if (!window.confirm("Remover este vídeo?")) return;
        setBusy(url);
        try { await onRemoveVideo(url); } finally { setBusy(null); }
    };

    const uploadButton = (kind: UploadKind, label: string, opts: { multiple?: boolean; accept: string; disabled?: boolean; title?: string; icon?: React.ReactNode }) => (
        <React.Fragment key={kind}>
            <button type="button" onClick={() => inputs.current[kind]?.click()} disabled={uploading !== null || opts.disabled} title={opts.title} className={btn}>
                {uploading === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (opts.icon ?? <Upload className="h-3.5 w-3.5" />)}
                {label}
            </button>
            <input
                ref={el => { inputs.current[kind] = el; }}
                type="file"
                multiple={opts.multiple}
                accept={opts.accept}
                className="sr-only"
                onChange={e => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; void pick(kind, picked); }}
            />
        </React.Fragment>
    );

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">Arquivos do imóvel</h2>
                    <p className="text-xs text-muted-foreground">
                        Documentos (IPTU, matrícula, escritura, certidões…), fotos e vídeos. A estrela marca a foto do card; os contratos de locação ficam em Contratos.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {DOCUMENT_CATEGORIES.map(c => uploadButton(c.id, c.label, { multiple: true, accept: "application/pdf,image/jpeg,image/png,image/webp", title: c.description }))}
                    {uploadButton("photos", `Fotos ${photos.length + pendingPhotos.length}/${MAX_PROPERTY_PHOTOS}`, { multiple: true, accept: "image/*", disabled: photos.length + pendingPhotos.length >= MAX_PROPERTY_PHOTOS, icon: <Camera className="h-3.5 w-3.5" />, title: "Fotos do imóvel (até 10)" })}
                    {uploadButton("videos", `Vídeos ${videos.length + pendingVideos.length}/${MAX_PROPERTY_VIDEOS}`, { accept: "video/*", disabled: videos.length + pendingVideos.length >= MAX_PROPERTY_VIDEOS, icon: <Video className="h-3.5 w-3.5" />, title: "Vídeos do imóvel (até 2)" })}
                </div>
            </header>

            <div className="space-y-5 p-4">
                {total === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">Nenhum arquivo ainda. Comece pelo IPTU ou pela matrícula — a IA lê o endereço deles — e por algumas fotos: imóveis com 5 fotos recebem 4x mais visualizações.</p>
                )}

                {DOCUMENT_CATEGORIES.map(c => {
                    const list = byCategory.get(c.id);
                    if (!list || list.length === 0) return null;
                    return (
                        <div key={c.id} className="space-y-2">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label} ({list.length})</h3>
                            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {list.map(doc => (
                                    <li key={doc.id} className="group relative overflow-hidden rounded-lg border border-border/70 bg-muted/20">
                                        <button type="button" onClick={() => void openDocument(doc)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title={`Abrir ${doc.name}`}>
                                            <span className="flex items-center gap-2 px-3 py-3 text-sm text-foreground">
                                                {isImageName(doc.name) ? <ImageIcon className="h-4 w-4 shrink-0 text-blue-600" /> : <FileText className="h-4 w-4 shrink-0 text-rose-600" />}
                                                <span className="line-clamp-1 break-all">{doc.name}</span>
                                            </span>
                                            <span className="block px-3 pb-2 text-[10px] tabular-nums text-muted-foreground">
                                                {formatDateBR(doc.createdAt.slice(0, 10))}{doc.size ? ` · ${formatFileSize(doc.size)}` : ""}{c.id === "iptu" ? ` · ${doc.year}` : ""}
                                                {doc.status === "analyzing" && <span className="ml-2 text-amber-600">lendo…</span>}
                                                {doc.status === "pending" && <span className="ml-2 text-amber-600">pendente</span>}
                                            </span>
                                        </button>
                                        <button type="button" onClick={() => void removeDoc(doc)} disabled={busy === doc.id} title="Excluir arquivo" aria-label={`Excluir ${doc.name}`} className="absolute right-1 top-1 rounded bg-background/90 p-1 text-muted-foreground opacity-0 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50">
                                            {busy === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}

                {(photos.length > 0 || pendingPhotos.length > 0) && (
                    <div className="space-y-2">
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Fotos ({photos.length + pendingPhotos.length}) <span className="ml-2 font-normal normal-case tracking-normal">clique para abrir · a estrela marca a foto do card</span>
                        </h3>
                        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                            {photos.map((url, i) => {
                                const isCover = url === coverEffective;
                                return (
                                    <li key={url} className={cn("group relative aspect-square overflow-hidden rounded-lg border bg-muted/20", isCover ? "border-amber-400" : "border-border/70")}>
                                        <button type="button" onClick={() => setPhotoIndex(i)} className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title="Abrir a galeria">
                                            <Image src={url} alt={`Foto ${i + 1}`} fill sizes="200px" className="object-cover" unoptimized />
                                        </button>
                                        {isCover ? (
                                            <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950" title="Foto do card"><Star className="h-3 w-3 fill-current" /> Capa</span>
                                        ) : (
                                            <button type="button" onClick={() => onSetCover(url)} title="Usar como foto do card" aria-label={`Usar a foto ${i + 1} como capa`} className="absolute left-1 top-1 rounded bg-background/90 p-1 text-muted-foreground opacity-0 hover:text-amber-500 focus-visible:opacity-100 group-hover:opacity-100"><Star className="h-3.5 w-3.5" /></button>
                                        )}
                                        <button type="button" onClick={() => void removePhoto(url)} disabled={busy === url} title="Excluir foto" aria-label={`Excluir a foto ${i + 1}`} className="absolute right-1 top-1 rounded bg-background/90 p-1 text-muted-foreground opacity-0 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50">
                                            {busy === url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        </button>
                                    </li>
                                );
                            })}
                            {pendingPhotos.map((f, i) => <ObjectPreview key={`pp-${i}-${f.name}`} file={f} kind="photo" onRemove={() => onRemovePendingPhoto(i)} />)}
                        </ul>
                    </div>
                )}

                {(videos.length > 0 || pendingVideos.length > 0) && (
                    <div className="space-y-2">
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vídeos ({videos.length + pendingVideos.length})</h3>
                        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                            {videos.map((url, i) => (
                                <li key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-black/80">
                                    <button type="button" onClick={() => setVideo(url)} className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title="Assistir">
                                        <video src={url} muted preload="metadata" className="h-full w-full object-cover opacity-80" />
                                        <span className="absolute inset-0 flex items-center justify-center text-white"><Play className="h-8 w-8 drop-shadow" /></span>
                                    </button>
                                    <button type="button" onClick={() => void removeVideo(url)} disabled={busy === url} title="Excluir vídeo" aria-label={`Excluir o vídeo ${i + 1}`} className="absolute right-1 top-1 rounded bg-background/90 p-1 text-muted-foreground opacity-0 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50">
                                        {busy === url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                </li>
                            ))}
                            {pendingVideos.map((f, i) => <ObjectPreview key={`pv-${i}-${f.name}`} file={f} kind="video" onRemove={() => onRemovePendingVideo(i)} />)}
                        </ul>
                    </div>
                )}

                {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>

            <PhotoLightbox
                photos={lightboxPhotos}
                index={photoIndex}
                onClose={() => setPhotoIndex(null)}
                onNavigate={setPhotoIndex}
                coverId={coverEffective}
                onSetCover={photo => { onSetCover(photo.url); }}
            />
            <PhotoLightbox photos={docLightbox?.photos ?? []} index={docLightbox?.index ?? null} onClose={() => setDocLightbox(null)} onNavigate={() => {}} />
            {viewer && <PdfViewerModal isOpen onClose={() => setViewer(null)} url={viewer.url} title={viewer.title} fileName={viewer.fileName} />}
            {video && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setVideo(null)}>
                    <button type="button" onClick={() => setVideo(null)} className="absolute right-4 top-4 rounded-lg bg-background/20 p-2 text-white hover:bg-background/40" aria-label="Fechar"><X className="h-5 w-5" /></button>
                    <video src={video} controls autoPlay className="max-h-[85vh] max-w-full rounded-xl" onClick={e => e.stopPropagation()} />
                </div>
            )}
        </section>
    );
}
