"use client";

/**
 * The IoT gateways (the founder-only pilot; not a product of Kitnets.com). Rendered only when the
 * account is on the pilot list (lib/gateways-access.ts); the cards are the ones the old dashboard had.
 */
import React from "react";
import Link from "next/link";
import { Activity, Plus, Router as RouterIcon } from "lucide-react";
import { Button } from "@kitnets/ui";
import type { DashboardGateway } from "@/lib/dashboard-views";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffSec < 60) return "agora mesmo";
    if (diffMin === 1) return "há 1 min";
    if (diffMin < 60) return `há ${diffMin} min`;
    if (diffHour === 1) return "há 1 hora";
    if (diffHour < 24) return `há ${diffHour} horas`;
    if (diffDay === 1) return "há 1 dia";
    return `há ${diffDay} dias`;
}

export default function GatewaysSection({ gateways, base }: { gateways: DashboardGateway[]; base: string }) {
    const online = gateways.filter(g => g.online).length;
    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-foreground"><RouterIcon className="h-5 w-5 text-emerald-600" /> Meus Gateways</h2>
                    <p className="text-xs text-muted-foreground">Piloto dos medidores conectados · {online} de {gateways.length} online</p>
                </div>
                <Link href={`${base}/dashboard/gateway/new`}>
                    <Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" /> Adicionar Gateway</Button>
                </Link>
            </div>

            {gateways.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
                    <RouterIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <h3 className="text-base font-medium text-foreground">Nenhum Gateway conectado</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Conecte seu Gateway Kitnet para monitorar consumo de água e luz.</p>
                    <Link href={`${base}/dashboard/gateway/new`}><Button variant="link" className="mt-3 text-primary">Conectar agora</Button></Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {gateways.map(gw => (
                        <div key={gw.id} className="rounded-xl border border-border/80 bg-card p-5">
                            <div className="mb-4 flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={cn("rounded-lg p-2", gw.online ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-rose-100 dark:bg-rose-900/30")}>
                                        <RouterIcon className={cn("h-6 w-6", gw.online ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400")} />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-foreground">{gw.label || "Gateway sem nome"}</h4>
                                        <p className="font-mono text-xs text-muted-foreground">{gw.serialNumber}</p>
                                    </div>
                                </div>
                                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", gw.online ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400")}>
                                    <span className={cn("inline-block h-2 w-2 rounded-full", gw.online ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                                    {gw.online ? "Online" : "Offline"}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Última atualização</span>
                                {/* relative to "now": the server's and the browser's clock may land in different minutes */}
                                <span suppressHydrationWarning className={cn("font-medium", gw.online ? "text-foreground" : "text-rose-500 dark:text-rose-400")}>{gw.lastSeenAt ? timeAgo(gw.lastSeenAt) : "Nunca"}</span>
                            </div>
                            <div className="mt-4 border-t border-border pt-3">
                                <Link href={`${base}/dashboard/gateway/${gw.id}`} className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                                    <Activity className="mr-2 h-4 w-4" /> Ver consumo em tempo real
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
