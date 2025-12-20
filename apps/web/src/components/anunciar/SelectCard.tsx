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
                "relative cursor-pointer group flex items-start gap-4 p-4 rounded-xl border-2 transition-all duration-200",
                selected
                    ? "border-emerald-500 bg-zinc-900 shadow-sm shadow-emerald-500/20"
                    : "border-zinc-800 bg-zinc-900 hover:border-emerald-500/50 hover:shadow-emerald-500/10",
                className
            )}
        >
            {icon && (
                <div className={cn(
                    "p-2 rounded-lg transition-colors",
                    // Use consistent style regardless of selection, relying on group-hover for interaction feedback if unselected
                    "bg-zinc-800 text-zinc-400 group-hover:bg-emerald-500/10 group-hover:text-emerald-500"
                )}>
                    {icon}
                </div>
            )}

            <div className="flex-1">
                <h3 className="font-semibold text-lg text-white">
                    {label}
                </h3>
                {description && (
                    <p className="text-sm mt-1 text-zinc-400">
                        {description}
                    </p>
                )}
            </div>

            <div className={cn(
                "absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                selected
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-zinc-700"
            )}>
                {selected && <Check className="w-3.5 h-3.5" />}
            </div>
        </div>
    );
}
