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
    const [shareSuccess, setShareSuccess] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);

    // Compute proxy URL — Safari renders PDFs natively in iframes
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

    // Fetch PDF blob for Share and Download (not for rendering — iframe handles that)
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
            return blob;
        } catch (err) {
            console.warn("[PdfViewer] Failed to fetch PDF blob:", err);
            return null;
        }
    }, []);

    // Pre-fetch blob when modal opens (for Share/Download)
    useEffect(() => {
        if (!isOpen || !url) {
            setPdfBlob(null);
            setLoading(true);
            return;
        }
        fetchPdfBlob(url);
    }, [isOpen, url, fetchPdfBlob]);

    // Direct download without leaving the application
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

    // Share handler using Web Share API (native share sheet on iOS/Android/Desktop Chrome)
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

            // Fallback: Share URL via native share sheet
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

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
        >
            {/* Modal Container */}
            <div
                className={`bg-card border border-border flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
                    isMaximized
                        ? "w-full h-full rounded-none"
                        : "w-full sm:w-[96vw] md:w-[92vw] lg:w-[86vw] xl:w-[80vw] h-[100dvh] sm:h-[94vh] sm:rounded-2xl"
                }`}
            >
                {/* Header Toolbar */}
                <header className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-border bg-muted/40 flex items-center justify-between gap-2 shrink-0 select-none">
                    {/* Left: Branding & Title */}
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0">
                            K
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-sm font-bold text-foreground truncate max-w-[140px] xs:max-w-[190px] sm:max-w-xs md:max-w-md">
                                {title}
                            </h3>
                            <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate hidden xs:block">
                                Kitnets.com • Visualização Nativa
                            </p>
                        </div>
                    </div>

                    {/* Right: Actions & Close */}
                    <div className="flex items-center gap-1 sm:gap-1.5">
                        {/* Share button (native sharing to Google Drive, WhatsApp, etc.) */}
                        <button
                            onClick={handleShare}
                            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            title="Compartilhar fatura (Google Drive, WhatsApp, etc.)"
                            aria-label="Compartilhar fatura"
                        >
                            {shareSuccess ? <Check className="w-3.5 h-3.5" /> : <Share className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{shareSuccess ? "Copiado!" : "Compartilhar"}</span>
                        </button>

                        {/* Download button */}
                        <button
                            onClick={handleDownload}
                            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            title="Baixar PDF para o dispositivo"
                            aria-label="Baixar fatura"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Baixar</span>
                        </button>

                        {/* Maximize / Minimize (Desktop only) */}
                        <button
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden md:inline-flex cursor-pointer"
                            title={isMaximized ? "Restaurar tamanho" : "Maximizar"}
                        >
                            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>

                        {/* Close button */}
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

                {/* Document Viewport — Native iframe rendering (Safari QuickLook) */}
                <div className="flex-1 w-full h-full overflow-hidden bg-neutral-100 dark:bg-neutral-900 relative">
                    {shareSuccess && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white border border-border px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 pointer-events-none">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Link copiado para a área de transferência!</span>
                        </div>
                    )}

                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-3 z-10">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                                Carregando documento...
                            </p>
                        </div>
                    )}

                    <iframe
                        src={proxyUrl || url}
                        className="w-full h-full border-0"
                        title={title}
                        onLoad={() => setLoading(false)}
                        style={{
                            // Ensure the iframe fills the full viewport area
                            minHeight: "100%",
                        }}
                    />
                </div>

                {/* Footer Bar */}
                <footer className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
                    <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate font-mono">{fileName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="font-medium text-foreground hover:underline cursor-pointer"
                        >
                            Voltar para o Kitnets
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
