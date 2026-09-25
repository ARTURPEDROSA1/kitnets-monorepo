"use client";

/**
 * One square card per corretor on /corretores — the same shape as the tenant, property and project
 * cards: the photo as the cover, the name and CRECI, who they work for, how many contracts they run
 * and what that rent adds up to, how many tenants they look after, and the ways to reach them.
 * The card opens the corretor's dashboard.
 */
import React from "react";
import { Building2, FileSignature, Globe, Mail, MessageCircle, Phone, Trash2, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverCarousel, useCoverCarousel } from "@/components/ui/CoverCarousel";
import { AGENT_STATUS_META, brl, monthsLabel, type AgentRow } from "@/lib/agent-dashboard";

interface Props {
    row: AgentRow;
    onSelect: () => void;
    onDelete: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
}

const EMPTY: string[] = [];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const iconLink = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:border-emerald-400 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function AgentSquareCard({ row, onSelect, onDelete, isDeleting = false }: Props) {
    const { agent } = row;
    const photos = agent.photo_url ? [agent.photo_url] : EMPTY;
    const carousel = useCoverCarousel(photos.length);
    const meta = AGENT_STATUS_META[row.status];
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    const [y, m] = row.since.split("-");
    const contacts = [row.whatsapp, row.tel, agent.email, agent.website].filter(Boolean).length;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-all hover:border-emerald-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <CoverCarousel photos={photos} alt={agent.full_name} state={carousel} fallback={<User className="h-12 w-12" />} unoptimized>
                <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    title="Excluir corretor"
                    aria-label={`Excluir ${agent.full_name}`}
                    className="absolute right-2 top-2 rounded-lg bg-background/90 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </CoverCarousel>

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="space-y-0.5">
                    <h3 className="break-words font-semibold leading-tight text-foreground">{agent.full_name}</h3>
                    <p className="text-xs text-muted-foreground">{row.creci}</p>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-foreground">
                    <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className={cn("break-words", agent.agent_type === "IMOBILIARIA" && !agent.agency_id && "text-amber-600")}>{row.affiliation}</span>
                </p>

                <dl className="mt-auto grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><FileSignature className="h-3 w-3" /> Contratos</dt>
                        <dd className="font-semibold tabular-nums text-foreground">{plural(row.inForce.length, "em vigor", "em vigor")}</dd>
                        <dd className="leading-snug text-muted-foreground">{row.inForce.length > 0 ? `${brl(row.rentManaged, 0)}/mês` : row.leases.length > 0 ? `${plural(row.leases.length, "encerrado", "encerrados")}` : "nenhum contrato"}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><Users className="h-3 w-3" /> Inquilinos</dt>
                        <dd className="font-semibold tabular-nums text-foreground">{row.activeTenants}</dd>
                        <dd className="leading-snug text-muted-foreground">{row.activeTenants > 0 ? "atendidos hoje" : row.tenants.length > 0 ? `${plural(row.tenants.length, "antigo", "antigos")}` : "nenhum inquilino"}</dd>
                    </div>
                </dl>

                <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-2">
                    <div className="flex shrink-0 items-center gap-1" aria-label="Contato">
                        {row.whatsapp && <a href={row.whatsapp} target="_blank" rel="noopener noreferrer" onClick={stop} className={cn(iconLink, "text-emerald-600")} title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></a>}
                        {row.tel && <a href={row.tel} onClick={stop} className={iconLink} title="Ligar"><Phone className="h-3.5 w-3.5" /></a>}
                        {agent.email && <a href={`mailto:${agent.email}`} onClick={stop} className={iconLink} title={agent.email}><Mail className="h-3.5 w-3.5" /></a>}
                        {agent.website && <a href={agent.website} target="_blank" rel="noopener noreferrer" onClick={stop} className={iconLink} title={agent.website}><Globe className="h-3.5 w-3.5" /></a>}
                        {contacts === 0 && <span className="text-[11px] text-muted-foreground">Sem contato</span>}
                    </div>
                    <span className="min-w-0 break-words text-right text-[11px] leading-snug text-muted-foreground" title={`Cadastrado há ${monthsLabel(row.monthsRegistered)}`}>
                        desde {MONTHS[Number(m) - 1] ?? m}/{y}
                    </span>
                </div>
            </div>
        </div>
    );
}
