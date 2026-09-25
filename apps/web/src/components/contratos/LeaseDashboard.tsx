"use client";

/**
 * One contract's dashboard (`/contratos?id=`): the KPIs on top (rent, term, next adjustment, what
 * the ledger says arrived, the deposit), the rent month by month next to the contract's card,
 * the contract's life as a line, and its files at the bottom — where the signed PDF and the older
 * contracts of the same tenant are kept.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Ban,
    Building2,
    CalendarClock,
    CalendarDays,
    CheckCircle2,
    Clock,
    DollarSign,
    ExternalLink,
    FileText,
    Home,
    Loader2,
    Mail,
    MessageCircle,
    PenLine,
    PiggyBank,
    Trash2,
    TrendingUp,
    User,
    Users,
    Wallet,
    X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@kitnets/ui";
import Tile from "@/components/properties/Tile";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { formatMonthKey } from "@/lib/property-income";
import { formatPhone } from "@/lib/validators";
import {
    MANAGEMENT_LABELS,
    brl,
    leaseIncome,
    milestones,
    statusMeta,
    summarizeLease,
    type Milestone,
} from "@/lib/lease-dashboard";
import type { LeaseDashboardView } from "@/lib/lease-views";
import type { LeaseWithDetails } from "@/types/lease";
import LeaseDocuments from "./LeaseDocuments";

const LeaseRentChart = dynamic(() => import("./LeaseRentChart"), {
    ssr: false,
    loading: () => <div className="flex h-60 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando gráfico…</div>,
});

interface Props {
    leaseId: string;
    lang: string;
    today: string;
    /** The dashboard the page preloaded on the server, so the first paint has it; refreshes go through the API. */
    initialBundle?: LeaseDashboardView | null;
    /** Bumped by the parent after it changed the lease (terminated, edited): the dashboard reloads. */
    refreshKey: number;
    /** A message to show on top (the "already has an active lease" warning after a save). */
    notice?: string | null;
    onDismissNotice?: () => void;
    onBack: () => void;
    onEdit: (bundle: LeaseDashboardView) => void;
    onTerminate: (lease: LeaseWithDetails) => void;
    onDelete: (lease: LeaseWithDetails) => void;
}

const CHARGE_LABELS: Record<string, string> = { CONDOMINIUM: "Condomínio", IPTU: "IPTU", WATER: "Água", ELECTRICITY: "Energia elétrica", GAS: "Gás", INTERNET: "Internet", OTHER: "Outro" };
const RESPONSIBILITY_LABELS: Record<string, string> = { TENANT: "Inquilino", LANDLORD: "Proprietário", INCLUDED: "Incluso no aluguel" };
const CHARGE_INDEX_LABELS: Record<string, string> = { IPCA: "IPCA", IGP_M: "IGP-M", INPC: "INPC", IVAR: "IVAR", CUSTOM: "Outra regra", NONE: "Valor fixo" };

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("min-w-0", className)}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
        </div>
    );
}

const chip = "inline-flex max-w-full items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-left text-xs font-medium leading-snug hover:bg-muted transition-colors";

export default function LeaseDashboard({ leaseId, lang, today, initialBundle = null, refreshKey, notice, onDismissNotice, onBack, onEdit, onTerminate, onDelete }: Props) {
    const preloaded = initialBundle && initialBundle.lease.id === leaseId ? initialBundle : null;
    const [bundle, setBundle] = useState<LeaseDashboardView | null>(preloaded);
    const [error, setError] = useState<string | null>(null);
    const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null);
    const seededRef = useRef(preloaded !== null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/leases/${leaseId}/dashboard`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erro ao carregar o contrato");
        setBundle(data as LeaseDashboardView);
    }, [leaseId]);

    useEffect(() => {
        // seeded from the server: no first fetch; a bump of refreshKey always reloads
        if (seededRef.current && refreshKey === 0) return;
        let alive = true;
        load().catch(err => { if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar"); });
        return () => { alive = false; };
    }, [load, refreshKey]);

    const base = lang === "pt" ? "" : `/${lang}`;
    const row = useMemo(() => (bundle ? summarizeLease(bundle.lease, bundle.series ? { [seriesKey(bundle.lease.adjustment_index)]: bundle.series } : {}, today) : null), [bundle, today]);
    const income = useMemo(() => (bundle ? leaseIncome(bundle.lease, bundle.income, today) : null), [bundle, today]);
    const line = useMemo(() => (bundle ? milestones(bundle.lease, today) : []), [bundle, today]);

    if (error && !bundle) {
        return (
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Contratos</Button>
                <p className="text-sm text-rose-600">{error}</p>
            </div>
        );
    }
    if (!bundle || !row || !income) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando contrato…
            </div>
        );
    }

    const { lease, tenant } = bundle;
    const { summary, status } = row;
    const meta = statusMeta(row);
    const contractFile = lease.documents.find(d => d.document_type === "CONTRACT") ?? lease.documents[0] ?? null;
    const rent = Number(lease.monthly_rent) || 0;
    const agencyManaged = lease.management_type === "AGENCY";
    const tenantCharges = lease.charges.filter(c => c.responsibility === "TENANT" && c.amount);
    const tenantChargesTotal = tenantCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const endTone = summary.daysLeft !== null && summary.daysLeft < 0 ? "rose" : summary.daysLeft !== null && summary.daysLeft <= 90 ? "amber" : "emerald";
    const phone = tenant?.main_phone ?? null;
    const waLink = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;
    const openPdf = (url: string, name: string) => (/\.pdf$/i.test(name) ? setViewing({ url, name }) : window.open(url, "_blank", "noopener,noreferrer"));

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                        <ArrowLeft className="mr-1 h-4 w-4" /> Contratos
                    </Button>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-bold text-foreground">{row.title}</h1>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                        <button
                            type="button"
                            onClick={() => onEdit(bundle)}
                            title="Editar o contrato"
                            aria-label="Editar o contrato"
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                            <PenLine className="h-4 w-4" />
                        </button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {[row.place, lease.primary_tenant_name, agencyManaged ? lease.agency_name ?? "Imobiliária" : lease.management_type === "AGENT" ? `Corretor ${lease.agent_name ?? ""}`.trim() : "Gestão própria"].filter(Boolean).join(" · ")}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {contractFile && (
                        <Button variant="outline" onClick={() => openPdf(contractFile.file_url, contractFile.file_name)} title={contractFile.file_name}>
                            <FileText className="h-4 w-4 text-rose-600 sm:mr-1" />
                            <span className="hidden sm:inline">Ver PDF</span>
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => onEdit(bundle)}>
                        <PenLine className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Editar</span>
                    </Button>
                    {row.inForce && (
                        <Button variant="outline" onClick={() => onTerminate(lease)} className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30">
                            <Ban className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Rescindir</span>
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => onDelete(lease)} title="Excluir contrato" aria-label="Excluir contrato" className="text-muted-foreground hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {notice && (
                <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    <span className="flex-1">{notice}</span>
                    {onDismissNotice && (
                        <button type="button" onClick={onDismissNotice} className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40" aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
                    )}
                </div>
            )}

            {status === "EXPIRED" && row.inForce && (
                <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                    <Clock className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>
                        O prazo terminou em <strong>{formatDateBR(summary.effectiveEnd)}</strong> e o contrato segue por prazo indeterminado (Lei 8.245/91, art. 46 §1º).
                        Renove com um aditivo, cadastre o novo contrato ou registre a rescisão.
                    </span>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <Tile
                    label="Aluguel"
                    tone="emerald"
                    icon={<DollarSign className="h-4 w-4" />}
                    value={brl(rent, 0)}
                    hint={
                        <span className="block space-y-0.5 pt-0.5">
                            <span className="block">Vence todo dia {lease.rent_due_day}</span>
                            {row.inForce && <span className="block">Próximo: {formatDateBR(summary.nextDueDate)} · {summary.daysToDue === 0 ? "hoje" : `em ${plural(summary.daysToDue, "dia", "dias")}`}</span>}
                            {tenantChargesTotal > 0 && <span className="block">+ {brl(tenantChargesTotal, 0)} de encargos do inquilino</span>}
                        </span>
                    }
                    info={{
                        what: "O aluguel de contrato: o valor bruto combinado, antes da taxa da imobiliária. Os encargos que o inquilino paga por fora (condomínio, energia) estão na ficha.",
                        formula: "aluguel de contrato · vencimento = dia do mês combinado (o último dia do mês quando ele não existe)",
                        example: agencyManaged ? `${brl(rent)} brutos; o que chega ao proprietário é o líquido, na razão de receitas do imóvel` : undefined,
                    }}
                />
                <Tile
                    label="Prazo"
                    tone={endTone}
                    icon={<CalendarDays className="h-4 w-4" />}
                    value={row.termMonths !== null ? `${row.termMonths} meses` : "Indeterminado"}
                    hint={
                        <span className="block space-y-0.5 pt-0.5">
                            <span className="block">{formatDateBR(lease.start_date)} → {summary.effectiveEnd ? formatDateBR(summary.effectiveEnd) : "sem data de término"}</span>
                            <span className="block">
                                {summary.daysLeft === null ? `Há ${plural(summary.daysElapsed, "dia", "dias")} em vigor`
                                    : !row.inForce ? (lease.status === "TERMINATED" ? `Rescindido em ${formatDateBR(lease.termination_date)}` : "Encerrado")
                                    : summary.daysLeft < 0 ? `Vencido há ${plural(-summary.daysLeft, "dia", "dias")}`
                                    : summary.daysLeft === 0 ? "Termina hoje" : `Faltam ${plural(summary.daysLeft, "dia", "dias")}`}
                            </span>
                            {summary.progressPct !== null && (
                                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted" title={`${summary.progressPct}% do prazo`}>
                                    <span className={cn("block h-full", endTone === "rose" ? "bg-rose-500" : endTone === "amber" ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${summary.progressPct}%` }} />
                                </span>
                            )}
                        </span>
                    }
                    info={{
                        what: "A duração combinada e quanto dela já passou. Um contrato residencial com 30 meses ou mais pode ser retomado no fim do prazo sem justificativa (denúncia vazia); abaixo disso, só nas hipóteses da lei.",
                        formula: "meses inteiros entre o início e o término · % = dias corridos ÷ dias do prazo",
                        note: "Terminado o prazo, se o inquilino fica e o proprietário não se opõe, o contrato segue por prazo indeterminado com as mesmas condições.",
                    }}
                />
                <Tile
                    label="Próximo reajuste"
                    tone={summary.daysToAdjustment !== null && summary.daysToAdjustment <= 30 && row.inForce ? "amber" : "violet"}
                    icon={<TrendingUp className="h-4 w-4" />}
                    value={row.inForce && summary.nextAdjustmentDate ? formatDateBR(summary.nextAdjustmentDate) : "—"}
                    hint={
                        !row.inForce ? "Contrato encerrado"
                            : !summary.nextAdjustmentDate ? row.indexLabel === "Não informado" ? "Índice não informado no contrato" : "Contrato sem reajuste"
                            : `${row.indexLabel} · a cada ${summary.frequencyMonths} meses · em ${plural(summary.daysToAdjustment ?? 0, "dia", "dias")}`
                    }
                    info={{
                        what: "Quando o aluguel é corrigido: a cada aniversário do contrato, pelo índice acumulado no ciclo que terminou (a prática dos contratos brasileiros).",
                        formula: "próximo reajuste = próximo aniversário do início, na periodicidade do contrato",
                        note: "A data fica no contrato; se ela passou sem ninguém rolar, o painel avança para o aniversário seguinte.",
                    }}
                />
                <Tile
                    label="Reajuste previsto"
                    tone="violet"
                    icon={<TrendingUp className="h-4 w-4" />}
                    value={row.inForce && summary.adjustedRent !== null && summary.monthsCounted > 0 ? brl(summary.adjustedRent, 0) : "—"}
                    hint={
                        row.inForce && summary.accumulatedPct !== null && summary.monthsCounted > 0
                            ? <>{row.indexLabel} {pctText(summary.accumulatedPct)} · {summary.monthsCounted} de {summary.frequencyMonths} meses{summary.indexThrough ? ` · até ${formatMonthKey(summary.indexThrough)}` : ""}</>
                            : !row.inForce ? "—" : !summary.nextAdjustmentDate ? "Sem reajuste" : !row.seriesCode ? `${row.indexLabel}: informe o percentual no reajuste` : summary.accumulatedPct !== null ? "Nenhum mês do ciclo divulgado ainda" : "Série do índice indisponível"
                    }
                    info={{
                        what: "Prévia do aluguel após o próximo reajuste, com os meses do ciclo já divulgados pelo índice. O percentual definitivo só fecha quando o último mês do ciclo sai.",
                        formula: <>acumulado = Π (1 + variação mensal) − 1<br />aluguel reajustado = aluguel × (1 + acumulado)</>,
                        example: summary.accumulatedPct !== null && summary.adjustedRent !== null ? `${brl(rent)} × (1 ${summary.accumulatedPct >= 0 ? "+" : "−"} ${Math.abs(summary.accumulatedPct).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%) = ${brl(summary.adjustedRent)}` : undefined,
                        note: "Com índice negativo a maioria dos contratos mantém o aluguel.",
                    }}
                />
                <Tile
                    label={agencyManaged ? "Recebido (líquido)" : "Recebido"}
                    tone="blue"
                    icon={<Wallet className="h-4 w-4" />}
                    value={income.confirmedMonths > 0 ? brl(income.received, 0) : "—"}
                    hint={
                        income.confirmedMonths > 0
                            ? <>{plural(income.confirmedMonths, "mês confirmado", "meses confirmados")}{income.expectedMonths > 0 ? ` · ${income.expectedMonths} previsto${income.expectedMonths === 1 ? "" : "s"}` : ""}{income.missingMonths > 0 ? ` · ${income.missingMonths} sem lançamento` : ""}</>
                            : "Sem lançamentos na razão de receitas do imóvel"
                    }
                    info={{
                        what: "O que chegou ao proprietário nos meses deste contrato, segundo a razão de receitas do imóvel (líquido da taxa da imobiliária, quando há). É o elo entre o contrato e o dinheiro.",
                        formula: "Σ recebido dos meses confirmados entre o início e o fim do contrato (a unidade do contrato, ou o imóvel inteiro)",
                        example: income.confirmedMonths > 0 ? `${income.confirmedMonths} meses · bruto ${brl(income.gross)} · recebido ${brl(income.received)}` : undefined,
                        note: "Lance os meses na razão de receitas do imóvel para este número acompanhar.",
                    }}
                />
                <Tile
                    label="Caução"
                    tone="slate"
                    icon={<PiggyBank className="h-4 w-4" />}
                    value={lease.security_deposit ? brl(Number(lease.security_deposit), 0) : "—"}
                    hint={lease.security_deposit ? `${lease.deposit_months ? `${plural(lease.deposit_months, "aluguel", "aluguéis")} · ` : ""}devolvida no fim do contrato` : "Sem caução informada"}
                    info={{
                        what: "A garantia em dinheiro que o inquilino deixou: até três aluguéis por lei, devolvida corrigida no fim do contrato, descontado o que ficar devendo.",
                        formula: "caução = até 3 × aluguel (Lei 8.245/91, art. 38 §2º)",
                    }}
                />
            </div>

            {/* Rent chart + contract card */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <section className="rounded-xl border border-border/80 bg-card lg:col-span-2">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Aluguel mês a mês</h2>
                            <p className="text-xs text-muted-foreground">
                                {income.points.length > 0
                                    ? `${formatMonthKey(income.firstMonth!)} a ${formatMonthKey(income.lastMonth!)} na razão de receitas do imóvel${income.currentGross !== null && Math.abs(income.currentGross - rent) >= 1 ? ` · último mês bruto ${brl(income.currentGross)} (contrato: ${brl(rent)})` : ""}`
                                    : "O que a razão de receitas do imóvel registrou nos meses deste contrato"}
                            </p>
                        </div>
                        <Link href={`${base}/imoveis?id=${lease.property_id}`} className={chip} title="Abrir a razão de receitas do imóvel">
                            <ExternalLink className="h-3.5 w-3.5" /> Razão de receitas
                        </Link>
                    </header>
                    <div className="p-4">
                        {income.points.length > 0 ? (
                            <LeaseRentChart points={income.points} agencyManaged={agencyManaged} />
                        ) : (
                            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                                <Wallet className="h-6 w-6 text-muted-foreground/60" />
                                <p>Nenhum mês deste contrato lançado ainda.</p>
                                <p className="text-xs">Os recebimentos são lançados na razão de receitas do imóvel (ou chegam pelo extrato bancário) e aparecem aqui.</p>
                            </div>
                        )}
                    </div>
                </section>

                <section className="rounded-xl border border-border/80 bg-card">
                    <header className="border-b border-border/60 px-4 py-3">
                        <h2 className="text-sm font-semibold text-foreground">Ficha do contrato</h2>
                    </header>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
                        <Field label="Imóvel" className="col-span-2">
                            <Link href={`${base}/imoveis?id=${lease.property_id}`} className={chip} title="Abrir o imóvel">
                                <Home className="h-3.5 w-3.5 shrink-0" /> <span className="break-words">{row.place}</span>
                            </Link>
                        </Field>
                        <Field label="Inquilino principal" className="col-span-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Link href={`${base}/inquilinos?tenant=${lease.primary_tenant_id}&property=${lease.property_id}`} className={chip} title="Abrir o inquilino">
                                    <User className="h-3.5 w-3.5 shrink-0" /> <span className="break-words">{lease.primary_tenant_name ?? "Inquilino"}</span>
                                </Link>
                                {phone && (
                                    <a href={waLink ?? undefined} target="_blank" rel="noopener noreferrer" className={chip} title="Conversar no WhatsApp">
                                        <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> {formatPhone(phone)}
                                    </a>
                                )}
                                {!phone && tenant?.email && (
                                    <a href={`mailto:${tenant.email}`} className={chip}><Mail className="h-3.5 w-3.5" /> {tenant.email}</a>
                                )}
                            </div>
                            {lease.additional_tenants.length > 0 && (
                                <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                                    {lease.additional_tenants.map(t => (
                                        <li key={t.id} className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {t.tenant_name ?? "Inquilino"} · {t.role === "OCCUPANT" ? "ocupante" : "co-inquilino"}</li>
                                    ))}
                                </ul>
                            )}
                            {phone && tenant?.email && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {tenant.email}</p>}
                        </Field>
                        <Field label="Gestão" className="col-span-2">
                            {agencyManaged && lease.agency_id ? (
                                <Link href={`${base}/imobiliaria?agency=${lease.agency_id}&property=${lease.property_id}`} className={chip} title="Abrir a imobiliária">
                                    <Building2 className="h-3.5 w-3.5 shrink-0" /> <span className="break-words">{lease.agency_name ?? "Imobiliária"}</span>
                                </Link>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-sm"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {lease.management_type === "AGENT" ? `Corretor ${lease.agent_name ?? ""}`.trim() : MANAGEMENT_LABELS[lease.management_type]}</span>
                            )}
                            {agencyManaged && lease.agent_name && <p className="mt-1 text-xs text-muted-foreground">Corretor: {lease.agent_name}</p>}
                        </Field>
                        <Field label="Início">{formatDateBR(lease.start_date)}</Field>
                        <Field label="Término">{lease.end_date ? formatDateBR(lease.end_date) : "Indeterminado"}</Field>
                        <Field label="Vencimento">Dia {lease.rent_due_day}</Field>
                        <Field label="Reajuste">{row.indexLabel}{lease.adjustment_index && lease.adjustment_index !== "NONE" ? ` · ${summary.frequencyMonths} meses` : ""}</Field>
                        <Field label="Caução">{lease.security_deposit ? `${brl(Number(lease.security_deposit))}${lease.deposit_months ? ` (${lease.deposit_months} ${lease.deposit_months === 1 ? "aluguel" : "aluguéis"})` : ""}` : "—"}</Field>
                        <Field label="Registro">
                            <span className="text-xs text-muted-foreground">criado {formatDateBR(lease.created_at)}{lease.updated_at && lease.updated_at.slice(0, 10) !== lease.created_at.slice(0, 10) ? ` · alterado ${formatDateBR(lease.updated_at)}` : ""}</span>
                        </Field>
                        {lease.status === "TERMINATED" && (
                            <Field label="Rescisão" className="col-span-2">
                                <span className="text-rose-700 dark:text-rose-300">{formatDateBR(lease.termination_date)}</span>
                                {lease.termination_reason && <p className="mt-0.5 text-xs text-muted-foreground">{lease.termination_reason}</p>}
                            </Field>
                        )}
                        {lease.charges.length > 0 && (
                            <Field label="Encargos" className="col-span-2">
                                <table className="w-full text-xs">
                                    <tbody>
                                        {lease.charges.map(c => (
                                            <tr key={c.id} className="border-t border-border/40 first:border-0">
                                                <td className="py-1 pr-2 text-foreground">{c.charge_type === "OTHER" && c.label ? c.label : CHARGE_LABELS[c.charge_type] ?? c.charge_type}</td>
                                                <td className="py-1 pr-2 text-muted-foreground">{RESPONSIBILITY_LABELS[c.responsibility] ?? c.responsibility}</td>
                                                <td className="py-1 text-right tabular-nums text-foreground">{c.amount ? brl(Number(c.amount)) : "—"}</td>
                                                <td className="py-1 pl-2 text-right text-muted-foreground" title={c.adjustment_notes ?? undefined}>{c.adjustment_index ? CHARGE_INDEX_LABELS[c.adjustment_index] ?? c.adjustment_index : ""}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Field>
                        )}
                        {lease.notes && (
                            <Field label="Observações" className="col-span-2">
                                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{lease.notes}</p>
                            </Field>
                        )}
                    </dl>
                </section>
            </div>

            {/* Milestones */}
            {line.length > 1 && (
                <section className="rounded-xl border border-border/80 bg-card px-4 py-3">
                    <h2 className="mb-2 text-sm font-semibold text-foreground">Linha do tempo do contrato</h2>
                    <ol className="flex flex-wrap items-center gap-y-2">
                        {line.map((m, i) => <MilestoneChip key={`${m.kind}-${m.date}`} milestone={m} last={i === line.length - 1} />)}
                    </ol>
                </section>
            )}

            {/* Documents */}
            <LeaseDocuments leaseId={lease.id} documents={lease.documents} onChanged={() => load().catch(() => {})} onView={(url, name) => setViewing({ url, name })} />

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <PdfViewerModal isOpen={viewing !== null} onClose={() => setViewing(null)} url={viewing?.url ?? null} title={viewing?.name ?? "Documento"} fileName={viewing?.name ?? "documento.pdf"} />
        </div>
    );
}

function MilestoneChip({ milestone, last }: { milestone: Milestone; last: boolean }) {
    const next = milestone.kind === "next_adjustment";
    const end = milestone.kind === "end" || milestone.kind === "termination";
    return (
        <li className="flex items-center">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                milestone.done ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : next ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                    : "border-border bg-muted/30 text-muted-foreground")}>
                {milestone.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : end ? <CalendarClock className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                <span className="font-medium">{milestone.label}</span>
                <span className="tabular-nums opacity-80">{formatDateBR(milestone.date)}</span>
            </span>
            {!last && <span className="mx-1 h-px w-4 bg-border sm:w-6" />}
        </li>
    );
}

const seriesKey = (index: string | null) => (index === "IGP_M" ? "igpm" : (index ?? "").toLowerCase());
