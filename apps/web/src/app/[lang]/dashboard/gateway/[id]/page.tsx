
import { createClient } from "../../../../../utils/supabase/server";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { Button } from "@kitnets/ui";
import { ArrowLeft, RefreshCw, Zap, Droplets, Flame } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function GatewayDetailPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es"; id: string }> }) {
    const { lang, id } = await params;
    const user = await currentUser();
    if (!user) redirect(`/${lang}/login/proprietario`);

    const supabase = await createClient();

    // Fetch gateway and ensure ownership
    const { data: gateway } = await supabase
        .from('gateways')
        .select(`
            *,
            meters (*)
        `)
        .eq('id', id)
        .single();

    // Authorization check: User must own the profile that owns the gateway
    // We need to fetch the profile id first as we did in dashboard, or use a join.
    // simpler: fetch profile id first.
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('clerk_id', user.id)
        .single();

    if (!gateway || gateway.owner_id !== profile?.id) {
        return notFound();
    }

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
                                {gateway.status}
                            </span>
                        </div>
                    </div>
                    <Button variant="outline" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Meters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(gateway.meters || []).map((meter: any) => (
                    <div key={meter.id} className="bg-card border border-border rounded-xl p-6 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 rounded-lg bg-muted/50">
                                {meter.type === 'electricity' && <Zap className="w-6 h-6 text-yellow-500" />}
                                {meter.type === 'water' && <Droplets className="w-6 h-6 text-blue-500" />}
                                {meter.type === 'gas' && <Flame className="w-6 h-6 text-orange-500" />}
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Leitura Atual</p>
                                <p className="text-2xl font-mono font-bold text-foreground">
                                    {meter.current_reading} <span className="text-sm font-normal text-muted-foreground">{meter.unit}</span>
                                </p>
                            </div>
                        </div>
                        <h3 className="font-medium text-foreground mb-1">{meter.label || `Medidor #${meter.meter_index}`}</h3>
                        <p className="text-xs text-muted-foreground">Fator de Pulso: {meter.pulse_factor} L/p</p>

                        <div className="mt-4 pt-4 border-t border-border">
                            {/* Placeholder for chart */}
                            <div className="h-24 bg-muted/20 rounded flex items-center justify-center text-xs text-muted-foreground">
                                Gráfico de Consumo (Em Breve)
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {gateway.meters?.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                    Nenhum medidor configurado neste gateway.
                </div>
            )}
        </div>
    );
}
