
import { createAdminClient } from "../../../utils/supabase/admin";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { Button } from "@kitnets/ui";
import { Plus, Router as RouterIcon, Activity, Home, Building2, Users } from "lucide-react";
import Link from "next/link";

interface PropertyDetails {
    numberOfUnits?: number;
    propertyName?: string;
}

interface AdditionalProperty {
    propertyType: 'single' | 'multi';
    details?: PropertyDetails;
}

export default async function DashboardPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;

    // Auth Check
    const user = await currentUser();
    if (!user) redirect(`/${lang}/login/proprietario`);

    // Use admin client to bypass RLS (server component can't carry Clerk JWT for RLS)
    const supabase = createAdminClient();

    // Fetch user profile with all property-related fields
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, property_type, property_details, additional_properties')
        .eq('clerk_id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error('[Dashboard] Profile fetch error:', profileError);
    }

    // Fetch gateways
    let gateways: { id: string; label?: string; serial_number: string; status: string; last_seen_at?: string }[] = [];
    if (profile) {
        const { data } = await supabase
            .from('gateways')
            .select('*')
            .eq('owner_id', profile.id);
        gateways = data || [];
    }

    // ── Compute property counts from profile data ────────────────────
    const primaryType = (profile?.property_type as string) || null;
    const primaryDetails = (profile?.property_details as PropertyDetails) || {};
    const additionalProps = (Array.isArray(profile?.additional_properties) ? profile.additional_properties : []) as AdditionalProperty[];

    // Count all properties (primary + additional)
    let singleCount = 0;
    let multiCount = 0;
    let totalUnits = 0;

    if (primaryType) {
        if (primaryType === 'single') {
            singleCount++;
        } else if (primaryType === 'multi') {
            multiCount++;
            totalUnits += primaryDetails.numberOfUnits || 0;
        }
    }

    for (const ap of additionalProps) {
        if (ap.propertyType === 'single') {
            singleCount++;
        } else if (ap.propertyType === 'multi') {
            multiCount++;
            totalUnits += ap.details?.numberOfUnits || 0;
        }
    }

    const propertyCount = singleCount + multiCount;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">
                        Bem vindo de volta, {profile?.full_name || user.firstName}.
                    </p>
                </div>
                <Link href={`/${lang}/profile?add=true`}>
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
                    <p className="text-2xl font-bold text-foreground mt-2">{propertyCount}</p>
                    <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Home className="w-3.5 h-3.5" />
                                Unifamiliar
                            </span>
                            <span className="font-medium text-foreground">{singleCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Building2 className="w-3.5 h-3.5" />
                                Multifamiliar
                            </span>
                            <span className="font-medium text-foreground">{multiCount}</span>
                        </div>
                        {totalUnits > 0 && (
                            <div className="flex items-center justify-between text-sm pt-1 border-t border-border">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <Users className="w-3.5 h-3.5" />
                                    Total de Unidades
                                </span>
                                <span className="font-medium text-foreground">{totalUnits}</span>
                            </div>
                        )}
                    </div>
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
                {propertyCount === 0 ? (
                    <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
                        <Home className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">Você ainda não cadastrou nenhum imóvel.</p>
                        <Link href={`/${lang}/profile?add=true`}>
                            <Button variant="link" className="mt-4 text-primary">Cadastrar agora</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
                        <p className="text-muted-foreground">
                            {propertyCount} {propertyCount === 1 ? 'imóvel cadastrado' : 'imóveis cadastrados'}.
                            {totalUnits > 0 && ` ${totalUnits} unidades no total.`}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
