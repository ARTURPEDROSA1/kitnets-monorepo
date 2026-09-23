"use client";

/**
 * The browser side of `user_ui_preferences`: one GET per page load serves every table on the page, writes
 * are debounced per preference, and localStorage keeps a copy so a table opens right away with the last
 * choice made on this device while the account's copy loads.
 *
 * Used by the table hooks (`useColumnVisibility`, `useColumnFilters`); pages do not call this directly.
 */
import { hiddenColumnsPrefKey, sanitizeHiddenColumns, sanitizeSort, sortPrefKey, type TableSort } from "@/lib/ui-preferences";

export interface AccountPreferences {
    hiddenColumns: Record<string, string[]>;
    sort: Record<string, TableSort>;
}
type Section = keyof AccountPreferences;

const EMPTY: AccountPreferences = { hiddenColumns: {}, sort: {} };
const ACCOUNT_TTL_MS = 60_000;
const SAVE_DEBOUNCE_MS = 600;

let account: { at: number; load: Promise<AccountPreferences> } | null = null;
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

const PREF_KEY: Record<Section, (tableKey: string) => string | null> = { hiddenColumns: hiddenColumnsPrefKey, sort: sortPrefKey };
const SANITIZE: Record<Section, (value: unknown) => unknown> = { hiddenColumns: sanitizeHiddenColumns, sort: sanitizeSort };

// ── This device's copy ─────────────────────────────────────────────────────

const storageName = (section: Section, tableKey: string) => `kitnets:${section === "hiddenColumns" ? "hidden-columns" : "sort"}:${tableKey}`;

/** This device's copy of one preference; null when it has none (or it is junk). */
export function readLocalPreference<S extends Section>(section: S, tableKey: string): AccountPreferences[S][string] | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(storageName(section, tableKey));
        return raw === null ? null : (SANITIZE[section](JSON.parse(raw)) as AccountPreferences[S][string] | null);
    } catch {
        return null;
    }
}

export function writeLocalPreference<S extends Section>(section: S, tableKey: string, value: AccountPreferences[S][string]) {
    try { window.localStorage.setItem(storageName(section, tableKey), JSON.stringify(value)); } catch { /* private mode: keep it for this visit */ }
}

// ── The account's copy ─────────────────────────────────────────────────────

export function loadAccountPreferences(): Promise<AccountPreferences> {
    if (!account || Date.now() - account.at > ACCOUNT_TTL_MS) {
        const load = fetch("/api/profiles/preferences")
            .then(res => (res.ok ? res.json() : EMPTY))
            .then((data: Partial<AccountPreferences>) => ({ hiddenColumns: data.hiddenColumns ?? {}, sort: data.sort ?? {} }))
            .catch(() => EMPTY);   // signed out or offline: this device's copy still works
        account = { at: Date.now(), load };
    }
    return account.load;
}

/** Stores one preference in the account (debounced); later reads in this page load see it at once. */
export function saveAccountPreference<S extends Section>(section: S, tableKey: string, value: AccountPreferences[S][string]) {
    if (!PREF_KEY[section](tableKey)) return;
    if (account) account = { at: account.at, load: account.load.then(all => ({ ...all, [section]: { ...all[section], [tableKey]: value } })) };
    const slot = `${section}:${tableKey}`;
    clearTimeout(pendingSaves.get(slot));
    pendingSaves.set(slot, setTimeout(() => {
        pendingSaves.delete(slot);
        void fetch("/api/profiles/preferences", {
            method: "PUT", headers: { "Content-Type": "application/json" }, keepalive: true,
            body: JSON.stringify({ [section]: { [tableKey]: value } }),
        }).catch(() => { /* the device's copy keeps the choice; the next change tries again */ });
    }, SAVE_DEBOUNCE_MS));
}
