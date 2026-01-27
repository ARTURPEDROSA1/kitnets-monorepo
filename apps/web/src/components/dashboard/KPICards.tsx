"use client";

import { ArrowUpRight, ArrowDownRight, Droplets, Banknote, Calendar, BarChart3, Activity } from "lucide-react";
import React from 'react';

type Trend = 'up' | 'down' | 'neutral';

export interface KPICardProps {
    title: string;
    value: string | number;
    unit?: string;
    description?: string;
    trend?: {
        value: string;
        direction: Trend;
    };
    icon?: 'water' | 'money' | 'calendar' | 'chart' | 'activity';
    loading?: boolean;
}

const getIcon = (type: string) => {
    switch (type) {
        case 'water': return <Droplets className="h-4 w-4 text-muted-foreground" />;
        case 'money': return <Banknote className="h-4 w-4 text-muted-foreground" />;
        case 'calendar': return <Calendar className="h-4 w-4 text-muted-foreground" />;
        case 'chart': return <BarChart3 className="h-4 w-4 text-muted-foreground" />;
        default: return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
};

export function KPICard({ title, value, unit, description, trend, icon = 'activity', loading = false }: KPICardProps) {
    if (loading) {
        return (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 animate-pulse">
                <div className="flex justify-between items-center mb-4">
                    <div className="h-4 w-1/3 bg-muted rounded"></div>
                    <div className="h-4 w-4 bg-muted rounded-full"></div>
                </div>
                <div className="h-8 w-1/2 bg-muted rounded mb-2"></div>
                <div className="h-3 w-1/4 bg-muted rounded"></div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">{title}</h3>
                {getIcon(icon)}
            </div>
            <div className="p-6 pt-0">
                <div className="text-2xl font-bold">
                    {value}
                    {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center">
                    {trend ? (
                        <span className={`mr-2 flex items-center font-medium ${trend.direction === 'up' ? 'text-red-500' :
                                trend.direction === 'down' ? 'text-green-500' : 'text-yellow-500'
                            }`}>
                            {trend.direction === 'up' ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> :
                                trend.direction === 'down' ? <ArrowDownRight className="h-3 w-3 mr-0.5" /> : null}
                            {trend.value}
                        </span>
                    ) : null}
                    {description && <span>{description}</span>}
                </div>
            </div>
        </div>
    );
}

export function KPIGrid({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {children}
        </div>
    );
}
