"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface SelectCardProps {
    label: string;
    description?: string;
    selected: boolean;
    onClick: () => void;
    icon?: React.ReactNode;
    className?: string;
}

export function SelectCard({ label, description, selected, onClick, icon, className }: SelectCardProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "relative cursor-pointer group flex items-start gap-4 p-5 rounded-xl border transition-all duration-300",
                selected
                    ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                    : "border-border bg-card/50 dark:bg-zinc-900/50 hover:border-emerald-500/50 hover:bg-card dark:hover:bg-zinc-900 hover:shadow-[0_0_15px_rgba(16,185,129,0.05)]",
                className
            )}
        >
            {icon && (
                <div className={cn(
                    "p-2.5 rounded-lg transition-colors",
                    selected
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground group-hover:bg-emerald-500/10 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                )}>
                    {icon}
                </div>
            )}

            <div className="flex-1">
                <h3 className={cn("font-medium text-lg transition-colors", selected ? "text-emerald-900 dark:text-emerald-50" : "text-foreground")}>
                    {label}
                </h3>
                {description && (
                    <p className="text-sm mt-1 text-muted-foreground leading-relaxed">
                        {description}
                    </p>
                )}
            </div>

            <div className={cn(
                "absolute top-5 right-5 w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300",
                selected
                    ? "border-emerald-500 bg-emerald-500 text-white scale-110"
                    : "border-input bg-transparent"
            )}>
                {selected && <Check className="w-3 h-3" />}
            </div>
        </div>
    );
}
