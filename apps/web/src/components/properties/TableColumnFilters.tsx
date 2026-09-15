"use client";

/**
 * Excel-style column sort & filter for the property tables.
 *
 *   const ctl = useColumnFilters(rows, columns, { key: "date", dir: "desc" });
 *   <thead><ColumnHeaders columns={columns} ctl={ctl} trailing={<th />} /></thead>
 *   {ctl.rows.map(...)}
 *   <FilterChips columns={columns} ctl={ctl} />   // active filters, one-click clear
 *   <ColumnMenu columns={columns} ctl={ctl} />    // the popup (fixed, never clipped by overflow)
 *
 * Column kinds: text (contains), number (min–max), date (ISO min–max), month (YYYY-MM min–max),
 * enum (checkbox list with counts from the unfiltered rows).
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, FilterX, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColumnKind = "text" | "number" | "date" | "month" | "enum";

export interface ColumnDef<T> {
    key: string;
    label: string;
    align?: "left" | "right" | "center";
    kind: ColumnKind;
    /** value used for sorting and filtering */
    get: (row: T) => string | number | null | undefined;
    /** enum only: all possible values and their labels */
    options?: { value: string; label: string }[];
    title?: string;
    /** extra classes for the <th> */
    className?: string;
    /** number columns: show the sum of the filtered rows under the header while a filter is active (default true; false for %, years, counts) */
    sum?: boolean;
    /** formats the sum (default: R$) */
    formatSum?: (n: number) => string;
    /** rendered inside the header cell after the label (e.g. an expand/collapse toggle) */
    headerExtra?: React.ReactNode;
}

export interface ColumnFilter {
    /** enum: allowed values; null/undefined = all */
    values?: Set<string> | null;
    /** text: contains (case-insensitive) */
    text?: string;
    /** number / date / month: inclusive bounds as typed */
    min?: string;
    max?: string;
}

export interface SortState { key: string; dir: "asc" | "desc" }

export interface ColumnFilterController<T> {
    rows: T[];
    sort: SortState;
    setSort: (s: SortState) => void;
    filters: Record<string, ColumnFilter>;
    setFilter: (key: string, f: ColumnFilter) => void;
    clearColumn: (key: string) => void;
    clearFilters: () => void;
    isActive: (key: string) => boolean;
    anyFilter: boolean;
    counts: Map<string, Map<string, number>>;
    menu: { key: string; x: number; y: number } | null;
    openMenu: (key: string, anchor: HTMLElement) => void;
    closeMenu: () => void;
    /** rows before column filters (after whatever the caller already filtered) */
    total: number;
}

const isActiveFilter = (f: ColumnFilter | undefined) =>
    Boolean(f && ((f.values !== null && f.values !== undefined) || (f.text ?? "").trim() !== "" || (f.min ?? "").trim() !== "" || (f.max ?? "").trim() !== ""));

export function useColumnFilters<T>(rows: T[], columns: ColumnDef<T>[], defaultSort: SortState): ColumnFilterController<T> {
    const [sort, setSort] = useState<SortState>(defaultSort);
    const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
    const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);

    const counts = useMemo(() => {
        const m = new Map<string, Map<string, number>>();
        for (const c of columns) {
            if (c.kind !== "enum") continue;
            const cm = new Map<string, number>();
            for (const r of rows) {
                const v = String(c.get(r) ?? "");
                cm.set(v, (cm.get(v) ?? 0) + 1);
            }
            m.set(c.key, cm);
        }
        return m;
    }, [rows, columns]);

    const filtered = useMemo(() => {
        const num = (s?: string) => (!s || s.trim() === "" ? null : Number(s.replace(",", ".")));
        const out = rows.filter(r => {
            for (const c of columns) {
                const f = filters[c.key];
                if (!isActiveFilter(f)) continue;
                const v = c.get(r);
                if (c.kind === "enum") {
                    if (f.values && !f.values.has(String(v ?? ""))) return false;
                } else if (c.kind === "text") {
                    const q = (f.text ?? "").trim().toLowerCase();
                    if (q && !String(v ?? "").toLowerCase().includes(q)) return false;
                } else if (c.kind === "number") {
                    const min = num(f.min), max = num(f.max);
                    if (min === null && max === null) continue;
                    if (v === null || v === undefined || v === "") return false;
                    const n = Number(v);
                    if (min !== null && n < min) return false;
                    if (max !== null && n > max) return false;
                } else {
                    // date / month: ISO strings compare lexicographically
                    const s = String(v ?? "");
                    if ((f.min ?? "").trim() && s < f.min!.trim()) return false;
                    if ((f.max ?? "").trim() && s > f.max!.trim()) return false;
                }
            }
            return true;
        });
        const col = columns.find(c => c.key === sort.key);
        if (!col) return out;
        const dir = sort.dir === "asc" ? 1 : -1;
        const labelOf = (v: unknown) => (col.kind === "enum" ? col.options?.find(o => o.value === String(v ?? ""))?.label ?? String(v ?? "") : String(v ?? ""));
        return [...out].sort((a, b) => {
            const va = col.get(a), vb = col.get(b);
            const na = va === null || va === undefined || va === "", nb = vb === null || vb === undefined || vb === "";
            if (na && nb) return 0;
            if (na) return 1;          // empties last either way
            if (nb) return -1;
            if (col.kind === "number") return (Number(va) - Number(vb)) * dir;
            if (col.kind === "enum") return labelOf(va).localeCompare(labelOf(vb), "pt-BR") * dir;
            return String(va).localeCompare(String(vb), "pt-BR") * dir;
        });
    }, [rows, columns, filters, sort]);

    const setFilter = useCallback((key: string, f: ColumnFilter) => setFilters(prev => ({ ...prev, [key]: f })), []);
    const clearColumn = useCallback((key: string) => setFilters(prev => { const n = { ...prev }; delete n[key]; return n; }), []);
    const clearFilters = useCallback(() => setFilters({}), []);
    const isActive = useCallback((key: string) => isActiveFilter(filters[key]), [filters]);
    const anyFilter = columns.some(c => isActiveFilter(filters[c.key]));
    const openMenu = useCallback((key: string, anchor: HTMLElement) => {
        const r = anchor.getBoundingClientRect();
        setMenu(m => (m?.key === key ? null : { key, x: Math.max(8, Math.min(r.left, window.innerWidth - 280)), y: r.bottom + 4 }));
    }, []);
    const closeMenu = useCallback(() => setMenu(null), []);
    // Esc closes the popup (listener only while it is open; stops the event so a cell selection stays)
    useEffect(() => {
        if (!menu) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setMenu(null); } };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [menu]);

    return { rows: filtered, sort, setSort, filters, setFilter, clearColumn, clearFilters, isActive, anyFilter, counts, menu, openMenu, closeMenu, total: rows.length };
}

const formatBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Header cells: a button per column with sort arrow and filter icon. While a filter is active, number columns show the sum of the visible rows. Pass extra cells via `leading` / `trailing`. */
export function ColumnHeaders<T>({ columns, ctl, leading, trailing, className }: { columns: ColumnDef<T>[]; ctl: ColumnFilterController<T>; leading?: React.ReactNode; trailing?: React.ReactNode; className?: string }) {
    const sums = useMemo(() => {
        const m = new Map<string, number>();
        if (!ctl.anyFilter) return m;
        for (const c of columns) {
            if (c.kind !== "number" || c.sum === false) continue;
            let total = 0, any = false;
            for (const r of ctl.rows) { const v = c.get(r); if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) { total += Number(v); any = true; } }
            if (any) m.set(c.key, Math.round(total * 100) / 100);
        }
        return m;
    }, [columns, ctl.rows, ctl.anyFilter]);
    return (
        <tr className={cn("text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border", className)}>
            {leading}
            {columns.map(c => {
                const sorted = ctl.sort.key === c.key;
                const active = ctl.isActive(c.key);
                const align = c.align ?? "left";
                return (
                    <th key={c.key} title={c.title} className={cn("px-2 py-2 font-semibold", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", c.className)}>
                        <button
                            type="button"
                            onClick={e => ctl.openMenu(c.key, e.currentTarget)}
                            title="Ordenar e filtrar"
                            className={cn("inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted hover:text-foreground transition-colors uppercase",
                                (sorted || active) && "text-foreground", align === "right" && "flex-row-reverse")}
                        >
                            <span>{c.label}</span>
                            {sorted ? (ctl.sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                            {active && <Filter className="w-3 h-3 text-emerald-600" />}
                        </button>
                        {c.headerExtra}
                        {sums.has(c.key) && (
                            <span className="block mt-0.5 text-[11px] normal-case tracking-normal font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums" title="Soma das linhas filtradas">
                                {(c.formatSum ?? formatBRL)(sums.get(c.key)!)}
                            </span>
                        )}
                    </th>
                );
            })}
            {trailing}
        </tr>
    );
}

/** Active-filter chips with one-click clear. Renders nothing when no filter is active. */
export function FilterChips<T>({ columns, ctl }: { columns: ColumnDef<T>[]; ctl: ColumnFilterController<T> }) {
    if (!ctl.anyFilter) return null;
    const describe = (c: ColumnDef<T>, f: ColumnFilter): string => {
        if (c.kind === "enum") {
            const labels = Array.from(f.values ?? []).map(v => c.options?.find(o => o.value === v)?.label ?? v);
            return `${c.label}: ${labels.join(", ") || "nenhum"}`;
        }
        if (c.kind === "text") return `${c.label} contém “${(f.text ?? "").trim()}”`;
        const min = (f.min ?? "").trim(), max = (f.max ?? "").trim();
        return `${c.label}: ${min ? `≥ ${min}` : ""}${min && max ? " e " : ""}${max ? `≤ ${max}` : ""}`;
    };
    return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            {columns.filter(c => ctl.isActive(c.key)).map(c => (
                <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 px-2 py-0.5">
                    {describe(c, ctl.filters[c.key])}
                    <button type="button" onClick={() => ctl.clearColumn(c.key)} className="hover:text-foreground" title="Remover filtro"><X className="w-3 h-3" /></button>
                </span>
            ))}
            <button type="button" onClick={ctl.clearFilters} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1">
                <FilterX className="w-3.5 h-3.5" /> Limpar filtros
            </button>
        </div>
    );
}

/** Keeps a fixed popup inside the viewport: slides up/left when it would overflow, scrolls when taller than the screen. */
function useFitInViewport(anchor: { x: number; y: number } | null) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
    useLayoutEffect(() => {
        if (!anchor) { setPos(null); return; }
        const fit = () => {
            const el = ref.current;
            if (!el) return;
            const margin = 8;
            const vw = window.innerWidth, vh = window.innerHeight;
            const maxHeight = Math.max(160, vh - margin * 2);
            const h = Math.min(el.offsetHeight, maxHeight), w = el.offsetWidth;
            const left = Math.max(margin, Math.min(anchor.x, vw - w - margin));
            const top = Math.max(margin, Math.min(anchor.y, vh - h - margin));
            setPos({ left, top, maxHeight });
        };
        fit();
        window.addEventListener("resize", fit);
        return () => window.removeEventListener("resize", fit);
    }, [anchor]);
    return { ref, pos };
}

/** The popup: sort buttons + the filter control for the column's kind. Fixed-positioned at the clicked header, kept inside the viewport. */
export function ColumnMenu<T>({ columns, ctl }: { columns: ColumnDef<T>[]; ctl: ColumnFilterController<T> }) {
    const { ref, pos } = useFitInViewport(ctl.menu);
    if (!ctl.menu) return null;
    const c = columns.find(x => x.key === ctl.menu!.key);
    if (!c) return null;
    const f = ctl.filters[c.key] ?? {};
    const ascLabel = c.kind === "date" || c.kind === "month" ? "Mais antigo primeiro" : c.kind === "number" ? "Menor → maior" : "A → Z";
    const descLabel = c.kind === "date" || c.kind === "month" ? "Mais recente primeiro" : c.kind === "number" ? "Maior → menor" : "Z → A";
    const inputCls = "w-full h-8 rounded-md border border-input bg-background px-2 text-xs";
    const sortBtn = (dir: "asc" | "desc", label: string, Icon: typeof ArrowUp) => (
        <button type="button" onClick={() => { ctl.setSort({ key: c.key, dir }); ctl.closeMenu(); }}
            className={cn("w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted", ctl.sort.key === c.key && ctl.sort.dir === dir && "bg-muted font-semibold")}>
            <Icon className="w-3.5 h-3.5" /> {label}
        </button>
    );
    const counts = ctl.counts.get(c.key);
    return (
        <>
            <div className="fixed inset-0 z-[60]" onClick={ctl.closeMenu} />
            <div ref={ref} className="fixed z-[61] overflow-y-auto w-64 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl p-2 text-xs space-y-1" style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { left: ctl.menu.x, top: ctl.menu.y, visibility: "hidden" }}>
                {sortBtn("asc", ascLabel, ArrowUp)}
                {sortBtn("desc", descLabel, ArrowDown)}
                <div className="border-t border-border my-1" />
                {c.kind === "enum" && c.options && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <span>Filtrar</span>
                            <span className="space-x-2">
                                <button type="button" className="hover:text-foreground" onClick={() => ctl.clearColumn(c.key)}>todos</button>
                                <button type="button" className="hover:text-foreground" onClick={() => ctl.setFilter(c.key, { values: new Set() })}>nenhum</button>
                            </span>
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                            {c.options.filter(o => (counts?.get(o.value) ?? 0) > 0).map(o => {
                                const checked = !f.values || f.values.has(o.value);
                                const count = counts?.get(o.value) ?? 0;
                                return (
                                    <label key={o.value} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted cursor-pointer", count === 0 && "opacity-50")}>
                                        <input type="checkbox" className="accent-emerald-600" checked={checked}
                                            onChange={e => {
                                                const present = c.options!.map(x => x.value).filter(v => (counts?.get(v) ?? 0) > 0);
                                                const next = new Set((f.values ? [...f.values] : present).filter(v => present.includes(v)));
                                                if (e.target.checked) next.add(o.value); else next.delete(o.value);
                                                if (present.every(v => next.has(v))) ctl.clearColumn(c.key); else ctl.setFilter(c.key, { values: next });
                                            }} />
                                        <span className="flex-1">{o.label}</span>
                                        <span className="text-muted-foreground tabular-nums">{count}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}
                {c.kind === "text" && (
                    <div className="px-2 py-1 space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contém o texto</div>
                        <input autoFocus type="text" value={f.text ?? ""} onChange={e => ctl.setFilter(c.key, { ...f, text: e.target.value })} placeholder="Digite para filtrar…" className={inputCls} />
                    </div>
                )}
                {(c.kind === "number" || c.kind === "date" || c.kind === "month") && (
                    <div className="px-2 py-1 space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.kind === "number" ? "Faixa de valores" : "Período"}</div>
                        <div className="flex items-center gap-1.5">
                            <input type={c.kind === "number" ? "number" : c.kind} step={c.kind === "number" ? "0.01" : undefined} placeholder={c.kind === "number" ? "mín." : ""} value={f.min ?? ""}
                                onChange={e => ctl.setFilter(c.key, { ...f, min: e.target.value })} className={inputCls} />
                            <span className="text-muted-foreground">a</span>
                            <input type={c.kind === "number" ? "number" : c.kind} step={c.kind === "number" ? "0.01" : undefined} placeholder={c.kind === "number" ? "máx." : ""} value={f.max ?? ""}
                                onChange={e => ctl.setFilter(c.key, { ...f, max: e.target.value })} className={inputCls} />
                        </div>
                    </div>
                )}
                {ctl.isActive(c.key) && (
                    <button type="button" onClick={() => ctl.clearColumn(c.key)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted text-muted-foreground">
                        <X className="w-3.5 h-3.5" /> Limpar filtro desta coluna
                    </button>
                )}
            </div>
        </>
    );
}
