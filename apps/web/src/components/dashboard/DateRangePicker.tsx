"use client";

import React, { useState } from "react";
import { subDays, startOfMonth, startOfYear, subMonths, endOfMonth, format } from "date-fns";
import { Calendar } from "lucide-react";

interface DateRangeProps {
    onChange: (start: Date, end: Date, label: string) => void;
    defaultValue?: string;
}

const ranges = [
    { label: "Hoje", value: "today", getRange: () => [new Date(), new Date()] as [Date, Date] },
    { label: "Últimos 7 dias", value: "last7", getRange: () => [subDays(new Date(), 6), new Date()] as [Date, Date] },
    { label: "Este Mês", value: "thisMonth", getRange: () => [startOfMonth(new Date()), new Date()] as [Date, Date] },
    {
        label: "Mês Passado", value: "lastMonth", getRange: () => {
            const prev = subMonths(new Date(), 1);
            return [startOfMonth(prev), endOfMonth(prev)] as [Date, Date];
        }
    },
    { label: "Este Ano", value: "thisYear", getRange: () => [startOfYear(new Date()), new Date()] as [Date, Date] },
];

export function DateRangePicker({ onChange, defaultValue = "last7" }: DateRangeProps) {
    const [selected, setSelected] = useState<string>(defaultValue);
    const [showCustom, setShowCustom] = useState(false);
    const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
    const [customEnd, setCustomEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));

    // Fire initial onChange on mount
    const initializedRef = React.useRef(false);
    React.useEffect(() => {
        if (!initializedRef.current) {
            initializedRef.current = true;
            const range = ranges.find((r) => r.value === defaultValue);
            if (range) {
                const [start, end] = range.getRange();
                onChange(start, end, range.label);
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSelect = (value: string) => {
        setSelected(value);
        setShowCustom(false);
        const range = ranges.find((r) => r.value === value);
        if (range) {
            const [start, end] = range.getRange();
            onChange(start, end, range.label);
        }
    };

    const handleCustomToggle = () => {
        setSelected("custom");
        setShowCustom(true);
    };

    const handleCustomApply = () => {
        if (!customStart || !customEnd) return;
        const start = new Date(customStart + "T00:00:00");
        const end = new Date(customEnd + "T00:00:00");
        if (start > end) return;

        const label = `${format(start, "dd/MM/yyyy")} — ${format(end, "dd/MM/yyyy")}`;
        onChange(start, end, label);
    };

    return (
        <div className="flex flex-col gap-2">
            {/* Preset buttons row */}
            <div className="flex items-center gap-1 flex-wrap bg-background border border-border rounded-lg p-1">
                {ranges.map((range) => (
                    <button
                        key={range.value}
                        onClick={() => handleSelect(range.value)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${selected === range.value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                    >
                        {range.label}
                    </button>
                ))}
                <button
                    onClick={handleCustomToggle}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${selected === "custom"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                >
                    <Calendar className="w-3.5 h-3.5" />
                    Período
                </button>
            </div>

            {/* Custom date inputs (shown when "Período" is selected) */}
            {showCustom && (
                <div className="flex items-center gap-2 flex-wrap bg-background border border-border rounded-lg p-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">De:</label>
                    <input
                        type="date"
                        value={customStart}
                        max={customEnd}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <label className="text-sm text-muted-foreground whitespace-nowrap">Até:</label>
                    <input
                        type="date"
                        value={customEnd}
                        min={customStart}
                        max={format(new Date(), "yyyy-MM-dd")}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                        onClick={handleCustomApply}
                        className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors whitespace-nowrap"
                    >
                        Aplicar
                    </button>
                </div>
            )}
        </div>
    );
}
