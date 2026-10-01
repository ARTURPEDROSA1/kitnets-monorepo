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
 * the list saved in the account (`user_ui_preferences`, key `sidebar:collapsed-groups`, through the
 * shared lib/ui-preferences-client.ts) and takes it over the local copy, and every toggle is saved
 * back there.
 */
import * as React from "react";
import { SIDEBAR_GROUPS_KEY as ACCOUNT_GROUPS_NAME } from "./ui-preferences";
import { loadAccountPreferences, saveAccountPreference } from "./ui-preferences-client";

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

/* ---------- the account's copy: the list follows the user across devices ---------- */

/** the user whose saved list was already applied in this page load */
let syncedFor: string | null = null;
/** bumps on every local toggle, so a late answer from the account never undoes a click made meanwhile */
let localVersion = 0;

const saveCollapsedGroupsToAccount = (keys: string[]) => saveAccountPreference("sidebar", ACCOUNT_GROUPS_NAME, keys);

/** The saved list; undefined when the account has none (never saved, signed out or offline). */
const loadCollapsedGroupsFromAccount = () => loadAccountPreferences().then((all) => all.sidebar[ACCOUNT_GROUPS_NAME]);

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
        loadCollapsedGroupsFromAccount().then((saved) => {
            if (cancelled) return;
            if (version !== localVersion) return; // the user clicked meanwhile: their choice is already being saved
            // nothing saved (or no answer): this device's copy stays, and the next toggle saves it;
            // a stale local copy must never overwrite what the user chose on another device
            if (saved === undefined) return;
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
        if (userId) saveCollapsedGroupsToAccount([...next]);
    }, [userId]);

    return { collapsed, toggle };
}
