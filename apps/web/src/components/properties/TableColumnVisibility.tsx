"use client";

/**
 * Hide / show table columns, Excel style.
 *
 *   const vis = useColumnVisibility(columnTableKey("income-ledger", multiUnit ? "multi" : "single"), { locked: ["month"] });
 *   <ColumnHeaders columns={columns} ctl={cf} visibility={vis} />          // right-click a header → menu
 *   {!vis.isHidden("energy") && <td>…</td>}                                  // body cells follow
 *   <ColumnVisibilityButton ctl={vis} />                                     // same menu, for touch screens
 *   <ColumnVisibilityMenu columns={columns} ctl={vis} />                     // once, at the section root
 *
 * The choice belongs to the user's account (`/api/profiles/preferences`), per table key, so it is there on any
 * device the user signs in on. A table that looks different per kind of property uses one key per kind
 * (`income-ledger:single`, `income-ledger:multi`). localStorage keeps a copy, so the table opens right away
 * with the last choice made on this device while the account's copy loads.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Columns3, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { hiddenColumnsPrefKey, sanitizeHiddenColumns } from "@/lib/ui-preferences";

export interface ColumnVisibility {
    isHidden: (key: string) => boolean;
    isLocked: (key: string) => boolean;
    hiddenCount: number;
    hide: (key: string) => void;
    toggle: (key: string) => void;
    showAll: () => void;
    /** Opens the menu at the pointer (header right-click) or under a button; `key` = the column that was clicked. */
    openMenu: (at: { x: number; y: number }, key?: string) => void;
    closeMenu: () => void;
    menu: { x: number; y: number; key?: string } | null;
}

const storageName = (key: string) => `kitnets:hidden-columns:${key}`;

/** This device's copy of a table's hidden columns; null when it has none. */
function readLocal(key: string): string[] | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(storageName(key));
        return raw === null ? null : sanitizeHiddenColumns(JSON.parse(raw));
    } catch {
        return null;
    }
}

function writeLocal(key: string, hidden: string[]) {
    try { window.localStorage.setItem(storageName(key), JSON.stringify(hidden)); } catch { /* private mode: keep it for this visit */ }
}

// ── The account's copy ──────────────────────────────────────────────────────
// One GET per page load serves every table; writes are debounced per table key.
const ACCOUNT_TTL_MS = 60_000;
let account: { at: number; load: Promise<Record<string, string[]>> } | null = null;
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

function loadAccountColumns(): Promise<Record<string, string[]>> {
    if (!account || Date.now() - account.at > ACCOUNT_TTL_MS) {
        const load = fetch("/api/profiles/preferences")
            .then(res => (res.ok ? res.json() : {}))
            .then((data: { hiddenColumns?: Record<string, string[]> }) => data.hiddenColumns ?? {})
            .catch(() => ({}));   // signed out or offline: this device's copy still works
        account = { at: Date.now(), load };
    }
    return account.load;
}

function saveAccountColumns(key: string, hidden: string[]) {
    if (!hiddenColumnsPrefKey(key)) return;
    // later reads in this page load see the new choice without another request
    if (account) account = { at: account.at, load: account.load.then(all => ({ ...all, [key]: hidden })) };
    clearTimeout(pendingSaves.get(key));
    pendingSaves.set(key, setTimeout(() => {
        pendingSaves.delete(key);
        void fetch("/api/profiles/preferences", {
            method: "PUT", headers: { "Content-Type": "application/json" }, keepalive: true,
            body: JSON.stringify({ hiddenColumns: { [key]: hidden } }),
        }).catch(() => { /* the device's copy keeps the choice; the next change tries again */ });
    }, 600));
}

export interface ColumnVisibilityOptions {
    locked?: string[];
    defaultHidden?: string[];
    /** Key this table used before it had one per kind of property: its choice on this device seeds the new key once. */
    legacyKey?: string;
}

export function useColumnVisibility(storageKey: string, opts: ColumnVisibilityOptions = {}): ColumnVisibility {
    const locked = opts.locked ?? [];
    const { legacyKey, defaultHidden } = opts;
    const initial = (key: string) => new Set(readLocal(key) ?? (legacyKey ? readLocal(legacyKey) : null) ?? defaultHidden ?? []);
    const [state, setState] = useState(() => ({ key: storageKey, hidden: initial(storageKey) }));
    // the key changes when the table turns out to be of another kind (the property's units arrive): start from that key's copy
    if (state.key !== storageKey) setState({ key: storageKey, hidden: initial(storageKey) });
    const hidden = state.hidden;
    const [menu, setMenu] = useState<ColumnVisibility["menu"]>(null);
    /** Table keys the user changed in this visit: the account's copy, arriving late, must not undo that. */
    const touched = useRef(new Set<string>());

    useEffect(() => {
        let alive = true;
        void loadAccountColumns().then(all => {
            if (!alive || touched.current.has(storageKey)) return;
            const remote = all[storageKey];
            if (remote) {
                writeLocal(storageKey, remote);
                setState(prev => (prev.key === storageKey ? { key: storageKey, hidden: new Set(remote) } : prev));
            } else {
                // first time this table is seen in the account: the choice made on this device becomes the account's
                const local = readLocal(storageKey) ?? (legacyKey ? readLocal(legacyKey) : null);
                if (local && local.length > 0) { writeLocal(storageKey, local); saveAccountColumns(storageKey, local); }
            }
        });
        return () => { alive = false; };
    }, [storageKey, legacyKey]);

    const update = (fn: (prev: Set<string>) => Set<string>) => {
        const next = fn(hidden);
        touched.current.add(storageKey);
        writeLocal(storageKey, [...next]);
        saveAccountColumns(storageKey, [...next]);
        setState({ key: storageKey, hidden: next });
    };

    const isLocked = (key: string) => locked.includes(key);
    return {
        isHidden: key => hidden.has(key) && !locked.includes(key),
        isLocked,
        hiddenCount: [...hidden].filter(k => !locked.includes(k)).length,
        hide: key => { if (!locked.includes(key)) update(prev => new Set(prev).add(key)); },
        toggle: key => { if (!locked.includes(key)) update(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; }); },
        showAll: () => update(() => new Set()),
        openMenu: (at, key) => setMenu({ ...at, key }),
        closeMenu: () => setMenu(null),
        menu,
    };
}

/** Floating menu: "hide this column", a checklist of every column, "show all". Always fully on screen. */
export function ColumnVisibilityMenu({ columns, ctl }: { columns: Array<{ key: string; label: string }>; ctl: ColumnVisibility }) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    const menu = ctl.menu;

    useLayoutEffect(() => {
        if (!menu || !ref.current) { setPos(null); return; }
        const r = ref.current.getBoundingClientRect();
        const margin = 8;
        setPos({
            left: Math.max(margin, Math.min(menu.x, window.innerWidth - r.width - margin)),
            top: Math.max(margin, Math.min(menu.y, window.innerHeight - r.height - margin)),
        });
    }, [menu]);

    useEffect(() => {
        if (!menu) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); ctl.closeMenu(); } };
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ctl.closeMenu(); };
        const onScroll = () => ctl.closeMenu();
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("mousedown", onDown);
        window.addEventListener("scroll", onScroll, true);
        return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("mousedown", onDown); window.removeEventListener("scroll", onScroll, true); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [menu]);

    if (!menu) return null;
    const clicked = menu.key ? columns.find(c => c.key === menu.key) : undefined;
    const item = "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors disabled:opacity-50 disabled:hover:bg-transparent";
    return (
        <div
            ref={ref}
            role="menu"
            aria-label="Colunas da tabela"
            onContextMenu={e => e.preventDefault()}
            style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
            className="fixed z-[80] w-60 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl py-1.5"
        >
            {clicked && !ctl.isLocked(clicked.key) && (
                <>
                    <button type="button" role="menuitem" className={cn(item, "font-semibold")} onClick={() => { ctl.hide(clicked.key); ctl.closeMenu(); }}>
                        <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> Ocultar “{clicked.label}”
                    </button>
                    <div className="my-1 border-t border-border" />
                </>
            )}
            <span className="block px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Colunas</span>
            {columns.map(c => {
                const lockedCol = ctl.isLocked(c.key);
                const shown = !ctl.isHidden(c.key);
                return (
                    <button key={c.key} type="button" role="menuitemcheckbox" aria-checked={shown} disabled={lockedCol} className={item}
                        title={lockedCol ? "Esta coluna identifica a linha e fica sempre visível" : undefined} onClick={() => ctl.toggle(c.key)}>
                        <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", shown ? "bg-emerald-600 border-emerald-600 text-white" : "border-input")}>
                            {shown && <Check className="w-3 h-3" />}
                        </span>
                        <span className="truncate">{c.label}</span>
                    </button>
                );
            })}
            <div className="my-1 border-t border-border" />
            <button type="button" role="menuitem" className={item} disabled={ctl.hiddenCount === 0} onClick={() => { ctl.showAll(); ctl.closeMenu(); }}>
                <Eye className="w-3.5 h-3.5 text-muted-foreground" /> Mostrar todas
            </button>
        </div>
    );
}

/** Button that opens the same menu (touch screens have no right-click) and says how many columns are hidden. */
export function ColumnVisibilityButton({ ctl, className }: { ctl: ColumnVisibility; className?: string }) {
    return (
        <button
            type="button"
            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); ctl.openMenu({ x: r.left, y: r.bottom + 4 }); }}
            title="Mostrar ou ocultar colunas (ou clique com o botão direito no cabeçalho da tabela)"
            className={cn("inline-flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-muted transition-colors",
                ctl.hiddenCount > 0 && "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300", className)}
        >
            <Columns3 className="w-3.5 h-3.5" /> Colunas{ctl.hiddenCount > 0 ? ` · ${ctl.hiddenCount} ${ctl.hiddenCount === 1 ? "oculta" : "ocultas"}` : ""}
        </button>
    );
}
