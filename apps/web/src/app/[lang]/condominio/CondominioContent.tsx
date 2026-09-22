"use client";

/**
 * Condomínio — the cost centre of a multi-unit property's condominium: what the units pay as condominium
 * (from Receitas de Aluguel), what the condominium spends, and the result. One property at a time; the
 * selector lists the owner's properties with units. `?property=<properties.id>` opens one directly.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Building, Home, Loader2, AlertCircle } from "lucide-react";
import CondominiumLedger from "@/components/condominium/CondominiumLedger";

interface CondoProperty { id: string; name: string; address: string; units: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CondominioContent({ lang }: { lang: string }) {
    const [properties, setProperties] = useState<CondoProperty[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string>("");

    useEffect(() => {
        let alive = true;
        fetch("/api/condominium/properties")
            .then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!alive) return;
                if (!res.ok) { setError(data.error || "Erro ao carregar os imóveis"); setProperties([]); return; }
                const list: CondoProperty[] = data.properties ?? [];
                setProperties(list);
                const wanted = new URLSearchParams(window.location.search).get("property");
                setSelected(wanted && UUID.test(wanted) && list.some(p => p.id === wanted) ? wanted : list[0]?.id ?? "");
            })
            .catch(() => { if (alive) { setError("Erro ao carregar os imóveis"); setProperties([]); } });
        return () => { alive = false; };
    }, []);

    const base = lang === "pt" ? "" : `/${lang}`;
    const property = properties?.find(p => p.id === selected) ?? null;

    return (
        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Building className="w-6 h-6 text-emerald-600" /> Condomínio
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        O condomínio dos seus imóveis com várias unidades como um centro de custos: a receita é o condomínio cobrado das
                        unidades em Receitas de Aluguel; aqui entram os custos (energia das áreas comuns, internet, água, IPTU, manutenção) e o resultado.
                    </p>
                </div>
                {properties && properties.length > 1 && (
                    <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Imóvel</span>
                        <select value={selected} onChange={e => setSelected(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                            {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.units} {p.units === 1 ? "unidade" : "unidades"}</option>)}
                        </select>
                    </label>
                )}
            </div>

            {error && (
                <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                </div>
            )}

            {properties === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : properties.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
                    <Building className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                        Nenhum imóvel com unidades cadastradas. O condomínio existe para imóveis multifamiliares (kitnets, apartamentos):
                        cadastre as unidades do imóvel em Imóveis e informe o condomínio de cada unidade em Receitas de Aluguel.
                    </p>
                    <Link href={`${base}/imoveis`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                        <Home className="w-4 h-4" /> Ir para Imóveis
                    </Link>
                </div>
            ) : property ? (
                <>
                    <div className="bg-card border border-border rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-bold text-foreground">{property.name}</h2>
                            <p className="text-xs text-muted-foreground">{property.address || "Endereço não informado"} · {property.units} {property.units === 1 ? "unidade" : "unidades"}</p>
                        </div>
                        <Link
                            href={`${base}/imoveis?id=${property.id}`}
                            className="inline-flex items-center gap-1.5 h-9 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
                        >
                            <Home className="w-4 h-4" /> Ver imóvel
                        </Link>
                    </div>
                    <CondominiumLedger key={property.id} propertyId={property.id} />
                </>
            ) : null}
        </div>
    );
}
