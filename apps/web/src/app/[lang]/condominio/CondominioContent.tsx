"use client";

/**
 * Condomínio — the hub of the condominiums the owner runs and, at `?id=<condominium>`, one
 * condominium's cost centre (KPIs, DRE and the monthly ledger). "Novo condomínio" ties a condominium
 * to a multi-unit property that has none yet; `?property=<properties.id>` (from the property page)
 * opens the property's condominium or offers to create it. The list is preloaded by the page on the
 * server; refreshes go through the API.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, Building, Building2, Check, Home, Loader2, Pencil, Plus, Settings, Sun, Trash2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CoverCarousel, useCoverCarousel } from "@/components/ui/CoverCarousel";
import CondominioHub from "@/components/condominium/CondominioHub";
import CondominiumLedger from "@/components/condominium/CondominiumLedger";
import { condoRows, condoViewFromParam, type CondoRow, type CondoView } from "@/lib/condominium-hub";
import type { Condominium } from "@/lib/condominium";

export interface CondoProperty { id: string; name: string; address: string; units: number; condominium_id: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
    lang: string;
    initial?: Condominium[] | null;
    initialProperties?: CondoProperty[] | null;
}

export default function CondominioContent({ lang, initial = null, initialProperties = null }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawId = searchParams.get("id");
    const selectedId = rawId && UUID.test(rawId) ? rawId : null;
    const propertyParam = searchParams.get("property");
    const view = condoViewFromParam(searchParams.get("view"));
    const base = `/${lang}/condominio`;

    // ── List ──────────────────────────────────────────────────────
    const [condominiums, setCondominiums] = useState<Condominium[] | null>(initial);
    const [properties, setProperties] = useState<CondoProperty[] | null>(initialProperties);
    const [seeded] = useState(initial !== null);
    const [error, setError] = useState<string | null>(null);

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
        if (seeded) return;
        let alive = true;
        load().catch(err => { if (alive) { setError((err as Error).message); setCondominiums([]); } });
        return () => { alive = false; };
    }, [load, seeded]);

    const rows = useMemo(() => condoRows(condominiums ?? []), [condominiums]);
    const available = useMemo(() => (properties ?? []).filter(p => !p.condominium_id), [properties]);
    const selected = condominiums?.find(c => c.id === selectedId) ?? null;

    // ── Navigation ────────────────────────────────────────────────
    const viewQuery = view === "todos" ? "" : `view=${view}`;
    const select = useCallback((id: string | null) => {
        const query = [id ? `id=${id}` : "", viewQuery].filter(Boolean).join("&");
        router.push(query ? `${base}?${query}` : base, { scroll: true });
    }, [router, base, viewQuery]);
    const setView = (next: CondoView) => router.replace(next === "todos" ? base : `${base}?view=${next}`, { scroll: false });

    // ── Create ────────────────────────────────────────────────────
    const [createOpen, setCreateOpen] = useState(false);
    const [createProperty, setCreateProperty] = useState("");
    const [createName, setCreateName] = useState("");
    const [creating, setCreating] = useState(false);

    // `?property=` from the property page: open its condominium, or offer to create it
    const [propertyHandled, setPropertyHandled] = useState<string | null>(null);
    useEffect(() => {
        if (!propertyParam || !UUID.test(propertyParam) || condominiums === null || properties === null || propertyHandled === propertyParam) return;
        setPropertyHandled(propertyParam);
        const existing = condominiums.find(c => c.property_id === propertyParam);
        if (existing) { router.replace(`${base}?id=${existing.id}`); return; }
        const p = properties.find(x => x.id === propertyParam);
        if (p) { setCreateProperty(p.id); setCreateName(`Condomínio ${p.name}`); setCreateOpen(true); }
    }, [propertyParam, condominiums, properties, propertyHandled, router, base]);

    const openCreate = () => {
        const first = available[0];
        setCreateProperty(first?.id ?? "");
        setCreateName(first ? `Condomínio ${first.name}` : "");
        setCreateOpen(true);
    };
    const pickCreateProperty = (id: string) => {
        setCreateProperty(id);
        const p = (properties ?? []).find(x => x.id === id);
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
            const created = list.find(c => c.id === data.condominium?.id);
            if (created) router.push(`${base}?id=${created.id}`);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCreating(false);
        }
    };

    // ── Delete ────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<Condominium | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/condominium/${deleteTarget.id}`, { method: "DELETE" });
            if (!res.ok) { setDeleteError((await res.json().catch(() => ({}))).error || "Erro ao excluir o condomínio"); return; }
            const wasSelected = selectedId === deleteTarget.id;
            setDeleteTarget(null);
            await load().catch(() => {});
            if (wasSelected) select(null);
        } catch {
            setDeleteError("Erro de conexão. Tente novamente.");
        } finally {
            setDeleting(false);
        }
    };

    // ── Rename & settings (the open condominium) ──────────────────
    const [renaming, setRenaming] = useState(false);
    const [renameText, setRenameText] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);

    const patchSelected = async (patch: { name?: string; solar_payback_from_result?: boolean }, failure: string) => {
        if (!selected) return;
        setError(null);
        const res = await fetch(`/api/condominium/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || failure);
        setCondominiums(prev => (prev ?? []).map(c => (c.id === selected.id ? { ...c, ...patch } : c)));
    };
    const saveSetting = async (patch: { solar_payback_from_result: boolean }) => {
        setSavingSettings(true);
        try { await patchSelected(patch, "Erro ao salvar a configuração"); } catch (err) { setError((err as Error).message); } finally { setSavingSettings(false); }
    };
    const saveRename = async () => {
        if (!selected) return;
        const name = renameText.trim();
        setRenaming(false);
        if (!name || name === selected.name) return;
        try { await patchSelected({ name }, "Erro ao renomear"); } catch (err) { setError((err as Error).message); }
    };

    const deleteModal = deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
                <button type="button" onClick={() => setDeleteTarget(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <h2 className="mb-2 text-xl font-bold text-foreground">Excluir condomínio?</h2>
                    <p className="text-sm text-muted-foreground">
                        Excluir <span className="font-semibold text-foreground">{deleteTarget.name}</span>? Os custos lançados na página Condomínio serão removidos. O condomínio cobrado das unidades continua em Receitas de Aluguel.
                    </p>
                </div>
                {deleteError && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" /> {deleteError}
                    </div>
                )}
                <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
                    <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
                        {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...</> : "Excluir condomínio"}
                    </Button>
                </div>
            </div>
        </div>
    );

    const dialogs = (
        <>
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-emerald-600" /> Configurações{selected ? ` · ${selected.name}` : ""}</DialogTitle>
                        <DialogDescription>Como este condomínio entra nas contas do imóvel.</DialogDescription>
                    </DialogHeader>
                    {selected && (
                        <label className="flex cursor-pointer select-none items-start gap-3 py-2 text-sm">
                            <input
                                type="checkbox" className="mt-1 accent-emerald-600" disabled={savingSettings}
                                checked={selected.solar_payback_from_result}
                                onChange={e => void saveSetting({ solar_payback_from_result: e.target.checked })}
                            />
                            <span>
                                <span className="flex items-center gap-1.5 font-semibold text-foreground"><Sun className="h-4 w-4 text-amber-500" /> Contar o resultado mensal do condomínio como retorno da energia solar</span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                    Água, internet e IPTU são repassados a custo: o que sobra no condomínio a cada mês é a economia que o sistema solar gera na conta de energia.
                                    Ligado, o resultado de cada mês (receita do condomínio − custos, meses confirmados) é somado ao “Recuperado” do card Energia solar em Investimento no imóvel,
                                    junto com a energia paga pelos inquilinos menos o custo de energia. Meses com prejuízo reduzem o recuperado.
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
                        <DialogTitle className="flex items-center gap-2"><Building className="h-5 w-5 text-emerald-600" /> Novo condomínio</DialogTitle>
                        <DialogDescription>
                            Escolha o imóvel com unidades cujo condomínio você administra. A receita vem do condomínio informado em cada unidade em Receitas de Aluguel; as fotos do imóvel viram a capa do card.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Imóvel</Label>
                            <select value={createProperty} onChange={e => pickCreateProperty(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
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
                        <Button onClick={() => void submitCreate()} disabled={!createProperty || creating} className="gap-1.5">
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar condomínio
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );

    if (selectedId && condominiums !== null && selected) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
                <Button variant="ghost" size="sm" onClick={() => select(null)} className="-ml-2">
                    <ArrowLeft className="mr-1 h-4 w-4" /> Condomínio
                </Button>
                <CondominiumHeader
                    condominium={selected}
                    lang={lang}
                    renaming={renaming}
                    renameText={renameText}
                    onRenameText={setRenameText}
                    onStartRename={() => { setRenameText(selected.name); setRenaming(true); }}
                    onSaveRename={() => void saveRename()}
                    onCancelRename={() => setRenaming(false)}
                    onSettings={() => setSettingsOpen(true)}
                    onDelete={() => setDeleteTarget(selected)}
                />
                {error && <ErrorBox text={error} />}
                <CondominiumLedger key={selected.property_id} propertyId={selected.property_id} lang={lang} />
                {deleteModal}
                {dialogs}
            </div>
        );
    }

    return (
        <>
            <CondominioHub
                rows={rows}
                loading={condominiums === null}
                error={error ?? (selectedId && condominiums !== null && !selected ? "Condomínio não encontrado." : null)}
                view={view}
                onViewChange={setView}
                onOpen={(row: CondoRow) => select(row.condo.id)}
                onDelete={row => setDeleteTarget(row.condo)}
                deletingId={deleting && deleteTarget ? deleteTarget.id : null}
                onNew={openCreate}
                availableCount={properties === null ? null : available.length}
            />
            {deleteModal}
            {dialogs}
        </>
    );
}

/** The open condominium's header: the property's photos, the name (renamable), its property and the actions. */
function CondominiumHeader({ condominium: c, lang, renaming, renameText, onRenameText, onStartRename, onSaveRename, onCancelRename, onSettings, onDelete }: {
    condominium: Condominium; lang: string; renaming: boolean; renameText: string; onRenameText: (v: string) => void;
    onStartRename: () => void; onSaveRename: () => void; onCancelRename: () => void; onSettings: () => void; onDelete: () => void;
}) {
    const photos = c.photos ?? [];
    const carousel = useCoverCarousel(photos.length);
    return (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="group w-full shrink-0 overflow-hidden rounded-xl border border-border sm:w-44" onMouseEnter={carousel.pause} onMouseLeave={carousel.resume}>
                <CoverCarousel photos={photos} alt={c.property_name} state={carousel} fallback={<Building className="h-10 w-10" />} className="h-28" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
                {renaming ? (
                    <div className="flex items-center gap-2">
                        <Input autoFocus value={renameText} onChange={e => onRenameText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onSaveRename(); if (e.key === "Escape") onCancelRename(); }} className="h-9 max-w-sm" aria-label="Nome do condomínio" />
                        <button type="button" onClick={onSaveRename} className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Salvar"><Check className="h-4 w-4" /></button>
                        <button type="button" onClick={onCancelRename} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Cancelar"><X className="h-4 w-4" /></button>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="break-words text-2xl font-bold text-foreground">{c.name}</h1>
                        <button type="button" onClick={onStartRename} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Renomear condomínio" aria-label="Renomear condomínio"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={onSettings} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Configurações do condomínio" aria-label="Configurações do condomínio"><Settings className="h-4 w-4" /></button>
                    </div>
                )}
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {c.property_name}</span>
                    {c.property_address && <><span>·</span><span>{c.property_address}</span></>}
                    <span>·</span>
                    <span>{c.units} {c.units === 1 ? "unidade" : "unidades"}</span>
                    {c.solar_payback_from_result && <><span>·</span><span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><Sun className="h-3.5 w-3.5" /> resultado conta como retorno solar</span></>}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Link href={`/${lang}/imoveis?id=${c.property_id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60">
                    <Home className="h-4 w-4" /> Ver imóvel
                </Link>
                <Button variant="ghost" size="icon" onClick={onDelete} title="Excluir condomínio" aria-label="Excluir condomínio" className="text-muted-foreground hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

function ErrorBox({ text }: { text: string }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-900 dark:bg-rose-950/30">
            <AlertCircle className="h-3.5 w-3.5" /> {text}
        </div>
    );
}
