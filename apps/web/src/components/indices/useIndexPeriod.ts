"use client";

/**
 * The period state behind the buttons of a history chart: which preset is active, the custom range
 * being edited, the dates the choice covers and which presets the series is too short for. Shared
 * by the standard index pages, the FipeZAP page and the salário mínimo page.
 */
import { useCallback, useMemo, useState } from "react";
import { clampRange, presetIsRedundant, presetRange, type DateRange, type PeriodKey, type PeriodPreset } from "@/lib/index-period";

export function useIndexPeriod(earliest: string, latest: string, presets: PeriodPreset[], defaultKey: PeriodKey) {
    const [period, setPeriod] = useState<PeriodKey>(defaultKey);
    const [custom, setCustomState] = useState<DateRange>(() => presetRange(presets.find((p) => p.key === "1y") ?? presets[0], earliest, latest));

    const redundant = useMemo(() => new Set<PeriodKey>(presets.filter((p) => presetIsRedundant(p, earliest, latest)).map((p) => p.key)), [presets, earliest, latest]);

    const range = useMemo<DateRange>(() => {
        if (period === "custom") return clampRange(custom, earliest, latest);
        const preset = presets.find((p) => p.key === period) ?? presets[presets.length - 1];
        return presetRange(preset, earliest, latest);
    }, [period, custom, presets, earliest, latest]);

    const select = useCallback((key: PeriodKey) => {
        if (key === "custom") {
            // start editing from what is on screen
            setCustomState(range);
        }
        setPeriod(key);
    }, [range]);

    const setCustom = useCallback((next: DateRange) => setCustomState(clampRange(next, earliest, latest)), [earliest, latest]);

    return { period, custom, range, redundant, select, setCustom };
}
