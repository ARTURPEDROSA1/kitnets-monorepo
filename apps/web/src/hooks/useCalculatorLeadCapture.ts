"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type TriggerType = 'advanced' | 'export' | 'time';
export type ExportType = 'pdf' | 'csv' | 'copy' | 'print';

interface UseCalculatorLeadCaptureProps {
    calculatorType?: string; // Optional if not used directly
    isSimpleCalculator?: boolean; // For time gate
}

export type LeadMetadata = {
    leadType: string;
    triggerType: string;
    interactionCount: number;
    engagedSeconds: number;
    exportType?: string;
};

// Helper to check cookie
function hasVerifiedCookie() {
    if (typeof document === 'undefined') return false;
    return document.cookie.split('; ').some(row => row.startsWith('kitnets_lead_verified='));
}

export function useCalculatorLeadCapture({ isSimpleCalculator = false }: UseCalculatorLeadCaptureProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [leadMetadata, setLeadMetadata] = useState<LeadMetadata | undefined>(undefined);

    // Timer refs
    const activeSecondsRef = useRef(0);
    const isPageVisibleRef = useRef(true);
    const hasTriggeredRef = useRef(false);
    const interactionCountRef = useRef(0);

    const triggerModal = useCallback((trigger: TriggerType, leadType: string, exportType?: ExportType) => {
        // Double check cookie just in case
        if (hasVerifiedCookie()) return;
        if (hasTriggeredRef.current) return;

        hasTriggeredRef.current = true;
        setLeadMetadata({
            leadType,
            triggerType: trigger,
            interactionCount: interactionCountRef.current,
            engagedSeconds: activeSecondsRef.current,
            exportType
        });
        setIsModalOpen(true);
    }, []);

    const trackInteraction = useCallback(() => {
        interactionCountRef.current += 1;
    }, []);

    const checkTimeTrigger = useCallback(() => {
        if (!isSimpleCalculator) return;
        if (hasTriggeredRef.current) return;
        if (hasVerifiedCookie()) return;

        if (activeSecondsRef.current >= 90 && interactionCountRef.current >= 1) {
            const scrollPercent = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
            if (scrollPercent > 0.3) {
                triggerModal('time', 'calculator_time_gate');
            }
        }
    }, [isSimpleCalculator, triggerModal]);

    const checkAdvancedTrigger = useCallback(() => {
        if (hasVerifiedCookie()) return;

        // Always trigger if called, assuming the caller knows it is an advanced interaction
        triggerModal('advanced', 'calculator_advanced_gate');
    }, [triggerModal]);

    const checkExportTrigger = useCallback((type: ExportType) => {
        if (hasVerifiedCookie()) return false;

        // Export is HARD GATE. Always show if no cookie.
        if (hasTriggeredRef.current && isModalOpen) {
            return true; // Already open, block action
        }

        // Reset triggered ref if we need to re-show (handled by handleClose resetting it, but to be safe)
        if (!isModalOpen) hasTriggeredRef.current = false;

        triggerModal('export', 'calculator_export_gate', type);
        return true; // Blocked
    }, [triggerModal, isModalOpen]);

    // Track active time
    useEffect(() => {
        const handleVisibilityChange = () => {
            isPageVisibleRef.current = document.visibilityState === 'visible';
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const interval = setInterval(() => {
            if (isPageVisibleRef.current) {
                activeSecondsRef.current += 1;
                checkTimeTrigger();
            }
        }, 1000);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(interval);
        };
    }, [checkTimeTrigger]);

    const handleClose = (open: boolean) => {
        if (!open) {
            setIsModalOpen(false);
            // Allow re-triggering immediately
            hasTriggeredRef.current = false;
        } else {
            setIsModalOpen(true);
        }
    };

    return {
        isModalOpen,
        setIsModalOpen: handleClose,
        leadMetadata,
        trackInteraction,
        checkAdvancedTrigger,
        checkExportTrigger,
        hasVerifiedCookie: hasVerifiedCookie(),
    };
}
