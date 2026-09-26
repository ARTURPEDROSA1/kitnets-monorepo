"use client";

/**
 * The units of a multi-unit property read flat, like the "Ficha do imóvel": one block per unit with its data as
 * a summary, its photos and videos always on screen, and "Editar" opening the wizard's own fields in place.
 * No accordion. The handlers and the fields are shared with the wizard (PropertyDetailsCard).
 */
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, CheckCircle2, Copy, FileSignature, Home, Loader2, PenLine, Play, Plus, Sparkles, Trash2, Video, Wand2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import PhotoLightbox, { type LightboxPhoto } from "@/components/investments/PhotoLightbox";
import { FilePreview, SubUnitFields, isSubUnitComplete, subUnitActions, type SubUnit, type SubUnitsSectionProps, type UnitContractFile } from "@/components/profile/PropertyDetailsCard";
import { Field, dash, muted } from "@/components/profile/PropertyRegisterSection";

const UNIT_TYPE_LABEL: Record<string, string> = { kitnet: "Kitnet", studio: "Studio", apartment: "Apartamento", house: "Casa", bedroom: "Quarto", commercial_room: "Sala comercial", garage: "Garagem", other: "Outro" };
const LAUNDRY: Record<SubUnit["laundry"], string> = { none: "não possui", individual: "individual", shared: "compartilhada" };
const AC: Record<SubUnit["ac"], string> = { none: "não possui", cold: "frio", cold_hot: "quente e frio" };
const COOKTOP: Record<SubUnit["cooktop"], string> = { none: "não possui", gas: "gás", electric: "elétrico", induction: "indução" };
const CONDO_INCLUDES: Array<[keyof SubUnit["condominiumIncludes"], string]> = [["energy", "energia"], ["water", "água"], ["internet", "internet"], ["iptu", "IPTU"], ["gas", "gás"]];

/** A label around a hidden file input, styled and focusable like a small outline button. */
const btn = "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs hover:border-emerald-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2";
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";
const yesNo = (v: boolean) => (v ? "sim" : muted("não"));
const brl = (v: string) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null; };
/** The unit's identity for the editor: its id, else its position. */
const keyOf = (unit: SubUnit, idx: number) => unit.id ?? `idx:${idx}`;

function Badge({ tone, children }: { tone: "emerald" | "amber" | "sky"; children: React.ReactNode }) {
    const tones = {
        emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
        amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
        sky: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    };
    return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", tones[tone])}>{children}</span>;
}

export default function SubUnitsFlatSection({
    details, units, onDetailsChange, onUnitsChange, onGenerateDescription, generatingDescriptionIdx, onImportContract, importingContractIdx,
    initialOpenIdx, propertyIndex, unitContracts, leasedUnitIds, onCommit, saveState = "idle",
}: SubUnitsSectionProps) {
    const [editing, setEditing] = useState<string | null>(() => (initialOpenIdx !== null && initialOpenIdx !== undefined && units[initialOpenIdx] ? keyOf(units[initialOpenIdx], initialOpenIdx) : null));
    const [contractViewer, setContractViewer] = useState<UnitContractFile | null>(null);
    const [lightbox, setLightbox] = useState<{ unit: number; index: number } | null>(null);
    const [videoOpen, setVideoOpen] = useState<string | null>(null);
    const closeVideoRef = useRef<HTMLButtonElement | null>(null);
    const saving = saveState === "saving";

    const actions = subUnitActions({
        details, units, onDetailsChange, onUnitsChange, onCommit,
        // a unit added or duplicated opens for editing and comes into view
        onInserted: (index, unit) => {
            setEditing(keyOf(unit, index));
            if (propertyIndex !== undefined) setTimeout(() => document.getElementById(`prop-${propertyIndex}-unit-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        },
    });
    const removeUnit = (idx: number) => {
        const key = keyOf(units[idx], idx);
        if (actions.removeUnit(idx) && editing === key) setEditing(null);
    };

    // The video player closes on Escape, like the other overlays
    useEffect(() => {
        if (!videoOpen) return;
        closeVideoRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setVideoOpen(null); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [videoOpen]);

    const unitHasLease = (unit: SubUnit) => !!unit.id && (!!leasedUnitIds?.includes(unit.id) || !!unitContracts?.[unit.id]);
    const rented = units.filter(unitHasLease).length;
    const available = units.length - rented;
    const incomplete = units.filter(u => !isSubUnitComplete(u)).length;
    const finish = () => { setEditing(null); onCommit?.(); };
    const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; return files; };
    const openContract = (contract: UnitContractFile) => {
        // Only PDFs open in the viewer; a photo of the agreement opens in a new tab
        if (contract.mime_type === "application/pdf" || contract.file_name.toLowerCase().endsWith(".pdf")) setContractViewer(contract);
        else window.open(contract.file_url, "_blank", "noopener,noreferrer");
    };

    const lightboxUnit = lightbox !== null ? units[lightbox.unit] : null;
    const lightboxPhotos: LightboxPhoto[] = (lightboxUnit?.photos ?? []).map((url, i) => ({ id: url, url, name: `${lightboxUnit?.name || "Unidade"} · foto ${i + 1}` }));

    return (
        <section
            className="rounded-xl border border-border/80 bg-card"
            onBlur={(e) => {
                // Focus left a typed field: persist what was typed (a no-op when nothing changed)
                const tag = (e.target as HTMLElement).tagName;
                if (tag === "INPUT" || tag === "TEXTAREA") onCommit?.();
            }}
        >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">Unidades locáveis ({units.length})</h2>
                    <p className="text-xs text-muted-foreground">
                        {units.length === 0
                            ? "As unidades que você aluga separadamente: kitnets, apartamentos, salas, garagens."
                            : [`${rented} ${rented === 1 ? "alugada" : "alugadas"}`, `${available} ${available === 1 ? "disponível" : "disponíveis"}`, incomplete > 0 ? `${incomplete} a preencher` : null].filter(Boolean).join(" · ")}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {saveState !== "idle" && (
                        <span role="status" className={cn("flex items-center gap-1 text-xs", saveState === "error" ? "text-destructive" : "text-muted-foreground")}>
                            {saveState === "saving" && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...</>}
                            {saveState === "saved" && <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Alterações salvas</>}
                            {saveState === "error" && "Não foi possível salvar"}
                        </span>
                    )}
                    <Button variant="outline" size="sm" onClick={actions.addUnit} disabled={saving} className="h-8 gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar unidade</Button>
                </div>
            </header>

            {units.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma unidade ainda. Clique em &quot;Adicionar unidade&quot; para cadastrar a primeira.</p>
            )}

            <div className="divide-y divide-border/60">
                {units.map((unit, idx) => {
                    const key = keyOf(unit, idx);
                    const isEditing = editing === key;
                    const hasLease = unitHasLease(unit);
                    const contract = unit.id ? unitContracts?.[unit.id] : undefined;
                    const complete = isSubUnitComplete(unit);
                    const photoCount = (unit.photos?.length || 0) + (unit.newPhotos?.length || 0);
                    const videoCount = (unit.videos?.length || 0) + (unit.newVideos?.length || 0);
                    const condo = unit.condominium
                        ? [brl(unit.condominiumValue) ?? "sim", CONDO_INCLUDES.filter(([k]) => unit.condominiumIncludes?.[k]).map(([, l]) => l).join(", ") || null].filter(Boolean).join(" · inclui ")
                        : null;
                    const importing = importingContractIdx === idx;
                    const name = unit.name || `Unidade ${idx + 1}`;
                    return (
                        <div key={key} id={propertyIndex !== undefined ? `prop-${propertyIndex}-unit-${idx}` : undefined} className="space-y-3 px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                                    <Home className="h-4 w-4 text-violet-600" /> {name}
                                    {unit.unitType && <span className="text-xs font-normal text-muted-foreground">{UNIT_TYPE_LABEL[unit.unitType] ?? unit.unitType}</span>}
                                    {hasLease ? <Badge tone="emerald">alugada</Badge> : <Badge tone="sky">disponível</Badge>}
                                    {complete ? <Badge tone="emerald">preenchida</Badge> : <Badge tone="amber">a preencher</Badge>}
                                </h3>
                                <div className="flex flex-wrap items-center gap-1">
                                    {contract && (
                                        <button type="button" onClick={() => openContract(contract)} title="Ver o contrato de locação desta unidade" aria-label={`Ver o contrato de ${name}`} className={cn(iconBtn, "text-emerald-600 hover:text-emerald-700")}><FileSignature className="h-4 w-4" /></button>
                                    )}
                                    {onImportContract && (
                                        <label className={cn(btn, "text-sky-700 dark:text-sky-300", importing && "pointer-events-none opacity-60")} title={`Envie o PDF ou a foto do contrato de locação de ${name}: a IA lê e cria o contrato, a imobiliária, o corretor e os inquilinos que faltarem`}>
                                            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                                            {importing ? "Lendo o contrato…" : hasLease ? "Novo contrato desta unidade" : "Contrato desta unidade"}
                                            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={importing} aria-label={`Enviar o contrato de ${name}`} onChange={e => { const [f] = pick(e); if (f) onImportContract(idx, f); }} />
                                        </label>
                                    )}
                                    <button type="button" onClick={() => actions.duplicateUnit(idx)} disabled={saving} title="Duplicar unidade" aria-label={`Duplicar ${name}`} className={cn(iconBtn, "hover:text-blue-600 disabled:opacity-50")}><Copy className="h-4 w-4" /></button>
                                    <button type="button" onClick={() => removeUnit(idx)} disabled={saving} title="Excluir unidade" aria-label={`Excluir ${name}`} className={cn(iconBtn, "hover:text-rose-600 disabled:opacity-50")}><Trash2 className="h-4 w-4" /></button>
                                    <Button variant={isEditing ? "default" : "outline"} size="sm" onClick={() => (isEditing ? finish() : setEditing(key))} disabled={saving} className="h-8 gap-1.5">
                                        {isEditing ? <><Check className="h-3.5 w-3.5" /> Concluir</> : <><PenLine className="h-3.5 w-3.5" /> Editar</>}
                                    </Button>
                                </div>
                            </div>

                            {isEditing ? (
                                <div className="space-y-4">
                                    <SubUnitFields unit={unit} idx={idx} updateUnit={actions.updateUnit} updateUnitCondo={actions.updateUnitCondo} />
                                    <div className="space-y-2 border-t border-border pt-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-foreground">Descrição da unidade</span>
                                            {onGenerateDescription && (
                                                <Button variant="outline" size="sm" className="h-7 gap-1 border-violet-300 text-xs text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20" onClick={() => onGenerateDescription(idx)} disabled={generatingDescriptionIdx === idx}>
                                                    {generatingDescriptionIdx === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                                                    {generatingDescriptionIdx === idx ? "Gerando..." : "Gerar com IA"}
                                                </Button>
                                            )}
                                        </div>
                                        <textarea
                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            placeholder="Ex: Kitnet com vista para o jardim, piso laminado, banheiro com box..."
                                            value={unit.description || ""}
                                            onChange={e => actions.updateUnit(idx, { description: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                                        <Field label="Área" value={dash(unit.sqMeters, " m²")} />
                                        <Field label="Cômodos" value={dash(unit.rooms)} />
                                        <Field label="Quartos" value={dash(unit.bedrooms)} />
                                        <Field label="Banheiros" value={dash(unit.bathrooms)} />
                                        <Field label="Garagem" value={yesNo(unit.garage)} />
                                        <Field label="Armários de cozinha" value={yesNo(unit.kitchenCabinets)} />
                                        <Field label="Lavanderia" value={unit.laundry === "none" ? muted(LAUNDRY.none) : LAUNDRY[unit.laundry] ?? muted("—")} />
                                        <Field label="Ar-condicionado" value={unit.ac === "none" ? muted(AC.none) : AC[unit.ac] ?? muted("—")} />
                                        <Field label="Cooktop" value={unit.cooktop === "none" ? muted(COOKTOP.none) : COOKTOP[unit.cooktop] ?? muted("—")} />
                                        <Field label="Condomínio" value={condo ?? muted("não")} />
                                    </dl>
                                    {unit.description?.trim()
                                        ? <p className="whitespace-pre-wrap text-sm text-foreground">{unit.description}</p>
                                        : <p className="text-sm text-muted-foreground">Nenhuma descrição ainda. Clique em Editar e escreva, ou peça à IA.</p>}
                                </>
                            )}

                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fotos e vídeos</h4>
                                    <label className={cn(btn, photoCount >= 10 && "pointer-events-none opacity-50")} title="Fotos da unidade (até 10)">
                                        <Camera className="h-3.5 w-3.5" /> Fotos {photoCount}/10
                                        <input type="file" multiple accept="image/*" className="sr-only" disabled={photoCount >= 10} aria-label={`Enviar fotos de ${name}`} onChange={e => actions.addUnitPhotos(idx, pick(e))} />
                                    </label>
                                    <label className={cn(btn, videoCount >= 2 && "pointer-events-none opacity-50")} title="Vídeos da unidade (até 2)">
                                        <Video className="h-3.5 w-3.5" /> Vídeos {videoCount}/2
                                        <input type="file" accept="video/*" className="sr-only" disabled={videoCount >= 2} aria-label={`Enviar vídeos de ${name}`} onChange={e => actions.addUnitVideos(idx, pick(e))} />
                                    </label>
                                    {photoCount < 2 && <span className="text-xs text-amber-700 dark:text-amber-300">pelo menos 2 fotos para anunciar</span>}
                                </div>
                                {(photoCount > 0 || videoCount > 0) && (
                                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                                        {(unit.photos || []).map((url, pi) => (
                                            <li key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-muted/20">
                                                <button type="button" onClick={() => setLightbox({ unit: idx, index: pi })} className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title="Abrir a galeria">
                                                    <Image src={url} alt={`${name} · foto ${pi + 1}`} fill sizes="160px" className="object-cover" unoptimized />
                                                </button>
                                                <button type="button" onClick={() => { if (window.confirm("Remover esta foto?")) actions.removeUnitSavedPhoto(idx, url); }} title="Excluir foto" aria-label={`Excluir a foto ${pi + 1}`} className="absolute right-1 top-1 rounded bg-background/90 p-1 text-muted-foreground opacity-0 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </li>
                                        ))}
                                        {(unit.newPhotos || []).map((file, pi) => <li key={`np-${pi}-${file.name}`}><FilePreview file={file} onRemove={() => actions.removeUnitNewPhoto(idx, pi)} /></li>)}
                                        {(unit.videos || []).map((url, vi) => (
                                            <li key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-black/80">
                                                <button type="button" onClick={() => setVideoOpen(url)} className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" title="Assistir">
                                                    <video src={url} muted preload="metadata" className="h-full w-full object-cover opacity-80" />
                                                    <span className="absolute inset-0 flex items-center justify-center text-white"><Play className="h-7 w-7 drop-shadow" /></span>
                                                </button>
                                                <button type="button" onClick={() => { if (window.confirm("Remover este vídeo?")) actions.removeUnitSavedVideo(idx, url); }} title="Excluir vídeo" aria-label={`Excluir o vídeo ${vi + 1}`} className="absolute right-1 top-1 rounded bg-background/90 p-1 text-muted-foreground opacity-0 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </li>
                                        ))}
                                        {(unit.newVideos || []).map((file, vi) => <li key={`nv-${vi}-${file.name}`}><FilePreview file={file} onRemove={() => actions.removeUnitNewVideo(idx, vi)} isVideo /></li>)}
                                    </ul>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <PhotoLightbox photos={lightboxPhotos} index={lightbox?.index ?? null} onClose={() => setLightbox(null)} onNavigate={i => setLightbox(l => (l ? { ...l, index: i } : l))} />
            <PdfViewerModal isOpen={contractViewer !== null} onClose={() => setContractViewer(null)} url={contractViewer?.file_url ?? null} title={contractViewer?.reference_name || "Contrato de locação"} fileName={contractViewer?.file_name ?? "contrato.pdf"} />
            {videoOpen && (
                <div role="dialog" aria-modal="true" aria-label="Vídeo da unidade" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setVideoOpen(null)}>
                    <button ref={closeVideoRef} type="button" onClick={() => setVideoOpen(null)} className="absolute right-4 top-4 rounded-lg bg-white/20 p-2 text-white hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Fechar o vídeo (Esc)"><X className="h-5 w-5" /></button>
                    <video src={videoOpen} controls autoPlay className="max-h-[85vh] max-w-full rounded-xl" onClick={e => e.stopPropagation()} />
                </div>
            )}
        </section>
    );
}
