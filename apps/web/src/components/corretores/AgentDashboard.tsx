"use client";

/**
 * One corretor's dashboard (`/corretores?id=`): the photo, who they are (CRECI, agency) and how to
 * reach them on top, the tiles (contracts in force, rent under management, tenants, agency, CRECI,
 * since when), then the contracts they run, the tenants they look after and the ficha.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CalendarClock, DollarSign, FileSignature, Globe, Home, Loader2, Mail, MessageCircle, PenLine, Phone, Power, Shield, Trash2, User, Users, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import Tile from "@/components/properties/Tile";
import TenantPhoto from "@/components/inquilinos/TenantPhoto";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { formatCPF, formatPhone } from "@/lib/validators";
import { IN_FORCE, statusMeta } from "@/lib/lease-dashboard";
import { TENANT_STATUS_META } from "@/lib/tenant-dashboard";
import { AGENT_STATUS_META, AGENT_TYPE_LABELS, agentRows, brl, monthsLabel, type AgentRow } from "@/lib/agent-dashboard";
import { whatsappUrl } from "@/lib/social-links";
import type { AgentDashboardView, AgentLeaseSummary, AgentTenantSummary } from "@/lib/agent-views";
import type { AgentWithAgency } from "@/types/agent";

interface Props {
    agentId: string;
    lang: string;
    today: string;
    initialBundle?: AgentDashboardView | null;
    /** bumped by the parent after it changed the corretor: the dashboard reloads */
    refreshKey: number;
    notice?: string | null;
    onDismissNotice?: () => void;
    onBack: () => void;
    onEdit: (agent: AgentWithAgency) => void;
    onDelete: (agent: AgentWithAgency) => void;
    onToggleStatus: (agent: AgentWithAgency) => Promise<void> | void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const chip = "inline-flex max-w-full items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-left text-xs font-medium leading-snug transition-colors hover:bg-muted";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("min-w-0", className)}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
        </div>
    );
}

export default function AgentDashboard({ agentId, lang, today, initialBundle = null, refreshKey, notice, onDismissNotice, onBack, onEdit, onDelete, onToggleStatus }: Props) {
    const preloaded = initialBundle && initialBundle.agent.id === agentId ? initialBundle : null;
    const [bundle, setBundle] = useState<AgentDashboardView | null>(preloaded);
    const [error, setError] = useState<string | null>(null);
    const [toggling, setToggling] = useState(false);
    const seededRef = useRef(preloaded !== null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/agents/${agentId}/dashboard`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erro ao carregar o corretor");
        setBundle(data as AgentDashboardView);
    }, [agentId]);

    useEffect(() => {
        if (seededRef.current && refreshKey === 0) return;
        let alive = true;
        load().catch(err => { if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar"); });
        return () => { alive = false; };
    }, [load, refreshKey]);

    const base = lang === "pt" ? "" : `/${lang}`;
    const row: AgentRow | null = useMemo(() => (bundle ? agentRows([bundle.agent], bundle.leases, bundle.tenants, today)[0] : null), [bundle, today]);

    if (error && !bundle) {
        return (
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Corretores</Button>
                <p className="text-sm text-rose-600">{error}</p>
            </div>
        );
    }
    if (!bundle || !row) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando corretor…
            </div>
        );
    }

    const { agent } = bundle;
    const meta = AGENT_STATUS_META[row.status];
    const active = agent.status === "ACTIVE";
    const tenantsNow = bundle.tenants.filter(t => t.status === "ACTIVE");

    return (
        <div className="space-y-5">
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                    <ArrowLeft className="mr-1 h-4 w-4" /> Corretores
                </Button>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                        <TenantPhoto tenantId={agent.id} url={agent.photo_url} name={agent.full_name} size={96} editable endpoint={`/api/agents/${agent.id}/photo`} subject="deste corretor" onChanged={() => load().catch(() => {})} />
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="break-words text-2xl font-bold text-foreground">{agent.full_name}</h1>
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                                <button type="button" onClick={() => onEdit(agent)} title="Editar o corretor" aria-label="Editar o corretor" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                    <PenLine className="h-4 w-4" />
                                </button>
                            </div>
                            <p className="text-sm text-foreground">{row.creci}</p>
                            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                                {agent.agent_type === "IMOBILIARIA" && agent.agency_id ? (
                                    <Link href={`${base}/imobiliaria?agency=${agent.agency_id}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline"><Building2 className="h-3.5 w-3.5" /> {agent.agency_name ?? "Imobiliária"}</Link>
                                ) : (
                                    <span className={cn("inline-flex items-center gap-1", agent.agent_type === "IMOBILIARIA" && "text-amber-600")}><Building2 className="h-3.5 w-3.5" /> {row.affiliation}</span>
                                )}
                                <span>·</span>
                                <span>cadastrado há {monthsLabel(row.monthsRegistered)}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {row.whatsapp ? (
                                    <a href={row.whatsapp} target="_blank" rel="noopener noreferrer" className={cn(chip, "border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300")}>
                                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp · {formatPhone((agent.main_phone_whatsapp ? agent.main_phone : agent.additional_phone) as string)}
                                    </a>
                                ) : !agent.main_phone ? (
                                    <button type="button" onClick={() => onEdit(agent)} className={cn(chip, "italic text-muted-foreground")}><Phone className="h-3.5 w-3.5" /> sem telefone — informar</button>
                                ) : null}
                                {agent.main_phone && <a href={`tel:${agent.main_phone}`} className={chip} title="Ligar"><Phone className="h-3.5 w-3.5" /> {formatPhone(agent.main_phone)}</a>}
                                {agent.additional_phone && !(row.whatsapp && agent.additional_phone_whatsapp && !agent.main_phone_whatsapp) && (
                                    <a href={`tel:${agent.additional_phone}`} className={chip} title="Telefone adicional"><Phone className="h-3.5 w-3.5" /> {formatPhone(agent.additional_phone)}</a>
                                )}
                                {agent.email && <a href={`mailto:${agent.email}`} className={chip}><Mail className="h-3.5 w-3.5" /> {agent.email}</a>}
                                {agent.website && <a href={agent.website} target="_blank" rel="noopener noreferrer" className={chip}><Globe className="h-3.5 w-3.5" /> {agent.website.replace(/^https?:\/\//, "")}</a>}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => onEdit(agent)}>
                            <PenLine className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Editar</span>
                        </Button>
                        <Button
                            variant="outline"
                            disabled={toggling}
                            onClick={async () => { setToggling(true); try { await onToggleStatus(agent); } finally { setToggling(false); } }}
                            className={active ? "border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30" : "border-emerald-500 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"}
                            title={active ? "Marcar como inativo" : "Reativar"}
                        >
                            {toggling ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <Power className="h-4 w-4 sm:mr-1" />}
                            <span className="hidden sm:inline">{active ? "Desativar" : "Ativar"}</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(agent)} title="Excluir corretor" aria-label="Excluir corretor" className="text-muted-foreground hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                        </Button>
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
                    hint={row.leases.length > row.inForce.length ? `${plural(row.leases.length - row.inForce.length, "contrato encerrado", "contratos encerrados")} também` : row.inForce.length > 0 ? "com este corretor como responsável" : "nenhum contrato nomeia este corretor"}
                    info={{ what: "Os contratos de locação em vigor que nomeiam este corretor como responsável (o campo Corretor do contrato).", formula: "contratos com status ativo ou vencendo, agent_id = este corretor" }}
                />
                <Tile
                    label="Aluguel sob gestão"
                    tone="emerald"
                    icon={<DollarSign className="h-4 w-4" />}
                    value={row.inForce.length > 0 ? brl(row.rentManaged, 0) : "—"}
                    hint={row.inForce.length > 0 ? `${brl(row.rentManaged * 12, 0)} por ano · valor de contrato` : "—"}
                    info={{ what: "A soma do aluguel de contrato (bruto) dos contratos em vigor deste corretor.", formula: "Σ aluguel dos contratos em vigor" }}
                />
                <Tile
                    label="Inquilinos atendidos"
                    tone="violet"
                    icon={<Users className="h-4 w-4" />}
                    value={String(tenantsNow.length)}
                    hint={bundle.tenants.length > tenantsNow.length ? `${plural(bundle.tenants.length - tenantsNow.length, "antigo ou futuro", "antigos ou futuros")} também` : tenantsNow.length > 0 ? "morando hoje" : "nenhum inquilino com este corretor"}
                    info={{ what: "Os inquilinos cadastrados com este corretor (o campo Corretor do inquilino).", formula: "inquilinos com status atual, agent_id = este corretor" }}
                />
                <Tile
                    label="Atuação"
                    tone="blue"
                    icon={<Building2 className="h-4 w-4" />}
                    value={agent.agent_type === "AUTONOMO" ? "Autônomo" : "Imobiliária"}
                    hint={agent.agent_type === "AUTONOMO" ? "sem vínculo com imobiliária" : row.affiliation}
                    info={{ what: "Um corretor autônomo intermedeia por conta própria; um vinculado responde pela imobiliária nos contratos dela.", formula: "tipo de atuação do cadastro" }}
                />
                <Tile
                    label="CRECI"
                    tone="slate"
                    icon={<Shield className="h-4 w-4" />}
                    value={agent.creci_number}
                    hint={`${agent.creci_state}${agent.cpf ? ` · CPF ${formatCPF(agent.cpf)}` : ""}`}
                    info={{ what: "O registro profissional no Conselho Regional de Corretores de Imóveis. Sem CRECI não há corretor.", formula: "CRECI-UF número" }}
                />
                <Tile
                    label="Cadastrado em"
                    tone="slate"
                    icon={<CalendarClock className="h-4 w-4" />}
                    value={formatDateBR(row.since)}
                    hint={`há ${monthsLabel(row.monthsRegistered)}`}
                    info={{ what: "Quando o corretor entrou no seu cadastro — pelo formulário ou lido de um contrato de locação.", formula: "data do cadastro" }}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Contratos</h2>
                                <p className="text-xs text-muted-foreground">Os contratos que nomeiam este corretor, os encerrados inclusive.</p>
                            </div>
                            <Link href={`${base}/contratos`} className={chip}><FileSignature className="h-3.5 w-3.5" /> Contratos</Link>
                        </header>
                        {bundle.leases.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum contrato nomeia este corretor. Selecione-o no campo Corretor de um contrato em Contratos.</p>
                        ) : (
                            <ul className="divide-y divide-border/50">
                                {bundle.leases.map(l => <LeaseLine key={l.id} lease={l} base={base} />)}
                            </ul>
                        )}
                    </section>

                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Inquilinos</h2>
                                <p className="text-xs text-muted-foreground">Os inquilinos cadastrados com este corretor.</p>
                            </div>
                            <Link href={`${base}/inquilinos`} className={chip}><Users className="h-3.5 w-3.5" /> Inquilinos</Link>
                        </header>
                        {bundle.tenants.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum inquilino com este corretor.</p>
                        ) : (
                            <ul className="divide-y divide-border/50">
                                {bundle.tenants.map(t => <TenantLine key={t.id} tenant={t} base={base} />)}
                            </ul>
                        )}
                    </section>
                </div>

                <section className="rounded-xl border border-border/80 bg-card">
                    <header className="border-b border-border/60 px-4 py-3">
                        <h2 className="text-sm font-semibold text-foreground">Ficha do corretor</h2>
                    </header>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
                        <Field label="CRECI">{row.creci}</Field>
                        <Field label="CPF">{agent.cpf ? formatCPF(agent.cpf) : "—"}</Field>
                        <Field label="Atuação" className="col-span-2">
                            {agent.agent_type === "IMOBILIARIA" && agent.agency_id ? (
                                <Link href={`${base}/imobiliaria?agency=${agent.agency_id}`} className={chip}><Building2 className="h-3.5 w-3.5" /> {agent.agency_name ?? "Imobiliária"}</Link>
                            ) : (
                                <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" /> {AGENT_TYPE_LABELS[agent.agent_type]}{agent.agent_type === "IMOBILIARIA" ? " (removida)" : ""}</span>
                            )}
                        </Field>
                        <Field label="Telefone principal">{agent.main_phone ? <>{formatPhone(agent.main_phone)}{agent.main_phone_whatsapp ? " · WhatsApp" : ""}</> : "—"}</Field>
                        <Field label="Telefone adicional">{agent.additional_phone ? <>{formatPhone(agent.additional_phone)}{agent.additional_phone_whatsapp ? " · WhatsApp" : ""}</> : "—"}</Field>
                        <Field label="E-mail" className="col-span-2">{agent.email ? <a href={`mailto:${agent.email}`} className="underline-offset-2 hover:underline">{agent.email}</a> : "—"}</Field>
                        <Field label="Website" className="col-span-2">{agent.website ? <a href={agent.website} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{agent.website.replace(/^https?:\/\//, "")}</a> : "—"}</Field>
                        {agent.notes && <Field label="Observações" className="col-span-2"><p className="whitespace-pre-wrap text-xs text-muted-foreground">{agent.notes}</p></Field>}
                        <Field label="Registro" className="col-span-2">
                            <span className="text-xs text-muted-foreground">cadastrado {formatDateBR(agent.created_at)}{agent.updated_at.slice(0, 10) !== agent.created_at.slice(0, 10) ? ` · alterado ${formatDateBR(agent.updated_at)}` : ""}</span>
                        </Field>
                    </dl>
                </section>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
    );
}

function LeaseLine({ lease, base }: { lease: AgentLeaseSummary; base: string }) {
    const inForce = IN_FORCE.has(lease.status);
    const meta = statusMeta({ status: lease.status, inForce });
    const end = lease.termination_date ?? lease.end_date;
    const place = [lease.property_name, lease.unit_name].filter(Boolean).join(" · ") || "Imóvel";
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                    <Link href={`${base}/contratos?id=${lease.id}`} className="break-words font-semibold text-foreground underline-offset-2 hover:underline">{lease.reference_name ?? place}</Link>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                    <Home className="mr-1 inline h-3 w-3 align-[-2px]" />{place} · {lease.primary_tenant_name ?? "—"} · {formatDateBR(lease.start_date)} → {end ? formatDateBR(end) : "indeterminado"}
                </p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-foreground">{brl(Number(lease.monthly_rent) || 0)}<span className="text-xs font-normal text-muted-foreground">/mês</span></span>
            <Link href={`${base}/contratos?id=${lease.id}`} className={chip} title="Abrir o contrato"><FileSignature className="h-3.5 w-3.5" /> Abrir</Link>
        </li>
    );
}

function TenantLine({ tenant, base }: { tenant: AgentTenantSummary; base: string }) {
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
