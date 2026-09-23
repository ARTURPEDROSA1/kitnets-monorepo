"use client";

/**
 * The cover of a square card as a small carousel over its pictures — shared by the project cards
 * (Projetos) and the property cards (Imóveis) so both hubs behave the same.
 *
 *   const carousel = useCoverCarousel(photos.length);
 *   <div role="button" onKeyDown={carousel.onKeyDown} onMouseEnter={carousel.pause} onMouseLeave={carousel.resume}>
 *       <CoverCarousel photos={photos} alt={title} state={carousel} fallback={<Home />}>
 *           …badges and buttons laid over the picture…
 *       </CoverCarousel>
 *   </div>
 *
 * Arrows and dots on hover, swipe on touch, ← → while the card has focus, and it advances by itself
 * every few seconds while the page is open — pausing under the pointer, staying still for people
 * who asked their system for reduced motion, and not ticking while the tab is hidden. Pictures are
 * mounted the first time they show, so a card with twelve photos does not download twelve images
 * just to be on the page; once seen they stay mounted for the cross-fade.
 */
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** How long each picture stays on the cover before the next one slides in. */
const AUTO_SLIDE_MS = 5000;
/** Horizontal finger travel that counts as a swipe. */
const SWIPE_MIN_PX = 40;

export interface CoverCarouselState {
    count: number;
    index: number;
    seen: number[];
    goTo: (next: number) => void;
    pause: () => void;
    resume: () => void;
    /** For the card root: ← → move the picture; other keys are left alone. Returns true when handled. */
    onKeyDown: (e: React.KeyboardEvent) => boolean;
}

export function useCoverCarousel(count: number): CoverCarouselState {
    const [slide, setSlide] = useState<{ index: number; seen: number[] }>({ index: 0, seen: [0] });
    const [paused, setPaused] = useState(false);
    const index = count > 0 ? slide.index % count : 0;

    const goTo = (next: number) => {
        if (count < 2) return;
        const wrapped = ((next % count) + count) % count;
        setSlide(s => ({ index: wrapped, seen: s.seen.includes(wrapped) ? s.seen : [...s.seen, wrapped] }));
    };

    useEffect(() => {
        if (count < 2 || paused) return;
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const timer = window.setInterval(() => {
            if (document.visibilityState === "hidden") return;
            setSlide(s => {
                const next = (s.index + 1) % count;
                return { index: next, seen: s.seen.includes(next) ? s.seen : [...s.seen, next] };
            });
        }, AUTO_SLIDE_MS);
        return () => window.clearInterval(timer);
    }, [count, paused]);

    return {
        count,
        index,
        seen: slide.seen,
        goTo,
        pause: () => setPaused(true),
        resume: () => setPaused(false),
        onKeyDown: e => {
            if (count < 2) return false;
            if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); return true; }
            if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); return true; }
            return false;
        },
    };
}

interface Props {
    photos: string[];
    alt: string;
    state: CoverCarouselState;
    /** What to draw when there is no picture. */
    fallback: React.ReactNode;
    /** Signed URLs (query strings) must skip next/image's optimizer. */
    unoptimized?: boolean;
    className?: string;
    /** Badges and buttons laid over the picture; they get the card's `group` hover like everything else. */
    children?: React.ReactNode;
}

export function CoverCarousel({ photos, alt, state, fallback, unoptimized = false, className, children }: Props) {
    const { count, index, seen, goTo } = state;
    const touchStartX = useRef<number | null>(null);

    const step = (e: React.SyntheticEvent, delta: number) => {
        e.stopPropagation();
        e.preventDefault();
        goTo(index + delta);
    };

    return (
        <div
            className={cn("relative h-32 w-full bg-gradient-to-br from-emerald-500/15 via-blue-500/10 to-violet-500/15", className)}
            onTouchStart={e => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={e => {
                const start = touchStartX.current;
                touchStartX.current = null;
                if (start === null || count < 2) return;
                const delta = (e.changedTouches[0]?.clientX ?? start) - start;
                if (delta <= -SWIPE_MIN_PX) goTo(index + 1);
                else if (delta >= SWIPE_MIN_PX) goTo(index - 1);
            }}
        >
            {count > 0 ? (
                photos.map((url, i) =>
                    seen.includes(i) || i === index ? (
                        <Image
                            key={url}
                            src={url}
                            alt={i === 0 ? alt : `${alt} — foto ${i + 1}`}
                            fill
                            sizes="(max-width: 768px) 100vw, 400px"
                            className={cn("object-cover transition-opacity duration-700 ease-in-out", i === index ? "opacity-100" : "opacity-0")}
                            aria-hidden={i !== index}
                            unoptimized={unoptimized}
                        />
                    ) : null
                )
            ) : (
                <span className="absolute inset-0 flex items-center justify-center text-emerald-600/60">{fallback}</span>
            )}

            {children}

            {count > 1 && (
                <>
                    <button
                        type="button"
                        onClick={e => step(e, -1)}
                        title="Foto anterior"
                        aria-label="Foto anterior"
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-background/85 text-foreground shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-background transition-opacity"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={e => step(e, 1)}
                        title="Próxima foto"
                        aria-label="Próxima foto"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-background/85 text-foreground shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-background transition-opacity"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-1.5 inset-x-0 flex items-center justify-center gap-1" aria-hidden>
                        {photos.map((url, i) => (
                            <button
                                key={url}
                                type="button"
                                tabIndex={-1}
                                onClick={e => { e.stopPropagation(); e.preventDefault(); goTo(i); }}
                                className={cn("h-1.5 rounded-full shadow-sm transition-all", i === index ? "w-4 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90")}
                            />
                        ))}
                    </div>
                    <span className="sr-only" aria-live="polite">Foto {index + 1} de {count}</span>
                </>
            )}
        </div>
    );
}
