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
 *
 * The collapsed groups also follow the user across devices: once signed in, useCollapsedGroups loads
 * the list saved for the profile (app/api/user-preferences) and takes it over the local copy, and
 * every toggle is saved back there.
 */
import * as React from "react";
import { sanitizeCollapsedGroups } from "./sidebar-groups";

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

/* ---------- the server copy: the list follows the user across devices ---------- */

const PREFERENCES_ENDPOINT = "/api/user-preferences";
/** the user whose saved list was already applied in this page load */
let syncedFor: string | null = null;
/** bumps on every local toggle, so a late server answer never undoes a click made meanwhile */
let localVersion = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveCollapsedGroupsToServer(keys: string[]) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        fetch(PREFERENCES_ENDPOINT, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sidebarCollapsedGroups: keys }),
            keepalive: true,
        }).catch(() => {
            // offline or signed out: the local copy still works, the next toggle tries again
        });
    }, 400);
}

/** The saved list: null when the user never saved one, undefined when the server could not answer. */
async function loadCollapsedGroupsFromServer(): Promise<string[] | null | undefined> {
    try {
        const res = await fetch(PREFERENCES_ENDPOINT, { cache: "no-store" });
        if (!res.ok) return undefined;
        const json = (await res.json()) as { sidebarCollapsedGroups?: unknown };
        if (json.sidebarCollapsedGroups === null) return null;
        return sanitizeCollapsedGroups(json.sidebarCollapsedGroups) ?? undefined;
    } catch {
        return undefined;
    }
}

const currentKeys = () => readCollapsedGroups().split(/\s+/).filter(Boolean);

/**
 * The keys of the collapsed groups (all expanded by default) and a toggle. With a signed-in
 * `userId`, the list saved for that user is loaded once per page load and wins over the local copy
 * (a group collapsed on another device shows up collapsed here), and every toggle is saved back.
 */
export function useCollapsedGroups(userId?: string | null) {
    const raw = React.useSyncExternalStore(groupsStore.subscribe, readCollapsedGroups, getServerGroups);
    const collapsed = React.useMemo(() => new Set(raw.split(/\s+/).filter(Boolean)), [raw]);

    // Another tab may have changed the list: keep <html data-nav-collapsed> in step with the store.
    React.useEffect(() => {
        applyCollapsedGroupsAttribute(readCollapsedGroups());
    }, [raw]);

    React.useEffect(() => {
        if (!userId || syncedFor === userId) return;
        syncedFor = userId;
        const version = localVersion;
        let cancelled = false;
        loadCollapsedGroupsFromServer().then((saved) => {
            if (cancelled) return;
            if (saved === undefined) {
                syncedFor = null; // could not reach the server: try again on the next mount
                return;
            }
            if (version !== localVersion) return; // the user clicked meanwhile: their choice is already being saved
            if (saved === null) {
                saveCollapsedGroupsToServer(currentKeys()); // first device: seed the server with the local copy
                return;
            }
            writeCollapsedGroups(saved);
        });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    const toggle = React.useCallback((key: string) => {
        const next = new Set(currentKeys());
        if (next.has(key)) next.delete(key);
        else next.add(key);
        localVersion += 1;
        writeCollapsedGroups(next);
        if (userId) saveCollapsedGroupsToServer([...next]);
    }, [userId]);

    return { collapsed, toggle };
}
