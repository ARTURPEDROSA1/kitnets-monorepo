"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { WaitlistData, WaitlistStepId, WAITLIST_STEPS } from "./types";

interface WaitlistState {
    currentStep: number;
    data: WaitlistData;
}

interface WaitlistContextType {
    state: WaitlistState;
    stepId: WaitlistStepId;
    progress: number;
    updateData: (data: Partial<WaitlistData>) => void;
    nextStep: () => void;
    prevStep: () => void;
    jumpToStep: (stepId: WaitlistStepId) => void;
}

const WaitlistContext = createContext<WaitlistContextType | undefined>(undefined);

const initialData: WaitlistData = {
    profile: null,
    identity: {},
    portfolioSize: null,
    location: { city: "", state: "" },
    contact: { name: "", email: "", whatsapp: "" }
};

export function WaitlistProvider({ children }: { children: ReactNode }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [data, setData] = useState<WaitlistData>(initialData);

    const updateData = (newData: Partial<WaitlistData>) => {
        setData((prev) => ({ ...prev, ...newData }));
    };

    const nextStep = () => {
        if (currentStep < WAITLIST_STEPS.length - 1) {
            setCurrentStep((prev) => prev + 1);
            window.scrollTo(0, 0);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep((prev) => prev - 1);
            window.scrollTo(0, 0);
        }
    };

    const jumpToStep = (stepId: WaitlistStepId) => {
        const index = WAITLIST_STEPS.indexOf(stepId);
        if (index !== -1) {
            setCurrentStep(index);
            window.scrollTo(0, 0);
        }
    };

    const progress = Math.round(((currentStep + 1) / WAITLIST_STEPS.length) * 100);

    return (
        <WaitlistContext.Provider
            value={{
                state: { currentStep, data },
                stepId: WAITLIST_STEPS[currentStep],
                progress,
                updateData,
                nextStep,
                prevStep,
                jumpToStep
            }}
        >
            {children}
        </WaitlistContext.Provider>
    );
}

export function useWaitlist() {
    const context = useContext(WaitlistContext);
    if (context === undefined) {
        throw new Error("useWaitlist must be used within a WaitlistProvider");
    }
    return context;
}
