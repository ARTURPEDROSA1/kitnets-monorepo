"use client";

/**
 * The dashboard's state: the bundle (seeded by the page or fetched from GET /api/dashboard), the day, the
 * month shown, board or calendar (remembered in the account, `view:dashboard`), and what the previous visit
 * had seen (`seen:dashboard`): the receipts posted after it are lit for this visit, and a few seconds in,
 * this visit's newest receipt becomes what was seen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardHub, { type BoardMode } from "@/components/dashboard/DashboardHub";
import { boardMonths, newestLedgerChange } from "@/lib/dashboard-hub";
import type { DashboardView } from "@/lib/dashboard-views";
import { todayBRT } from "@/lib/lease-dashboard";
import { loadAccountPreferences, readLocalPreference, saveAccountPreference, writeLocalPreference } from "@/lib/ui-preferences-client";

interface Props {
    lang: string;
    initial?: DashboardView | null;
}

const PAGE = "dashboard";
const isMode = (v: unknown): v is BoardMode => v === "quadro" || v === "calendario";
/** How long the page must be open before its receipts count as seen. */
const SEEN_AFTER_MS = 4000;

/** Board or calendar: opens on the board, then takes this device's copy and the account's — unless the user already chose in this visit. */
function useBoardMode(): [BoardMode, (m: BoardMode) => void] {
    const [mode, setMode] = useState<BoardMode>("quadro");
    const touched = useRef(false);
    useEffect(() => {
        let alive = true;
        const local = readLocalPreference("views", PAGE);
        void Promise.resolve(local)
            .then(v => { if (alive && !touched.current && isMode(v)) setMode(v); })
            .then(() => loadAccountPreferences())
            .then(all => {
                const remote = all.views[PAGE];
                if (isMode(remote)) {
                    if (alive && !touched.current) { setMode(remote); writeLocalPreference("views", PAGE, remote); }
                } else if (isMode(local)) {
                    // first time the account hears of it: the choice made on this device becomes the account's
                    saveAccountPreference("views", PAGE, local);
                }
            });
        return () => { alive = false; };
    }, []);
    const choose = (m: BoardMode) => {
        touched.current = true;
        setMode(m);
        writeLocalPreference("views", PAGE, m);
        saveAccountPreference("views", PAGE, m);
    };
    return [mode, choose];
}

/**
 * What the previous visit had seen: the account's copy (the newer of it and this device's). `undefined` while
 * it loads, so nothing is lit and nothing is saved before the page knows.
 */
function usePreviousSeen(): string | null | undefined {
    const [seen, setSeen] = useState<string | null | undefined>(undefined);
    useEffect(() => {
        let alive = true;
        const local = readLocalPreference("seen", PAGE);
        void loadAccountPreferences().then(all => {
            const remote = all.seen[PAGE] ?? null;
            const newer = [local, remote].filter((v): v is string => !!v).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
            if (alive) setSeen(newer);
        });
        return () => { alive = false; };
    }, []);
    return seen;
}

export default function DashboardContent({ lang, initial = null }: Props) {
    const base = lang === "pt" ? "" : `/${lang}`;
    const [view, setView] = useState<DashboardView | null>(initial);
    const [seeded] = useState(initial !== null);
    const [error, setError] = useState<string | null>(null);
    const today = useMemo(() => todayBRT(), []);
    const [month, setMonth] = useState(() => today.slice(0, 7));
    const [mode, setMode] = useBoardMode();
    const previousSeen = usePreviousSeen();

    const load = useCallback(async () => {
        try {
            let res = await fetch("/api/dashboard");
            if (res.status === 403) {
                // A brand-new account lands here before its profile row exists: create it, then read again.
                await fetch("/api/profiles/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                res = await fetch("/api/dashboard");
            }
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Não foi possível carregar o painel.");
            setView(json as DashboardView);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Não foi possível carregar o painel.");
        }
    }, []);
    useEffect(() => {
        if (!seeded) void load();
    }, [seeded, load]);

    // a few seconds into the visit, the newest receipt on the page counts as seen (the lit rows stay lit until the next visit)
    useEffect(() => {
        if (!view || previousSeen === undefined) return;
        const newest = newestLedgerChange(view);
        if (!newest || (previousSeen && Date.parse(newest) <= Date.parse(previousSeen))) return;
        const timer = setTimeout(() => {
            writeLocalPreference("seen", PAGE, newest);
            saveAccountPreference("seen", PAGE, newest);
        }, SEEN_AFTER_MS);
        return () => clearTimeout(timer);
    }, [view, previousSeen]);

    const months = useMemo(() => (view ? boardMonths(view, today) : [today.slice(0, 7)]), [view, today]);

    return (
        <DashboardHub
            base={base}
            view={view}
            today={today}
            month={month}
            months={months}
            onMonth={setMonth}
            mode={mode}
            onMode={setMode}
            seenAt={previousSeen ?? null}
            loading={view === null && error === null}
            error={error}
        />
    );
}
