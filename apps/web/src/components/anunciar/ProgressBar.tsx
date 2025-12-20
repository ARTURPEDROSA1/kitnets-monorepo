"use client";

import React from "react";


interface ProgressBarProps {
    progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
    return (
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
                className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
            />
        </div>
    );
}
