"use client";

/**
 * Editable money cell: shows "R$ 3.500,00" at rest, a plain number while editing.
 * Works with the draft/commit pattern of the tables: `draft` is the text being
 * typed (undefined when untouched), `onDraft` updates it, `onCommit` saves on blur/Enter.
 */
import React, { useState } from "react";
import { cn } from "@/lib/utils";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toEdit = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "" : n.toFixed(2));
const parse = (s: string): number | null => {
    const t = s.trim().replace(/^R\$\s*/i, "");
    if (t === "") return null;
    // "3.500,50" → 3500.50 · "3500.50" → 3500.50 · "3500,5" → 3500.5
    const normalised = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", ".");
    const n = Number(normalised);
    return Number.isFinite(n) ? n : null;
};

interface Props {
    value: number | null | undefined;
    draft?: string;
    onDraft: (text: string) => void;
    onCommit: () => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    title?: string;
}

export default function MoneyInput({ value, draft, onDraft, onCommit, disabled, placeholder, className, title }: Props) {
    const [editing, setEditing] = useState(false);
    const rest = draft !== undefined ? (parse(draft) === null ? draft : formatBRL(parse(draft)!)) : value === null || value === undefined ? "" : formatBRL(value);
    const text = editing ? (draft ?? toEdit(value)) : rest;
    return (
        <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={text}
            placeholder={placeholder}
            title={title}
            onFocus={e => { setEditing(true); requestAnimationFrame(() => e.target.select()); }}
            onChange={e => onDraft(e.target.value)}
            onBlur={() => { setEditing(false); onCommit(); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className={cn("text-right bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1.5 py-1 outline-none tabular-nums", className)}
        />
    );
}

export { parse as parseMoneyText };
