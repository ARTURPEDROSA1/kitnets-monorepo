"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@kitnets/ui";
import { ArrowLeft, RefreshCw, Zap, Droplets, Flame } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { KPICard } from "@/components/dashboard/KPICards";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { format, differenceInDays, subDays } from "date-fns";

interface DateRange {
    start: Date;
    end: Date;
    label: string;
}

interface KPIs {
    totalConsumption: number;
    avgPerDay: number;
    peakDay: { date: string; value: number } | null;
    previousPeriodChange: number | null;
}

/** Extract "DD/MM" from an ISO date string without timezone conversion */
function shortDateLabel(isoOrDateStr: string): string {
    const d = isoOrDateStr.substring(0, 10); // "2026-02-14"
    return `${d.substring(8, 10)}/${d.substring(5, 7)}`;
}

export default function GatewayDetailPage() {
    const params = useParams();
    const lang = params.lang as string;
    const id = params.id as string;
    const supabase = createClient();

    const [gateway, setGateway] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [metersData, setMetersData] = useState<any[]>([]);
    const [dateRange, setDateRange] = useState<DateRange | null>(null);
    const [kpis, setKpis] = useState<KPIs>({
        totalConsumption: 0,
        avgPerDay: 0,
        peakDay: null,
        previousPeriodChange: null,
    });

    // Track date range timestamps for stable effect deps
    const startMs = dateRange?.start.getTime();
    const endMs = dateRange?.end.getTime();

    useEffect(() => {
        if (!dateRange) return;
        let cancelled = false;

        const fetchData = async () => {
            setLoading(true);

            const startStr = format(dateRange.start, "yyyy-MM-dd");
            const endStr = format(dateRange.end, "yyyy-MM-dd");

            // 1. Gateway + meters (no readings — fast)
            const { data: gw, error } = await supabase
                .from("gateways")
                .select("*, meters(*)")
                .eq("id", id)
                .single();

            if (cancelled) return;
            if (error || !gw) {
                console.error(error);
                setLoading(false);
                return;
            }

            setGateway(gw);
            const meterIds: string[] = (gw.meters || []).map((m: any) => m.id);

            if (meterIds.length === 0) {
                setMetersData([]);
                setKpis({ totalConsumption: 0, avgPerDay: 0, peakDay: null, previousPeriodChange: null });
                setLoading(false);
                return;
            }

            // 2. Current-period readings (date-filtered)
            const { data: readings } = await supabase
                .from("meter_readings")
                .select("meter_id, value, read_at")
                .in("meter_id", meterIds)
                .gte("read_at", startStr)
                .lte("read_at", endStr + "T23:59:59.999Z")
                .order("read_at", { ascending: true });

            if (cancelled) return;

            // 3. Previous-period readings (same duration, immediately before)
            const daysInRange = differenceInDays(dateRange.end, dateRange.start) + 1;
            const prevStart = subDays(dateRange.start, daysInRange);
            const prevEnd = subDays(dateRange.start, 1);

            const { data: prevReadings } = await supabase
                .from("meter_readings")
                .select("value")
                .in("meter_id", meterIds)
                .gte("read_at", format(prevStart, "yyyy-MM-dd"))
                .lte("read_at", format(prevEnd, "yyyy-MM-dd") + "T23:59:59.999Z");

            if (cancelled) return;

            // ── Process readings ──────────────────────────────
            const allReadings = readings || [];
            const meterMap: Record<string, any[]> = {};
            const dailyTotals: Record<string, number> = {};

            for (const r of allReadings) {
                if (!meterMap[r.meter_id]) meterMap[r.meter_id] = [];
                meterMap[r.meter_id].push(r);

                const dateKey = r.read_at.substring(0, 10);
                dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + Number(r.value);
            }

            const processedMeters = (gw.meters || []).map((meter: any) => {
                const sorted = (meterMap[meter.id] || []).sort((a: any, b: any) =>
                    a.read_at.localeCompare(b.read_at)
                );

                const chartData = sorted.map((r: any) => ({
                    date: r.read_at,
                    date_label: shortDateLabel(r.read_at),
                    consumption: Number(r.value),
                }));

                const totalConsumption = chartData.reduce(
                    (acc: number, c: any) => acc + c.consumption, 0
                );

                return { ...meter, chartData, totalConsumption };
            });

            // ── KPIs ─────────────────────────────────────────
            const totalConsumption = processedMeters.reduce(
                (acc: number, m: any) => acc + m.totalConsumption, 0
            );
            const avgPerDay = daysInRange > 0 ? Math.round(totalConsumption / daysInRange) : 0;

            let peakDay: KPIs["peakDay"] = null;
            for (const [date, total] of Object.entries(dailyTotals)) {
                if (!peakDay || total > peakDay.value) {
                    peakDay = { date, value: total };
                }
            }

            const prevTotal = (prevReadings || []).reduce(
                (acc: number, r: any) => acc + Number(r.value), 0
            );
            const previousPeriodChange =
                prevTotal > 0
                    ? Math.round(((totalConsumption - prevTotal) / prevTotal) * 100)
                    : null;

            setKpis({ totalConsumption, avgPerDay, peakDay, previousPeriodChange });
            setMetersData(processedMeters);
            setLoading(false);
        };

        fetchData();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, startMs, endMs]);

    // ── Handlers ──────────────────────────────────────────────
    const handleDateRangeChange = (start: Date, end: Date, label: string) => {
        setDateRange({ start, end, label });
    };

    const handleRefresh = () => {
        if (dateRange) {
            // Force re-fetch by creating new Date objects with same values
            setDateRange({ ...dateRange, start: new Date(dateRange.start), end: new Date(dateRange.end) });
        }
    };

    // ── Loading / empty states ────────────────────────────────
    if (!gateway && loading) {
        return <div className="p-8 text-center">Carregando dados do Gateway...</div>;
    }
    if (!gateway) {
        return <div className="p-8 text-center">Gateway não encontrado.</div>;
    }

    // ── Derived display values ────────────────────────────────
    const peakDayValue = kpis.peakDay ? kpis.peakDay.value.toLocaleString("pt-BR") : "-";
    const peakDayDesc = kpis.peakDay ? shortDateLabel(kpis.peakDay.date) : undefined;

    const changeLabel =
        kpis.previousPeriodChange !== null
            ? `${kpis.previousPeriodChange > 0 ? "+" : ""}${kpis.previousPeriodChange}%`
            : "-";
    const changeDirection: "up" | "down" | "neutral" =
        kpis.previousPeriodChange !== null
            ? kpis.previousPeriodChange > 0
                ? "up"
                : kpis.previousPeriodChange < 0
                    ? "down"
                    : "neutral"
            : "neutral";

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* ── Header ─────────────────────────────────────── */}
            <div className="mb-6">
                <Link
                    href={`/${lang}/dashboard`}
                    className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar para Dashboard
                </Link>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">{gateway.label}</h1>
                        <div className="flex items-center mt-2 space-x-4">
                            <p className="font-mono text-sm text-muted-foreground">{gateway.serial_number}</p>
                            <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${gateway.status === "online"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                    }`}
                            >
                                {gateway.status?.toUpperCase() || "OFFLINE"}
                            </span>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* ── Date Range Picker ──────────────────────────── */}
            <div className="mb-8">
                <DateRangePicker onChange={handleDateRangeChange} defaultValue="last7" />
            </div>

            {/* ── KPI Cards ──────────────────────────────────── */}
            <div className="mb-12">
                <h2 className="text-lg font-semibold mb-4">
                    Visão Geral{dateRange ? ` (${dateRange.label})` : ""}
                </h2>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                    <KPICard
                        title="Consumo Total"
                        value={kpis.totalConsumption.toLocaleString("pt-BR")}
                        unit="L"
                        icon="water"
                        loading={loading}
                    />
                    <KPICard
                        title="Média Diária"
                        value={kpis.avgPerDay.toLocaleString("pt-BR")}
                        unit="L/dia"
                        icon="activity"
                        loading={loading}
                    />
                    <KPICard
                        title="Dia de Pico"
                        value={peakDayValue}
                        unit={kpis.peakDay ? "L" : undefined}
                        description={peakDayDesc}
                        icon="chart"
                        loading={loading}
                    />
                    <KPICard
                        title="vs Período Anterior"
                        value={changeLabel}
                        trend={
                            kpis.previousPeriodChange !== null
                                ? { value: "vs período anterior", direction: changeDirection }
                                : undefined
                        }
                        description={kpis.previousPeriodChange === null ? "Sem dados anteriores" : undefined}
                        icon="chart"
                        loading={loading}
                    />
                    <KPICard
                        title="Custo Estimado"
                        value="-"
                        description="Sem tarifa configurada"
                        icon="money"
                        loading={loading}
                    />
                </div>
            </div>

            {/* ── Per-meter detail cards ──────────────────────── */}
            <h2 className="text-lg font-semibold mb-4">Detalhamento por Medidor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {metersData.map((meter: any) => (
                    <div key={meter.id} className="bg-card border border-border rounded-xl p-6 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 rounded-lg bg-muted/50">
                                    {meter.type === "electricity" ? (
                                        <Zap className="w-5 h-5 text-yellow-500" />
                                    ) : meter.type === "gas" ? (
                                        <Flame className="w-5 h-5 text-orange-500" />
                                    ) : (
                                        <Droplets className="w-5 h-5 text-blue-500" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-medium text-foreground">
                                        {meter.display_name || meter.id}
                                    </h3>
                                    <p className="text-xs text-muted-foreground capitalize">
                                        {meter.type === "water" ? "Água" : meter.type}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                                <p className="text-xl font-bold text-foreground">
                                    {meter.totalConsumption.toLocaleString("pt-BR")}{" "}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        {meter.unit || "L"}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="mt-6">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-3">
                                Histórico Recente
                            </h4>
                            <div style={{ height: 200 }}>
                                <ConsumptionChart
                                    data={meter.chartData}
                                    unit={meter.unit || "L"}
                                    color={meter.type === "electricity" ? "#eab308" : "#3b82f6"}
                                    height={200}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {metersData.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    Nenhum medidor configurado neste gateway.
                </div>
            )}
        </div>
    );
}
