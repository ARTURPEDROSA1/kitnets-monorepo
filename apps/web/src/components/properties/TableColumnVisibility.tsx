"use client";

/**
 * Hide / show table columns, Excel style.
 *
 *   const vis = useColumnVisibility("income-ledger", { locked: ["month"] });
 *   <ColumnHeaders columns={columns} ctl={cf} visibility={vis} />          // right-click a header → menu
 *   {!vis.isHidden("energy") && <td>…</td>}                                  // body cells follow
 *   <ColumnVisibilityButton ctl={vis} />                                     // same menu, for touch screens
 *   <ColumnVisibilityMenu columns={columns} ctl={vis} />                     // once, at the section root
 *
 * The choice is kept per table in localStorage, so it survives reloads on that device.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Columns3, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

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

function readStored(key: string, fallback: string[]): Set<string> {
    if (typeof window === "undefined") return new Set(fallback);
    try {
        const raw = window.localStorage.getItem(storageName(key));
        if (raw === null) return new Set(fallback);
        const parsed: unknown = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : fallback);
    } catch {
        return new Set(fallback);
    }
}

export function useColumnVisibility(storageKey: string, opts: { locked?: string[]; defaultHidden?: string[] } = {}): ColumnVisibility {
    const locked = opts.locked ?? [];
    const [hidden, setHidden] = useState<Set<string>>(() => readStored(storageKey, opts.defaultHidden ?? []));
    const [menu, setMenu] = useState<ColumnVisibility["menu"]>(null);

    const update = useCallback((fn: (prev: Set<string>) => Set<string>) => {
        setHidden(prev => {
            const next = fn(prev);
            try { window.localStorage.setItem(storageName(storageKey), JSON.stringify([...next])); } catch { /* private mode: keep it for this visit */ }
            return next;
        });
    }, [storageKey]);

    const isLocked = useCallback((key: string) => locked.includes(key), [locked]);   // eslint-disable-line react-hooks/exhaustive-deps
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
