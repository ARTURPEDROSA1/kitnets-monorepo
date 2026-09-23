"use client";

/**
 * A date typed the Brazilian way — dd/mm/aaaa — whatever language the browser is in.
 *
 * A native `<input type="date">` renders in the browser's locale, not the page's: on a Chrome set
 * to English every date on kitnets.com read 03/17/2026 while the text next to it said 17/03/2026.
 * This input keeps the value ISO (`YYYY-MM-DD`, what the API wants), shows and masks it as
 * dd/mm/aaaa, and the calendar button still opens the browser's own picker. `mode="month"` does
 * the same for `YYYY-MM` as mm/aaaa.
 *
 *   <DateInput value={row.due_on} onChange={iso => patch({ due_on: iso })} />
 *   <DateInput mode="month" value={rentStart} onChange={ym => update({ rentStart: ym || null })} variant="bare" className={cellInput} />
 *
 * `onChange` fires with the ISO string once the typed date is complete and real (30/02 never
 * fires), and with "" when the field is cleared. A half-typed date is put back on blur.
 */
import React, { useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { brToISO, isoToBR, maskBR, type DateInputMode as Mode } from "@/lib/date-input";

export interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
    /** ISO: `YYYY-MM-DD`, or `YYYY-MM` in month mode. */
    value: string | null | undefined;
    onChange: (iso: string) => void;
    mode?: Mode;
    /** `input` looks like the app's Input; `bare` takes only `className` (table cells bring their own look). */
    variant?: "input" | "bare";
    /** Extra classes for the wrapper (width, margins). */
    wrapperClassName?: string;
}

const INPUT_LOOK =
    "flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow";

export function DateInput({ value, onChange, mode = "date", variant = "input", className, wrapperClassName, disabled, readOnly, onBlur, ...rest }: DateInputProps) {
    const [text, setText] = useState(() => isoToBR(value, mode));
    // The parent's value changed (a row reloaded, another cell wrote it): show that, not what was typed
    const [seen, setSeen] = useState(value);
    if (seen !== value) {
        setSeen(value);
        setText(isoToBR(value, mode));
    }
    const native = useRef<HTMLInputElement>(null);

    const placeholder = rest.placeholder ?? (mode === "month" ? "mm/aaaa" : "dd/mm/aaaa");

    const openPicker = () => {
        const el = native.current;
        if (!el || disabled || readOnly) return;
        try {
            el.showPicker();
        } catch {
            el.focus();
            el.click();
        }
    };

    // Auto-fit table cells shrink to the content they see; the text input must claim room for
    // "dd/mm/aaaa" plus the calendar button or the year is clipped under it (seen on the phone).
    const minWidth = mode === "month" ? "min-w-[6.25rem]" : "min-w-[8.25rem]";

    return (
        <span className={cn("relative inline-flex w-full items-center", minWidth, wrapperClassName)}>
            <input
                {...rest}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={placeholder}
                value={text}
                disabled={disabled}
                readOnly={readOnly}
                onChange={e => {
                    const masked = maskBR(e.target.value, mode);
                    setText(masked);
                    if (masked === "") { onChange(""); return; }
                    const iso = brToISO(masked, mode);
                    if (iso && iso !== value) onChange(iso);
                }}
                onBlur={e => {
                    // a half-typed date is nobody's date: put the stored one back
                    if (text !== "" && brToISO(text, mode) === null) setText(isoToBR(value, mode));
                    onBlur?.(e);
                }}
                className={cn(variant === "input" ? INPUT_LOOK : null, "pr-7 tabular-nums", minWidth, className)}
            />
            <button
                type="button"
                tabIndex={-1}
                onClick={openPicker}
                disabled={disabled || readOnly}
                aria-label={mode === "month" ? "Escolher o mês no calendário" : "Escolher a data no calendário"}
                className="absolute right-1.5 inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
                <Calendar className="w-3.5 h-3.5" />
            </button>
            {/* the browser's picker, reached only through the button: it renders in the browser's locale */}
            <input
                ref={native}
                type={mode}
                tabIndex={-1}
                aria-hidden
                value={value ?? ""}
                onChange={e => {
                    const iso = e.target.value;
                    setText(isoToBR(iso, mode));
                    onChange(iso);
                }}
                className="absolute inset-y-0 right-0 w-6 opacity-0 pointer-events-none"
            />
        </span>
    );
}

export default DateInput;
