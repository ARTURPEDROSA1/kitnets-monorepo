"use client";

/**
 * One square card per agency on /imobiliaria — the same shape as the project, property, tenant and
 * corretor cards: the logo as the cover (whole, on a light background), the name and CNPJ, where it
 * is, the contracts it administers and what they add up to, the fee, the ways to reach it and how
 * its service agreement stands. The card opens the agency's dashboard.
 */
import React from "react";
import { Building2, FileSignature, FileText, Globe, Mail, MapPin, MessageCircle, Percent, Phone, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverCarousel, useCoverCarousel } from "@/components/ui/CoverCarousel";
import { AGENCY_STATUS_META, brl, type AgencyRow } from "@/lib/agency-dashboard";
import { formatDateBR } from "@/lib/dates";

interface Props {
    row: AgencyRow;
    onSelect: () => void;
    onDelete: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
}

const EMPTY: string[] = [];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const iconLink = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:border-emerald-400 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

export default function AgencySquareCard({ row, onSelect, onDelete, isDeleting = false }: Props) {
    const { agency, agreement } = row;
    const photos = agency.logo_url ? [agency.logo_url] : EMPTY;
    const carousel = useCoverCarousel(photos.length);
    const meta = AGENCY_STATUS_META[row.status];
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    const contacts = [row.whatsapp, row.tel, agency.email, agency.website].filter(Boolean).length;
    const canDelete = agency.role === "OWNER";

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-all hover:border-emerald-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <CoverCarousel photos={photos} alt={row.displayName} state={carousel} fit="contain" fallback={<Building2 className="h-12 w-12 text-slate-300" />} unoptimized>
                <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                {canDelete && (
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={isDeleting}
                        title="Excluir imobiliária"
                        aria-label={`Excluir ${row.displayName}`}
                        className="absolute right-2 top-2 rounded-lg bg-background/90 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                )}
            </CoverCarousel>

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="space-y-0.5">
                    <h3 className="break-words font-semibold leading-tight text-foreground">{row.displayName}</h3>
                    <p className="break-words text-xs text-muted-foreground">{[row.cnpj ? `CNPJ ${row.cnpj}` : null, row.creci].filter(Boolean).join(" · ") || agency.name}</p>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="break-words">{[agency.neighborhood, row.place].filter(Boolean).join(" · ") || "endereço não informado"}</span>
                </p>

                <dl className="mt-auto grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><FileSignature className="h-3 w-3" /> Contratos</dt>
                        <dd className="font-semibold tabular-nums text-foreground">{plural(row.inForce.length, "em vigor", "em vigor")}</dd>
                        <dd className="leading-snug text-muted-foreground">{row.inForce.length > 0 ? `${brl(row.rentManaged, 0)}/mês` : row.leases.length > 0 ? plural(row.leases.length, "encerrado", "encerrados") : "nenhum contrato"}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><Percent className="h-3 w-3" /> Taxa</dt>
                        <dd className={cn("font-semibold tabular-nums", row.feePct == null ? "text-amber-600" : "text-foreground")}>{row.feePct != null ? `${row.feePct.toLocaleString("pt-BR")}%` : "não informada"}</dd>
                        <dd className="leading-snug text-muted-foreground">{row.feePct != null && row.inForce.length > 0 ? `${brl(row.monthlyFee, 0)}/mês` : row.feePct != null ? "do aluguel" : "informe no cadastro"}</dd>
                    </div>
                </dl>

                <div className="flex flex-wrap items-start justify-between gap-2 border-t border-border/60 pt-2">
                    <div className="flex shrink-0 items-center gap-1" aria-label="Contato">
                        {row.whatsapp && <a href={row.whatsapp} target="_blank" rel="noopener noreferrer" onClick={stop} className={cn(iconLink, "text-emerald-600")} title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></a>}
                        {row.tel && <a href={row.tel} onClick={stop} className={iconLink} title="Ligar"><Phone className="h-3.5 w-3.5" /></a>}
                        {agency.email && <a href={`mailto:${agency.email}`} onClick={stop} className={iconLink} title={agency.email}><Mail className="h-3.5 w-3.5" /></a>}
                        {agency.website && <a href={agency.website} target="_blank" rel="noopener noreferrer" onClick={stop} className={iconLink} title={agency.website}><Globe className="h-3.5 w-3.5" /></a>}
                        {contacts === 0 && <span className="text-[11px] text-muted-foreground">Sem contato</span>}
                    </div>
                    <span
                        className={cn("inline-flex min-w-0 items-start gap-1 text-right text-[11px] leading-snug", agreement.expired ? "text-rose-600" : agreement.expiring ? "text-amber-600" : "text-muted-foreground")}
                        title={agreement.hasFile ? "Contrato de prestação de serviços" : "Sem contrato de prestação de serviços anexado"}
                    >
                        <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="break-words">
                            {agreement.end ? `${agreement.expired ? "prestação vencida em" : "prestação até"} ${formatDateBR(agreement.end)}` : agreement.hasFile ? "prestação anexada" : "sem contrato de prestação"}
                        </span>
                    </span>
                </div>
            </div>
        </div>
    );
}
