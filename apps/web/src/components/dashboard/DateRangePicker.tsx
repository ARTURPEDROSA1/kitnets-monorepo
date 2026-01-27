"use client";

import React, { useState, useEffect } from "react";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";
import { Button } from "@kitnets/ui";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";

interface DateRangeProps {
    onChange: (start: Date, end: Date, label: string) => void;
}

export function DateRangePicker({ onChange }: DateRangeProps) {
    const [selected, setSelected] = useState<string>("today");

    const ranges = [
        { label: "Hoje", value: "today", getRange: () => [new Date(), new Date()] },
        { label: "Ontem", value: "yesterday", getRange: () => [subDays(new Date(), 1), subDays(new Date(), 1)] },
        { label: "Últimos 7 dias", value: "last7", getRange: () => [subDays(new Date(), 6), new Date()] },
        { label: "Este Mês", value: "thisMonth", getRange: () => [startOfMonth(new Date()), new Date()] },
        { label: "Este Ano", value: "thisYear", getRange: () => [startOfYear(new Date()), new Date()] },
    ];

    const handleSelect = (value: string) => {
        setSelected(value);
        const range = ranges.find((r) => r.value === value);
        if (range) {
            const [start, end] = range.getRange();
            onChange(start, end, range.label);
        }
    };

    // Auto-select "Last 7 days" on mount
    useEffect(() => {
        handleSelect("last7");
    }, []);

    return (
        <div className="flex items-center space-x-2 bg-background border border-border rounded-lg p-1">
            {ranges.map((range) => (
                <button
                    key={range.value}
                    onClick={() => handleSelect(range.value)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${selected === range.value
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
