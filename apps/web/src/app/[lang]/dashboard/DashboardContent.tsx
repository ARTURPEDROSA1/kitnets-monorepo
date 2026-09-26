"use client";

/**
 * The dashboard's state: the bundle (seeded by the page or fetched from GET /api/dashboard), the day,
 * the pure figures, and the geocoding request that fills the map's missing addresses once per visit.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardHub from "@/components/dashboard/DashboardHub";
import type { GeocodeStatus } from "@/components/dashboard/PortfolioMap";
import { dashboardAttention, dashboardRows, dashboardTotals } from "@/lib/dashboard-hub";
import type { DashboardView } from "@/lib/dashboard-views";
import type { MapPin } from "@/lib/geocode";
import { todayBRT } from "@/lib/lease-dashboard";

interface Props {
    lang: string;
    initial?: DashboardView | null;
    mapsApiKey: string | null;
    mapId: string | null;
}

/** Batches asked per visit: a large portfolio fills its map over a couple of visits, well within the route's hourly limit. */
const GEOCODE_ROUNDS = 3;

export default function DashboardContent({ lang, initial = null, mapsApiKey, mapId }: Props) {
    const router = useRouter();
    const base = lang === "pt" ? "" : `/${lang}`;
    const [view, setView] = useState<DashboardView | null>(initial);
    const [seeded] = useState(initial !== null);
    const [error, setError] = useState<string | null>(null);
    const [geocode, setGeocode] = useState<GeocodeStatus>("idle");
    const today = useMemo(() => todayBRT(), []);

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

    // Addresses the cache does not know yet are geocoded once per visit and the pins come back located.
    // No cancel flag: under React's development double-mount the guard below already keeps it to one request,
    // and a cancelled flag would throw that request's answer away.
    const asked = useRef(false);
    useEffect(() => {
        if (!view || view.map.pending === 0 || asked.current) return;
        asked.current = true;
        void (async () => {
            try {
                for (let round = 0; round < GEOCODE_ROUNDS; round++) {
                    const res = await fetch("/api/geocode", { method: "POST" });
                    if (!res.ok) {
                        setGeocode("failed");
                        return;
                    }
                    const json = (await res.json()) as { pins: MapPin[]; pending: number; geocoded: number };
                    setView(v => (v ? { ...v, map: { pins: json.pins, pending: json.pending } } : v));
                    // nothing left, or nothing could be asked this time (the geocoder is unreachable): stop
                    if (json.pending === 0) break;
                    if (json.geocoded === 0) {
                        setGeocode("failed");
                        return;
                    }
                }
                setGeocode("done");
            } catch {
                setGeocode("failed");
            }
        })();
    }, [view]);

    const rows = useMemo(() => (view ? dashboardRows(view, today) : null), [view, today]);
    const totals = useMemo(() => (view && rows ? dashboardTotals(view, today, rows) : null), [view, rows, today]);
    const attention = useMemo(() => (view && rows ? dashboardAttention(view, today, rows) : []), [view, rows, today]);

    return (
        <DashboardHub
            base={base}
            view={view}
            totals={totals}
            attention={attention}
            loading={view === null && error === null}
            error={error}
            mapsApiKey={mapsApiKey}
            mapId={mapId}
            geocodeStatus={geocode}
            onOpen={href => router.push(`${base}${href}`)}
        />
    );
}
