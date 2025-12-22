
import { createClient } from "../../../utils/supabase/server";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { Button } from "@kitnets/ui";
import { Plus, Router as RouterIcon, Activity } from "lucide-react";
import Link from "next/link";
import { getDictionary } from "../../../dictionaries";

export default async function DashboardPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;

    // Auth Check
    const user = await currentUser();
    if (!user) redirect(`/${lang}/login/proprietario`);

    const supabase = await createClient();

    // Fetch user profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('clerk_id', user.id)
        .single();

    // Fetch gateways
    let gateways: any[] = [];
    if (profile) {
        const { data } = await supabase
            .from('gateways')
            .select('*')
            .eq('owner_id', profile.id);
        gateways = data || [];
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">
                        Bem vindo de volta, {profile?.full_name || user.firstName}.
                    </p>
                </div>
                <Link href={`/${lang}/anunciar`}>
                    <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Imóvel
                    </Button>
                </Link>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">Total de Imóveis</h3>
                    <p className="text-2xl font-bold text-foreground mt-2">0</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">Unidades Alugadas</h3>
                    <p className="text-2xl font-bold text-foreground mt-2">0%</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">Gateways Ativos</h3>
                    <p className="text-2xl font-bold text-foreground mt-2">{gateways.length}</p>
                </div>
            </div>

            {/* Gateways Section */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-foreground">Meus Gateways</h2>
                    <Link href={`/${lang}/dashboard/gateway/new`}>
                        <Button variant="outline" size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar Gateway
                        </Button>
                    </Link>
                </div>

                {gateways.length === 0 ? (
                    <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
                        <RouterIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground">Nenhum Gateway conectado</h3>
                        <p className="text-muted-foreground mt-2">Conecte seu Gateway Kitnet para monitorar consumo de água e luz.</p>
                        <Link href={`/${lang}/dashboard/gateway/new`}>
                            <Button variant="link" className="mt-4 text-primary">Conectar agora</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {gateways.map((gw) => (
                            <div key={gw.id} className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="bg-primary/10 p-2 rounded-lg">
                                            <RouterIcon className="w-6 h-6 text-primary" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-foreground">{gw.label || 'Gateway Sem Nome'}</h4>
                                            <p className="text-xs text-muted-foreground font-mono">{gw.serial_number}</p>
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${gw.status === 'online' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600'}`}>
                                        {gw.status === 'online' ? 'Online' : 'Offline'}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Última atualização</span>
                                        <span className="text-foreground">{gw.last_seen_at ? new Date(gw.last_seen_at).toLocaleTimeString() : '-'}</span>
                                    </div>
                                </div>
                                <div className="mt-6 pt-4 border-t border-border">
                                    <Link href={`/${lang}/dashboard/gateway/${gw.id}`} className="text-primary text-sm font-medium hover:underline flex items-center">
                                        <Activity className="w-4 h-4 mr-2" />
                                        Ver Consumo em Tempo Real
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Properties Placeholder */}
            <div>
                <h2 className="text-xl font-semibold text-foreground mb-4">Meus Imóveis</h2>
                <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
                    <p className="text-muted-foreground">Você ainda não cadastrou nenhum imóvel.</p>
                </div>
            </div>
        </div>
    );
}
