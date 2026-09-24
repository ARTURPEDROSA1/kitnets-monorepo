"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, MapPin, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { normalizeCityKey, type FipezapCity } from "@/lib/fipezap-cities";
import { cn } from "@/lib/utils";

export interface CityPickerLabels { search: string; noResults: string; capitals: string; otherCities: string; brasil: string; capital: string; add: string; remove: string }

/**
 * City chooser without a combobox dependency: a button opens a dialog with a search box (accent- and
 * case-insensitive, matches name or UF), the cities grouped into capitals and others, keyboard
 * navigation with ↑ ↓ Enter. Single mode picks one place (the national index included); multiple
 * mode toggles cities up to `max` and shows them as removable chips.
 */
export function CityPicker({ cities, value, onChange, multiple = false, max = 5, exclude = [], labels, title, includeNational = false, className }: {
    cities: readonly FipezapCity[];
    value: string | string[];
    onChange: (v: string | string[]) => void;
    multiple?: boolean;
    max?: number;
    /** slugs that cannot be chosen (the selected city in the comparison picker) */
    exclude?: string[];
    labels: CityPickerLabels;
    title: string;
    includeNational?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const selected = Array.isArray(value) ? value : [value];

    const options = useMemo(() => {
        const q = normalizeCityKey(query);
        return cities.filter(c => (includeNational || c.slug !== "brasil") && !exclude.includes(c.slug) && (!q || normalizeCityKey(`${c.name} ${c.uf ?? ""} ${c.slug}`).includes(q)));
    }, [cities, query, exclude, includeNational]);
    const groups = useMemo(() => [
        { key: "national", label: null, items: options.filter(c => c.slug === "brasil") },
        { key: "capitals", label: labels.capitals, items: options.filter(c => c.isCapital) },
        { key: "others", label: labels.otherCities, items: options.filter(c => c.slug !== "brasil" && !c.isCapital) },
    ].filter(g => g.items.length), [options, labels]);
    const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);

    useEffect(() => { if (open) { const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); } }, [open]);
    const setOpenAndReset = (next: boolean) => { setOpen(next); setQuery(""); setCursor(0); };
    const onQuery = (q: string) => { setQuery(q); setCursor(0); };

    const pick = (slug: string) => {
        if (multiple) {
            const next = selected.includes(slug) ? selected.filter(s => s !== slug) : selected.length < max ? [...selected, slug] : selected;
            onChange(next);
        } else { onChange(slug); setOpenAndReset(false); }
    };
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(flat.length - 1, c + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
        else if (e.key === "Enter" && flat[cursor]) { e.preventDefault(); pick(flat[cursor].slug); }
    };
    const byslug = (slug: string) => cities.find(c => c.slug === slug);
    const single = !multiple ? byslug(selected[0]) : null;

    return (
        <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
            {multiple && selected.map(slug => {
                const c = byslug(slug);
                if (!c) return null;
                return (
                    <span key={slug} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 py-0.5 text-xs font-medium">
                        {c.name}{c.uf && <span className="text-muted-foreground">/{c.uf}</span>}
                        <button type="button" onClick={() => pick(slug)} aria-label={labels.remove.replace("{name}", c.name)} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-3 w-3" /></button>
                    </span>
                );
            })}
            {(!multiple || selected.length < max) && (
                <button
                    type="button"
                    onClick={() => setOpenAndReset(true)}
                    aria-haspopup="dialog"
                    className={cn("inline-flex items-center gap-1.5 rounded-lg border border-input bg-background text-xs font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        multiple ? "h-7 px-2 border-dashed text-muted-foreground" : "h-9 px-3 min-w-[12rem] justify-between")}
                >
                    {multiple ? <><Plus className="h-3.5 w-3.5" />{labels.add}</> : <>
                        <span className="inline-flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{single ? (single.slug === "brasil" ? labels.brasil : `${single.name}${single.uf ? ` · ${single.uf}` : ""}`) : title}</span>
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </>}
                </button>
            )}
            <Dialog open={open} onOpenChange={setOpenAndReset}>
                <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" onKeyDown={onKeyDown}>
                    <DialogHeader className="p-4 pb-2">
                        <DialogTitle className="text-base">{title}</DialogTitle>
                        <DialogDescription className="sr-only">{labels.search}</DialogDescription>
                        <Input ref={inputRef} value={query} onChange={e => onQuery(e.target.value)} placeholder={labels.search} aria-label={labels.search} className="mt-2 h-9" />
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto px-2 pb-2" role="listbox" aria-multiselectable={multiple}>
                        {flat.length === 0 && <p className="p-4 text-sm text-muted-foreground">{labels.noResults}</p>}
                        {groups.map(g => (
                            <div key={g.key} className="py-1">
                                {g.label && <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>}
                                {g.items.map(c => {
                                    const idx = flat.indexOf(c);
                                    const isSel = selected.includes(c.slug);
                                    return (
                                        <button
                                            key={c.slug}
                                            type="button"
                                            role="option"
                                            aria-selected={isSel}
                                            onClick={() => pick(c.slug)}
                                            onMouseEnter={() => setCursor(idx)}
                                            className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm", idx === cursor && "bg-accent", isSel && "font-semibold")}
                                        >
                                            <span className="truncate">{c.slug === "brasil" ? labels.brasil : c.name}</span>
                                            <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">{c.uf}{multiple && isSel ? " ✓" : ""}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
