"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Zap, Droplets, Flame, FileText, CalendarSync } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { KPICard } from "@/components/dashboard/KPICards";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";
import { ConsumptionTabs, DailyTotal } from "@/components/dashboard/ConsumptionTabs";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { format, differenceInDays, subDays, startOfMonth } from "date-fns";

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
    estimatedCost: number | null;
    rateInfo: string | null; // e.g. "R$ 9,83/m³ (Jan/2026)"
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
    const [dailyTotalsData, setDailyTotalsData] = useState<DailyTotal[]>([]);
    const [dateRange, setDateRange] = useState<DateRange>({
        start: startOfMonth(new Date()),
        end: new Date(),
        label: "Este Mês",
    });
    const [kpis, setKpis] = useState<KPIs>({
        totalConsumption: 0,
        avgPerDay: 0,
        peakDay: null,
        previousPeriodChange: null,
        estimatedCost: null,
        rateInfo: null,
    });

    // ── Billing cycle sync ────────────────────────────────────
    interface BillingCycle { label: string; start: Date; end: Date; refMonth: string }
    const [billCycles, setBillCycles] = useState<BillingCycle[]>([]);

    // Fetch bills once to compute billing cycles (independent of date range)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            // First get the gateway to know the property_id
            const { data: gw } = await supabase
                .from("gateways")
                .select("property_id")
                .eq("id", id)
                .single();

            if (cancelled || !gw?.property_id) return;

            const { data: billsData } = await supabase
                .rpc("get_property_bills", { p_property_id: gw.property_id });

            if (cancelled || !billsData || billsData.length < 2) return;

            // Use reading_date_orig preferentially, fallback to reading_date
            const sorted = billsData
                .filter((b: any) => b.reading_date_orig || b.reading_date)
                .sort((a: any, b: any) => b.reference_month.localeCompare(a.reference_month));

            const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
            const cycles: BillingCycle[] = [];

            for (let i = 0; i < sorted.length - 1 && cycles.length < 6; i++) {
                const curr = sorted[i];
                const prev = sorted[i + 1];
                const currDate = curr.reading_date_orig || curr.reading_date;
                const prevDate = prev.reading_date_orig || prev.reading_date;
                if (!currDate || !prevDate) continue;

                const [y, m] = curr.reference_month.split("-");
                cycles.push({
                    label: `${monthNames[parseInt(m) - 1]}/${y}`,
                    start: new Date(prevDate + "T00:00:00"),
                    end: new Date(currDate + "T00:00:00"),
                    refMonth: curr.reference_month,
                });
            }

            setBillCycles(cycles);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Track date range timestamps for stable effect deps
    const startMs = dateRange.start.getTime();
    const endMs = dateRange.end.getTime();

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
                setDailyTotalsData([]);
                setKpis({ totalConsumption: 0, avgPerDay: 0, peakDay: null, previousPeriodChange: null, estimatedCost: null, rateInfo: null });
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

            // ── Billing: fetch latest water bill for cost estimation ──
            let estimatedCost: number | null = null;
            let rateInfo: string | null = null;

            if (gw.property_id) {
                const { data: rateData } = await supabase
                    .rpc("get_latest_billing_rate", { p_property_id: gw.property_id });

                const latestBill = rateData?.[0];
                if (latestBill && latestBill.effective_rate_per_m3) {
                    const rate = Number(latestBill.effective_rate_per_m3);
                    // totalConsumption is in liters, rate is R$/m³
                    estimatedCost = Math.round((totalConsumption / 1000) * rate * 100) / 100;
                    const [year, month] = latestBill.reference_month.split("-");
                    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                    const monthLabel = monthNames[parseInt(month) - 1];
                    rateInfo = `R$ ${rate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/m\u00b3 (${monthLabel}/${year})`;
                }
            }

            if (cancelled) return;

            setKpis({ totalConsumption, avgPerDay, peakDay, previousPeriodChange, estimatedCost, rateInfo });
            setDailyTotalsData(
                Object.entries(dailyTotals)
                    .map(([date, total]) => ({ date, total }))
            );
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
            </div>

            {/* ── Date Range Picker ──────────────────────────── */}
            <div className="mb-8">
                <DateRangePicker onChange={handleDateRangeChange} defaultValue="thisMonth" />

                {/* Billing cycle sync buttons */}
                {billCycles.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5 mr-1">
                            <CalendarSync className="w-3.5 h-3.5" />
                            Ciclo de Leitura:
                        </span>
                        {billCycles.slice(0, 4).map((cycle) => {
                            const sd = cycle.start;
                            const ed = cycle.end;
                            const shortStart = `${sd.getDate().toString().padStart(2, "0")}/${(sd.getMonth() + 1).toString().padStart(2, "0")}`;
                            const shortEnd = `${ed.getDate().toString().padStart(2, "0")}/${(ed.getMonth() + 1).toString().padStart(2, "0")}`;
                            const isActive = dateRange.label === `Leitura ${cycle.label}`;
                            return (
                                <button
                                    key={cycle.refMonth}
                                    onClick={() => setDateRange({ start: cycle.start, end: cycle.end, label: `Leitura ${cycle.label}` })}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap border ${isActive
                                            ? "bg-primary text-primary-foreground shadow-sm border-primary"
                                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }`}
                                >
                                    {cycle.label}
                                    <span className="ml-1 opacity-60">({shortStart} — {shortEnd})</span>
                                </button>
                            );
                        })}
                    </div>
                )}
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
                        value={
                            kpis.estimatedCost !== null
                                ? `R$ ${kpis.estimatedCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                                : "-"
                        }
                        description={kpis.rateInfo || "Sem tarifa configurada"}
                        icon="money"
                        loading={loading}
                    />
                </div>

                {/* Link to billing history */}
                {gateway.property_id && (
                    <div className="mt-4">
                        <Link
                            href={`/${lang}/dashboard/billing/${gateway.property_id}?gateway=${id}`}
                            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                            Histórico de Contas de Água →
                        </Link>
                    </div>
                )}
            </div>

            {/* ── Consolidated Chart with Tabs ────────────────── */}
            <div className="mb-12">
                <ConsumptionTabs dailyData={dailyTotalsData} loading={loading} />
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

                                {/* ── Cost Allocation ──────────────── */}
                                {kpis.estimatedCost !== null && metersData.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        {/* Equal split */}
                                        <div className="flex items-center justify-end gap-1.5">
                                            <span className="text-xs uppercase tracking-wider text-muted-foreground">Rateio igual</span>
                                            <span className="text-xs font-semibold text-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                                                R$ {(kpis.estimatedCost / metersData.length).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        {/* Proportional split */}
                                        <div className="flex items-center justify-end gap-1.5">
                                            <span className="text-xs uppercase tracking-wider text-muted-foreground">Proporcional</span>
                                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                                                R$ {(kpis.totalConsumption > 0
                                                    ? (meter.totalConsumption / kpis.totalConsumption) * kpis.estimatedCost
                                                    : 0
                                                ).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        {/* Percentage of total */}
                                        <p className="text-xs text-muted-foreground">
                                            {kpis.totalConsumption > 0
                                                ? ((meter.totalConsumption / kpis.totalConsumption) * 100).toFixed(1)
                                                : "0"
                                            }% do total
                                        </p>
                                    </div>
                                )}
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
