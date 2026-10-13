"use client";

/**
 * The month's rents as a calendar, Sunday first: each rent on its due day, coloured by its status, with the
 * month's bills, instalments, adjustments and contract ends beside them. A day whose rents all came in turns
 * emerald, a day with an overdue rent rose; today is outlined. Three or more rents of one property on the same
 * day fold into one chip ("Bela Vista", the amount and the count), except an overdue one: it always keeps its
 * own chip, so who has not paid shows without a hover. On a phone the grid becomes the list of the days that
 * have something.
 */
import React from "react";
import Link from "next/link";
import { CalendarClock, Droplets, HardHat, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/privacy";
import { brl } from "@/lib/lease-dashboard";
import { calendarWeeks, type MonthEvent, type MonthEventKind, type MonthRent } from "@/lib/dashboard-hub";
import { INK } from "./ink";

interface Props {
    month: string;
    today: string;
    rents: MonthRent[];
    /** bills, instalments, adjustments and contract ends with a date in the month */
    events: MonthEvent[];
    fresh: Set<string>;
    base: string;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAYS_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export const EVENT_META: Record<MonthEventKind, { icon: LucideIcon; chip: string; text: string }> = {
    energia: { icon: Zap, chip: "bg-amber-500/15 text-amber-600", text: "text-amber-600" },
    agua: { icon: Droplets, chip: "bg-sky-500/15 text-sky-600", text: "text-sky-600" },
    parcela: { icon: HardHat, chip: "bg-orange-500/15 text-orange-600", text: "text-orange-600" },
    reajuste: { icon: TrendingUp, chip: "bg-amber-500/15 text-amber-600", text: "text-amber-600" },
    termino: { icon: CalendarClock, chip: "bg-indigo-500/15 text-indigo-500", text: "text-indigo-500" },
};

const RENT_CHIP = {
    recebido: `border-emerald-500/30 bg-emerald-500/10 ${INK.in}`,
    a_vencer: `border-amber-500/30 bg-amber-500/10 ${INK.due}`,
    vencido: `border-rose-500/35 bg-rose-500/10 ${INK.late}`,
} as const;

/** The unit's name when there is one ("Kitnet 3B"), else the contract's title. */
const shortName = (r: MonthRent) => r.lease.unit_name?.trim() || r.title;

type Item =
    | { type: "rent"; rent: MonthRent }
    | { type: "group"; propertyId: string; name: string; rents: MonthRent[] }
    | { type: "event"; event: MonthEvent };

/** The day's items: overdue rents first, each on its own; then the others (grouped by property from three on); then the other events. */
function itemsOf(rents: MonthRent[], events: MonthEvent[]): Item[] {
    const out: Item[] = rents.filter(r => r.status === "vencido").map(rent => ({ type: "rent" as const, rent }));
    const byProperty = new Map<string, MonthRent[]>();
    for (const r of rents) if (r.status !== "vencido") byProperty.set(r.lease.property_id, [...(byProperty.get(r.lease.property_id) ?? []), r]);
    for (const [propertyId, list] of byProperty) {
        if (list.length >= 3) out.push({ type: "group", propertyId, name: list[0].lease.property_name ?? "Imóvel", rents: list });
        else for (const rent of list) out.push({ type: "rent", rent });
    }
    for (const event of events) out.push({ type: "event", event });
    return out;
}

function RentChip({ rent, fresh, base }: { rent: MonthRent; fresh: boolean; base: string }) {
    return (
        <Link
            href={`${base}/contratos?id=${rent.lease.id}`}
            title={`${rent.place} · ${rent.status === "recebido" ? "recebido" : rent.status === "vencido" ? "vencido" : "a vencer"}`}
            className={cn("block rounded-md border px-1.5 py-1 text-[11px] leading-tight transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", RENT_CHIP[rent.status])}
        >
            <span className="flex items-center gap-1 font-semibold">
                {fresh && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="novo" />}
                <span className="truncate">{shortName(rent)}</span>
            </span>
            {rent.lease.unit_name?.trim() && rent.lease.property_name && <span className="block truncate opacity-80">{rent.lease.property_name}</span>}
            <span className="block truncate tabular-nums opacity-80"><Money>{brl(rent.received?.gross ?? rent.rent, 0)}</Money></span>
        </Link>
    );
}

function GroupChip({ name, rents, fresh, base, propertyId }: { name: string; rents: MonthRent[]; fresh: Set<string>; base: string; propertyId: string }) {
    const counts = { recebido: 0, a_vencer: 0, vencido: 0 };
    for (const r of rents) counts[r.status] += 1;
    const worst = counts.vencido > 0 ? "vencido" : counts.a_vencer > 0 ? "a_vencer" : "recebido";
    const total = rents.reduce((s, r) => s + (r.received?.gross ?? r.rent), 0);
    const anyFresh = rents.some(r => fresh.has(r.id));
    return (
        <Link
            href={`${base}/imoveis?id=${propertyId}`}
            title={[`${name}: ${rents.length} aluguéis`, ...rents.map(r => `${shortName(r)}: ${r.status === "recebido" ? "recebido" : r.status === "vencido" ? "vencido" : "a vencer"}`)].join("\n")}
            className={cn("block rounded-md border px-1.5 py-1 text-[11px] leading-tight transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", RENT_CHIP[worst])}
        >
            <span className="flex items-center gap-1 font-semibold">
                {anyFresh && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="novo" />}
                <span className="truncate">{name}</span>
            </span>
            <span className="block truncate tabular-nums opacity-80"><Money>{brl(total, 0)}</Money> · {rents.length}</span>
            <span className="mt-1 flex h-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10" aria-label={`${counts.recebido} recebidos, ${counts.a_vencer} a vencer, ${counts.vencido} vencidos`}>
                <span className="bg-emerald-500" style={{ width: `${(counts.recebido / rents.length) * 100}%` }} />
                <span className="bg-amber-400" style={{ width: `${(counts.a_vencer / rents.length) * 100}%` }} />
                <span className="bg-rose-500" style={{ width: `${(counts.vencido / rents.length) * 100}%` }} />
            </span>
        </Link>
    );
}

function EventChip({ event, base }: { event: MonthEvent; base: string }) {
    const meta = EVENT_META[event.kind];
    const Icon = meta.icon;
    return (
        <Link
            href={`${base}${event.href}`}
            title={[event.title, event.place, event.detail].filter(Boolean).join(" · ")}
            className="block rounded-md border border-border/80 bg-card px-1.5 py-1 text-[11px] leading-tight text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <span className="flex items-center gap-1 font-medium">
                <Icon className={cn("h-3 w-3 shrink-0", meta.text)} />
                <span className="truncate">{event.title}</span>
            </span>
            <span className="block truncate text-muted-foreground">
                {event.amount !== null ? <Money>{brl(event.amount, 0)}</Money> : event.detail}
            </span>
        </Link>
    );
}

function ItemView({ item, fresh, base }: { item: Item; fresh: Set<string>; base: string }) {
    if (item.type === "rent") return <RentChip rent={item.rent} fresh={fresh.has(item.rent.id)} base={base} />;
    if (item.type === "group") return <GroupChip name={item.name} rents={item.rents} fresh={fresh} base={base} propertyId={item.propertyId} />;
    return <EventChip event={item.event} base={base} />;
}

export default function RentCalendar({ month, today, rents, events, fresh, base }: Props) {
    const weeks = calendarWeeks(month);
    const rentsOn = new Map<string, MonthRent[]>();
    for (const r of rents) rentsOn.set(r.due, [...(rentsOn.get(r.due) ?? []), r]);
    const eventsOn = new Map<string, MonthEvent[]>();
    for (const e of events) if (e.date) eventsOn.set(e.date, [...(eventsOn.get(e.date) ?? []), e]);
    const dayTone = (day: string) => {
        const list = rentsOn.get(day) ?? [];
        if (list.some(r => r.status === "vencido")) return "bg-rose-500/[0.05]";
        if (list.length > 0 && list.every(r => r.status === "recebido")) return "bg-emerald-500/[0.06]";
        return "";
    };
    const busyDays = weeks.flat().filter((d): d is string => !!d && ((rentsOn.get(d)?.length ?? 0) > 0 || (eventsOn.get(d)?.length ?? 0) > 0));

    return (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
            {/* the grid, from a tablet up */}
            <div className="hidden md:block">
                <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
                    {WEEKDAYS.map(d => <div key={d} className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                    {weeks.flat().map((day, i) => {
                        const items = day ? itemsOf(rentsOn.get(day) ?? [], eventsOn.get(day) ?? []) : [];
                        const isToday = day === today;
                        return (
                            <div
                                key={day ?? `pad-${i}`}
                                className={cn(
                                    "relative min-h-[112px] border-b border-r border-border/50 p-1.5 [&:nth-child(7n)]:border-r-0",
                                    !day && "bg-muted/20",
                                    day && dayTone(day),
                                )}
                            >
                                {isToday && <span className="pointer-events-none absolute inset-0.5 rounded-md ring-2 ring-emerald-500" aria-hidden />}
                                {day && (
                                    <>
                                        <div className="mb-1 flex items-center justify-between px-0.5">
                                            <span className={cn("text-xs tabular-nums", isToday ? cn("font-bold", INK.in) : day < today ? "text-muted-foreground" : "font-medium text-foreground")}>{Number(day.slice(8, 10))}</span>
                                            {isToday && <span className={cn("text-[10px] font-semibold", INK.in)}>hoje</span>}
                                        </div>
                                        <div className="space-y-1">
                                            {items.map((item, k) => <ItemView key={k} item={item} fresh={fresh} base={base} />)}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* on a phone, the days that have something */}
            <ol className="divide-y divide-border/60 md:hidden">
                {busyDays.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nada vence neste mês.</li>}
                {busyDays.map(day => {
                    const weekday = WEEKDAYS_LONG[new Date(`${day}T12:00:00Z`).getUTCDay()];
                    const isToday = day === today;
                    return (
                        <li key={day} className={cn("flex gap-3 px-3 py-2.5", dayTone(day))}>
                            <div className={cn("w-12 shrink-0 text-center", isToday && "rounded-md ring-2 ring-emerald-500")}>
                                <span className={cn("block text-lg font-bold leading-tight tabular-nums", isToday ? INK.in : "text-foreground")}>{Number(day.slice(8, 10))}</span>
                                <span className="block text-[10px] text-muted-foreground">{isToday ? "hoje" : weekday.slice(0, 3)}</span>
                            </div>
                            <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                                {itemsOf(rentsOn.get(day) ?? [], eventsOn.get(day) ?? []).map((item, k) => <ItemView key={k} item={item} fresh={fresh} base={base} />)}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
