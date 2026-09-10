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

export function PdfViewerModal({
    isOpen,
    onClose,
    url,
    title = "Visualizador de Documento",
    fileName = "documento.pdf",
}: PdfViewerModalProps) {
    const [loading, setLoading] = useState(true);
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [rotation, setRotation] = useState<number>(0);
    const [isMaximized, setIsMaximized] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<"canvas" | "iframe">("canvas");
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [zoom, setZoom] = useState<number>(1);
    const [shareSuccess, setShareSuccess] = useState(false);

    const viewportRef = useRef<HTMLDivElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfDocRef = useRef<any>(null);

    // Transform state for 60/120 FPS hardware-accelerated pan and zoom
    const transformRef = useRef({ scale: 1, x: 0, y: 0 });

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

    // Fetch PDF data as Blob (immutable, never detached by web workers)
    const fetchPdfData = useCallback(async (targetUrl: string): Promise<Blob | null> => {
        setLoading(true);
        try {
            const fetchUrl = targetUrl.startsWith("blob:") || targetUrl.startsWith("data:")
                ? targetUrl
                : `/api/pdf-proxy?url=${encodeURIComponent(targetUrl)}`;

            let res = await fetch(fetchUrl);
            if (!res.ok) {
                res = await fetch(targetUrl);
                if (!res.ok) {
                    throw new Error(`Falha ao carregar documento (Status ${res.status})`);
                }
            }
            const blob = await res.blob();
            setPdfBlob(blob);
            return blob;
        } catch (err: any) {
            console.warn("[PdfViewer] Failed to fetch raw PDF blob, falling back to iframe:", err);
            setViewMode("iframe");
            setLoading(false);
            return null;
        }
    }, []);

    // Load PDF using PDF.js
    useEffect(() => {
        if (!isOpen || !url) {
            setPdfBlob(null);
            pdfDocRef.current = null;
            setNumPages(0);
            setCurrentPage(1);
            setZoom(1);
            setRotation(0);
            transformRef.current = { scale: 1, x: 0, y: 0 };
            return;
        }

        let isCancelled = false;

        async function initPdf() {
            try {
                const blob = await fetchPdfData(url!);
                if (!blob || isCancelled) return;

                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

                // Convert blob to ArrayBuffer and pass a slice clone so original blob is never detached
                const rawBuffer = await blob.arrayBuffer();
                const workerBuffer = rawBuffer.slice(0);

                const loadingTask = pdfjsLib.getDocument({
                    data: new Uint8Array(workerBuffer),
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

    // Position clamping utility to keep document visible in viewport
    const clampPosition = useCallback((scale: number, x: number, y: number) => {
        const viewport = viewportRef.current;
        const content = canvasContainerRef.current;
        if (!viewport || !content) return { x, y };

        const vWidth = viewport.clientWidth;
        const vHeight = viewport.clientHeight;
        const cWidth = content.offsetWidth * scale;
        const cHeight = content.offsetHeight * scale;

        let clampedX = x;
        let clampedY = y;

        if (cWidth <= vWidth) {
            clampedX = (vWidth - cWidth) / 2;
        } else {
            const minX = vWidth - cWidth;
            const maxX = 0;
            clampedX = Math.min(Math.max(x, minX), maxX);
        }

        if (cHeight <= vHeight) {
            clampedY = (vHeight - cHeight) / 2;
        } else {
            const minY = vHeight - cHeight;
            const maxY = 0;
            clampedY = Math.min(Math.max(y, minY), maxY);
        }

        return { x: clampedX, y: clampedY };
    }, []);

    // Apply CSS 3D transform with hardware acceleration
    const updateTransform = useCallback((scale: number, x: number, y: number, animate = false) => {
        const content = canvasContainerRef.current;
        if (!content) return;

        content.style.transition = animate ? "transform 0.25s cubic-bezier(0.15, 0.9, 0.3, 1)" : "none";
        content.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        transformRef.current = { scale, x, y };
        setZoom(scale);
    }, []);

    // Reset zoom and center
    const resetZoom = useCallback(() => {
        const clamped = clampPosition(1.0, 0, 0);
        updateTransform(1.0, clamped.x, clamped.y, true);
    }, [clampPosition, updateTransform]);

    // Render pages ONCE with high-DPI supersampling
    useEffect(() => {
        if (!pdfDocRef.current || viewMode !== "canvas" || loading) return;

        let isCancelled = false;
        const currentContainer = canvasContainerRef.current;
        if (!currentContainer) return;

        currentContainer.innerHTML = "";

        async function renderAllPages() {
            const pdf = pdfDocRef.current;
            const targetContainer = canvasContainerRef.current;
            const viewportEl = viewportRef.current;
            if (!pdf || !targetContainer) return;

            // Fit initial width nicely to viewport
            const availableWidth = viewportEl ? Math.min(viewportEl.clientWidth - 20, 800) : 600;

            for (let i = 1; i <= pdf.numPages; i++) {
                if (isCancelled) break;

                try {
                    const page = await pdf.getPage(i);
                    if (isCancelled) break;

                    const unscaledViewport = page.getViewport({ scale: 1, rotation });
                    const fitScale = Math.max(availableWidth / unscaledViewport.width, 0.9);

                    // High-DPI render: 2.0x supersampling so zooming in 2x-4x stays razor sharp
                    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3);
                    const renderDpr = dpr * 1.5;

                    const viewport = page.getViewport({ scale: fitScale * renderDpr, rotation });
                    const cssWidth = viewport.width / renderDpr;
                    const cssHeight = viewport.height / renderDpr;

                    // Wrapper card
                    const pageWrapper = document.createElement("div");
                    pageWrapper.className = "flex flex-col items-center my-2 sm:my-3 relative";
                    pageWrapper.dataset.pageNumber = String(i);

                    // Page label badge
                    const badge = document.createElement("div");
                    badge.className = "self-start mb-1 px-2 py-0.5 rounded text-[11px] font-medium bg-muted/80 text-muted-foreground border border-border/50";
                    badge.textContent = `Página ${i} de ${pdf.numPages}`;
                    pageWrapper.appendChild(badge);

                    // Canvas
                    const canvas = document.createElement("canvas");
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.style.width = `${cssWidth}px`;
                    canvas.style.height = `${cssHeight}px`;
                    canvas.className = "rounded-lg border border-border/60 bg-white shadow-xl";

                    const ctx = canvas.getContext("2d", { alpha: false });
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

            // Center document initially
            setTimeout(() => {
                resetZoom();
            }, 50);
        }

        renderAllPages();

        return () => {
            isCancelled = true;
        };
    }, [numPages, rotation, viewMode, loading, resetZoom]);

    // Native-feeling Touch Gestures: Focal-Point Pinch-to-Zoom + 2D Free Pan + Double Tap
    useEffect(() => {
        const viewport = viewportRef.current;
        const content = canvasContainerRef.current;
        if (!viewport || !content || viewMode !== "canvas") return;

        let isPinching = false;
        let isPanning = false;
        let initialDist = 0;
        let startScale = 1;
        let focalPoint = { x: 0, y: 0 };
        let startPos = { x: 0, y: 0 };
        let panStart = { x: 0, y: 0 };
        let lastTap = 0;

        const onTouchStart = (e: TouchEvent) => {
            const vRect = viewport.getBoundingClientRect();

            if (e.touches.length === 2) {
                // Two-finger pinch start
                isPinching = true;
                isPanning = false;
                startScale = transformRef.current.scale;
                initialDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                focalPoint = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - vRect.left,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - vRect.top,
                };
                startPos = {
                    x: transformRef.current.x,
                    y: transformRef.current.y,
                };
                content.style.transition = "none";
            } else if (e.touches.length === 1) {
                const now = Date.now();
                if (now - lastTap < 300) {
                    // Double-tap zoom toggle
                    e.preventDefault();
                    lastTap = 0;
                    const tapX = e.touches[0].clientX - vRect.left;
                    const tapY = e.touches[0].clientY - vRect.top;

                    if (transformRef.current.scale > 1.2) {
                        resetZoom();
                    } else {
                        // Zoom into tapped spot at 2.5x
                        const targetScale = 2.5;
                        const targetX = tapX - (tapX - transformRef.current.x) * (targetScale / transformRef.current.scale);
                        const targetY = tapY - (tapY - transformRef.current.y) * (targetScale / transformRef.current.scale);
                        const clamped = clampPosition(targetScale, targetX, targetY);
                        updateTransform(targetScale, clamped.x, clamped.y, true);
                    }
                    return;
                }
                lastTap = now;

                // Single-finger 2D pan
                isPanning = true;
                isPinching = false;
                panStart = {
                    x: e.touches[0].clientX - transformRef.current.x,
                    y: e.touches[0].clientY - transformRef.current.y,
                };
                content.style.transition = "none";
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            const vRect = viewport.getBoundingClientRect();

            if (isPinching && e.touches.length === 2) {
                e.preventDefault();
                if (initialDist <= 0) return;

                const currentDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const factor = currentDist / initialDist;
                const newScale = Math.min(Math.max(startScale * factor, 0.8), 5.0);

                const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - vRect.left;
                const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - vRect.top;

                // Focal-point zoom: expands directly from the point between fingers
                const newX = currentMidX - (focalPoint.x - startPos.x) * (newScale / startScale);
                const newY = currentMidY - (focalPoint.y - startPos.y) * (newScale / startScale);

                updateTransform(newScale, newX, newY, false);
            } else if (isPanning && e.touches.length === 1) {
                e.preventDefault();
                const newX = e.touches[0].clientX - panStart.x;
                const newY = e.touches[0].clientY - panStart.y;

                const cWidth = content.offsetWidth * transformRef.current.scale;
                let targetX = newX;
                if (cWidth <= vRect.width) {
                    targetX = (vRect.width - cWidth) / 2;
                }

                updateTransform(transformRef.current.scale, targetX, newY, false);
            }
        };

        const onTouchEnd = (e: TouchEvent) => {
            if (isPinching && e.touches.length < 2) {
                isPinching = false;
                let targetScale = Math.min(Math.max(transformRef.current.scale, 1.0), 4.5);
                const clamped = clampPosition(targetScale, transformRef.current.x, transformRef.current.y);
                updateTransform(targetScale, clamped.x, clamped.y, true);
            } else if (isPanning && e.touches.length === 0) {
                isPanning = false;
                const clamped = clampPosition(transformRef.current.scale, transformRef.current.x, transformRef.current.y);
                updateTransform(transformRef.current.scale, clamped.x, clamped.y, true);
            }
        };

        // Desktop mouse wheel zoom into cursor position
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const vRect = viewport.getBoundingClientRect();
            const mouseX = e.clientX - vRect.left;
            const mouseY = e.clientY - vRect.top;
            const current = transformRef.current;

            const delta = e.deltaY < 0 ? 1.15 : 0.85;
            const targetScale = Math.min(Math.max(current.scale * delta, 1.0), 4.5);

            const targetX = mouseX - (mouseX - current.x) * (targetScale / current.scale);
            const targetY = mouseY - (mouseY - current.y) * (targetScale / current.scale);

            const clamped = clampPosition(targetScale, targetX, targetY);
            updateTransform(targetScale, clamped.x, clamped.y, true);
        };

        viewport.addEventListener("touchstart", onTouchStart, { passive: false });
        viewport.addEventListener("touchmove", onTouchMove, { passive: false });
        viewport.addEventListener("touchend", onTouchEnd, { passive: false });
        viewport.addEventListener("touchcancel", onTouchEnd, { passive: false });
        viewport.addEventListener("wheel", onWheel, { passive: false });

        return () => {
            viewport.removeEventListener("touchstart", onTouchStart);
            viewport.removeEventListener("touchmove", onTouchMove);
            viewport.removeEventListener("touchend", onTouchEnd);
            viewport.removeEventListener("touchcancel", onTouchEnd);
            viewport.removeEventListener("wheel", onWheel);
        };
    }, [viewMode, clampPosition, updateTransform, resetZoom]);

    // Zoom buttons
    const zoomIn = () => {
        const current = transformRef.current;
        const targetScale = Math.min(current.scale + 0.4, 4.5);
        const vWidth = viewportRef.current?.clientWidth || 400;
        const vHeight = viewportRef.current?.clientHeight || 600;
        const targetX = vWidth / 2 - (vWidth / 2 - current.x) * (targetScale / current.scale);
        const targetY = vHeight / 2 - (vHeight / 2 - current.y) * (targetScale / current.scale);
        const clamped = clampPosition(targetScale, targetX, targetY);
        updateTransform(targetScale, clamped.x, clamped.y, true);
    };

    const zoomOut = () => {
        const current = transformRef.current;
        const targetScale = Math.max(current.scale - 0.4, 1.0);
        const vWidth = viewportRef.current?.clientWidth || 400;
        const vHeight = viewportRef.current?.clientHeight || 600;
        const targetX = vWidth / 2 - (vWidth / 2 - current.x) * (targetScale / current.scale);
        const targetY = vHeight / 2 - (vHeight / 2 - current.y) * (targetScale / current.scale);
        const clamped = clampPosition(targetScale, targetX, targetY);
        updateTransform(targetScale, clamped.x, clamped.y, true);
    };

    const rotate = () => setRotation((prev) => (prev + 90) % 360);

    // Direct download without leaving the application
    const handleDownload = async () => {
        try {
            let targetBlob: Blob | null = pdfBlob;
            if (!targetBlob || targetBlob.size === 0) {
                const fetchUrl = url?.startsWith("blob:") || url?.startsWith("data:")
                    ? url
                    : `/api/pdf-proxy?url=${encodeURIComponent(url || "")}`;
                const res = await fetch(fetchUrl);
                if (res.ok) {
                    targetBlob = await res.blob();
                    setPdfBlob(targetBlob);
                }
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
                try {
                    const fetchUrl = url?.startsWith("blob:") || url?.startsWith("data:")
                        ? url
                        : `/api/pdf-proxy?url=${encodeURIComponent(url || "")}`;
                    const res = await fetch(fetchUrl);
                    if (res.ok) {
                        targetBlob = await res.blob();
                        setPdfBlob(targetBlob);
                    }
                } catch (blobErr) {
                    console.warn("[PdfViewer] Fetch blob for share error:", blobErr);
                }
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
                                Kitnets.com • Visualização Interna
                            </p>
                        </div>
                    </div>

                    {/* Center: Controls (Zoom, Pages - hidden on mobile screens) */}
                    <div className="hidden sm:flex items-center gap-1 sm:gap-1.5">
                        {viewMode === "canvas" && (
                            <>
                                <button
                                    onClick={zoomOut}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                    title="Diminuir Zoom"
                                    aria-label="Diminuir Zoom"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={resetZoom}
                                    className="px-2 py-1 rounded-md text-[11px] font-mono font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors min-w-[50px] text-center cursor-pointer"
                                    title="Restaurar Zoom (100%)"
                                >
                                    {Math.round(zoom * 100)}%
                                </button>
                                <button
                                    onClick={zoomIn}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                    title="Aumentar Zoom"
                                    aria-label="Aumentar Zoom"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={rotate}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden sm:inline-flex cursor-pointer"
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
                        {/* Native Safari / QuickLook direct button (exact WhatsApp iPhone experience) */}
                        <a
                            href={proxyUrl || url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold shadow-xs transition-colors cursor-pointer border border-border/60"
                            title="Abrir no visualizador nativo do iPhone / Safari"
                            aria-label="Abrir no visualizador nativo"
                        >
                            <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                            <span className="hidden xs:inline">Nativo</span>
                        </a>

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
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden sm:inline-flex cursor-pointer"
                            title={viewMode === "canvas" ? "Alternar para modo navegador" : "Alternar para modo canvas"}
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        {/* Maximize / Minimize (Desktop) */}
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

                {/* Document Viewport with GPU Transform Pan & Zoom */}
                <div
                    ref={viewportRef}
                    className="flex-1 w-full h-full overflow-hidden bg-neutral-900/95 dark:bg-neutral-950 relative select-none"
                    style={{ touchAction: "none" }}
                >
                    {shareSuccess && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white border border-border px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 pointer-events-none">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Link copiado para a área de transferência!</span>
                        </div>
                    )}

                    {loading && (
                        <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center space-y-3">
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
                        <div
                            ref={canvasContainerRef}
                            className="w-full flex flex-col items-center py-4"
                            style={{
                                transformOrigin: "0 0",
                                willChange: "transform",
                            }}
                        />
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
