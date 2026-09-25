"use client";

/**
 * One tenant's dashboard (`/inquilinos?id=`): the photo, who they are and how to reach them on
 * top, the tiles (rent, time living there, when the contract ends, what they paid, deposit,
 * birthday), the rent month by month from the property's ledger, every contract they have had —
 * the ones from before too — and the ficha with the personal data.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Building2, Cake, CalendarClock, CalendarDays, DollarSign, ExternalLink, FileSignature, Home, Instagram, Linkedin, Loader2, Mail, MapPin, MessageCircle, PenLine, Phone, PiggyBank, Shield, Trash2, Wallet, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import Tile from "@/components/properties/Tile";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { formatCEP, formatCPF, formatPhone } from "@/lib/validators";
import { formatMonthKey } from "@/lib/property-income";
import { leaseIncome, statusMeta } from "@/lib/lease-dashboard";
import { IN_FORCE } from "@/lib/lease-dashboard";
import { TENANT_MANAGEMENT_LABELS, TENANT_STATUS_META, brl, livingLabel, monthsLabel, placeOfLease, tenantRows, type TenantRow } from "@/lib/tenant-dashboard";
import { instagramUrl, linkedinLabel, telUrl, whatsappUrl } from "@/lib/social-links";
import type { TenantDashboardView, TenantLeaseSummary } from "@/lib/tenant-views";
import type { TenantWithDetails } from "@/types/tenant";
import TenantPhoto from "./TenantPhoto";

const LeaseRentChart = dynamic(() => import("@/components/contratos/LeaseRentChart"), {
    ssr: false,
    loading: () => <div className="flex h-60 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando gráfico…</div>,
});

interface Props {
    tenantId: string;
    lang: string;
    today: string;
    initialBundle?: TenantDashboardView | null;
    /** bumped by the parent after it changed the tenant: the dashboard reloads */
    refreshKey: number;
    notice?: string | null;
    onDismissNotice?: () => void;
    onBack: () => void;
    onEdit: (tenant: TenantWithDetails) => void;
    onDelete: (tenant: TenantWithDetails) => void;
}

const ROLE_LABELS: Record<string, string> = { PRIMARY: "Inquilino principal", CO_TENANT: "Co-inquilino", OCCUPANT: "Ocupante" };
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("min-w-0", className)}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
        </div>
    );
}

const chip = "inline-flex max-w-full items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-left text-xs font-medium leading-snug transition-colors hover:bg-muted";

export default function TenantDashboard({ tenantId, lang, today, initialBundle = null, refreshKey, notice, onDismissNotice, onBack, onEdit, onDelete }: Props) {
    const preloaded = initialBundle && initialBundle.tenant.id === tenantId ? initialBundle : null;
    const [bundle, setBundle] = useState<TenantDashboardView | null>(preloaded);
    const [error, setError] = useState<string | null>(null);
    const seededRef = useRef(preloaded !== null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/tenants/${tenantId}/dashboard`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erro ao carregar o inquilino");
        setBundle(data as TenantDashboardView);
    }, [tenantId]);

    useEffect(() => {
        if (seededRef.current && refreshKey === 0) return;
        let alive = true;
        load().catch(err => { if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar"); });
        return () => { alive = false; };
    }, [load, refreshKey]);

    const base = lang === "pt" ? "" : `/${lang}`;
    const row: TenantRow | null = useMemo(() => (bundle ? tenantRows([bundle.tenant], bundle.leases, today)[0] : null), [bundle, today]);
    const incomeLease = useMemo(() => bundle?.leases.find(l => l.id === bundle.incomeLeaseId) ?? null, [bundle]);
    const income = useMemo(() => (bundle && incomeLease ? leaseIncome(incomeLease, bundle.income, today) : null), [bundle, incomeLease, today]);

    if (error && !bundle) {
        return (
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Inquilinos</Button>
                <p className="text-sm text-rose-600">{error}</p>
            </div>
        );
    }
    if (!bundle || !row) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando inquilino…
            </div>
        );
    }

    const { tenant } = bundle;
    const meta = TENANT_STATUS_META[row.status];
    const wa = whatsappUrl(tenant.main_phone, `Olá, ${tenant.full_name.split(" ")[0]}!`);
    const tel = telUrl(tenant.main_phone);
    const current = row.current;
    const agencyManaged = (current?.management_type ?? tenant.management_type) === "AGENCY";
    const endTone = row.daysToLeaseEnd !== null && row.daysToLeaseEnd < 0 ? "rose" : row.daysToLeaseEnd !== null && row.daysToLeaseEnd <= 90 ? "amber" : "emerald";
    const address = tenant.use_property_address
        ? null
        : [[tenant.street, tenant.street_number].filter(Boolean).join(", "), tenant.address_complement, tenant.neighborhood, [tenant.city, tenant.state].filter(Boolean).join("/"), tenant.postal_code ? formatCEP(tenant.postal_code) : null].filter(Boolean).join(" · ");

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                    <ArrowLeft className="mr-1 h-4 w-4" /> Inquilinos
                </Button>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                        <TenantPhoto tenantId={tenant.id} url={tenant.photo_url} name={tenant.full_name} size={96} editable onChanged={() => load().catch(() => {})} />
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="break-words text-2xl font-bold text-foreground">{tenant.full_name}</h1>
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                                <button
                                    type="button"
                                    onClick={() => onEdit(tenant)}
                                    title="Editar o inquilino"
                                    aria-label="Editar o inquilino"
                                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                >
                                    <PenLine className="h-4 w-4" />
                                </button>
                            </div>
                            <p className={cn("text-sm", tenant.occupation ? "text-foreground" : "italic text-muted-foreground")}>{tenant.occupation || "Ocupação não informada — informe no lápis"}</p>
                            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1"><Home className="h-3.5 w-3.5" /> {row.place}</span>
                                <span>·</span>
                                <span>{livingLabel(row)}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {wa ? (
                                    <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(chip, "border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300")}>
                                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp · {formatPhone(tenant.main_phone as string)}
                                    </a>
                                ) : (
                                    <button type="button" onClick={() => onEdit(tenant)} className={cn(chip, "italic text-muted-foreground")}><Phone className="h-3.5 w-3.5" /> sem telefone — informar</button>
                                )}
                                {tel && <a href={tel} className={chip} title="Ligar"><Phone className="h-3.5 w-3.5" /> Ligar</a>}
                                {tenant.additional_phone && whatsappUrl(tenant.additional_phone) && (
                                    <a href={whatsappUrl(tenant.additional_phone) as string} target="_blank" rel="noopener noreferrer" className={chip} title="Telefone adicional"><Phone className="h-3.5 w-3.5" /> {formatPhone(tenant.additional_phone)}</a>
                                )}
                                {tenant.email && <a href={`mailto:${tenant.email}`} className={chip}><Mail className="h-3.5 w-3.5" /> {tenant.email}</a>}
                                {tenant.instagram && <a href={instagramUrl(tenant.instagram)} target="_blank" rel="noopener noreferrer" className={chip}><Instagram className="h-3.5 w-3.5" /> @{tenant.instagram}</a>}
                                {tenant.linkedin && <a href={tenant.linkedin} target="_blank" rel="noopener noreferrer" className={chip}><Linkedin className="h-3.5 w-3.5" /> {linkedinLabel(tenant.linkedin)}</a>}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => onEdit(tenant)}>
                            <PenLine className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Editar</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(tenant)} title="Excluir inquilino" aria-label="Excluir inquilino" className="text-muted-foreground hover:text-rose-600">
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

            {/* Tiles */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <Tile
                    label="Aluguel"
                    tone="emerald"
                    icon={<DollarSign className="h-4 w-4" />}
                    value={row.rent !== null ? brl(row.rent, 0) : "—"}
                    hint={current ? `vence dia ${current.rent_due_day} · ${current.reference_name ?? placeOfLease(current)}` : row.last ? `último contrato: ${brl(Number(row.last.monthly_rent) || 0, 0)}` : "sem contrato cadastrado"}
                    info={{ what: "O aluguel de contrato em vigor deste inquilino (valor bruto, antes da taxa da imobiliária).", formula: "aluguel do contrato em vigor (o mais recente, quando há mais de um)" }}
                />
                <Tile
                    label="Tempo de casa"
                    tone="violet"
                    icon={<CalendarClock className="h-4 w-4" />}
                    value={row.monthsLiving !== null ? monthsLabel(row.monthsLiving) : row.status === "FUTURE" ? "a chegar" : "—"}
                    hint={row.since ? `${row.status === "FORMER" ? "de" : "desde"} ${formatDateBR(row.since)}${row.until ? ` a ${formatDateBR(row.until)}` : ""}` : "informe a data de entrada"}
                    info={{ what: "Quanto tempo o inquilino mora (ou morou) no imóvel: da data de entrada — ou do início do contrato — até hoje ou até a saída.", formula: "meses inteiros entre a entrada e a saída (ou hoje)" }}
                />
                <Tile
                    label="Contrato"
                    tone={current ? endTone : "slate"}
                    icon={<CalendarDays className="h-4 w-4" />}
                    value={row.leaseEnd ? formatDateBR(row.leaseEnd) : current ? "Indeterminado" : "—"}
                    hint={
                        !current ? (row.status === "ACTIVE" ? "sem contrato em vigor: cadastre em Contratos" : row.last ? `último contrato ${statusMeta({ status: row.last.status, inForce: IN_FORCE.has(row.last.status) }).label.toLowerCase()}` : "sem contrato")
                            : row.daysToLeaseEnd === null ? "sem data de término"
                            : row.daysToLeaseEnd < 0 ? `prazo vencido há ${plural(-row.daysToLeaseEnd, "dia", "dias")} · segue por prazo indeterminado`
                            : row.daysToLeaseEnd === 0 ? "termina hoje" : `faltam ${plural(row.daysToLeaseEnd, "dia", "dias")}`
                    }
                    info={{ what: "O fim do prazo do contrato em vigor. Um contrato cujo prazo passou continua valendo por prazo indeterminado enquanto o inquilino fica.", formula: "término (ou rescisão) do contrato em vigor − hoje" }}
                />
                <Tile
                    label={agencyManaged ? "Recebido (líquido)" : "Recebido"}
                    tone="blue"
                    icon={<Wallet className="h-4 w-4" />}
                    value={income && income.confirmedMonths > 0 ? brl(income.received, 0) : "—"}
                    hint={
                        income && income.confirmedMonths > 0
                            ? `${plural(income.confirmedMonths, "mês confirmado", "meses confirmados")}${income.expectedMonths > 0 ? ` · ${income.expectedMonths} previsto${income.expectedMonths === 1 ? "" : "s"}` : ""} no ${incomeLease && IN_FORCE.has(incomeLease.status) ? "contrato atual" : "último contrato"}`
                            : incomeLease ? "sem lançamentos na razão de receitas" : "sem contrato"
                    }
                    info={{ what: "O que chegou ao proprietário nos meses do contrato deste inquilino, segundo a razão de receitas do imóvel.", formula: "Σ recebido dos meses confirmados do contrato em vigor (ou do último)" }}
                />
                <Tile
                    label="Caução"
                    tone="slate"
                    icon={<PiggyBank className="h-4 w-4" />}
                    value={current?.security_deposit ? brl(Number(current.security_deposit), 0) : "—"}
                    hint={current?.security_deposit ? "devolvida no fim do contrato" : current ? "sem caução no contrato" : "—"}
                    info={{ what: "A garantia em dinheiro deixada no contrato em vigor, devolvida corrigida no fim, descontado o que ficar devendo.", formula: "caução do contrato (até 3 aluguéis por lei)" }}
                />
                <Tile
                    label="Aniversário"
                    tone="amber"
                    icon={<Cake className="h-4 w-4" />}
                    value={tenant.date_of_birth ? formatDateBR(tenant.date_of_birth).slice(0, 5) : "—"}
                    hint={
                        row.birthday
                            ? `${row.age !== null ? `${row.age} anos · ` : ""}${row.birthday.days === 0 ? "é hoje!" : `faz ${row.birthday.turning} em ${plural(row.birthday.days, "dia", "dias")}`}`
                            : row.age !== null ? `${row.age} anos` : "sem data de nascimento"
                    }
                    info={{ what: "Uma mensagem no aniversário custa nada e segura inquilino. A lista Atenção do hub avisa na semana.", formula: "próximo aniversário a partir de hoje" }}
                />
            </div>

            {/* Payments + contracts | ficha */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Aluguel mês a mês</h2>
                                <p className="text-xs text-muted-foreground">
                                    {income && income.points.length > 0 && incomeLease
                                        ? `${formatMonthKey(income.firstMonth!)} a ${formatMonthKey(income.lastMonth!)} · ${placeOfLease(incomeLease)}`
                                        : "O que a razão de receitas do imóvel registrou nos meses do contrato"}
                                </p>
                            </div>
                            {incomeLease && (
                                <Link href={`${base}/imoveis?id=${incomeLease.property_id}`} className={chip} title="Abrir a razão de receitas do imóvel">
                                    <ExternalLink className="h-3.5 w-3.5" /> Razão de receitas
                                </Link>
                            )}
                        </header>
                        <div className="p-4">
                            {income && income.points.length > 0 ? (
                                <LeaseRentChart points={income.points} agencyManaged={agencyManaged} />
                            ) : (
                                <div className="flex h-32 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
                                    <Wallet className="h-6 w-6 text-muted-foreground/60" />
                                    <p>{incomeLease ? "Nenhum mês deste contrato lançado ainda." : "Sem contrato cadastrado para este inquilino."}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Contratos</h2>
                                <p className="text-xs text-muted-foreground">Todos os contratos deste inquilino, os antigos inclusive.</p>
                            </div>
                            <Link href={`${base}/contratos`} className={chip}><FileSignature className="h-3.5 w-3.5" /> Contratos</Link>
                        </header>
                        {bundle.leases.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum contrato cadastrado. Envie o contrato de locação em Contratos → Novo Contrato.</p>
                        ) : (
                            <ul className="divide-y divide-border/50">
                                {bundle.leases.map(l => <LeaseLine key={l.id} lease={l} base={base} />)}
                            </ul>
                        )}
                    </section>
                </div>

                <section className="rounded-xl border border-border/80 bg-card">
                    <header className="border-b border-border/60 px-4 py-3">
                        <h2 className="text-sm font-semibold text-foreground">Ficha do inquilino</h2>
                    </header>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
                        <Field label="CPF">{formatCPF(tenant.cpf)}</Field>
                        <Field label="RG">{tenant.rg || "—"}</Field>
                        <Field label="Nascimento">{tenant.date_of_birth ? `${formatDateBR(tenant.date_of_birth)}${row.age !== null ? ` (${row.age} anos)` : ""}` : "—"}</Field>
                        <Field label="Ocupação">{tenant.occupation || "—"}</Field>
                        <Field label="Endereço" className="col-span-2">
                            {tenant.use_property_address ? (
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Mora no imóvel alugado</span>
                            ) : address || "—"}
                        </Field>
                        <Field label="Imóvel cadastrado" className="col-span-2">
                            <Link href={`${base}/imoveis?id=${tenant.property_id}`} className={chip}><Home className="h-3.5 w-3.5" /> {tenant.property_name ?? "Imóvel"}</Link>
                        </Field>
                        <Field label="Gestão" className="col-span-2">
                            {tenant.management_type === "AGENCY" && tenant.agency_id ? (
                                <Link href={`${base}/imobiliaria?agency=${tenant.agency_id}&property=${tenant.property_id}`} className={chip}><Building2 className="h-3.5 w-3.5" /> {tenant.agency_name ?? "Imobiliária"}</Link>
                            ) : (
                                <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {TENANT_MANAGEMENT_LABELS[tenant.management_type]}</span>
                            )}
                            {tenant.agent_name && <p className="mt-1 text-xs text-muted-foreground">Corretor: {tenant.agent_name}</p>}
                        </Field>
                        {(tenant.emergency_contact_name || tenant.emergency_contact_phone) && (
                            <Field label="Contato de emergência" className="col-span-2">
                                <span className="inline-flex flex-wrap items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-muted-foreground" /> {tenant.emergency_contact_name}
                                    {tenant.emergency_contact_phone && whatsappUrl(tenant.emergency_contact_phone) && (
                                        <a href={whatsappUrl(tenant.emergency_contact_phone) as string} target="_blank" rel="noopener noreferrer" className={chip}><MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> {formatPhone(tenant.emergency_contact_phone)}</a>
                                    )}
                                </span>
                            </Field>
                        )}
                        {tenant.notes && (
                            <Field label="Observações" className="col-span-2"><p className="whitespace-pre-wrap text-xs text-muted-foreground">{tenant.notes}</p></Field>
                        )}
                        <Field label="Registro" className="col-span-2">
                            <span className="text-xs text-muted-foreground">cadastrado {formatDateBR(tenant.created_at)}{tenant.updated_at.slice(0, 10) !== tenant.created_at.slice(0, 10) ? ` · alterado ${formatDateBR(tenant.updated_at)}` : ""}</span>
                        </Field>
                    </dl>
                </section>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
    );
}

function LeaseLine({ lease, base }: { lease: TenantLeaseSummary; base: string }) {
    const inForce = IN_FORCE.has(lease.status);
    const meta = statusMeta({ status: lease.status, inForce });
    const end = lease.termination_date ?? lease.end_date;
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                    <Link href={`${base}/contratos?id=${lease.id}`} className="break-words font-semibold text-foreground underline-offset-2 hover:underline">{lease.reference_name ?? placeOfLease(lease)}</Link>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                    {lease.role !== "PRIMARY" && <span className="text-[11px] text-muted-foreground">{ROLE_LABELS[lease.role]}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                    {placeOfLease(lease)} · {formatDateBR(lease.start_date)} → {end ? formatDateBR(end) : "indeterminado"}
                    {lease.management_type === "AGENCY" && lease.agency_name ? ` · ${lease.agency_name}` : ""}
                </p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-foreground">{brl(Number(lease.monthly_rent) || 0)}<span className="text-xs font-normal text-muted-foreground">/mês</span></span>
            <Link href={`${base}/contratos?id=${lease.id}`} className={chip} title="Abrir o contrato"><FileSignature className="h-3.5 w-3.5" /> Abrir</Link>
        </li>
    );
}
