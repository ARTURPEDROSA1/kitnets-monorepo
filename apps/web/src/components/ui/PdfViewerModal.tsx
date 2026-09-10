"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
    X,
    ZoomIn,
    ZoomOut,
    Download,
    Printer,
    Maximize2,
    Minimize2,
    RotateCw,
    FileText,
    Loader2,
    RefreshCw,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    Share,
    Check,
} from "lucide-react";

export interface PdfViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    url: string | null;
    title?: string;
    fileName?: string;
}

interface RenderedPage {
    pageNumber: number;
    canvas: HTMLCanvasElement;
}

export function PdfViewerModal({
    isOpen,
    onClose,
    url,
    title = "Visualizador de Documento",
    fileName = "documento.pdf",
}: PdfViewerModalProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.1);
    const [rotation, setRotation] = useState<number>(0);
    const [isMaximized, setIsMaximized] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<"canvas" | "iframe">("canvas");
    const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfDocRef = useRef<any>(null);

    // Compute proxy URL for iframe fallback or same-origin safety
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

    // Fetch PDF data
    const fetchPdfData = useCallback(async (targetUrl: string) => {
        setLoading(true);
        setError(null);
        try {
            // First attempt: fetch via proxy or directly
            const fetchUrl = targetUrl.startsWith("blob:") || targetUrl.startsWith("data:")
                ? targetUrl
                : `/api/pdf-proxy?url=${encodeURIComponent(targetUrl)}`;

            const res = await fetch(fetchUrl);
            if (!res.ok) {
                // Fallback attempt: try direct targetUrl if proxy failed
                const fallbackRes = await fetch(targetUrl);
                if (!fallbackRes.ok) {
                    throw new Error(`Falha ao carregar documento (Status ${res.status})`);
                }
                const buf = await fallbackRes.arrayBuffer();
                setPdfData(buf);
                return buf;
            }
            const buf = await res.arrayBuffer();
            setPdfData(buf);
            return buf;
        } catch (err: any) {
            console.warn("[PdfViewer] Failed to fetch raw PDF buffer, falling back to iframe:", err);
            setViewMode("iframe");
            setLoading(false);
            return null;
        }
    }, []);

    // Load PDF using PDF.js
    useEffect(() => {
        if (!isOpen || !url) {
            setPdfData(null);
            pdfDocRef.current = null;
            setNumPages(0);
            setCurrentPage(1);
            setScale(1.1);
            setRotation(0);
            return;
        }

        let isCancelled = false;

        async function initPdf() {
            try {
                const buf = await fetchPdfData(url!);
                if (!buf || isCancelled) return;

                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

                const loadingTask = pdfjsLib.getDocument({
                    data: new Uint8Array(buf),
                    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
                    cMapPacked: true,
                });

                const pdfDoc = await loadingTask.promise;
                if (isCancelled) return;

                pdfDocRef.current = pdfDoc;
                setNumPages(pdfDoc.numPages);
                setCurrentPage(1);
                setLoading(false);
            } catch (err: any) {
                console.warn("[PdfViewer] PDF.js rendering error, switching to iframe:", err);
                if (!isCancelled) {
                    setViewMode("iframe");
                    setLoading(false);
                }
            }
        }

        initPdf();

        return () => {
            isCancelled = true;
        };
    }, [isOpen, url, fetchPdfData]);

    // Render pages to canvas container
    useEffect(() => {
        if (!pdfDocRef.current || viewMode !== "canvas" || loading) return;

        let isCancelled = false;
        const currentContainer = canvasContainerRef.current;
        if (!currentContainer) return;

        // Clear existing canvases
        currentContainer.innerHTML = "";

        async function renderAllPages() {
            const pdf = pdfDocRef.current;
            const targetContainer = canvasContainerRef.current;
            if (!pdf || !targetContainer) return;

            for (let i = 1; i <= pdf.numPages; i++) {
                if (isCancelled) break;

                try {
                    const page = await pdf.getPage(i);
                    if (isCancelled) break;

                    const dpr = window.devicePixelRatio || 1;
                    const viewport = page.getViewport({ scale: scale * dpr, rotation });
                    const cssWidth = viewport.width / dpr;
                    const cssHeight = viewport.height / dpr;

                    // Wrapper card
                    const pageWrapper = document.createElement("div");
                    pageWrapper.className = "flex flex-col items-center my-3 relative group";
                    pageWrapper.dataset.pageNumber = String(i);

                    // Page label badge
                    const badge = document.createElement("div");
                    badge.className = "self-start mb-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-muted/80 text-muted-foreground border border-border/50";
                    badge.textContent = `Página ${i} de ${pdf.numPages}`;
                    pageWrapper.appendChild(badge);

                    // Canvas
                    const canvas = document.createElement("canvas");
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.style.width = `${cssWidth}px`;
                    canvas.style.height = `${cssHeight}px`;
                    canvas.className = "rounded-lg shadow-xl border border-border/60 bg-white max-w-full transition-all";

                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
                    }

                    pageWrapper.appendChild(canvas);
                    targetContainer.appendChild(pageWrapper);
                } catch (pageErr) {
                    console.error(`[PdfViewer] Error rendering page ${i}:`, pageErr);
                }
            }
        }

        renderAllPages();

        return () => {
            isCancelled = true;
        };
    }, [numPages, scale, rotation, viewMode, loading]);

    // Direct download without leaving the application
    const handleDownload = async () => {
        try {
            let blob: Blob;
            if (pdfData) {
                blob = new Blob([pdfData], { type: "application/pdf" });
            } else if (url) {
                const res = await fetch(proxyUrl || url);
                blob = await res.blob();
            } else {
                return;
            }

            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            console.error("[PdfViewer] Download error:", err);
            if (url) window.open(url, "_blank");
        }
    };

    const [shareSuccess, setShareSuccess] = useState(false);

    // Share handler using Web Share API (native share sheet on iOS/Android/Desktop Chrome) with clipboard fallback
    const handleShare = async () => {
        const cleanFileName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
        const shareTitle = title || cleanFileName;
        const targetShareUrl = url?.startsWith("http") ? url : `${typeof window !== "undefined" ? window.location.origin : ""}${url}`;

        try {
            // Priority 1: Share actual PDF file blob (supports Google Drive, WhatsApp, Mail, Save to Files, etc.)
            if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
                let fileToShare: File | null = null;
                if (pdfData) {
                    fileToShare = new File([pdfData], cleanFileName, { type: "application/pdf" });
                } else if (url) {
                    try {
                        const res = await fetch(proxyUrl || url);
                        const blob = await res.blob();
                        fileToShare = new File([blob], cleanFileName, { type: "application/pdf" });
                    } catch {
                        // Fall through to URL share
                    }
                }

                if (fileToShare && typeof navigator.canShare === "function" && navigator.canShare({ files: [fileToShare] })) {
                    await navigator.share({
                        title: shareTitle,
                        files: [fileToShare],
                    });
                    return;
                }

                // Priority 2: Share URL via native share sheet
                await navigator.share({
                    title: shareTitle,
                    text: shareTitle,
                    url: targetShareUrl,
                });
                return;
            }

            // Priority 3: Clipboard fallback
            await navigator.clipboard.writeText(targetShareUrl);
            setShareSuccess(true);
            setTimeout(() => setShareSuccess(false), 2500);
        } catch (err: any) {
            // Dismissing native share sheet throws AbortError; safely ignore
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

    // Print handler
    const handlePrint = () => {
        if (viewMode === "iframe") {
            const iframe = document.getElementById("kitnets-pdf-iframe") as HTMLIFrameElement;
            iframe?.contentWindow?.print();
        } else if (pdfData) {
            const blob = new Blob([pdfData], { type: "application/pdf" });
            const printUrl = URL.createObjectURL(blob);
            const printWin = window.open(printUrl, "_blank");
            printWin?.addEventListener("load", () => {
                printWin.print();
            });
        }
    };

    // Zoom controls
    const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
    const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));
    const resetZoom = () => setScale(1.1);
    const rotate = () => setRotation((prev) => (prev + 90) % 360);

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
                            <h3 className="text-xs sm:text-sm font-bold text-foreground truncate max-w-[160px] sm:max-w-xs md:max-w-md">
                                {title}
                            </h3>
                            <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate hidden xs:block">
                                Kitnets.com • Visualização Interna
                            </p>
                        </div>
                    </div>

                    {/* Center: Controls (Zoom, Pages - hidden on mobile since touchscreens use 2-finger pinch) */}
                    <div className="hidden sm:flex items-center gap-1 sm:gap-1.5">
                        {viewMode === "canvas" && (
                            <>
                                <button
                                    onClick={zoomOut}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    title="Diminuir Zoom"
                                    aria-label="Diminuir Zoom"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={resetZoom}
                                    className="px-2 py-1 rounded-md text-[11px] font-mono font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors min-w-[50px] text-center"
                                    title="Restaurar Zoom"
                                >
                                    {Math.round((scale / 1.1) * 100)}%
                                </button>
                                <button
                                    onClick={zoomIn}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    title="Aumentar Zoom"
                                    aria-label="Aumentar Zoom"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={rotate}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden sm:inline-flex"
                                    title="Girar 90°"
                                    aria-label="Girar 90 graus"
                                >
                                    <RotateCw className="w-4 h-4" />
                                </button>
                            </>
                        )}

                        {numPages > 0 && viewMode === "canvas" && (
                            <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-1 rounded-md hidden md:inline-block">
                                {numPages} {numPages === 1 ? "página" : "páginas"}
                            </span>
                        )}
                    </div>

                    {/* Right: Actions & Close */}
                    <div className="flex items-center gap-1 sm:gap-1.5">
                        {/* Share button (Up Arrow for native sharing to Google Drive, WhatsApp, etc.) */}
                        <button
                            onClick={handleShare}
                            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            title="Compartilhar fatura (Google Drive, WhatsApp, etc.)"
                            aria-label="Compartilhar fatura"
                        >
                            {shareSuccess ? <Check className="w-3.5 h-3.5" /> : <Share className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{shareSuccess ? "Copiado!" : "Compartilhar"}</span>
                        </button>

                        {/* Download button (Down Arrow) */}
                        <button
                            onClick={handleDownload}
                            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            title="Baixar PDF para o dispositivo"
                            aria-label="Baixar fatura"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Baixar</span>
                        </button>

                        {/* View mode toggle (Canvas vs Iframe) */}
                        <button
                            onClick={() => setViewMode(viewMode === "canvas" ? "iframe" : "canvas")}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden sm:inline-flex"
                            title={viewMode === "canvas" ? "Alternar para modo navegador" : "Alternar para modo canvas"}
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        {/* Maximize / Minimize (Desktop) */}
                        <button
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden md:inline-flex"
                            title={isMaximized ? "Restaurar tamanho" : "Maximizar"}
                        >
                            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1"
                            title="Fechar (Esc)"
                            aria-label="Fechar visualizador"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {/* Document Canvas / Iframe Body */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-auto bg-neutral-900/95 dark:bg-neutral-950 p-2 sm:p-6 flex flex-col items-center justify-start relative overscroll-contain touch-pan-x touch-pan-y"
                >
                    {shareSuccess && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white border border-border px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Link copiado para a área de transferência!</span>
                        </div>
                    )}
                    {loading && (
                        <div className="my-auto flex flex-col items-center justify-center p-8 text-center space-y-3">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                            <p className="text-sm font-medium text-neutral-300">
                                Carregando documento dentro do Kitnets...
                            </p>
                            <p className="text-xs text-neutral-500">
                                Renderizando com segurança na sua página
                            </p>
                        </div>
                    )}

                    {!loading && viewMode === "canvas" && (
                        <div ref={canvasContainerRef} className="flex flex-col items-center w-full" />
                    )}

                    {!loading && viewMode === "iframe" && (
                        <div className="w-full h-full flex flex-col items-center">
                            <iframe
                                id="kitnets-pdf-iframe"
                                src={proxyUrl || url}
                                className="w-full h-full border-0 rounded-lg bg-white shadow-2xl"
                                title={title}
                            />
                        </div>
                    )}
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
