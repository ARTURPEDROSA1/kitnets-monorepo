"use client";

/**
 * "Contrato de Aluguel" — the property's lease at a glance: term, days elapsed and left, rent due date,
 * adjustment index with the variation accumulated in the current cycle, next adjustment date and the rent
 * that accumulation would give today, plus links to the tenant, the agency, the contract and its file.
 * Maths in lib/lease-summary.ts; data from /api/properties/[id]/lease and the index calculator series.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CalendarClock, ExternalLink, FileSignature, FileText, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { CardInfoIcon, TILE_TONES, type TileInfo } from "./Tile";
import { LEASE_INDEX_LABELS, leaseIndexSeriesCode, leaseSummary, type IndexPoint, type LeaseForSummary } from "@/lib/lease-summary";

interface LeaseDocument { id: string; document_type: string; file_name: string; file_url: string }
interface PropertyLease extends LeaseForSummary {
    id: string;
    status: string;
    reference_name: string | null;
    management_type: string;
    primary_tenant_id: string;
    primary_tenant_name: string | null;
    agency_id: string | null;
    agency_name: string | null;
    agent_name: string | null;
    documents: LeaseDocument[];
}

const STATUS: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Ativo", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
    EXPIRING_SOON: { label: "Vencendo", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    EXPIRED: { label: "Vencido", cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300" },
    TERMINATED: { label: "Encerrado", cls: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    CANCELLED: { label: "Cancelado", cls: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    DRAFT: { label: "Rascunho", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300" },
};

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (d: string | null) => { if (!d) return "—"; const [y, m, day] = d.slice(0, 10).split("-"); return `${day}/${m}/${y}`; };
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const formatMonth = (m: string | null) => { if (!m) return "—"; const [y, mm] = m.split("-"); return `${MONTHS[Number(mm) - 1] ?? mm}/${y}`; };
const days = (n: number) => `${Math.abs(n).toLocaleString("pt-BR")} ${Math.abs(n) === 1 ? "dia" : "dias"}`;
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
/** Today in Brasília, `YYYY-MM-DD`. */
const todayBRT = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
    return (
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight text-muted-foreground block">{label}</span>
            <span className={cn("text-lg font-bold block tabular-nums leading-tight", tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "bad" ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>{value}</span>
            {hint && <span className="text-[11px] text-muted-foreground block leading-snug">{hint}</span>}
        </div>
    );
}

export default function PropertyLeaseCard({ propertyId, lang = "pt" }: { propertyId?: string; lang?: string }) {
    const [lease, setLease] = useState<PropertyLease | null>(null);
    const [others, setOthers] = useState(0);
    const [loading, setLoading] = useState<boolean>(Boolean(propertyId));
    const [error, setError] = useState<string | null>(null);
    const [series, setSeries] = useState<IndexPoint[] | null>(null);
    const [viewer, setViewer] = useState<{ url: string; title: string; fileName: string } | null>(null);

    useEffect(() => {
        if (!propertyId) return;
        let cancelled = false;
        setLoading(true); setError(null);
        fetch(`/api/properties/${propertyId}/lease`)
            .then(async res => { const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || "Erro ao carregar o contrato"); return d; })
            .then(d => { if (!cancelled) { setLease(d.lease ?? null); setOthers(Number(d.others) || 0); } })
            .catch(err => { if (!cancelled) setError((err as Error).message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [propertyId]);

    // the index's monthly series (same source as the calculators on the index pages)
    const seriesCode = leaseIndexSeriesCode(lease?.adjustment_index);
    useEffect(() => {
        if (!seriesCode) { setSeries(null); return; }
        let cancelled = false;
        fetch(`/api/indices/${seriesCode}/calculator-data`)
            .then(res => res.json())
            .then(json => { if (!cancelled) setSeries(Array.isArray(json) ? json : null); })
            .catch(() => { if (!cancelled) setSeries(null); });
        return () => { cancelled = true; };
    }, [seriesCode]);

    const today = todayBRT();
    const s = useMemo(() => (lease ? leaseSummary(lease, series, today) : null), [lease, series, today]);

    if (!propertyId) return null;

    const indexLabel = lease?.adjustment_index ? (LEASE_INDEX_LABELS[lease.adjustment_index] ?? lease.adjustment_index) : "Não informado";
    const info: TileInfo = {
        what: "O contrato de locação em vigor neste imóvel. O reajuste segue a prática dos contratos brasileiros: a cada aniversário o aluguel é corrigido pelo índice acumulado no ciclo que terminou. Um ciclo que começa em abril soma os meses de abril a março, e o novo valor vale a partir de abril.",
        formula: <>Acumulado no ciclo = Π (1 + variação mensal) − 1, dos meses já divulgados do ciclo<br />Aluguel reajustado até hoje = aluguel atual × (1 + acumulado)<br />Próximo reajuste = próximo aniversário do início, na periodicidade do contrato</>,
        example: lease && s && s.accumulatedPct !== null ? <>{formatBRL(lease.monthly_rent)} × (1 {s.accumulatedPct >= 0 ? "+" : "−"} {Math.abs(s.accumulatedPct).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%) = {formatBRL(s.adjustedRent ?? 0)}<br />{s.monthsCounted} de {s.frequencyMonths} meses do ciclo, até {formatMonth(s.indexThrough)}</> : undefined,
        note: "O valor reajustado é uma prévia: o percentual definitivo só fecha quando o último mês do ciclo é divulgado. Com índice negativo, a maioria dos contratos mantém o aluguel.",
    };
    const status = lease ? (STATUS[lease.status] ?? { label: lease.status, cls: STATUS.DRAFT.cls }) : null;
    const contract = lease?.documents.find(d => d.document_type === "CONTRACT") ?? lease?.documents[0] ?? null;
    const linkCls = "inline-flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors max-w-full";

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                    <h3 className="font-bold text-base text-foreground flex flex-wrap items-center gap-2">
                        <FileSignature className="w-4 h-4 text-emerald-600" />
                        Contrato de Aluguel
                        {status && <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full", status.cls)}>{status.label}</span>}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {lease
                            ? <>{lease.reference_name ? `${lease.reference_name} · ` : ""}Prazo, vencimento, reajuste pelo índice do contrato e o aluguel corrigido até hoje.{others > 0 ? ` Este imóvel tem mais ${others} ${others === 1 ? "contrato" : "contratos"} em Contratos.` : ""}</>
                            : "Prazo, vencimento e reajuste do contrato de locação deste imóvel."}
                    </p>
                </div>
                {lease && <CardInfoIcon label="Contrato de Aluguel" icon={<CalendarClock className="w-4 h-4" />} info={info} className={cn("p-2", TILE_TONES.emerald)} />}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : error ? (
                <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">{error}</div>
            ) : !lease || !s ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl space-y-2">
                    <p>Nenhum contrato de locação cadastrado para este imóvel.</p>
                    <Link href={`/${lang}/contratos`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-2">
                        <FileSignature className="w-3.5 h-3.5" /> Cadastrar contrato
                    </Link>
                </div>
            ) : (
                <>
                    {/* Term */}
                    {s.progressPct !== null && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{formatDate(lease.start_date)}</span>
                                <span className="font-semibold text-foreground">{s.progressPct}% do prazo</span>
                                <span>{formatDate(s.effectiveEnd)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div className={cn("h-full", s.daysLeft !== null && s.daysLeft < 0 ? "bg-rose-500" : s.daysLeft !== null && s.daysLeft <= 90 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${s.progressPct}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Stat label="Início do contrato" value={formatDate(lease.start_date)} hint={`Há ${days(s.daysElapsed)}`} />
                        <Stat label="Fim do contrato" value={formatDate(s.effectiveEnd)}
                            tone={s.daysLeft !== null && s.daysLeft < 0 ? "bad" : s.daysLeft !== null && s.daysLeft <= 90 ? "warn" : undefined}
                            hint={s.daysLeft === null ? "Prazo indeterminado" : s.daysLeft < 0 ? `Vencido há ${days(s.daysLeft)}` : s.daysLeft === 0 ? "Termina hoje" : `Faltam ${days(s.daysLeft)}`} />
                        <Stat label="Vencimento do aluguel" value={`Todo dia ${lease.rent_due_day}`}
                            hint={<>Próximo: {formatDate(s.nextDueDate)}<br />{s.daysToDue === 0 ? "Vence hoje" : `Em ${days(s.daysToDue)}`}</>} />
                        <Stat label="Aluguel atual" value={formatBRL(lease.monthly_rent)} hint="Valor do contrato" />

                        <Stat label="Índice de reajuste" value={indexLabel} hint={s.nextAdjustmentDate ? `A cada ${s.frequencyMonths} meses` : "Contrato sem reajuste"} />
                        <Stat label="Acumulado no ciclo" tone={s.accumulatedPct === null ? undefined : s.accumulatedPct < 0 ? "bad" : "good"}
                            value={s.accumulatedPct !== null ? pct(s.accumulatedPct) : "—"}
                            hint={s.accumulatedPct !== null
                                ? <>{s.monthsCounted} de {s.frequencyMonths} meses<br />{s.monthsCounted > 0 ? `${formatMonth(s.cycleStart?.slice(0, 7) ?? null)} a ${formatMonth(s.indexThrough)}` : "Nenhum mês do ciclo divulgado ainda"}</>
                                : s.nextAdjustmentDate ? (seriesCode ? "Série do índice indisponível no momento" : "Índice sem série no Kitnets: informe o percentual no reajuste") : "—"} />
                        <Stat label="Próximo reajuste" value={formatDate(s.nextAdjustmentDate)}
                            tone={s.daysToAdjustment !== null && s.daysToAdjustment <= 30 ? "warn" : undefined}
                            hint={s.daysToAdjustment === null ? "—" : `Em ${days(s.daysToAdjustment)}`} />
                        <Stat label="Aluguel reajustado até hoje" value={s.adjustedRent !== null ? formatBRL(s.adjustedRent) : "—"}
                            hint={s.adjustedRent !== null
                                ? <>{s.adjustedRent >= lease.monthly_rent ? "+" : "−"}{formatBRL(Math.abs(s.adjustedRent - lease.monthly_rent))} sobre o atual<br />Prévia com os meses já divulgados</>
                                : "—"} />
                    </div>

                    {/* Links */}
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/${lang}/inquilinos?tenant=${lease.primary_tenant_id}&property=${propertyId}`} className={linkCls} title="Abrir o inquilino principal">
                            <User className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{lease.primary_tenant_name ?? "Inquilino principal"}</span>
                        </Link>
                        {lease.agency_id ? (
                            <Link href={`/${lang}/imobiliaria?agency=${lease.agency_id}&property=${propertyId}`} className={linkCls} title="Abrir a imobiliária do contrato">
                                <Building2 className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{lease.agency_name ?? "Imobiliária"}</span>
                            </Link>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 h-8 px-3 text-xs text-muted-foreground"><Building2 className="w-3.5 h-3.5" /> {lease.management_type === "SELF_MANAGED" ? "Gestão própria, sem imobiliária" : lease.agent_name ? `Corretor: ${lease.agent_name}` : "Sem imobiliária"}</span>
                        )}
                        <Link href={`/${lang}/contratos?lease=${lease.id}&property=${propertyId}`} className={linkCls} title="Abrir o contrato em Contratos">
                            <FileSignature className="w-3.5 h-3.5 shrink-0" /> Contrato
                        </Link>
                        {contract && (
                            /\.pdf$/i.test(contract.file_name)
                                ? <button type="button" onClick={() => setViewer({ url: contract.file_url, title: "Contrato de locação", fileName: contract.file_name })} className={linkCls} title={contract.file_name}><FileText className="w-3.5 h-3.5 shrink-0" /> Ver PDF do contrato</button>
                                : <a href={contract.file_url} target="_blank" rel="noopener noreferrer" className={linkCls} title={contract.file_name}><ExternalLink className="w-3.5 h-3.5 shrink-0" /> Ver arquivo do contrato</a>
                        )}
                    </div>
                </>
            )}

            <PdfViewerModal isOpen={viewer !== null} onClose={() => setViewer(null)} url={viewer?.url ?? null} title={viewer?.title ?? "Contrato"} fileName={viewer?.fileName ?? "contrato.pdf"} />
        </div>
    );
}
