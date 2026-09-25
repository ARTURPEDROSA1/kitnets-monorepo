"use client";

/**
 * One contract's rent, month by month, from the property's income ledger: what arrived (bars, the
 * months still "previsto" hollow) and the gross rent the ledger implies (line) — the contract value
 * of each month, so an adjustment shows as a step. One axis, two series, a legend, a tooltip.
 */
import React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMonthKey } from "@/lib/property-income";
import type { LeaseIncomePoint } from "@/lib/lease-dashboard";

interface Props {
    points: LeaseIncomePoint[];
    /** whether the rent passes through an agency (the bars are net of its cut) */
    agencyManaged: boolean;
}

const RECEIVED = "#10b981";        // emerald-500
const RECEIVED_EXPECTED = "#a7f3d0"; // emerald-200
const GROSS = "hsl(var(--foreground))";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Datum { key: string; month: string; received: number; gross: number; status: LeaseIncomePoint["status"] }

function ChartTooltip({ active, payload, agencyManaged }: { active?: boolean; payload?: Array<{ payload: Datum }>; agencyManaged: boolean }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold text-foreground">{formatMonthKey(d.key)}{d.status === "EXPECTED" ? " · previsto" : ""}</p>
            <p className="tabular-nums text-muted-foreground">Aluguel bruto: <span className="text-foreground">{brl2(d.gross)}</span></p>
            <p className="tabular-nums text-muted-foreground">{agencyManaged ? "Recebido (líquido)" : "Recebido"}: <span className="text-foreground">{brl2(d.received)}</span></p>
        </div>
    );
}

export default function LeaseRentChart({ points, agencyManaged }: Props) {
    // "set/26": the year in two digits keeps the axis readable on a phone
    const data: Datum[] = points.map(p => ({ key: p.key, month: formatMonthKey(p.key).replace(/\/20(\d\d)$/, "/$1"), received: p.received, gross: p.gross, status: p.status }));

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legenda">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RECEIVED }} /> {agencyManaged ? "Recebido (líquido da imobiliária)" : "Recebido"}</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm border" style={{ background: RECEIVED_EXPECTED, borderColor: RECEIVED }} /> Previsto, ainda não confirmado</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: GROSS }} /> Aluguel bruto (valor de contrato)</span>
            </div>
            <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => brl(v)} />
                        <Tooltip content={<ChartTooltip agencyManaged={agencyManaged} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                        <Bar dataKey="received" name="Recebido" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}
                            shape={(props: unknown) => {
                                const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: Datum };
                                if (!height || height <= 0) return <g />;
                                const expected = payload.status === "EXPECTED";
                                return <rect x={x} y={y} width={width} height={height} rx={4} ry={4} fill={expected ? RECEIVED_EXPECTED : RECEIVED} stroke={expected ? RECEIVED : "none"} strokeWidth={expected ? 1 : 0} />;
                            }}
                        />
                        <Line type="stepAfter" dataKey="gross" name="Aluguel bruto" stroke={GROSS} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
