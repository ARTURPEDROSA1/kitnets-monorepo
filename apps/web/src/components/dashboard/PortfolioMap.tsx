"use client";

/**
 * The map of the portfolio: the rental properties, the live projects and the agencies with a contract in
 * force, each kind with its own colour, a legend that toggles kinds, and a popup with the address and a
 * link. Google Maps through @vis.gl/react-google-maps; without a browser key the same pins are listed.
 * Everything drawn over the map is a Google map control, so the Google logo and controls stay visible;
 * the notes about the addresses sit under the map.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdvancedMarker, APIProvider, ControlPosition, InfoWindow, Map, MapControl, Pin, useMap } from "@vis.gl/react-google-maps";
import { AlertCircle, ExternalLink, Loader2, MapPin as MapPinIcon } from "lucide-react";
import { PIN_KIND_META, pinBounds, spreadOverlapping, type MapPin, type MapPinKind } from "@/lib/geocode";
import { cn } from "@/lib/utils";

/** idle: the geocoding request (if any) has not finished; done / failed: it has. */
export type GeocodeStatus = "idle" | "done" | "failed";

interface Props {
    pins: MapPin[];
    /** addresses still to geocode */
    pending: number;
    status: GeocodeStatus;
    apiKey: string | null;
    mapId: string | null;
    base: string;
    unavailable?: boolean;
}

const KINDS: MapPinKind[] = ["property", "project", "agency"];
const BRAZIL = { lat: -14.235, lng: -51.925 };
const located = (p: MapPin): p is MapPin & { lat: number; lng: number } => p.lat !== null && p.lng !== null;
const addresses = (n: number) => `${n} ${n === 1 ? "endereço" : "endereços"}`;

/** Fits the view to the pins shown; one pin gets a street-level zoom, none the whole country. */
function FitBounds({ pins }: { pins: Array<{ lat: number; lng: number }> }) {
    const map = useMap();
    const key = pins.map(p => `${p.lat},${p.lng}`).join(";");
    useEffect(() => {
        if (!map) return;
        const b = pinBounds(pins);
        if (!b) {
            map.setCenter(BRAZIL);
            map.setZoom(4);
        } else if (b.north === b.south && b.east === b.west) {
            map.setCenter({ lat: b.north, lng: b.east });
            map.setZoom(15);
        } else {
            map.fitBounds(b, 56);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, key]);
    return null;
}

function Legend({ counts, hidden, onToggle, className }: { counts: Record<MapPinKind, number>; hidden: Set<MapPinKind>; onToggle: (k: MapPinKind) => void; className?: string }) {
    return (
        <div className={cn("flex flex-wrap gap-1.5", className)}>
            {KINDS.map(k => (
                <button
                    key={k}
                    type="button"
                    onClick={() => onToggle(k)}
                    aria-pressed={!hidden.has(k)}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border bg-background/95 px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur transition-colors", hidden.has(k) ? "border-border text-muted-foreground line-through" : "border-border text-foreground")}
                >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIN_KIND_META[k].color }} />
                    {PIN_KIND_META[k].plural} ({counts[k]})
                </button>
            ))}
        </div>
    );
}

function PinList({ pins, base }: { pins: MapPin[]; base: string }) {
    if (pins.length === 0) return <p className="text-sm text-muted-foreground">Nenhum endereço para mostrar ainda: cadastre um imóvel, um projeto ou uma imobiliária com contrato.</p>;
    return (
        <ul className="grid gap-2 sm:grid-cols-2">
            {pins.map(p => (
                <li key={`${p.kind}:${p.id}`} className="flex items-start gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PIN_KIND_META[p.kind].color }} />
                    <span className="min-w-0 flex-1">
                        <Link href={`${base}${p.href}`} className="font-semibold text-foreground underline-offset-2 hover:underline">{p.label}</Link>
                        {p.subtitle && <span className="text-muted-foreground"> · {p.subtitle}</span>}
                        <span className="block text-xs text-muted-foreground">{p.addressText || "endereço incompleto"}{p.lat === null ? " · sem localização" : ""}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

export default function PortfolioMap({ pins, pending, status, apiKey, mapId, base, unavailable = false }: Props) {
    const [hidden, setHidden] = useState<Set<MapPinKind>>(() => new Set());
    const [open, setOpen] = useState<string | null>(null);
    const counts = useMemo(() => ({ property: pins.filter(p => p.kind === "property").length, project: pins.filter(p => p.kind === "project").length, agency: pins.filter(p => p.kind === "agency").length }), [pins]);
    // pins sharing a position (a CEP-level answer, one building) are spread so each can be clicked
    const shown = useMemo(() => spreadOverlapping(pins.filter(located).filter(p => !hidden.has(p.kind))), [pins, hidden]);
    const unlocated = pins.length - pins.filter(located).length;
    const approximate = pins.filter(p => located(p) && p.precision === "CEP").length;
    const locating = status === "idle" && pending > 0;
    const toggle = (k: MapPinKind) => setHidden(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
    const openPin = open ? shown.find(p => `${p.kind}:${p.id}` === open) ?? null : null;

    const summary = locating
        ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> localizando {addresses(pending)}…</span>
        : status === "failed" && pending > 0
            ? `não foi possível localizar ${addresses(pending)} agora`
            : pending > 0
                ? `${addresses(pending)} ainda por localizar`
                : unlocated > 0
                    ? `${unlocated} sem localização`
                    : addresses(pins.length);

    const header = (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"><MapPinIcon className="h-4 w-4 text-emerald-600" /> Mapa da carteira</h2>
            <span className="text-xs text-muted-foreground">{summary}</span>
        </div>
    );

    // Under the map: what could not be placed, and what is placed only by its CEP
    const notes = [
        !locating && pending === 0 && unlocated > 0 ? `${addresses(unlocated)} não ${unlocated === 1 ? "foi localizado" : "foram localizados"}: confira o CEP e a rua no cadastro.` : null,
        !locating && pending > 0 ? "Os endereços que faltam são localizados na próxima visita." : null,
        approximate > 0 ? `${addresses(approximate)} no mapa pela posição do CEP (aproximada).` : null,
    ].filter(Boolean);

    if (unavailable) {
        return (
            <div>
                {header}
                <p className="flex items-center gap-2 px-4 py-6 text-sm text-rose-600"><AlertCircle className="h-4 w-4 shrink-0" /> Não foi possível montar o mapa.</p>
            </div>
        );
    }

    if (!apiKey) {
        return (
            <div>
                {header}
                <div className="space-y-3 p-4">
                    <p className="text-xs text-muted-foreground">O mapa ainda não está disponível; os endereços da carteira ficam listados aqui.</p>
                    <Legend counts={counts} hidden={hidden} onToggle={toggle} />
                    <PinList pins={pins.filter(p => !hidden.has(p.kind))} base={base} />
                </div>
            </div>
        );
    }

    return (
        <div>
            {header}
            <div className="h-[420px] w-full">
                <APIProvider apiKey={apiKey} language="pt-BR" region="BR" version="quarterly">
                    <Map
                        mapId={mapId ?? "DEMO_MAP_ID"}
                        defaultCenter={BRAZIL}
                        defaultZoom={4}
                        gestureHandling="cooperative"
                        mapTypeControl={false}
                        streetViewControl={false}
                        style={{ width: "100%", height: "100%" }}
                        onClick={() => setOpen(null)}
                    >
                        <FitBounds pins={shown} />
                        <MapControl position={ControlPosition.TOP_LEFT}>
                            <Legend counts={counts} hidden={hidden} onToggle={toggle} className="m-2.5 max-w-[70vw] sm:max-w-none" />
                        </MapControl>
                        {shown.map(p => (
                            <AdvancedMarker key={`${p.kind}:${p.id}`} position={{ lat: p.lat, lng: p.lng }} title={p.label} onClick={() => setOpen(`${p.kind}:${p.id}`)}>
                                <Pin background={PIN_KIND_META[p.kind].color} borderColor={PIN_KIND_META[p.kind].border} glyphColor="#ffffff" />
                            </AdvancedMarker>
                        ))}
                        {openPin && (
                            <InfoWindow position={{ lat: openPin.lat, lng: openPin.lng }} onCloseClick={() => setOpen(null)}>
                                <div className="max-w-[240px] space-y-1 text-sm text-slate-900">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PIN_KIND_META[openPin.kind].color }}>{PIN_KIND_META[openPin.kind].label}</p>
                                    <p className="font-semibold leading-tight">{openPin.label}</p>
                                    {openPin.subtitle && <p className="text-xs text-slate-600">{openPin.subtitle}</p>}
                                    <p className="text-xs text-slate-600">{openPin.addressText}{openPin.precision === "CEP" ? " · posição aproximada (CEP)" : ""}</p>
                                    <Link href={`${base}${openPin.href}`} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline">
                                        Abrir <ExternalLink className="h-3 w-3" />
                                    </Link>
                                </div>
                            </InfoWindow>
                        )}
                    </Map>
                </APIProvider>
            </div>
            {notes.length > 0 && (
                <p className="border-t border-border/60 px-4 py-2 text-[11px] leading-snug text-muted-foreground">{notes.join(" ")}</p>
            )}
        </div>
    );
}
