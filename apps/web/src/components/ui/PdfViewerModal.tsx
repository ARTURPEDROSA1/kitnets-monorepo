"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
    X,
    Download,
    FileText,
    Loader2,
    Share,
    Check,
    Maximize2,
    Minimize2,
} from "lucide-react";

export interface PdfViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    url: string | null;
    title?: string;
    fileName?: string;
}

export function PdfViewerModal({
    isOpen,
    onClose,
    url,
    title = "Visualizador de Documento",
    fileName = "documento.pdf",
}: PdfViewerModalProps) {
    const [loading, setLoading] = useState(true);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [shareSuccess, setShareSuccess] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile on mount
    useEffect(() => {
        if (typeof window !== "undefined") {
            const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
                window.innerWidth < 640;
            setIsMobile(mobile);
        }
    }, [isOpen]);

    // Compute proxy URL
    const proxyUrl = url
        ? url.startsWith("/api/")
            ? url
            : `/api/pdf-proxy?url=${encodeURIComponent(url)}`
        : "";

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isOpen]);

    // Fetch PDF blob → create blob URL for native rendering
    const fetchPdfBlob = useCallback(async (targetUrl: string): Promise<Blob | null> => {
        try {
            const fetchUrl = targetUrl.startsWith("blob:") || targetUrl.startsWith("data:")
                ? targetUrl
                : `/api/pdf-proxy?url=${encodeURIComponent(targetUrl)}`;

            let res = await fetch(fetchUrl);
            if (!res.ok) {
                res = await fetch(targetUrl);
                if (!res.ok) return null;
            }
            const blob = await res.blob();
            setPdfBlob(blob);

            // Create a blob URL — Safari renders blob: PDFs with full native viewer
            const objectUrl = URL.createObjectURL(blob);
            setBlobUrl(objectUrl);

            return blob;
        } catch (err) {
            console.warn("[PdfViewer] Failed to fetch PDF blob:", err);
            return null;
        }
    }, []);

    // Pre-fetch blob when modal opens
    useEffect(() => {
        if (!isOpen || !url) {
            setPdfBlob(null);
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            setBlobUrl(null);
            setLoading(true);
            return;
        }
        fetchPdfBlob(url);

        return () => {
            // Cleanup blob URL on unmount
            setBlobUrl(prev => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, url, fetchPdfBlob]);

    // Direct download
    const handleDownload = async () => {
        try {
            let targetBlob: Blob | null = pdfBlob;
            if (!targetBlob || targetBlob.size === 0) {
                targetBlob = await fetchPdfBlob(url || "");
            }

            if (targetBlob && targetBlob.size > 0) {
                const cleanFileName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
                const downloadUrl = URL.createObjectURL(targetBlob);
                const a = document.createElement("a");
                a.href = downloadUrl;
                a.download = cleanFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
            } else if (url) {
                window.open(url, "_blank");
            }
        } catch (err) {
            console.error("[PdfViewer] Download error:", err);
            if (url) window.open(url, "_blank");
        }
    };

    // Share handler using Web Share API
    const handleShare = async () => {
        const cleanFileName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
        const shareTitle = title || cleanFileName;
        const targetShareUrl = url?.startsWith("http") ? url : `${typeof window !== "undefined" ? window.location.origin : ""}${url}`;

        try {
            let targetBlob: Blob | null = pdfBlob;
            if (!targetBlob || targetBlob.size === 0) {
                targetBlob = await fetchPdfBlob(url || "");
            }

            // Share actual File blob
            if (targetBlob && targetBlob.size > 0) {
                const fileToShare = new File([targetBlob], cleanFileName, {
                    type: "application/pdf",
                    lastModified: Date.now(),
                });

                if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
                    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [fileToShare] })) {
                        await navigator.share({
                            title: shareTitle,
                            files: [fileToShare],
                        });
                        return;
                    }
                }
            }

            // Fallback: Share URL
            if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
                await navigator.share({
                    title: shareTitle,
                    text: shareTitle,
                    url: targetShareUrl,
                });
                return;
            }

            // Fallback: Clipboard copy
            await navigator.clipboard.writeText(targetShareUrl);
            setShareSuccess(true);
            setTimeout(() => setShareSuccess(false), 2500);
        } catch (err: any) {
            if (err?.name !== "AbortError") {
                console.warn("[PdfViewer] Web Share failed, copying to clipboard:", err);
                try {
                    await navigator.clipboard.writeText(targetShareUrl);
                    setShareSuccess(true);
                    setTimeout(() => setShareSuccess(false), 2500);
                } catch {
                    if (url) window.open(targetShareUrl, "_blank");
                }
            }
        }
    };

    if (!isOpen || !url) return null;

    // The URL to render: prefer blob URL (triggers better native rendering), fallback to proxy
    const renderUrl = blobUrl || proxyUrl || url;

    // ═══════════════════════════════════════════════════════════════
    // MOBILE LAYOUT — WhatsApp-style: full-screen, floating buttons
    // ═══════════════════════════════════════════════════════════════
    if (isMobile) {
        return (
            <div
                className="fixed inset-0 z-[100] bg-white flex flex-col"
                role="dialog"
                aria-modal="true"
            >
                {/* Floating top bar — minimal like WhatsApp QuickLook */}
                <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-2 bg-white/90 backdrop-blur-sm border-b border-neutral-200/60">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-sm font-medium text-neutral-800 truncate">
                            {fileName}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200 transition-colors cursor-pointer ml-2 shrink-0"
                        aria-label="Fechar visualizador"
                    >
                        <X className="w-5 h-5 text-neutral-700" />
                    </button>
                </div>

                {/* Clipboard toast */}
                {shareSuccess && (
                    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 pointer-events-none">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Link copiado!</span>
                    </div>
                )}

                {/* Loading spinner */}
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-white">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                        <p className="text-sm font-medium text-neutral-500 mt-3">
                            Carregando documento...
                        </p>
                    </div>
                )}

                {/* PDF iframe — fills entire screen */}
                <iframe
                    src={renderUrl}
                    className="w-full flex-1 border-0"
                    title={title}
                    onLoad={() => setLoading(false)}
                    style={{
                        paddingTop: "44px",    // space for floating top bar
                        paddingBottom: "52px", // space for floating bottom bar
                        backgroundColor: "white",
                    }}
                />

                {/* Floating bottom toolbar — matches WhatsApp QuickLook style */}
                <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-4 px-4 py-3 bg-white/90 backdrop-blur-sm border-t border-neutral-200/60">
                    <button
                        onClick={handleShare}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md transition-colors cursor-pointer"
                        aria-label="Compartilhar"
                    >
                        {shareSuccess ? <Check className="w-4 h-4" /> : <Share className="w-4 h-4" />}
                        <span>{shareSuccess ? "Copiado!" : "Compartilhar"}</span>
                    </button>
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md transition-colors cursor-pointer"
                        aria-label="Baixar"
                    >
                        <Download className="w-4 h-4" />
                        <span>Baixar</span>
                    </button>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // DESKTOP LAYOUT — Modal with header, iframe, footer
    // ═══════════════════════════════════════════════════════════════
    return (
        <div
            className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 overflow-hidden animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
        >
            <div
                className={`bg-card border border-border flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
                    isMaximized
                        ? "w-full h-full rounded-none"
                        : "w-[96vw] md:w-[92vw] lg:w-[86vw] xl:w-[80vw] h-[94vh] rounded-2xl"
                }`}
            >
                {/* Header Toolbar */}
                <header className="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between gap-2 shrink-0 select-none">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0">
                            K
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-foreground truncate max-w-xs md:max-w-md">
                                {title}
                            </h3>
                            <p className="text-[11px] text-muted-foreground truncate">
                                Kitnets.com • Visualização Nativa
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleShare}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            title="Compartilhar fatura"
                            aria-label="Compartilhar fatura"
                        >
                            {shareSuccess ? <Check className="w-3.5 h-3.5" /> : <Share className="w-3.5 h-3.5" />}
                            <span>{shareSuccess ? "Copiado!" : "Compartilhar"}</span>
                        </button>
                        <button
                            onClick={handleDownload}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            title="Baixar PDF"
                            aria-label="Baixar fatura"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Baixar</span>
                        </button>
                        <button
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            title={isMaximized ? "Restaurar tamanho" : "Maximizar"}
                        >
                            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1 cursor-pointer"
                            title="Fechar (Esc)"
                            aria-label="Fechar visualizador"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {/* PDF Viewport */}
                <div className="flex-1 w-full h-full overflow-hidden bg-neutral-100 dark:bg-neutral-900 relative">
                    {shareSuccess && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white border border-border px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 pointer-events-none">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Link copiado para a área de transferência!</span>
                        </div>
                    )}

                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300 mt-3">
                                Carregando documento...
                            </p>
                        </div>
                    )}

                    <iframe
                        src={renderUrl}
                        className="w-full h-full border-0"
                        title={title}
                        onLoad={() => setLoading(false)}
                    />
                </div>

                {/* Footer */}
                <footer className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
                    <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate font-mono">{fileName}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="font-medium text-foreground hover:underline cursor-pointer"
                    >
                        Voltar para o Kitnets
                    </button>
                </footer>
            </div>
        </div>
    );
}
