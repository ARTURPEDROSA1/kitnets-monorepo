"use client";

/**
 * Global privacy toggles: the eye and the dollar buttons in the sidebar footer.
 *
 * - "sensitive" hides the identifiers: addresses, CEP, CPF/CNPJ/RG, meter and consumer-unit
 *   numbers, bank agency/account numbers, phones and e-mails.
 * - "money" hides every amount in R$.
 *
 * Everything is visible by default. The preference lives in localStorage as a space-separated
 * word list ("sensitive money") and is mirrored onto <html data-hide-sensitive="1"> and
 * <html data-hide-money="1">, so plain CSS (globals.css) blurs any element carrying the
 * `privacy-sensitive` / `privacy-money` class, whether it was rendered on the server or on the
 * client, on every page and without a refresh. The root layout applies the stored attributes in an
 * inline <head> script so the first paint already hides what should be hidden (app/[lang]/layout.tsx).
 * Wrap values with <Sensitive> / <Money> from components/privacy.
 */
import * as React from "react";

export const PRIVACY_STORAGE_KEY = "kitnets_privacy";

export type PrivacyState = Readonly<{ hideSensitive: boolean; hideMoney: boolean }>;

export const PRIVACY_DEFAULT: PrivacyState = Object.freeze({ hideSensitive: false, hideMoney: false });

/** Parses the stored value; anything unknown or empty means "all visible". */
export function parsePrivacy(raw: string | null | undefined): PrivacyState {
    if (!raw) return PRIVACY_DEFAULT;
    const words = raw.split(/\s+/);
    const hideSensitive = words.includes("sensitive");
    const hideMoney = words.includes("money");
    if (!hideSensitive && !hideMoney) return PRIVACY_DEFAULT;
    return Object.freeze({ hideSensitive, hideMoney });
}

export function serializePrivacy(state: PrivacyState): string {
    return [state.hideSensitive ? "sensitive" : null, state.hideMoney ? "money" : null].filter(Boolean).join(" ");
}

let memoryRaw = ""; // used when localStorage is unavailable (private mode etc.)
let lastRaw: string | undefined;
let lastState: PrivacyState = PRIVACY_DEFAULT;

function readRaw(): string {
    try {
        return window.localStorage.getItem(PRIVACY_STORAGE_KEY) ?? "";
    } catch {
        return memoryRaw;
    }
}

/** Current preference; returns the same object while the stored value is unchanged (useSyncExternalStore). */
export function readPrivacy(): PrivacyState {
    const raw = readRaw();
    if (raw !== lastRaw) {
        lastRaw = raw;
        lastState = parsePrivacy(raw);
    }
    return lastState;
}

/** Mirrors the preference onto <html> so the CSS in globals.css can hide the wrapped values. */
export function applyPrivacyAttributes(state: PrivacyState) {
    const html = document.documentElement;
    if (state.hideSensitive) html.setAttribute("data-hide-sensitive", "1");
    else html.removeAttribute("data-hide-sensitive");
    if (state.hideMoney) html.setAttribute("data-hide-money", "1");
    else html.removeAttribute("data-hide-money");
}

const listeners = new Set<() => void>();

export function writePrivacy(next: PrivacyState) {
    const raw = serializePrivacy(next);
    memoryRaw = raw;
    try {
        window.localStorage.setItem(PRIVACY_STORAGE_KEY, raw);
    } catch {
        // Storage blocked: the in-memory value still works for this session.
    }
    applyPrivacyAttributes(readPrivacy());
    listeners.forEach((listener) => listener());
}

function subscribePrivacy(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== PRIVACY_STORAGE_KEY) return;
        applyPrivacyAttributes(readPrivacy()); // keep other tabs in sync
        listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

const getServerPrivacy = () => PRIVACY_DEFAULT;

/** The two toggles. Server renders "all visible"; the client snapshot takes over after hydration. */
export function usePrivacy() {
    const state = React.useSyncExternalStore(subscribePrivacy, readPrivacy, getServerPrivacy);

    // The inline <head> script normally applied the attributes before first paint; this covers the
    // cases where it did not run (e.g. a page mounted without the root layout script).
    React.useEffect(() => {
        applyPrivacyAttributes(readPrivacy());
    }, []);

    const toggleSensitive = React.useCallback(() => {
        const current = readPrivacy();
        writePrivacy({ hideSensitive: !current.hideSensitive, hideMoney: current.hideMoney });
    }, []);
    const toggleMoney = React.useCallback(() => {
        const current = readPrivacy();
        writePrivacy({ hideSensitive: current.hideSensitive, hideMoney: !current.hideMoney });
    }, []);

    return { hideSensitive: state.hideSensitive, hideMoney: state.hideMoney, toggleSensitive, toggleMoney };
}
