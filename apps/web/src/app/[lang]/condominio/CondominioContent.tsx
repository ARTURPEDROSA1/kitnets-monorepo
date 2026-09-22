"use client";

/**
 * Condomínio — the condominiums the owner runs, one card each with the key figures; a card opens the
 * condominium's cost centre (KPIs, DRE and the monthly ledger). "Novo condomínio" ties a condominium to
 * a multi-unit property that has none yet. `?id=<condominium>` opens one; `?property=<properties.id>`
 * (from the property page) opens the property's condominium or offers to create it.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Building, Check, Home, Loader2, Pencil, Plus, Settings, Sun, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CondominiumCard from "@/components/condominium/CondominiumCard";
import CondominiumLedger from "@/components/condominium/CondominiumLedger";
import type { Condominium } from "@/lib/condominium";

interface CondoProperty { id: string; name: string; address: string; units: number; condominium_id: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CondominioContent({ lang }: { lang: string }) {
    const [condominiums, setCondominiums] = useState<Condominium[] | null>(null);
    const [properties, setProperties] = useState<CondoProperty[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    // create dialog
    const [createOpen, setCreateOpen] = useState(false);
    const [createProperty, setCreateProperty] = useState("");
    const [createName, setCreateName] = useState("");
    const [creating, setCreating] = useState(false);
    // rename
    const [renaming, setRenaming] = useState(false);
    // settings dialog
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [renameText, setRenameText] = useState("");

    const base = `/${lang}`;

    const load = useCallback(async () => {
        const [a, b] = await Promise.all([fetch("/api/condominium"), fetch("/api/condominium/properties")]);
        const da = await a.json().catch(() => ({}));
        const db = await b.json().catch(() => ({}));
        if (!a.ok) throw new Error(da.error || "Erro ao carregar os condomínios");
        const list: Condominium[] = da.condominiums ?? [];
        const props: CondoProperty[] = b.ok ? db.properties ?? [] : [];
        setCondominiums(list);
        setProperties(props);
        return { list, properties: props };
    }, []);

    useEffect(() => {
        let alive = true;
        load()
            .then(({ list, properties }) => {
                if (!alive) return;
                const params = new URLSearchParams(window.location.search);
                const id = params.get("id"), property = params.get("property");
                if (id && UUID.test(id) && list.some(c => c.id === id)) { setSelectedId(id); return; }
                if (property && UUID.test(property)) {
                    const existing = list.find(c => c.property_id === property);
                    if (existing) { setSelectedId(existing.id); return; }
                    const p = properties.find(x => x.id === property);
                    if (p) { setCreateProperty(p.id); setCreateName(`Condomínio ${p.name}`); setCreateOpen(true); }
                }
            })
            .catch(err => { if (alive) { setError((err as Error).message); setCondominiums([]); } });
        return () => { alive = false; };
    }, [load]);

    // keep the URL in step with the open condominium, so a reload lands on the same view
    useEffect(() => {
        if (condominiums === null) return;
        const url = new URL(window.location.href);
        url.searchParams.delete("property");
        if (selectedId) url.searchParams.set("id", selectedId); else url.searchParams.delete("id");
        window.history.replaceState(null, "", url.toString());
    }, [selectedId, condominiums]);

    const available = properties.filter(p => !p.condominium_id);
    const selected = condominiums?.find(c => c.id === selectedId) ?? null;

    const openCreate = () => {
        const first = available[0];
        setCreateProperty(first?.id ?? "");
        setCreateName(first ? `Condomínio ${first.name}` : "");
        setCreateOpen(true);
    };
    const pickCreateProperty = (id: string) => {
        setCreateProperty(id);
        const p = properties.find(x => x.id === id);
        setCreateName(p ? `Condomínio ${p.name}` : "");
    };
    const submitCreate = async () => {
        if (!createProperty) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch("/api/condominium", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_id: createProperty, name: createName }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Erro ao criar o condomínio");
            setCreateOpen(false);
            const { list } = await load();
            setSelectedId(list.find(c => c.id === data.condominium?.id)?.id ?? null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCreating(false);
        }
    };

    const remove = async (c: Condominium) => {
        if (!window.confirm(`Excluir o condomínio “${c.name}”? Os custos lançados na página Condomínio serão removidos. O condomínio cobrado das unidades continua em Receitas de Aluguel.`)) return;
        setDeletingId(c.id);
        setError(null);
        try {
            const res = await fetch(`/api/condominium/${c.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao excluir o condomínio");
            if (selectedId === c.id) setSelectedId(null);
            await load();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDeletingId(null);
        }
    };

    const saveSetting = async (patch: { solar_payback_from_result: boolean }) => {
        if (!selected) return;
        setSavingSettings(true);
        setError(null);
        try {
            const res = await fetch(`/api/condominium/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao salvar a configuração");
            setCondominiums(prev => (prev ?? []).map(c => (c.id === selected.id ? { ...c, ...patch } : c)));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSavingSettings(false);
        }
    };

    const saveRename = async () => {
        if (!selected) return;
        const name = renameText.trim();
        setRenaming(false);
        if (!name || name === selected.name) return;
        try {
            const res = await fetch(`/api/condominium/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao renomear");
            setCondominiums(prev => (prev ?? []).map(c => (c.id === selected.id ? { ...c, name } : c)));
        } catch (err) {
            setError((err as Error).message);
        }
    };

    return (
        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
            {selected ? (
                <>
                    <button type="button" onClick={() => setSelectedId(null)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="w-4 h-4" /> Voltar para todos os condomínios
                    </button>
                    <div className="bg-card border border-border rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                            {renaming ? (
                                <div className="flex items-center gap-2">
                                    <Input autoFocus value={renameText} onChange={e => setRenameText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void saveRename(); if (e.key === "Escape") setRenaming(false); }} className="h-9 max-w-sm" aria-label="Nome do condomínio" />
                                    <button type="button" onClick={() => void saveRename()} className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Salvar"><Check className="w-4 h-4" /></button>
                                    <button type="button" onClick={() => setRenaming(false)} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted" title="Cancelar"><X className="w-4 h-4" /></button>
                                </div>
                            ) : (
                                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                                    <Building className="w-6 h-6 text-emerald-600" /> {selected.name}
                                    <button type="button" onClick={() => { setRenameText(selected.name); setRenaming(true); }} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Renomear condomínio"><Pencil className="w-4 h-4" /></button>
                                    <button type="button" onClick={() => setSettingsOpen(true)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Configurações do condomínio"><Settings className="w-4 h-4" /></button>
                                </h1>
                            )}
                            <p className="text-xs text-muted-foreground">
                                {selected.property_name}{selected.property_address ? ` · ${selected.property_address}` : ""} · {selected.units} {selected.units === 1 ? "unidade" : "unidades"}
                            </p>
                        </div>
                        <Link
                            href={`${base}/imoveis?id=${selected.property_id}`}
                            className="inline-flex items-center gap-1.5 h-9 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors shrink-0"
                        >
                            <Home className="w-4 h-4" /> Ver imóvel
                        </Link>
                    </div>
                    {error && <ErrorBox text={error} />}
                    <CondominiumLedger key={selected.property_id} propertyId={selected.property_id} lang={lang} />
                </>
            ) : (
                <>
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                                <Building className="w-6 h-6 text-emerald-600" /> Condomínio
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Cada imóvel com várias unidades tem o seu condomínio, um centro de custos: a receita é o condomínio cobrado das unidades em
                                Receitas de Aluguel; os custos (energia das áreas comuns, internet, água, IPTU, manutenção) entram aqui.
                            </p>
                        </div>
                        <Button onClick={openCreate} disabled={condominiums === null || available.length === 0} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                            title={available.length === 0 && condominiums !== null ? "Todo imóvel com unidades já tem o seu condomínio. Cadastre as unidades de um imóvel em Imóveis para criar outro." : undefined}>
                            <Plus className="w-4 h-4" /> Novo condomínio
                        </Button>
                    </div>

                    {error && <ErrorBox text={error} />}

                    {condominiums === null ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
                    ) : condominiums.length === 0 ? (
                        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
                            <Building className="w-8 h-8 mx-auto text-muted-foreground" />
                            {available.length > 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nenhum condomínio ainda. Clique em “Novo condomínio” e escolha o imóvel: {available.map(p => p.name).join(", ")}.
                                </p>
                            ) : (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        O condomínio existe para imóveis com várias unidades (kitnets, apartamentos). Cadastre as unidades do imóvel em Imóveis; depois volte aqui e crie o condomínio dele.
                                    </p>
                                    <Link href={`${base}/imoveis`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                                        <Home className="w-4 h-4" /> Ir para Imóveis
                                    </Link>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {condominiums.map(c => (
                                <CondominiumCard key={c.id} condominium={c} onSelect={() => setSelectedId(c.id)} onDelete={() => void remove(c)} deleting={deletingId === c.id} />
                            ))}
                        </div>
                    )}
                </>
            )}

            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Settings className="w-5 h-5 text-emerald-600" /> Configurações{selected ? ` · ${selected.name}` : ""}</DialogTitle>
                        <DialogDescription>Como este condomínio entra nas contas do imóvel.</DialogDescription>
                    </DialogHeader>
                    {selected && (
                        <label className="flex items-start gap-3 py-2 text-sm cursor-pointer select-none">
                            <input
                                type="checkbox" className="mt-1 accent-emerald-600" disabled={savingSettings}
                                checked={selected.solar_payback_from_result}
                                onChange={e => void saveSetting({ solar_payback_from_result: e.target.checked })}
                            />
                            <span>
                                <span className="font-semibold text-foreground flex items-center gap-1.5"><Sun className="w-4 h-4 text-amber-500" /> Usar o resultado mensal do condomínio no payback da energia solar</span>
                                <span className="block text-xs text-muted-foreground mt-1">
                                    Ligado, o resultado de cada mês (receita do condomínio − custos, meses confirmados) é somado ao “Recuperado” do card Energia solar em Investimento no imóvel,
                                    junto com a energia paga pelos inquilinos menos o custo de energia. Use quando o sistema solar alimenta o medidor do condomínio. Meses com prejuízo reduzem o recuperado.
                                </span>
                            </span>
                        </label>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Building className="w-5 h-5 text-emerald-600" /> Novo condomínio</DialogTitle>
                        <DialogDescription>
                            Escolha o imóvel com unidades cujo condomínio você administra. A receita vem do condomínio informado em cada unidade em Receitas de Aluguel.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Imóvel</Label>
                            <select value={createProperty} onChange={e => pickCreateProperty(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                                {available.length === 0 && <option value="">Nenhum imóvel com unidades sem condomínio</option>}
                                {available.map(p => <option key={p.id} value={p.id}>{p.name} · {p.units} {p.units === 1 ? "unidade" : "unidades"}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Nome do condomínio</Label>
                            <Input value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Ex.: Condomínio Santo Antônio" maxLength={120} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button onClick={() => void submitCreate()} disabled={!createProperty || creating} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar condomínio
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ErrorBox({ text }: { text: string }) {
    return (
        <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {text}
        </div>
    );
}
