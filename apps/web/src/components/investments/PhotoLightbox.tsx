"use client";

/**
 * The photo viewer of a Novo Investimento: one picture at a time, big, on black.
 *
 * What a gallery owes its user, and this one does: arrows and ← → to move, Esc to leave, a
 * counter so they know where they are, a strip of thumbnails to jump, zoom in steps with the
 * scroll to pan, swipe on a phone, the next picture already loading while this one is looked at,
 * and — the one thing specific to this app — a button to make the current picture the card's cover.
 *
 * Built on the app's Dialog so focus, Esc and the backdrop behave like every other popup. The
 * viewer inside is keyed by the picture, so zoom and the loading state reset by remounting rather
 * than by an effect writing state.
 */
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Loader2, Star, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface LightboxPhoto {
    id: string;
    url: string;
    name: string;
}

interface Props {
    photos: LightboxPhoto[];
    /** Which picture is open; null closes the viewer. */
    index: number | null;
    onClose: () => void;
    onNavigate: (index: number) => void;
    /** The picture currently on the card, if any. */
    coverId?: string | null;
    onSetCover?: (photo: LightboxPhoto) => Promise<boolean> | void;
}

const ZOOM_STEPS = [1, 1.5, 2, 3];
const SWIPE_MIN_PX = 50;

export default function PhotoLightbox({ photos, index, onClose, onNavigate, coverId, onSetCover }: Props) {
    const open = index !== null && index >= 0 && index < photos.length;
    const current = open ? photos[index as number] : null;
    const count = photos.length;

    const go = (delta: number) => {
        if (!open || count < 2) return;
        onNavigate(((index as number) + delta + count) % count);
    };

    // The neighbours load while this one is being looked at, so the arrows never show a blank.
    useEffect(() => {
        if (!open || count < 2) return;
        for (const delta of [1, -1]) {
            const neighbour = photos[((index as number) + delta + count) % count];
            if (neighbour?.url) {
                const img = new window.Image();
                img.src = neighbour.url;
            }
        }
    }, [open, index, count, photos]);

    return (
        <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
            <DialogContent
                className="max-w-[96vw] w-[96vw] h-[92vh] p-0 gap-0 border-0 bg-black text-white overflow-hidden rounded-lg sm:rounded-lg flex flex-col"
                onKeyDown={e => {
                    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
                    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
                }}
            >
                <DialogTitle className="sr-only">{current?.name ?? "Foto"}</DialogTitle>
                <DialogDescription className="sr-only">
                    Visualizador de fotos. Setas para navegar, Esc para fechar.
                </DialogDescription>
                {current && (
                    <Viewer
                        key={current.id}
                        photo={current}
                        position={`${(index as number) + 1} / ${count}`}
                        isCover={coverId != null && coverId === current.id}
                        onSetCover={onSetCover ? () => onSetCover(current) : undefined}
                        onPrev={count > 1 ? () => go(-1) : undefined}
                        onNext={count > 1 ? () => go(1) : undefined}
                    />
                )}
                {count > 1 && (
                    <Thumbnails photos={photos} index={index as number} coverId={coverId ?? null} onPick={onNavigate} />
                )}
            </DialogContent>
        </Dialog>
    );
}

function Viewer({
    photo,
    position,
    isCover,
    onSetCover,
    onPrev,
    onNext,
}: {
    photo: LightboxPhoto;
    position: string;
    isCover: boolean;
    onSetCover?: () => Promise<boolean> | void;
    onPrev?: () => void;
    onNext?: () => void;
}) {
    const [zoomStep, setZoomStep] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [settingCover, setSettingCover] = useState(false);
    const touchStartX = useRef<number | null>(null);
    const zoom = ZOOM_STEPS[zoomStep];

    const setCover = async () => {
        if (!onSetCover || isCover) return;
        setSettingCover(true);
        await onSetCover();
        setSettingCover(false);
    };

    return (
        <>
            <div className="flex items-center justify-between gap-3 px-4 py-2 pr-12 text-xs border-b border-white/10">
                <span className="truncate text-white/80" title={photo.name}>{photo.name}</span>
                <span className="shrink-0 tabular-nums text-white/60">{position}</span>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => setZoomStep(s => Math.max(0, s - 1))}
                        disabled={zoomStep === 0}
                        title="Diminuir (−)"
                        aria-label="Diminuir zoom"
                        className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"
                    >
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setZoomStep(s => (s + 1) % ZOOM_STEPS.length)}
                        title="Aumentar (+)"
                        aria-label="Aumentar zoom"
                        className="px-1.5 py-1 rounded hover:bg-white/10 tabular-nums text-white/80 inline-flex items-center gap-1"
                    >
                        <ZoomIn className="w-4 h-4" /> {zoom}×
                    </button>
                    {onSetCover && (
                        <button
                            type="button"
                            onClick={setCover}
                            disabled={isCover || settingCover}
                            title={isCover ? "Esta é a capa do card" : "Usar esta foto como capa do card"}
                            className={cn(
                                "ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                                isCover ? "border-amber-400 bg-amber-400/20 text-amber-200" : "border-white/30 text-white/80 hover:bg-white/10"
                            )}
                        >
                            {settingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className={cn("w-3.5 h-3.5", isCover && "fill-current")} />}
                            {isCover ? "Capa do card" : "Usar como capa"}
                        </button>
                    )}
                </div>
            </div>

            <div
                className={cn("relative flex-1 min-h-0", zoom > 1 ? "overflow-auto" : "overflow-hidden flex items-center justify-center")}
                onTouchStart={e => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
                onTouchEnd={e => {
                    const start = touchStartX.current;
                    touchStartX.current = null;
                    if (start === null || zoom > 1) return;
                    const delta = (e.changedTouches[0]?.clientX ?? start) - start;
                    if (delta <= -SWIPE_MIN_PX) onNext?.();
                    else if (delta >= SWIPE_MIN_PX) onPrev?.();
                }}
                onDoubleClick={() => setZoomStep(s => (s === 0 ? 2 : 0))}
            >
                {!loaded && (
                    <span className="absolute inset-0 flex items-center justify-center text-white/60">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </span>
                )}
                <Image
                    src={photo.url}
                    alt={photo.name}
                    width={1600}
                    height={1200}
                    unoptimized
                    priority
                    onLoad={() => setLoaded(true)}
                    draggable={false}
                    className={cn("select-none transition-opacity", loaded ? "opacity-100" : "opacity-0")}
                    style={
                        zoom > 1
                            ? { width: `${zoom * 100}%`, height: "auto", maxWidth: "none", maxHeight: "none" }
                            : { width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }
                    }
                />
                {onPrev && (
                    <button
                        type="button"
                        onClick={onPrev}
                        title="Anterior (←)"
                        aria-label="Foto anterior"
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                )}
                {onNext && (
                    <button
                        type="button"
                        onClick={onNext}
                        title="Próxima (→)"
                        aria-label="Próxima foto"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                )}
            </div>
        </>
    );
}

function Thumbnails({ photos, index, coverId, onPick }: { photos: LightboxPhoto[]; index: number; coverId: string | null; onPick: (i: number) => void }) {
    const strip = useRef<HTMLDivElement>(null);

    // Keep the current thumbnail in view as the arrows move; scrolling is not state.
    useEffect(() => {
        strip.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }, [index]);

    return (
        <div ref={strip} className="flex gap-1.5 overflow-x-auto px-3 py-2 border-t border-white/10 bg-black/80">
            {photos.map((p, i) => (
                <button
                    key={p.id}
                    type="button"
                    data-index={i}
                    onClick={() => onPick(i)}
                    title={p.name}
                    aria-label={`Foto ${i + 1} de ${photos.length}`}
                    aria-current={i === index ? "true" : undefined}
                    className={cn(
                        "relative h-14 w-20 shrink-0 overflow-hidden rounded border-2 transition-colors",
                        i === index ? "border-emerald-400" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                >
                    <Image src={p.url} alt="" fill sizes="80px" unoptimized className="object-cover" />
                    {coverId === p.id && <Star className="absolute right-0.5 top-0.5 w-3 h-3 fill-amber-300 text-amber-300" />}
                </button>
            ))}
        </div>
    );
}
