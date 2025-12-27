"use client";

import React from "react";
import { useWaitlist } from "./WaitlistContext";
import { ArrowLeft } from "lucide-react";
import { WAITLIST_STEPS } from "./types";

function ProgressBar({ progress }: { progress: number }) {
    return (
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
                className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
            />
        </div>
    );
}

interface StepLayoutProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    showBack?: boolean;
}

export function StepLayout({ title, subtitle, children, showBack = true }: StepLayoutProps) {
    const { progress, prevStep, state } = useWaitlist();

    const handleBack = () => {
        if (state.currentStep > 0) {
            prevStep();
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-emerald-500/30">
            {/* Top Bar */}
            <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
                <div className="max-w-xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between mb-2">
                        {showBack && state.currentStep > 0 ? (
                            <button
                                onClick={handleBack}
                                className="p-2 -ml-2 rounded-full hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        ) : <div className="w-9" />}

                        <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                            Passo {state.currentStep + 1} de {WAITLIST_STEPS.length}
                        </span>

                        <div className="w-9" />
                    </div>
                    <ProgressBar progress={progress} />
                </div>
            </div>

            {/* Content */}
            <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8 md:py-12 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
                <div className="space-y-2 mb-8 text-center">
                    <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-muted-foreground text-lg">
                            {subtitle}
                        </p>
                    )}
                </div>

                <div className="space-y-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
