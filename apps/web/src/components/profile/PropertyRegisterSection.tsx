"use client";

/**
 * "Ficha do imóvel" — the property's registration read flat: the address, the property data and the
 * description as a summary each, with "Editar" opening the editor in place (the editors are the
 * page's own; this component only frames them). No accordions: everything the owner registered is
 * on screen, and what is missing says so.
 */
import React from "react";
import { Check, FileText, Home, MapPin, PenLine, SlidersHorizontal, Sun } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import type { PropertyDetails } from "@/components/profile/PropertyDetailsCard";

export interface PropertyAddressData {
    cep?: string;
    street?: string;
    number?: string;
    city?: string;
    state?: string;
    neighborhood?: string;
    complement?: string;
    description?: string;
}

interface Props {
    propertyType: "single" | "multi";
    details: PropertyDetails;
    address: PropertyAddressData;
    unitsCount: number;
    saving: boolean;
    editingAddress: boolean;
    onEditAddress: (open: boolean) => void;
    addressEditor: React.ReactNode;
    editingDetails: boolean;
    onEditDetails: (open: boolean) => void;
    detailsEditor: React.ReactNode;
    editingDescription: boolean;
    onEditDescription: (open: boolean) => void;
    descriptionEditor: React.ReactNode;
    /** saves the property (the editors change the page's state; this persists it) */
    onSave: () => void | Promise<unknown>;
}

function Block({ icon, title, filled, editing, onToggle, saving, summary, editor }: { icon: React.ReactNode; title: string; filled: boolean; editing: boolean; onToggle: (open: boolean) => void; saving: boolean; summary: React.ReactNode; editor: React.ReactNode }) {
    return (
        <div className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="text-emerald-600">{icon}</span> {title}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", filled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300")}>
                        {filled ? "preenchido" : "a preencher"}
                    </span>
                </h3>
                <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => onToggle(!editing)} disabled={saving} className="gap-1.5">
                    {editing ? <><Check className="h-3.5 w-3.5" /> Concluir</> : <><PenLine className="h-3.5 w-3.5" /> Editar</>}
                </Button>
            </div>
            {editing ? <div className="space-y-3">{editor}</div> : summary}
        </div>
    );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-foreground">{value}</dd>
        </div>
    );
}

const dash = (v: string | number | null | undefined, suffix = "") => (v === null || v === undefined || String(v).trim() === "" ? <span className="text-muted-foreground">—</span> : `${v}${suffix}`);

export default function PropertyRegisterSection({ propertyType, details, address, unitsCount, saving, editingAddress, onEditAddress, addressEditor, editingDetails, onEditDetails, detailsEditor, editingDescription, onEditDescription, descriptionEditor, onSave }: Props) {
    const addressFilled = Boolean(address.street?.trim() || address.cep?.trim());
    const detailsFilled = Boolean(details.propertyName?.trim() || details.totalSqMeters || details.areaEdificada);
    const descriptionFilled = Boolean(address.description?.trim());
    const meters = [details.mainMeters?.water && "Água", details.mainMeters?.energy && "Energia", details.mainMeters?.gas && "Gás"].filter(Boolean).join(" · ");
    const toggle = (setter: (open: boolean) => void) => (open: boolean) => { setter(open); if (!open) void onSave(); };

    return (
        <section className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card">
            <header className="px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">Ficha do imóvel</h2>
                <p className="text-xs text-muted-foreground">Endereço, dados cadastrais e a descrição do anúncio. Edite no lugar; a ficha alimenta os cards, o painel e os anúncios.</p>
            </header>

            <Block
                icon={<MapPin className="h-4 w-4" />} title="Endereço" filled={addressFilled} editing={editingAddress} onToggle={toggle(onEditAddress)} saving={saving}
                summary={addressFilled ? (
                    <p className="text-sm text-foreground">
                        {[[address.street, address.number].filter(Boolean).join(", "), address.complement, address.neighborhood, [address.city, address.state].filter(Boolean).join("/"), address.cep ? `CEP ${address.cep}` : null].filter(Boolean).join(" · ")}
                    </p>
                ) : <p className="text-sm text-muted-foreground">Nenhum endereço ainda. Envie o IPTU ou a matrícula em Arquivos do imóvel — a IA lê o endereço — ou clique em Editar.</p>}
                editor={addressEditor}
            />

            <Block
                icon={<SlidersHorizontal className="h-4 w-4" />} title="Dados do imóvel" filled={detailsFilled} editing={editingDetails} onToggle={toggle(onEditDetails)} saving={saving}
                summary={(
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                        <Field label="Nome" value={dash(details.propertyName)} />
                        <Field label="Tipo" value={propertyType === "multi" ? <><Home className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-violet-600" />Multifamiliar · {unitsCount} {unitsCount === 1 ? "unidade" : "unidades"}</> : <><Home className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-emerald-600" />Unifamiliar</>} />
                        <Field label="Área total" value={dash(details.totalSqMeters, " m²")} />
                        <Field label="Área edificada" value={dash(details.areaEdificada, " m²")} />
                        <Field label="Área do lote" value={dash(details.areaLote, " m²")} />
                        <Field label="Cadastro imobiliário" value={dash(details.cadastroImobiliario)} />
                        <Field label="Inscrição imobiliária" value={dash(details.inscricaoImobiliaria)} />
                        <Field label="Matrícula" value={dash(details.matricula)} />
                        {propertyType === "single" && <Field label="Cômodos" value={[details.bedrooms ? `${details.bedrooms} quartos` : null, details.bathrooms ? `${details.bathrooms} banheiros` : null, details.parkingSpaces ? `${details.parkingSpaces} vagas` : null].filter(Boolean).join(" · ") || <span className="text-muted-foreground">—</span>} />}
                        <Field label="Medidores principais" value={meters || <span className="text-muted-foreground">nenhum pago por você</span>} />
                        <Field label="Internet" value={details.internetBill ? "conta do imóvel" : <span className="text-muted-foreground">não</span>} />
                        <Field label="Energia solar" value={details.solarEnergy ? <><Sun className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-amber-500" />{details.solarKwp ? `${details.solarKwp} kWp` : "sim"}</> : <span className="text-muted-foreground">não</span>} />
                    </dl>
                )}
                editor={detailsEditor}
            />

            <Block
                icon={<FileText className="h-4 w-4" />} title="Descrição do imóvel" filled={descriptionFilled} editing={editingDescription} onToggle={toggle(onEditDescription)} saving={saving}
                summary={descriptionFilled ? <p className="whitespace-pre-wrap text-sm text-foreground">{address.description}</p> : <p className="text-sm text-muted-foreground">Nenhuma descrição ainda. Clique em Editar e escreva, ou peça à IA.</p>}
                editor={descriptionEditor}
            />
        </section>
    );
}
