"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@kitnets/ui";
import { ArrowLeft, RefreshCw, Zap, Droplets, Flame } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { KPIGrid, KPICard } from "@/components/dashboard/KPICards";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";

export default function GatewayDetailPage() {
    const params = useParams();
    const lang = params.lang as string;
    const id = params.id as string;

    const [gateway, setGateway] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [metersData, setMetersData] = useState<any[]>([]);

    const supabase = createClient();

    const fetchData = async () => {
        setLoading(true);
        const { data: gatewayData, error } = await supabase
            .from('gateways')
            .select(`
                *,
                meters (
                    *,
                    meter_readings (
                        value,
                        read_at
                    )
                )
            `)
            .eq('id', id)
            .single();

        if (error || !gatewayData) {
            console.error(error);
            setLoading(false);
            return;
        }

        setGateway(gatewayData);

        // Process meters
        const processedMeters = (gatewayData.meters || []).map((meter: any) => {
            // Sort readings by date ASC
            const sortedReadings = (meter.meter_readings || []).sort((a: any, b: any) =>
                new Date(a.read_at).getTime() - new Date(b.read_at).getTime()
            );

            // Assuming 'value' is daily consumption (Liters) based on recent context
            // If it's cumulative, we need a different logic (value - prevValue)
            // But based on user input "190", "220" etc, it looks like daily increment.
            const chartData = sortedReadings.map((r: any) => ({
                date: r.read_at,
                date_label: new Date(r.read_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }),
                consumption: Number(r.value)
            }));

            const totalConsumption = chartData.reduce((acc: number, curr: any) => acc + curr.consumption, 0);

            return {
                ...meter,
                chartData,
                totalConsumption
            };
        });

        setMetersData(processedMeters);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    if (loading) {
        return <div className="p-8 text-center">Carregando dados do Gateway...</div>;
    }

    if (!gateway) {
        return <div className="p-8 text-center">Gateway não encontrado.</div>;
    }

    const gatewayTotalConsumption = metersData.reduce((acc, m) => acc + m.totalConsumption, 0);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <Link href={`/${lang}/dashboard`} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar para Dashboard
                </Link>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">{gateway.label}</h1>
                        <div className="flex items-center mt-2 space-x-4">
                            <p className="font-mono text-sm text-muted-foreground">{gateway.serial_number}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${gateway.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {gateway.status?.toUpperCase() || 'OFFLINE'}
                            </span>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchData}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="mb-12">
                <h2 className="text-lg font-semibold mb-4">Visão Geral (Últimos 30 dias)</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KPICard
                        title="Consumo Total"
                        value={gatewayTotalConsumption.toLocaleString('pt-BR')}
                        unit="L"
                        icon="water"
                    />
                    <KPICard
                        title="Média Diária"
                        value={(gatewayTotalConsumption / 30).toFixed(0)}
                        unit="L/dia"
                        icon="activity"
                    />
                    <KPICard
                        title="Custo Estimado"
                        value="-"
                        description="Sem tarifa configurada"
                        icon="money"
                    />
                </div>
            </div>

            {/* Meters Grid */}
            <h2 className="text-lg font-semibold mb-4">Detalhamento por Medidor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {metersData.map((meter: any) => (
                    <div key={meter.id} className="bg-card border border-border rounded-xl p-6 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 rounded-lg bg-muted/50">
                                    {meter.type === 'electricity' ? <Zap className="w-5 h-5 text-yellow-500" /> :
                                        meter.type === 'gas' ? <Flame className="w-5 h-5 text-orange-500" /> :
                                            <Droplets className="w-5 h-5 text-blue-500" />}
                                </div>
                                <div>
                                    <h3 className="font-medium text-foreground">{meter.display_name || meter.id}</h3>
                                    <p className="text-xs text-muted-foreground capitalize">{meter.type === 'water' ? 'Água' : meter.type}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                                <p className="text-xl font-bold text-foreground">
                                    {meter.totalConsumption} <span className="text-sm font-normal text-muted-foreground">{meter.unit || 'L'}</span>
                                </p>
                            </div>
                        </div>

                        <div className="mt-6">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-3">Histórico Recente</h4>
                            <div style={{ height: 200 }}>
                                <ConsumptionChart
                                    data={meter.chartData}
                                    unit={meter.unit || 'L'}
                                    color={meter.type === 'electricity' ? '#eab308' : '#3b82f6'}
                                    height={200}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {metersData.length === 0 && (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    Nenhum medidor configurado neste gateway.
                </div>
            )}
        </div>
    );
}
