"use client";

/**
 * One square card per tenant on /inquilinos — the same shape as the project and property cards:
 * the photo as the cover, the name and what they do, where they live and what they pay, how long
 * they have been there and when the contract ends, and the ways to reach them (WhatsApp, phone,
 * e-mail, Instagram, LinkedIn) as icons that work without opening the card. The card opens the
 * tenant's dashboard.
 */
import React from "react";
import { Building2, CalendarClock, Home, Instagram, Linkedin, Mail, MessageCircle, Phone, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { CoverCarousel, useCoverCarousel } from "@/components/ui/CoverCarousel";
import { TENANT_MANAGEMENT_LABELS, TENANT_STATUS_META, brl, livingLabel, type TenantRow } from "@/lib/tenant-dashboard";
import { instagramUrl, telUrl, whatsappUrl } from "@/lib/social-links";

interface Props {
    row: TenantRow;
    onSelect: () => void;
    onDelete: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const EMPTY: string[] = [];

/** "faltam 284 dias", "prazo vencido há 12 dias", "prazo indeterminado", "sem contrato" */
function leaseHint(row: TenantRow): { text: string; tone?: string } {
    if (!row.current) return { text: row.status === "FORMER" ? (row.last ? "contrato encerrado" : "sem contrato") : "sem contrato em vigor" };
    if (row.daysToLeaseEnd === null) return { text: "prazo indeterminado" };
    if (row.daysToLeaseEnd < 0) return { text: `prazo vencido há ${plural(-row.daysToLeaseEnd, "dia", "dias")}`, tone: "text-rose-600 dark:text-rose-400" };
    if (row.daysToLeaseEnd === 0) return { text: "termina hoje", tone: "text-amber-600 dark:text-amber-400" };
    return { text: `faltam ${plural(row.daysToLeaseEnd, "dia", "dias")}`, tone: row.daysToLeaseEnd <= 90 ? "text-amber-600 dark:text-amber-400" : undefined };
}

const iconLink = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:border-emerald-400 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

export default function TenantSquareCard({ row, onSelect, onDelete, isDeleting = false }: Props) {
    const { tenant } = row;
    const photos = tenant.photo_url ? [tenant.photo_url] : EMPTY;
    const carousel = useCoverCarousel(photos.length);
    const meta = TENANT_STATUS_META[row.status];
    const hint = leaseHint(row);
    const wa = whatsappUrl(tenant.main_phone);
    const tel = telUrl(tenant.main_phone);
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    const contacts = [wa, tel, tenant.email, tenant.instagram, tenant.linkedin].filter(Boolean).length;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-all hover:border-emerald-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <CoverCarousel photos={photos} alt={tenant.full_name} state={carousel} fallback={<User className="h-12 w-12" />} unoptimized>
                <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    title="Excluir inquilino"
                    aria-label={`Excluir ${tenant.full_name}`}
                    className="absolute right-2 top-2 rounded-lg bg-background/90 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </CoverCarousel>

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="space-y-0.5">
                    <h3 className="break-words font-semibold leading-tight text-foreground">{tenant.full_name}</h3>
                    <p className={cn("break-words text-xs", tenant.occupation ? "text-muted-foreground" : "italic text-muted-foreground/70")}>
                        {tenant.occupation || "Ocupação não informada"}
                    </p>
                </div>

                <div className="space-y-1 text-xs">
                    <p className="flex items-start gap-1.5 text-foreground"><Home className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> <span className="break-words">{row.place}</span></p>
                    <p className="flex items-baseline justify-between gap-2">
                        {row.rent !== null ? (
                            <span className="font-semibold tabular-nums text-foreground">{brl(row.rent, 0)}<span className="font-normal text-muted-foreground">/mês · dia {row.current?.rent_due_day}</span></span>
                        ) : row.last ? (
                            <span className="text-muted-foreground">{row.status === "FORMER" ? "Pagava" : "Contrato"} {brl(Number(row.last.monthly_rent) || 0, 0)}/mês</span>
                        ) : (
                            <span className="text-muted-foreground">Sem contrato cadastrado</span>
                        )}
                    </p>
                </div>

                <dl className="mt-auto grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3 w-3" /> Moradia</dt>
                        <dd className="break-words font-semibold leading-snug text-foreground">{livingLabel(row)}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><Building2 className="h-3 w-3" /> Contrato</dt>
                        <dd className="font-semibold tabular-nums text-foreground">{row.leaseEnd ? `até ${formatDateBR(row.leaseEnd)}` : row.current ? "sem prazo" : "—"}</dd>
                        <dd className={cn("leading-snug text-muted-foreground", hint.tone)}>{hint.text}</dd>
                    </div>
                </dl>

                <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-2">
                    <div className="flex shrink-0 items-center gap-1" aria-label="Contato">
                        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" onClick={stop} className={cn(iconLink, "text-emerald-600")} title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></a>}
                        {tel && <a href={tel} onClick={stop} className={iconLink} title="Ligar"><Phone className="h-3.5 w-3.5" /></a>}
                        {tenant.email && <a href={`mailto:${tenant.email}`} onClick={stop} className={iconLink} title={tenant.email}><Mail className="h-3.5 w-3.5" /></a>}
                        {tenant.instagram && <a href={instagramUrl(tenant.instagram)} target="_blank" rel="noopener noreferrer" onClick={stop} className={iconLink} title={`@${tenant.instagram}`}><Instagram className="h-3.5 w-3.5" /></a>}
                        {tenant.linkedin && <a href={tenant.linkedin} target="_blank" rel="noopener noreferrer" onClick={stop} className={iconLink} title="LinkedIn"><Linkedin className="h-3.5 w-3.5" /></a>}
                        {contacts === 0 && <span className="text-[11px] text-muted-foreground">Sem contato</span>}
                    </div>
                    <span className="min-w-0 break-words text-right text-[11px] leading-snug text-muted-foreground" title={TENANT_MANAGEMENT_LABELS[tenant.management_type]}>
                        {tenant.management_type === "AGENCY" ? tenant.agency_name ?? "Imobiliária" : "Gestão própria"}
                    </span>
                </div>
            </div>
        </div>
    );
}
