"use client";

/**
 * One contract's dashboard (`/contratos?id=`): the KPIs on top (rent, term, next adjustment, what
 * the ledger says arrived, the deposit), the rent month by month next to the contract's card,
 * the contract's life as a line, and its files at the bottom — where the signed PDF and the older
 * contracts of the same tenant are kept.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CalendarClock, CheckCircle2, Clock, DoorOpen, ExternalLink, FileSignature, FileText, Home, Loader2, Mail, MessageCircle, PenLine, Trash2, TrendingUp, User, Users, Wallet, X } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@kitnets/ui";
import { CardInfoIcon, TILE_TONES, type TileInfo } from "@/components/properties/Tile";
import { Money, Sensitive } from "@/components/privacy";
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
import type { IndexPoint } from "@/lib/lease-summary";
import type { LeaseWithDetails } from "@/types/lease";
import { amountOf, chargeAdjustment, featuredCharge, monthlyTotal, tenantCharges } from "@/lib/lease-charges";
import { ADJUSTED_CHARGE_LABELS, pastAdjustmentDates, trackedCharge } from "@/lib/lease-adjustments";
import { leaseTermTotals } from "@/lib/lease-term";
import LeaseAdjustmentTable from "./LeaseAdjustmentTable";
import LeaseAddendumModal from "./LeaseAddendumModal";
import LeaseDocuments from "./LeaseDocuments";
import LeaseOverview from "./LeaseOverview";
import { LeaseTitle } from "./LeaseTitle";

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
const RESPONSIBILITY_LABELS: Record<string, string> = { TENANT: "Inquilino", LANDLORD: "Proprietário", INCLUDED: "Incluso no aluguel", INCLUDED_IN_CONDO: "Incluso no condomínio" };
/** who bills the tenant for a charge ("Emissor da fatura" in the form) */
const COLLECTOR_SHORT: Record<string, string> = { OWNER: "proprietário", AGENCY: "imobiliária", THIRD_PARTY: "terceiros" };
const CHARGE_INDEX_LABELS: Record<string, string> = { IPCA: "IPCA", IGP_M: "IGP-M", INPC: "INPC", IVAR: "IVAR", CUSTOM: "Outra regra", NONE: "Valor fixo" };


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
    // "Registrar aditivo": undefined = closed, null = no adjustment chosen, a date = that adjustment's
    const [addendumFor, setAddendumFor] = useState<string | null | undefined>(undefined);
    const seededRef = useRef(preloaded !== null);

    /** the tenant changed their mind: the notice goes away and the contract runs on */
    const [cancellingNotice, setCancellingNotice] = useState(false);
    const cancelNotice = async () => {
        if (!window.confirm("Cancelar o aviso de desocupação? O contrato segue vigente, sem data de saída.")) return;
        setCancellingNotice(true);
        try {
            const res = await fetch(`/api/leases/${leaseId}/terminate`, { method: "DELETE" });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                setError(typeof json.error === "string" ? json.error : "Não foi possível cancelar o aviso.");
                return;
            }
            await load();
        } catch {
            setError("Erro de conexão. Tente novamente.");
        } finally {
            setCancellingNotice(false);
        }
    };

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
    // the lease's own index, plus the index a charge names for itself
    const seriesByCode = useMemo<Record<string, IndexPoint[] | null>>(() => (bundle ? { ...(bundle.chargeSeries ?? {}), ...(bundle.series ? { [seriesKey(bundle.lease.adjustment_index)]: bundle.series } : {}) } : {}), [bundle]);
    const row = useMemo(() => (bundle ? summarizeLease(bundle.lease, seriesByCode, today) : null), [bundle, seriesByCode, today]);
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
    // the property's own charge (condomínio for kitnets, energia for a house) and what the tenant pays in all
    const featured = featuredCharge(lease.charges, bundle.propertyKind ?? (lease.unit_id ? "multi" : null));
    const tenantFixed = tenantCharges(lease.charges);
    // the charge the adjustments follow next to the rent — the condominium, or a house's energy — readjusted on
    // the lease's dates: with the rent ("Reajusta com o aluguel") or by its own index
    const followed = trackedCharge(lease.charges);
    const followedLabel = followed ? ADJUSTED_CHARGE_LABELS[followed.charge_type] : featured.charge ? featured.label : "Condomínio";
    const followedAdjustment = chargeAdjustment(followed, lease, seriesByCode, today);
    const followedCode = followedAdjustment ? seriesKey(followedAdjustment.index) : "";
    // what the adjustments already made of the contract's original rent
    const history = bundle.adjustments ?? null;
    // what the contract adds up to over its term: what the ledger confirmed, and what is still to come by the contract
    const term = leaseTermTotals(
        { ...lease, monthly_rent: rent },
        history?.rows ?? [],
        income.points.filter(p => p.status === "CONFIRMED").map(p => ({ month: p.key, rent: p.gross, condo: p.condo, energy: p.energy })),
        today
    );
    const monthly = monthlyTotal(rent, lease.charges);
    const cycleKnown = summary.accumulatedPct !== null && summary.monthsCounted > 0;
    const cardInfo: TileInfo = {
        what: `O contrato lido como na ficha do imóvel: prazo, vencimento, reajuste pelo índice acumulado no ciclo (contado como o mercado conta: cada mês do contrato, do dia do início ao mesmo dia do mês seguinte, leva o índice cheio do mês em que começa; a cada aniversário o aluguel é corrigido pelo acumulado do ciclo que terminou), ${featured.label.toLowerCase()} e o total que sai do bolso do inquilino; o que a razão de receitas registrou e a caução.`,
        formula: <>Acumulado no ciclo = Π (1 + índice do mês) dos meses do contrato já fechados; o mês em curso entra por dia: (1 + índice)^(dias decorridos ÷ dias do mês do contrato). Nada conta antes de fechar o primeiro mês<br />Prévia do próximo reajuste (no histórico) = valor atual × (1 + acumulado)<br />Total mensal = aluguel + encargos com valor fixo pagos pelo inquilino<br />Total no contrato = realizado + previsto<br />Realizado = o que a razão de receitas confirmou: o aluguel antes da taxa da imobiliária e o condomínio pago pelo inquilino<br />Previsto = os pagamentos do contrato sem lançamento confirmado: o primeiro pro rata do início ao primeiro vencimento, os seguintes inteiros e o resto do prazo pro rata (mês comercial de 30 dias), cada um pelo valor em vigor</>,
        example: cycleKnown && summary.adjustedRent !== null ? `${brl(rent)} × (1 ${summary.accumulatedPct! >= 0 ? "+" : "−"} ${Math.abs(summary.accumulatedPct!).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%) = ${brl(summary.adjustedRent)}` : undefined,
        note: "O valor reajustado é uma prévia. No reajuste valem os índices cheios dos meses do ciclo (de setembro a agosto, num contrato iniciado em setembro), a conta que o mercado faz. O recebido vem da razão de receitas do imóvel, líquido da taxa da imobiliária quando há.",
    };
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
                        <h1 className="text-2xl font-bold text-foreground"><LeaseTitle title={row.title} tenant={lease.primary_tenant_name} /></h1>
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
                        {row.place}
                        {lease.primary_tenant_name && <> · <Sensitive>{lease.primary_tenant_name}</Sensitive></>}
                        {" · "}{agencyManaged ? lease.agency_name ?? "Imobiliária" : lease.management_type === "AGENT" ? `Corretor ${lease.agent_name ?? ""}`.trim() : "Gestão própria"}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" asChild title="O contrato escrito pelo Kitnets: revisar, aceitar e assinar pelo gov.br" className="border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                        <Link href={`${lang === "pt" ? "" : `/${lang}`}/contratos/documento?id=${lease.id}`}>
                            <FileSignature className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Documento</span>
                        </Link>
                    </Button>
                    <Button variant="outline" onClick={() => onEdit(bundle)}>
                        <PenLine className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Editar</span>
                    </Button>
                    {row.inForce && (
                        <Button variant="outline" onClick={() => onTerminate(lease)} title="Aviso de desocupação ou rescisão" className="border-orange-400 text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/30">
                            <DoorOpen className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Encerrar</span>
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

            {/* The tenant's notice of leaving: in force until the move-out day */}
            {row.notice && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 dark:border-orange-800 dark:bg-orange-950/30">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-600"><DoorOpen className="h-5 w-5" /></span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                                Aviso de desocupação{row.notice.noticeDate ? ` recebido em ${formatDateBR(row.notice.noticeDate)}` : ""}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {row.notice.daysLeft > 0
                                    ? <>O inquilino desocupa em <strong className="text-foreground">{formatDateBR(row.notice.moveOut)}</strong> (em {row.notice.daysLeft} {row.notice.daysLeft === 1 ? "dia" : "dias"}). Até lá o contrato segue vigente; no dia seguinte passa a rescindido.</>
                                    : <>A desocupação estava prevista para <strong className="text-foreground">{formatDateBR(row.notice.moveOut)}</strong>: o contrato passa a rescindido.</>}
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => onTerminate(lease)}>Alterar</Button>
                        <Button size="sm" variant="ghost" onClick={() => void cancelNotice()} disabled={cancellingNotice}>
                            {cancellingNotice && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Cancelar aviso
                        </Button>
                    </div>
                </div>
            )}

            {/* The contract at a glance: the cards of the property page's "Contrato de Aluguel", plus the charges and the totals */}
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground"><FileSignature className="h-4 w-4 text-emerald-600" /> Contrato de aluguel</h2>
                        <p className="text-xs text-muted-foreground">O que o inquilino paga por mês, o prazo, o que o contrato soma (realizado e previsto), o reajuste, o recebido e a caução.</p>
                    </div>
                    <CardInfoIcon label="Contrato de aluguel" icon={<CalendarClock className="h-4 w-4" />} info={cardInfo} className={cn("p-2", TILE_TONES.emerald)} />
                </div>

                <LeaseOverview
                    lease={lease}
                    row={row}
                    rent={rent}
                    monthly={monthly}
                    featured={featured}
                    tenantFixed={tenantFixed}
                    term={term}
                    chargeLabel={followedLabel}
                    chargeAdjustment={followedAdjustment}
                    chargeSeries={!followedCode || !(followedCode in seriesByCode) ? "none" : seriesByCode[followedCode] ? "ok" : "unavailable"}
                    income={income}
                    today={today}
                />

                <div className="flex flex-wrap items-center gap-2">
                    <Link href={`${base}/inquilinos?tenant=${lease.primary_tenant_id}&property=${lease.property_id}`} className={chip} title="Abrir o inquilino principal">
                        <User className="h-3.5 w-3.5 shrink-0" /> <Sensitive className="truncate">{lease.primary_tenant_name ?? "Inquilino principal"}</Sensitive>
                    </Link>
                    {agencyManaged && lease.agency_id ? (
                        <Link href={`${base}/imobiliaria?agency=${lease.agency_id}&property=${lease.property_id}`} className={chip} title="Abrir a imobiliária do contrato">
                            <Building2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{lease.agency_name ?? "Imobiliária"}</span>
                        </Link>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> {lease.management_type === "AGENT" ? `Corretor ${lease.agent_name ?? ""}`.trim() : MANAGEMENT_LABELS[lease.management_type]}</span>
                    )}
                    <Link href={`${base}/imoveis?id=${lease.property_id}`} className={chip} title="Abrir o imóvel">
                        <Home className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{row.place}</span>
                    </Link>
                    {contractFile && (
                        <button type="button" onClick={() => openPdf(contractFile.file_url, contractFile.file_name)} className={chip} title={contractFile.file_name}>
                            <FileText className="h-3.5 w-3.5 shrink-0 text-rose-600" /> {/\.pdf$/i.test(contractFile.file_name) ? "Ver PDF do contrato" : "Ver arquivo do contrato"}
                        </button>
                    )}
                </div>
            </section>

            {/* Rent chart + contract card */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <section className="rounded-xl border border-border/80 bg-card lg:col-span-2">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Aluguel mês a mês</h2>
                            <p className="text-xs text-muted-foreground">
                                {income.points.length > 0
                                    ? <>{formatMonthKey(income.firstMonth!)} a {formatMonthKey(income.lastMonth!)} na razão de receitas do imóvel{income.currentGross !== null && Math.abs(income.currentGross - rent) >= 1 ? <> · último mês bruto <Money>{brl(income.currentGross)}</Money> (contrato: <Money>{brl(rent)}</Money>)</> : ""}</>
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
                                    <User className="h-3.5 w-3.5 shrink-0" /> <Sensitive className="break-words">{lease.primary_tenant_name ?? "Inquilino"}</Sensitive>
                                </Link>
                                {phone && (
                                    <a href={waLink ?? undefined} target="_blank" rel="noopener noreferrer" className={chip} title="Conversar no WhatsApp">
                                        <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> <Sensitive>{formatPhone(phone)}</Sensitive>
                                    </a>
                                )}
                                {!phone && tenant?.email && (
                                    <a href={`mailto:${tenant.email}`} className={chip}><Mail className="h-3.5 w-3.5" /> <Sensitive>{tenant.email}</Sensitive></a>
                                )}
                            </div>
                            {lease.additional_tenants.length > 0 && (
                                <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                                    {lease.additional_tenants.map(t => (
                                        <li key={t.id} className="flex items-center gap-1.5"><Users className="h-3 w-3" /> <Sensitive>{t.tenant_name ?? "Inquilino"}</Sensitive> · {t.role === "OCCUPANT" ? "ocupante" : "co-inquilino"}</li>
                                    ))}
                                </ul>
                            )}
                            {phone && tenant?.email && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> <Sensitive>{tenant.email}</Sensitive></p>}
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
                        <Field label="Caução">{lease.security_deposit ? <><Money>{brl(Number(lease.security_deposit))}</Money>{lease.deposit_months ? ` (${lease.deposit_months} ${lease.deposit_months === 1 ? "aluguel" : "aluguéis"})` : ""}</> : "—"}</Field>
                        <Field label="Registro">
                            <span className="text-xs text-muted-foreground">criado {formatDateBR(lease.created_at)}{lease.updated_at && lease.updated_at.slice(0, 10) !== lease.created_at.slice(0, 10) ? ` · alterado ${formatDateBR(lease.updated_at)}` : ""}</span>
                        </Field>
                        {row.notice && (
                            <Field label="Desocupação prevista" className="col-span-2">
                                <span className="text-orange-700 dark:text-orange-300">{formatDateBR(row.notice.moveOut)}</span>
                                {row.notice.noticeDate && <span className="text-xs text-muted-foreground"> · aviso em {formatDateBR(row.notice.noticeDate)}</span>}
                                {lease.termination_reason && <p className="mt-0.5 text-xs text-muted-foreground">{lease.termination_reason}</p>}
                            </Field>
                        )}
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
                                                <td className="py-1 pr-2 text-muted-foreground">
                                                    {RESPONSIBILITY_LABELS[c.responsibility] ?? c.responsibility}
                                                    {c.responsibility === "TENANT" && c.collected_by && <span title="Quem emite a fatura deste encargo"> · fatura: {COLLECTOR_SHORT[c.collected_by] ?? c.collected_by}</span>}
                                                </td>
                                                <td className="py-1 text-right tabular-nums text-foreground">{c.amount ? <Money>{brl(Number(c.amount))}</Money> : "—"}</td>
                                                <td className="py-1 pl-2 text-right text-muted-foreground" title={c.adjusts_with_rent ? undefined : c.adjustment_notes ?? undefined}>{c.adjusts_with_rent ? "Com o aluguel" : c.adjustment_index ? CHARGE_INDEX_LABELS[c.adjustment_index] ?? c.adjustment_index : ""}</td>
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

            {/* Adjustments: what each one changed, by addendum or by Kitnets' calculation */}
            {history && lease.adjustment_index !== "NONE" && (
                <LeaseAdjustmentTable
                    leaseId={lease.id}
                    startDate={lease.start_date}
                    adjustments={history}
                    summary={summary}
                    indexLabel={row.indexLabel}
                    currentRent={rent}
                    currentCondo={followed ? amountOf(followed) : null}
                    nextCondo={followedAdjustment?.adjustedAmount ?? null}
                    inForce={row.inForce}
                    documents={lease.documents}
                    onView={openPdf}
                    onAddendum={date => setAddendumFor(date)}
                    onChanged={() => load().catch(() => {})}
                />
            )}

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

            {addendumFor !== undefined && history && (
                <LeaseAddendumModal
                    leaseId={lease.id}
                    initial={history.initial}
                    rows={history.rows}
                    charge={followed ? { type: followed.charge_type, label: followedLabel } : null}
                    adjustmentDates={pastAdjustmentDates(lease, today)}
                    initialDate={addendumFor}
                    onClose={() => setAddendumFor(undefined)}
                    onSaved={() => { setAddendumFor(undefined); load().catch(() => {}); }}
                />
            )}

            <PdfViewerModal isOpen={viewing !== null} onClose={() => setViewing(null)} url={viewing?.url ?? null} title={viewing?.name ?? "Documento"} fileName={viewing?.name ?? "documento.pdf"} />
        </div>
    );
}

function MilestoneChip({ milestone, last }: { milestone: Milestone; last: boolean }) {
    const next = milestone.kind === "next_adjustment" || (milestone.kind === "move_out" && !milestone.done);
    const end = milestone.kind === "end" || milestone.kind === "termination" || milestone.kind === "move_out" || milestone.kind === "notice";
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
