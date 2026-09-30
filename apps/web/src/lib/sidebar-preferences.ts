"use client";

/**
 * Persisted sidebar preferences, exposed as tiny external stores so useSyncExternalStore can hydrate
 * them without a setState-in-effect:
 *
 * - "show less information" (the compact icon rail), mirrored onto <html data-sidebar="collapsed">;
 * - the collapsed menu groups (Operação, Contábil & Fiscal, Ferramentas, Configurações), stored as a
 *   space-separated list of group keys and mirrored onto <html data-nav-collapsed="...">.
 *
 * The root layout reads the same keys in an inline <head> script so the first paint already uses the
 * stored state (see app/[lang]/layout.tsx); globals.css does the hiding. Components/Sidebar.tsx keeps
 * the attributes in sync afterwards.
 */
import * as React from "react";

export const SIDEBAR_COLLAPSED_KEY = "kitnets_sidebar_collapsed";
export const SIDEBAR_GROUPS_KEY = "kitnets_sidebar_groups";

function createStringStore(key: string) {
    const listeners = new Set<() => void>();
    let memory = ""; // used when localStorage is unavailable (private mode etc.)

    const read = (): string => {
        try {
            return window.localStorage.getItem(key) ?? "";
        } catch {
            return memory;
        }
    };

    const write = (raw: string) => {
        memory = raw;
        try {
            window.localStorage.setItem(key, raw);
        } catch {
            // Storage blocked: the in-memory value still works for this session.
        }
        listeners.forEach((listener) => listener());
    };

    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || event.key === key) listener(); // keep other tabs in sync
        };
        window.addEventListener("storage", onStorage);
        return () => {
            listeners.delete(listener);
            window.removeEventListener("storage", onStorage);
        };
    };

    return { read, write, subscribe };
}

/* ---------- compact rail ---------- */

const collapsedStore = createStringStore(SIDEBAR_COLLAPSED_KEY);

export const readCollapsedPreference = (): boolean => collapsedStore.read() === "1";
export const writeCollapsedPreference = (next: boolean) => collapsedStore.write(next ? "1" : "0");
const getServerCollapsed = () => false;

/** Server renders expanded; the client snapshot takes over after hydration. */
export function useSidebarCollapsed(): boolean {
    return React.useSyncExternalStore(collapsedStore.subscribe, readCollapsedPreference, getServerCollapsed);
}

/* ---------- menu groups ---------- */

const groupsStore = createStringStore(SIDEBAR_GROUPS_KEY);

export const readCollapsedGroups = (): string => groupsStore.read();
const getServerGroups = () => "";

/** Mirrors the list onto <html> so the CSS in globals.css can hide the items of the collapsed groups. */
export function applyCollapsedGroupsAttribute(raw: string) {
    const html = document.documentElement;
    if (raw.trim()) html.setAttribute("data-nav-collapsed", raw.trim());
    else html.removeAttribute("data-nav-collapsed");
}

export function writeCollapsedGroups(keys: Iterable<string>) {
    const raw = Array.from(new Set(keys)).filter(Boolean).join(" ");
    groupsStore.write(raw);
    applyCollapsedGroupsAttribute(raw);
}

/** The keys of the collapsed groups (all expanded by default) and a toggle. */
export function useCollapsedGroups() {
    const raw = React.useSyncExternalStore(groupsStore.subscribe, readCollapsedGroups, getServerGroups);
    const collapsed = React.useMemo(() => new Set(raw.split(/\s+/).filter(Boolean)), [raw]);

    // Another tab may have changed the list: keep <html data-nav-collapsed> in step with the store.
    React.useEffect(() => {
        applyCollapsedGroupsAttribute(readCollapsedGroups());
    }, [raw]);

    const toggle = React.useCallback((key: string) => {
        const next = new Set(readCollapsedGroups().split(/\s+/).filter(Boolean));
        if (next.has(key)) next.delete(key);
        else next.add(key);
        writeCollapsedGroups(next);
    }, []);

    return { collapsed, toggle };
}
