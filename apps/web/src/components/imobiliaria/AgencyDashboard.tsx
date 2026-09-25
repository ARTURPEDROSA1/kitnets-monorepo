"use client";

/**
 * One agency's dashboard (`/imobiliaria?id=`): the logo, who it is (CNPJ, CRECI, responsável) and how
 * to reach it on top, the tiles (contracts in force, rent under management, the fee and what it
 * costs, tenants, corretores, the service agreement), then the contracts it administers, the
 * tenants it looks after, the corretores who work for it, the service agreement and the ficha.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, DollarSign, Eye, FileSignature, FileText, Globe, Home, Loader2, Mail, MapPin, MessageCircle, PenLine, Percent, Phone, Shield, Sparkles, Trash2, User, UserCheck, Users, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import Tile from "@/components/properties/Tile";
import AgencyLogo from "./AgencyLogo";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { formatCEP, formatPhone } from "@/lib/validators";
import { IN_FORCE, statusMeta } from "@/lib/lease-dashboard";
import { TENANT_STATUS_META } from "@/lib/tenant-dashboard";
import { AGENT_STATUS_META } from "@/lib/agent-dashboard";
import { AGENCY_STATUS_META, agencyRows, brl, monthsLabel, type AgencyRow } from "@/lib/agency-dashboard";
import { whatsappUrl } from "@/lib/social-links";
import type { AgencyAgentSummary, AgencyDashboardView, AgencyLeaseSummary, AgencyTenantSummary } from "@/lib/agency-views";
import type { AgencyWithRole } from "@/types/agency";

interface Props {
    agencyId: string;
    lang: string;
    today: string;
    initialBundle?: AgencyDashboardView | null;
    /** bumped by the parent after it changed the agency: the dashboard reloads */
    refreshKey: number;
    notice?: string | null;
    onDismissNotice?: () => void;
    onBack: () => void;
    onEdit: (agency: AgencyWithRole) => void;
    onDelete: (agency: AgencyWithRole) => void;
    /** "Importar contrato": the AI reads a lease agreement of this agency */
    onImportLease: (agency: AgencyWithRole) => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const chip = "inline-flex max-w-full items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-left text-xs font-medium leading-snug transition-colors hover:bg-muted";
const ROLE_LABELS: Record<string, string> = { OWNER: "Proprietário", ADMIN: "Administrador", MANAGER: "Gerente", AGENT: "Corretor", VIEWER: "Visualizador" };

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("min-w-0", className)}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
        </div>
    );
}

export default function AgencyDashboard({ agencyId, lang, today, initialBundle = null, refreshKey, notice, onDismissNotice, onBack, onEdit, onDelete, onImportLease }: Props) {
    const preloaded = initialBundle && initialBundle.agency.id === agencyId ? initialBundle : null;
    const [bundle, setBundle] = useState<AgencyDashboardView | null>(preloaded);
    const [error, setError] = useState<string | null>(null);
    const seededRef = useRef(preloaded !== null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/agencies/${agencyId}/dashboard`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erro ao carregar a imobiliária");
        setBundle(data as AgencyDashboardView);
    }, [agencyId]);

    useEffect(() => {
        if (seededRef.current && refreshKey === 0) return;
        let alive = true;
        load().catch(err => { if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar"); });
        return () => { alive = false; };
    }, [load, refreshKey]);

    const base = lang === "pt" ? "" : `/${lang}`;
    const row: AgencyRow | null = useMemo(() => (bundle ? agencyRows([bundle.agency], bundle.leases, bundle.tenants, bundle.agents, today)[0] : null), [bundle, today]);

    if (error && !bundle) {
        return (
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Imobiliárias</Button>
                <p className="text-sm text-rose-600">{error}</p>
            </div>
        );
    }
    if (!bundle || !row) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando imobiliária…
            </div>
        );
    }

    const { agency, agreement } = row;
    const meta = AGENCY_STATUS_META[row.status];
    const canEdit = agency.role === "OWNER" || agency.role === "ADMIN";
    const canDelete = agency.role === "OWNER";
    const tenantsNow = bundle.tenants.filter(t => t.status === "ACTIVE");
    const agentsNow = bundle.agents.filter(g => g.status === "ACTIVE");
    const address = [[agency.street, agency.street_number].filter(Boolean).join(", "), agency.address_complement, agency.neighborhood, row.place].filter(Boolean).join(" · ");

    return (
        <div className="space-y-5">
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                    <ArrowLeft className="mr-1 h-4 w-4" /> Imobiliárias
                </Button>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row">
                        <AgencyLogo agencyId={agency.id} url={agency.logo_url} name={row.displayName} editable={canEdit} onChanged={() => load().catch(() => {})} />
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="break-words text-2xl font-bold text-foreground">{row.displayName}</h1>
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                                {canEdit && (
                                    <button type="button" onClick={() => onEdit(agency)} title="Editar a imobiliária" aria-label="Editar a imobiliária" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                        <PenLine className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            {agency.trade_name && <p className="break-words text-sm text-muted-foreground">{agency.name}</p>}
                            <p className="flex flex-wrap items-center gap-x-2 text-sm text-foreground">
                                {row.cnpj && <span>CNPJ {row.cnpj}</span>}
                                {row.cnpj && row.creci && <span className="text-muted-foreground">·</span>}
                                {row.creci && <span className="inline-flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-muted-foreground" /> {row.creci}</span>}
                                {!row.cnpj && !row.creci && <span className="text-muted-foreground">sem CNPJ nem CRECI informados</span>}
                            </p>
                            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                                {agency.owner_name && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {agency.owner_name}</span>}
                                {agency.owner_name && <span>·</span>}
                                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {address || "endereço não informado"}</span>
                                <span>·</span>
                                <span>cadastrada há {monthsLabel(row.monthsRegistered)}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {row.whatsapp && (
                                    <a href={row.whatsapp} target="_blank" rel="noopener noreferrer" className={cn(chip, "border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300")}>
                                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp · {formatPhone((agency.main_phone_whatsapp ? agency.main_phone : agency.additional_phone) as string)}
                                    </a>
                                )}
                                {agency.main_phone && <a href={`tel:${agency.main_phone}`} className={chip} title="Ligar"><Phone className="h-3.5 w-3.5" /> {formatPhone(agency.main_phone)}</a>}
                                {agency.additional_phone && <a href={`tel:${agency.additional_phone}`} className={chip} title="Telefone adicional"><Phone className="h-3.5 w-3.5" /> {formatPhone(agency.additional_phone)}</a>}
                                {agency.email && <a href={`mailto:${agency.email}`} className={chip}><Mail className="h-3.5 w-3.5" /> {agency.email}</a>}
                                {agency.website && <a href={agency.website} target="_blank" rel="noopener noreferrer" className={chip}><Globe className="h-3.5 w-3.5" /> {agency.website.replace(/^https?:\/\//, "")}</a>}
                                {!row.hasContact && canEdit && <button type="button" onClick={() => onEdit(agency)} className={cn(chip, "italic text-muted-foreground")}><Phone className="h-3.5 w-3.5" /> sem contato — informar</button>}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => onImportLease(agency)} title="A IA lê um contrato de locação desta imobiliária e cria o contrato e os inquilinos que ainda não estiverem cadastrados">
                            <Sparkles className="h-4 w-4 text-amber-500 sm:mr-1" />
                            <span className="hidden sm:inline">Importar contrato</span>
                        </Button>
                        {canEdit && (
                            <Button variant="outline" onClick={() => onEdit(agency)}>
                                <PenLine className="h-4 w-4 sm:mr-1" />
                                <span className="hidden sm:inline">Editar</span>
                            </Button>
                        )}
                        {canDelete && (
                            <Button variant="ghost" size="icon" onClick={() => onDelete(agency)} title="Excluir imobiliária" aria-label="Excluir imobiliária" className="text-muted-foreground hover:text-rose-600">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {notice && (
                <div role="note" className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <span className="flex-1">{notice}</span>
                    {onDismissNotice && <button type="button" onClick={onDismissNotice} className="rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40" aria-label="Fechar aviso"><X className="h-4 w-4" /></button>}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <Tile
                    label="Contratos em vigor"
                    tone="emerald"
                    icon={<FileSignature className="h-4 w-4" />}
                    value={String(row.inForce.length)}
                    hint={row.leases.length > row.inForce.length ? `${plural(row.leases.length - row.inForce.length, "contrato encerrado", "contratos encerrados")} também` : row.inForce.length > 0 ? "administrados por esta imobiliária" : "nenhum contrato nomeia esta imobiliária"}
                    info={{ what: "Os contratos de locação em vigor que esta imobiliária administra (o campo Imobiliária do contrato).", formula: "contratos com status ativo ou vencendo, agency_id = esta imobiliária" }}
                />
                <Tile
                    label="Aluguel sob gestão"
                    tone="emerald"
                    icon={<DollarSign className="h-4 w-4" />}
                    value={row.inForce.length > 0 ? brl(row.rentManaged, 0) : "—"}
                    hint={row.inForce.length > 0 ? `${brl(row.rentManaged * 12, 0)} por ano · valor de contrato` : "—"}
                    info={{ what: "A soma do aluguel de contrato (bruto) dos contratos em vigor desta imobiliária.", formula: "Σ aluguel dos contratos em vigor" }}
                />
                <Tile
                    label="Taxa de administração"
                    tone="amber"
                    icon={<Percent className="h-4 w-4" />}
                    value={row.feePct != null ? `${row.feePct.toLocaleString("pt-BR")}%` : "—"}
                    hint={row.feePct == null ? "não informada: preencha no cadastro" : row.inForce.length > 0 ? `${brl(row.monthlyFee, 0)}/mês · ${brl(row.monthlyFee * 12, 0)} por ano` : "do aluguel de cada contrato"}
                    info={{ what: "O percentual do aluguel que a imobiliária retém todo mês, e o que isso custa nos contratos em vigor — a economia potencial com autogestão.", formula: "Σ aluguel em vigor × taxa" }}
                />
                <Tile
                    label="Inquilinos atendidos"
                    tone="violet"
                    icon={<Users className="h-4 w-4" />}
                    value={String(tenantsNow.length)}
                    hint={bundle.tenants.length > tenantsNow.length ? `${plural(bundle.tenants.length - tenantsNow.length, "antigo ou futuro", "antigos ou futuros")} também` : tenantsNow.length > 0 ? "morando hoje" : "nenhum inquilino com esta imobiliária"}
                    info={{ what: "Os inquilinos cadastrados com esta imobiliária (o campo Imobiliária do inquilino).", formula: "inquilinos com status atual, agency_id = esta imobiliária" }}
                />
                <Tile
                    label="Corretores"
                    tone="blue"
                    icon={<UserCheck className="h-4 w-4" />}
                    value={String(agentsNow.length)}
                    hint={agentsNow.length > 0 ? agentsNow.map(g => g.full_name.split(" ")[0]).slice(0, 3).join(", ") + (agentsNow.length > 3 ? "…" : "") : bundle.agents.length > 0 ? `${plural(bundle.agents.length, "inativo", "inativos")}` : "nenhum corretor vinculado"}
                    info={{ what: "Os corretores cadastrados como vinculados a esta imobiliária — normalmente quem assina os contratos por ela.", formula: "corretores ativos com agency_id = esta imobiliária" }}
                />
                <Tile
                    label="Prestação de serviços"
                    tone={agreement.expired ? "rose" : agreement.expiring ? "amber" : agreement.hasFile ? "emerald" : "slate"}
                    icon={<FileText className="h-4 w-4" />}
                    value={agreement.end ? formatDateBR(agreement.end) : agreement.hasFile ? "Anexado" : "—"}
                    hint={agreement.expired && agreement.daysToEnd !== null
                        ? `vencido há ${plural(-agreement.daysToEnd, "dia", "dias")}`
                        : agreement.expiring && agreement.daysToEnd !== null
                            ? `vence em ${plural(agreement.daysToEnd, "dia", "dias")}`
                            : agreement.end ? "fim da vigência" : agreement.hasFile ? "sem vigência informada" : "nenhum contrato anexado"}
                    info={{ what: "O contrato de prestação de serviços de administração firmado com a imobiliária: o documento, a taxa acordada e a vigência.", formula: "vigência até agreement_end_date" }}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Contratos</h2>
                                <p className="text-xs text-muted-foreground">Os contratos que esta imobiliária administra, os encerrados inclusive.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => onImportLease(agency)} className={chip}><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Importar contrato</button>
                                <Link href={`${base}/contratos`} className={chip}><FileSignature className="h-3.5 w-3.5" /> Contratos</Link>
                            </div>
                        </header>
                        {bundle.leases.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum contrato nomeia esta imobiliária. Importe o contrato de locação — a IA o lê e cadastra o que faltar — ou selecione-a no campo Imobiliária de um contrato em Contratos.</p>
                        ) : (
                            <ul className="divide-y divide-border/50">
                                {bundle.leases.map(l => <LeaseLine key={l.id} lease={l} base={base} feePct={row.feePct} />)}
                            </ul>
                        )}
                    </section>

                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Inquilinos</h2>
                                <p className="text-xs text-muted-foreground">Os inquilinos cadastrados com esta imobiliária.</p>
                            </div>
                            <Link href={`${base}/inquilinos`} className={chip}><Users className="h-3.5 w-3.5" /> Inquilinos</Link>
                        </header>
                        {bundle.tenants.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum inquilino com esta imobiliária.</p>
                        ) : (
                            <ul className="divide-y divide-border/50">
                                {bundle.tenants.map(t => <TenantLine key={t.id} tenant={t} base={base} />)}
                            </ul>
                        )}
                    </section>

                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Corretores</h2>
                                <p className="text-xs text-muted-foreground">Quem assina e responde pela imobiliária, com o CRECI dele.</p>
                            </div>
                            <Link href={`${base}/corretores`} className={chip}><UserCheck className="h-3.5 w-3.5" /> Corretores</Link>
                        </header>
                        {bundle.agents.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum corretor vinculado. A importação de um contrato lê o representante da imobiliária e oferece cadastrá-lo.</p>
                        ) : (
                            <ul className="divide-y divide-border/50">
                                {bundle.agents.map(g => <AgentLine key={g.id} agent={g} base={base} />)}
                            </ul>
                        )}
                    </section>
                </div>

                <div className="space-y-4">
                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <h2 className="text-sm font-semibold text-foreground">Prestação de serviços</h2>
                            {canEdit && <button type="button" onClick={() => onEdit(agency)} className={chip}><PenLine className="h-3.5 w-3.5" /> {agreement.hasFile ? "Alterar" : "Anexar"}</button>}
                        </header>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
                            <Field label="Documento" className="col-span-2">
                                {agreement.hasFile ? (
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="break-all text-sm">{agency.service_agreement_filename || "Contrato de prestação de serviços"}</span>
                                        {agency.service_agreement_url && (
                                            <a href={agency.service_agreement_url} target="_blank" rel="noopener noreferrer" className={chip}><Eye className="h-3.5 w-3.5" /> Ver</a>
                                        )}
                                    </span>
                                ) : <span className="text-muted-foreground">nenhum anexado</span>}
                            </Field>
                            <Field label="Taxa">{row.feePct != null ? `${row.feePct.toLocaleString("pt-BR")}% do aluguel` : "—"}</Field>
                            <Field label="Vigência">
                                {agreement.start || agreement.end
                                    ? <span className={cn(agreement.expired && "text-rose-600", agreement.expiring && "text-amber-600")}>{formatDateBR(agreement.start)} → {agreement.end ? formatDateBR(agreement.end) : "indeterminada"}</span>
                                    : "—"}
                            </Field>
                        </dl>
                    </section>

                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="border-b border-border/60 px-4 py-3">
                            <h2 className="text-sm font-semibold text-foreground">Ficha da imobiliária</h2>
                        </header>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
                            <Field label="Razão social" className="col-span-2">{agency.name}</Field>
                            <Field label="Nome fantasia">{agency.trade_name || "—"}</Field>
                            <Field label="CNPJ">{row.cnpj || "—"}</Field>
                            <Field label="CRECI">{row.creci || "—"}</Field>
                            <Field label="Responsável legal">{agency.owner_name || "—"}</Field>
                            <Field label="Telefone principal">{agency.main_phone ? <>{formatPhone(agency.main_phone)}{agency.main_phone_whatsapp ? " · WhatsApp" : ""}</> : "—"}</Field>
                            <Field label="Telefone adicional">{agency.additional_phone ? <>{formatPhone(agency.additional_phone)}{agency.additional_phone_whatsapp ? " · WhatsApp" : ""}</> : "—"}</Field>
                            <Field label="E-mail" className="col-span-2">{agency.email ? <a href={`mailto:${agency.email}`} className="underline-offset-2 hover:underline">{agency.email}</a> : "—"}</Field>
                            <Field label="Website" className="col-span-2">{agency.website ? <a href={agency.website} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{agency.website.replace(/^https?:\/\//, "")}</a> : "—"}</Field>
                            <Field label="Endereço" className="col-span-2">{address || "—"}{agency.postal_code ? <span className="text-muted-foreground"> · CEP {formatCEP(agency.postal_code)}</span> : null}</Field>
                            {agency.description && <Field label="Notas internas" className="col-span-2"><p className="whitespace-pre-wrap text-xs text-muted-foreground">{agency.description}</p></Field>}
                            <Field label="Registro" className="col-span-2">
                                <span className="text-xs text-muted-foreground">
                                    {ROLE_LABELS[agency.role] ?? agency.role} · cadastrada {formatDateBR(agency.created_at)}{agency.updated_at.slice(0, 10) !== agency.created_at.slice(0, 10) ? ` · alterada ${formatDateBR(agency.updated_at)}` : ""}
                                </span>
                            </Field>
                        </dl>
                    </section>
                </div>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
    );
}

function LeaseLine({ lease, base, feePct }: { lease: AgencyLeaseSummary; base: string; feePct: number | null }) {
    const inForce = IN_FORCE.has(lease.status);
    const meta = statusMeta({ status: lease.status, inForce });
    const end = lease.termination_date ?? lease.end_date;
    const place = [lease.property_name, lease.unit_name].filter(Boolean).join(" · ") || "Imóvel";
    const rent = Number(lease.monthly_rent) || 0;
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                    <Link href={`${base}/contratos?id=${lease.id}`} className="break-words font-semibold text-foreground underline-offset-2 hover:underline">{lease.reference_name ?? place}</Link>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                    <Home className="mr-1 inline h-3 w-3 align-[-2px]" />{place} · {lease.primary_tenant_name ?? "—"}{lease.agent_name ? ` · corretor ${lease.agent_name}` : ""} · {formatDateBR(lease.start_date)} → {end ? formatDateBR(end) : "indeterminado"}
                </p>
            </div>
            <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                {brl(rent)}<span className="text-xs font-normal text-muted-foreground">/mês</span>
                {feePct != null && inForce && <span className="block text-[11px] font-normal text-amber-700 dark:text-amber-400">taxa {brl((rent * feePct) / 100, 0)}</span>}
            </span>
            <Link href={`${base}/contratos?id=${lease.id}`} className={chip} title="Abrir o contrato"><FileSignature className="h-3.5 w-3.5" /> Abrir</Link>
        </li>
    );
}

function TenantLine({ tenant, base }: { tenant: AgencyTenantSummary; base: string }) {
    const meta = TENANT_STATUS_META[tenant.status] ?? TENANT_STATUS_META.ACTIVE;
    const wa = whatsappUrl(tenant.main_phone);
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                    <Link href={`${base}/inquilinos?id=${tenant.id}`} className="break-words font-semibold text-foreground underline-offset-2 hover:underline">{tenant.full_name}</Link>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                </p>
                <p className="text-xs text-muted-foreground"><Home className="mr-1 inline h-3 w-3 align-[-2px]" />{tenant.property_name ?? "Imóvel"}</p>
            </div>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(chip, "text-emerald-700")} title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /> {formatPhone(tenant.main_phone as string)}</a>}
            <Link href={`${base}/inquilinos?id=${tenant.id}`} className={chip} title="Abrir o inquilino"><Users className="h-3.5 w-3.5" /> Abrir</Link>
        </li>
    );
}

function AgentLine({ agent, base }: { agent: AgencyAgentSummary; base: string }) {
    const meta = AGENT_STATUS_META[agent.status] ?? AGENT_STATUS_META.ACTIVE;
    const wa = agent.main_phone_whatsapp ? whatsappUrl(agent.main_phone) : null;
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                    <Link href={`${base}/corretores?id=${agent.id}`} className="break-words font-semibold text-foreground underline-offset-2 hover:underline">{agent.full_name}</Link>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                </p>
                <p className="text-xs text-muted-foreground"><Shield className="mr-1 inline h-3 w-3 align-[-2px]" />CRECI-{agent.creci_state} {agent.creci_number}{agent.email ? ` · ${agent.email}` : ""}</p>
            </div>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(chip, "text-emerald-700")} title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /> {formatPhone(agent.main_phone as string)}</a>}
            {!wa && agent.main_phone && <a href={`tel:${agent.main_phone}`} className={chip} title="Ligar"><Phone className="h-3.5 w-3.5" /> {formatPhone(agent.main_phone)}</a>}
            <Link href={`${base}/corretores?id=${agent.id}`} className={chip} title="Abrir o corretor"><UserCheck className="h-3.5 w-3.5" /> Abrir</Link>
        </li>
    );
}

export { Building2 as AgencyIcon };
