"use client";

/**
 * The lead gate of the index pages: the first time a visitor changes the period (or the FipeZAP
 * series) the LeadCaptureModal asks for their contact; once the `kitnets_lead_verified` cookie is
 * set the change goes straight through. `guard(fn)` runs `fn` now or after a successful capture;
 * `modal` is the element to render once in the page.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { LeadCaptureModal } from "./LeadCaptureModal";

const COOKIE = "kitnets_lead_verified";

function hasLeadCookie(): boolean {
    if (typeof document === "undefined") return false;
    return document.cookie.split("; ").some((part) => part.startsWith(`${COOKIE}=`) && part.slice(COOKIE.length + 1) !== "");
}

export function useLeadGate(enabled = true): { guard: (action: () => void) => void; modal: ReactNode } {
    const [open, setOpen] = useState(false);
    const pending = useRef<(() => void) | null>(null);

    const guard = useCallback((action: () => void) => {
        if (!enabled || hasLeadCookie()) {
            action();
            return;
        }
        pending.current = action;
        setOpen(true);
    }, [enabled]);

    const modal = (
        <LeadCaptureModal
            isOpen={open}
            onClose={(proceed) => {
                setOpen(false);
                const action = pending.current;
                pending.current = null;
                if (proceed && action) action();
            }}
        />
    );

    return { guard, modal };
}
