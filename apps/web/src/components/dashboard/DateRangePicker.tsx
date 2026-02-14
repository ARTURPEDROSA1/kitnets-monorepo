"use client";

import React, { useState } from "react";
import { subDays, startOfMonth, startOfYear, subMonths, endOfMonth } from "date-fns";

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
        const range = ranges.find((r) => r.value === value);
        if (range) {
            const [start, end] = range.getRange();
            onChange(start, end, range.label);
        }
    };

    return (
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
        </div>
    );
}
