"use client";

/**
 * The dashboard: the headline figures of the whole portfolio, the map, the merged attention list, one
 * card per module with its own figures, and — for the pilot accounts only — the IoT gateways. Everything
 * is computed by lib/dashboard-hub.ts; this file only renders. A figure whose loader failed reads "—" and
 * says so, never zero.
 */
import React, { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Building, Building2, CheckCircle2, ChevronDown, ChevronUp, Droplets, FileSignature, HardHat, Home, Landmark, LayoutDashboard, Loader2, Plus, Sparkles, UserCheck, Users, Wallet, Zap } from "lucide-react";
import { Button } from "@kitnets/ui";
import GatewaysSection from "@/components/dashboard/GatewaysSection";
import PortfolioMap, { type GeocodeStatus } from "@/components/dashboard/PortfolioMap";
import Tile, { TILE_TONES, type TileTone } from "@/components/properties/Tile";
import { monthLabel } from "@/lib/condominium-hub";
import { MODULE_META, isEmptyPortfolio, type DashboardAttentionItem, type DashboardTone, type DashboardTotals } from "@/lib/dashboard-hub";
import type { DashboardLoader, DashboardView } from "@/lib/dashboard-views";
import { formatDateBR } from "@/lib/dates";
import { brl } from "@/lib/lease-dashboard";
import { monthsLabel } from "@/lib/tenant-dashboard";
import { cn } from "@/lib/utils";

interface Props {
    /** "" for Portuguese, "/en" | "/es" otherwise */
    base: string;
    view: DashboardView | null;
    totals: DashboardTotals | null;
    attention: DashboardAttentionItem[];
    loading: boolean;
    error: string | null;
    mapsApiKey: string | null;
    mapId: string | null;
    geocodeStatus: GeocodeStatus;
    onOpen: (href: string) => void;
}

/** Contratos opens its import ("Importar contratos", mode current) straight away with this parameter. */
const IMPORT_HREF = "/contratos?importar=1";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const pct1 = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const kwh = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} kWh`;
const m3 = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m³`;
const DOT: Record<DashboardTone, string> = { rose: "bg-rose-500", amber: "bg-amber-500", sky: "bg-sky-500", emerald: "bg-emerald-500", slate: "bg-slate-400" };
const LOADER_LABELS: Record<DashboardLoader, string> = {
    properties: "imóveis", income: "receitas", leases: "contratos", tenants: "inquilinos", agents: "corretores", agencies: "imobiliárias",
    energy: "energia", water: "água", condominiums: "condomínio", projects: "projetos", taxes: "tributos", gateways: "gateways", map: "mapa",
};

interface Figure {
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    title?: string;
}

function ModuleCard({ icon, tone, title, href, base, figures, note, unavailable }: { icon: React.ReactNode; tone: TileTone; title: string; href: string; base: string; figures: Figure[]; note?: React.ReactNode; unavailable?: boolean }) {
    return (
        <section className="flex flex-col rounded-xl border border-border/80 bg-card">
            <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className={cn("shrink-0 rounded-lg p-1.5", TILE_TONES[tone])}>{icon}</span>
                    {title}
                </h3>
                <Link href={`${base}${href}`} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
                    Abrir <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </header>
            {unavailable ? (
                <p className="flex items-center gap-2 px-4 py-4 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> Não foi possível carregar estes dados.</p>
            ) : (
                <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3 px-4 py-3">
                    {figures.map(f => (
                        <div key={f.label} className="min-w-0" title={f.title}>
                            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</dt>
                            <dd className="break-words text-base font-bold leading-tight tabular-nums text-foreground">{f.value}</dd>
                            {f.hint && <dd className="break-words text-[11px] leading-snug text-muted-foreground">{f.hint}</dd>}
                        </div>
                    ))}
                </dl>
            )}
            {note && !unavailable && <p className="border-t border-border/60 px-4 py-2 text-[11px] leading-snug text-muted-foreground">{note}</p>}
        </section>
    );
}

function AttentionPanel({ items, base }: { items: DashboardAttentionItem[]; base: string }) {
    const [all, setAll] = useState(false);
    const shown = all ? items : items.slice(0, 6);
    return (
        <section className="flex flex-col rounded-xl border border-border/80 bg-card">
            <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <AlertCircle className="h-4 w-4 text-amber-600" /> Atenção <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
                </h2>
                {items.length > 6 && (
                    <button type="button" onClick={() => setAll(v => !v)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        {all ? <>menos <ChevronUp className="h-3.5 w-3.5" /></> : <>ver todos <ChevronDown className="h-3.5 w-3.5" /></>}
                    </button>
                )}
            </header>
            {items.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nada pendente: os módulos não apontam nada para hoje.</p>
            ) : (
                <ul className="divide-y divide-border/50">
                    {shown.map((item, i) => (
                        <li key={`${item.module}-${item.href}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                            <span className="min-w-0 flex-1">
                                <Link href={`${base}${item.href}`} className="font-semibold text-foreground underline-offset-2 hover:underline">{item.name}</Link>
                                <span className="text-muted-foreground"> — {item.text}</span>
                                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{MODULE_META[item.module].label}</span>
                            </span>
                            {item.date && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateBR(item.date)}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default function DashboardHub({ base, view, totals, attention, loading, error, mapsApiKey, mapId, geocodeStatus, onOpen }: Props) {
    const name = view?.profile.fullName?.split(" ")[0] || null;
    const failed = new Set(view?.failed ?? []);
    const down = {
        properties: failed.has("properties"),
        income: failed.has("income"),
        leases: failed.has("leases"),
        tenants: failed.has("tenants"),
        agents: failed.has("agents"),
        agencies: failed.has("agencies"),
    };
    const unavailable = (what: string) => <span className="text-rose-600">{what} indisponíveis</span>;
    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <LayoutDashboard className="h-6 w-6 text-emerald-600" /> Dashboard
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {name ? `Bem-vindo de volta, ${name}. ` : ""}A carteira inteira num só painel: o que rende, quem mora, quem trabalha e o que está por vencer.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => onOpen(IMPORT_HREF)}><Sparkles className="mr-1 h-4 w-4 text-amber-500" /> Importar contrato</Button>
                    <Button onClick={() => onOpen("/imoveis?add=true")}><Plus className="mr-1 h-4 w-4" /> Novo imóvel</Button>
                </div>
            </div>

            {error && (
                <p className="flex items-start gap-2 text-sm text-rose-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>
            )}
            {loading && (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
            )}

            {view && totals && (
                <>
                    {isEmptyPortfolio(view) && view.failed.length === 0 && (
                        <section className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                            <Home className="mx-auto h-10 w-10 text-muted-foreground/60" />
                            <h2 className="text-lg font-semibold text-foreground">Comece pela carteira</h2>
                            <p className="mx-auto max-w-md text-sm text-muted-foreground">Cadastre um imóvel ou envie um contrato de locação: a IA cria o imóvel, o contrato, a imobiliária, o corretor e os inquilinos. Os números aparecem aqui conforme os módulos ganham dados.</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button onClick={() => onOpen("/imoveis?add=true")}><Plus className="mr-1 h-4 w-4" /> Cadastrar imóvel</Button>
                                <Button variant="outline" onClick={() => onOpen(IMPORT_HREF)}><Sparkles className="mr-1 h-4 w-4 text-amber-500" /> Importar contrato</Button>
                                <Button variant="outline" onClick={() => onOpen("/projetos")}><HardHat className="mr-1 h-4 w-4" /> Novo projeto</Button>
                            </div>
                        </section>
                    )}

                    {/* The headline */}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                        <Tile
                            label="Imóveis" tone="emerald" icon={<Building2 className="h-4 w-4" />}
                            value={down.properties ? "—" : totals.properties.count.toLocaleString("pt-BR")}
                            hint={down.properties ? unavailable("imóveis") : down.leases
                                ? `${plural(totals.occupancy.units, "unidade", "unidades")} · ocupação indisponível`
                                : `${plural(totals.occupancy.units, "unidade", "unidades")} · ${pct1(totals.occupancy.pct)} ocupadas`}
                            onClick={() => onOpen("/imoveis")}
                            info={{
                                what: "Os imóveis de aluguel cadastrados e as unidades que eles têm.",
                                formula: <>Ocupação = unidades com contrato em vigor ÷ unidades × 100<br />Contrato sem unidade num multifamiliar = uma unidade</>,
                                note: `${totals.properties.single} unifamiliar · ${totals.properties.multi} multifamiliar · ${totals.properties.solar} com energia solar.`,
                            }}
                        />
                        <Tile
                            label="Receita do mês" tone="emerald" icon={<Wallet className="h-4 w-4" />}
                            value={!down.income && totals.income.withLedger > 0 ? brl(totals.income.revenue, 0) : "—"}
                            hint={down.income
                                ? unavailable("receitas")
                                : totals.income.withLedger > 0
                                    ? `NOI ${brl(totals.income.noi, 0)} · margem ${pct1(totals.income.margin)} · ${monthLabel(totals.income.month)}`
                                    : "sem razão de receitas lançada ainda"}
                            onClick={() => onOpen("/imoveis")}
                            info={{
                                what: "O mês mais recente confirmado na razão de receitas de cada imóvel, somado.",
                                formula: <>Receita = aluguel bruto + energia recebida + condomínio pago pelo inquilino<br />NOI = receita − taxa da imobiliária − energia − outras despesas − condomínio − IPTU pago por você no mês</>,
                                note: down.income ? undefined : `${plural(totals.income.withLedger, "imóvel com razão", "imóveis com razão")} de receitas.`,
                            }}
                        />
                        <Tile
                            label="Aluguel contratado" tone="emerald" icon={<FileSignature className="h-4 w-4" />}
                            value={down.leases ? "—" : `${brl(totals.contracts.contractedRent, 0)}/mês`}
                            hint={down.leases ? unavailable("contratos") : `${plural(totals.contracts.inForce, "contrato em vigor", "contratos em vigor")}${totals.contracts.nextEnd ? ` · próximo término ${formatDateBR(totals.contracts.nextEnd.date)}` : ""}`}
                            onClick={() => onOpen("/contratos")}
                            info={{ what: "O valor de contrato dos contratos em vigor (ativos ou vencendo), antes da taxa da imobiliária.", formula: "Σ aluguel mensal dos contratos com status ativo ou vencendo", note: down.leases ? undefined : `${brl(totals.contracts.contractedRent * 12, 0)} por ano.` }}
                        />
                        <Tile
                            label="Pessoas abrigadas" tone="violet" icon={<Users className="h-4 w-4" />}
                            value={down.tenants ? "—" : totals.people.housed.toLocaleString("pt-BR")}
                            hint={down.tenants ? unavailable("inquilinos") : `${plural(totals.people.tenants.active, "inquilino atual", "inquilinos atuais")}${down.leases ? "" : ` · ${plural(totals.occupancy.occupied, "unidade ocupada", "unidades ocupadas")}`}`}
                            onClick={() => onOpen("/inquilinos")}
                            info={{ what: "Quantas pessoas moram hoje nos seus imóveis: titulares, co-locatários e ocupantes dos contratos em vigor, cada pessoa contada uma vez.", formula: "pessoas distintas nos contratos em vigor (titular + co-locatários + ocupantes)", note: "Dependentes que não estão no contrato não entram; cadastre-os como ocupantes para contá-los." }}
                        />
                        <Tile
                            label="Empregos apoiados" tone="violet" icon={<UserCheck className="h-4 w-4" />}
                            value={down.agents ? "—" : totals.jobs.agents.active.toLocaleString("pt-BR")}
                            hint={down.agents ? unavailable("corretores") : `${plural(totals.jobs.agents.active - totals.jobs.agents.idle, "corretor com contrato", "corretores com contrato")}${down.agencies ? "" : ` · ${plural(totals.jobs.agenciesWithLeases, "imobiliária com contrato", "imobiliárias com contrato")}`}`}
                            onClick={() => onOpen("/corretores")}
                            info={{ what: "Os corretores ativos que a carteira sustenta, e as imobiliárias que administram contratos em vigor.", formula: "corretores com status ativo; com contrato = com pelo menos um contrato em vigor ou inquilino atual", note: !down.agencies && totals.jobs.agencies.monthlyFees > 0 ? `${brl(totals.jobs.agencies.monthlyFees, 0)}/mês em taxas de administração.` : undefined }}
                        />
                        <Tile
                            label={`Impostos pagos em ${totals.taxes?.year ?? new Date().getFullYear()}`} tone="amber" icon={<Landmark className="h-4 w-4" />}
                            value={totals.taxes ? brl(totals.taxes.iptuLandlordYtd + totals.taxes.itbiOtherYtd, 0) : "—"}
                            hint={totals.taxes ? `IPTU ${brl(totals.taxes.iptuLandlordYtd, 0)} · ITBI e outros ${brl(totals.taxes.itbiOtherYtd, 0)} · federais em breve` : unavailable("tributos")}
                            onClick={() => onOpen("/imoveis")}
                            info={{ what: "Os tributos municipais que você pagou este ano, até este mês, no mês do pagamento, pelo registro Tributos do imóvel.", formula: "IPTU pago por você no ano + ITBI e outros tributos pagos por você no ano", note: "Os impostos federais (IRPF, carnê-leão, holding) chegam com o módulo Contábil & Fiscal." }}
                        />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <section className="overflow-hidden rounded-xl border border-border/80 bg-card lg:col-span-2">
                            <PortfolioMap pins={view.map.pins} pending={view.map.pending} status={geocodeStatus} apiKey={mapsApiKey} mapId={mapId} base={base} unavailable={failed.has("map")} />
                        </section>
                        <AttentionPanel items={attention} base={base} />
                    </div>

                    {/* One card per module */}
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <ModuleCard icon={<Building2 className="h-4 w-4" />} tone="emerald" title="Imóveis" href="/imoveis" base={base} unavailable={down.properties}
                            figures={[
                                { label: "Imóveis", value: totals.properties.count, hint: `${totals.properties.single} unifamiliar · ${totals.properties.multi} multifamiliar` },
                                { label: "Unidades", value: totals.occupancy.units, hint: down.leases ? "contratos indisponíveis" : `${totals.occupancy.occupied} com contrato em vigor` },
                                { label: "Ocupação", value: down.leases ? "—" : pct1(totals.occupancy.pct), hint: down.leases ? "contratos indisponíveis" : `${plural(totals.occupancy.propertiesWithLease, "imóvel alugado", "imóveis alugados")}` },
                                { label: "Economia potencial", value: down.income ? "—" : brl(totals.income.feeAllTime, 0), hint: down.income ? "receitas indisponíveis" : "taxa de imobiliária acumulada · autogestão", title: "Σ da taxa da imobiliária retida antes do crédito, desde o início, pela razão de receitas" },
                            ]}
                            note={totals.properties.unlinked > 0 ? `${plural(totals.properties.unlinked, "imóvel ainda não foi salvo", "imóveis ainda não foram salvos")} até o fim: complete o cadastro em Imóveis.` : undefined}
                        />
                        <ModuleCard icon={<FileSignature className="h-4 w-4" />} tone="emerald" title="Contratos" href="/contratos" base={base} unavailable={down.leases}
                            figures={[
                                { label: "Em vigor", value: totals.contracts.inForce, hint: totals.contracts.overdueTerm > 0 ? <span className="text-rose-600">{plural(totals.contracts.overdueTerm, "com prazo vencido", "com prazo vencido")}</span> : `${totals.contracts.total} no total` },
                                { label: "Aluguel contratado", value: `${brl(totals.contracts.contractedRent, 0)}/mês`, hint: `${brl(totals.contracts.contractedRent * 12, 0)} por ano` },
                                { label: "Próximo término", value: totals.contracts.nextEnd ? formatDateBR(totals.contracts.nextEnd.date) : "—", hint: totals.contracts.nextEnd ? `em ${plural(totals.contracts.nextEnd.days, "dia", "dias")} · ${totals.contracts.ending90} nos próximos 90 dias` : "nenhum término à vista" },
                                { label: "Caução em mãos", value: brl(totals.contracts.deposits, 0), hint: `${plural(totals.contracts.depositsCount, "contrato com caução", "contratos com caução")}` },
                            ]}
                        />
                        <ModuleCard icon={<Users className="h-4 w-4" />} tone="violet" title="Inquilinos" href="/inquilinos" base={base} unavailable={down.tenants}
                            figures={[
                                { label: "Atuais", value: totals.people.tenants.active, hint: `${totals.people.tenants.future} futuros · ${totals.people.tenants.former} antigos` },
                                { label: "Pessoas abrigadas", value: totals.people.housed, hint: "nos contratos em vigor" },
                                { label: "Tempo de casa", value: totals.people.tenants.avgMonths ? monthsLabel(totals.people.tenants.avgMonths) : "—", hint: "média dos atuais" },
                                { label: "Sem contrato", value: totals.people.tenants.withoutLease, hint: totals.people.tenants.withoutPhone > 0 ? `${totals.people.tenants.withoutPhone} sem telefone` : "todos com telefone" },
                            ]}
                        />
                        <ModuleCard icon={<UserCheck className="h-4 w-4" />} tone="violet" title="Corretores" href="/corretores" base={base} unavailable={down.agents}
                            figures={[
                                { label: "Ativos", value: totals.jobs.agents.active, hint: `${totals.jobs.agents.inactive} inativos` },
                                { label: "Contratos em vigor", value: totals.jobs.agents.leasesInForce, hint: `${totals.jobs.agents.leasesTotal} no total` },
                                { label: "Aluguel sob gestão", value: `${brl(totals.jobs.agents.rentManaged, 0)}/mês`, hint: `${plural(totals.jobs.agents.tenantsServed, "inquilino atendido", "inquilinos atendidos")}` },
                                { label: "Autônomos", value: totals.jobs.agents.autonomous, hint: `${plural(totals.jobs.agents.agencies, "imobiliária", "imobiliárias")} com corretores` },
                            ]}
                        />
                        <ModuleCard icon={<Building className="h-4 w-4" />} tone="blue" title="Imobiliárias" href="/imobiliaria" base={base} unavailable={down.agencies}
                            figures={[
                                { label: "Ativas", value: totals.jobs.agencies.active, hint: `${totals.jobs.agenciesWithLeases} com contrato em vigor` },
                                { label: "Contratos em vigor", value: totals.jobs.agencies.leasesInForce, hint: `${brl(totals.jobs.agencies.rentManaged, 0)}/mês sob gestão` },
                                { label: "Taxas de administração", value: `${brl(totals.jobs.agencies.monthlyFees, 0)}/mês`, hint: `${brl(totals.jobs.agencies.monthlyFees * 12, 0)} por ano: a economia potencial com autogestão` },
                                { label: "Inquilinos atendidos", value: totals.jobs.agencies.tenantsServed, hint: `${plural(totals.jobs.agencies.agentsLinked, "corretor vinculado", "corretores vinculados")}` },
                            ]}
                        />
                        <ModuleCard icon={<Zap className="h-4 w-4" />} tone="amber" title="Energia" href="/dashboard/energy" base={base} unavailable={failed.has("energy")}
                            figures={totals.energy ? [
                                { label: "Unidades de aluguel", value: totals.energy.units, hint: `${totals.energy.withBills} com faturas` },
                                { label: "Consumo mais recente", value: kwh(totals.energy.consumptionLatest), hint: `${kwh(totals.energy.consumption12)} em 12 meses` },
                                { label: "Faturas mais recentes", value: brl(totals.energy.billsLatest, 0), hint: totals.energy.overdue > 0 ? <span className="text-rose-600">{plural(totals.energy.overdue, "vencida", "vencidas")}</span> : totals.energy.dueSoon > 0 ? `${plural(totals.energy.dueSoon, "vence em 7 dias", "vencem em 7 dias")}` : `${brl(totals.energy.paid12, 0)} em 12 meses` },
                                { label: "Economia solar", value: brl(totals.energy.savingsLatest, 0), hint: `${brl(totals.energy.savings12, 0)} em 12 meses · ${plural(totals.energy.solarUnits, "unidade gerando", "unidades gerando")}` },
                            ] : []}
                            note="Só os imóveis de aluguel; as unidades avulsas ficam no hub de Energia."
                        />
                        <ModuleCard icon={<Droplets className="h-4 w-4" />} tone="blue" title="Água" href="/dashboard/water" base={base} unavailable={failed.has("water")}
                            figures={totals.water ? [
                                { label: "Imóveis com água", value: totals.water.units, hint: `${totals.water.withBills} com contas` },
                                { label: "Consumo mais recente", value: m3(totals.water.consumptionLatest), hint: `${m3(totals.water.consumption12)} em 12 meses` },
                                { label: "Contas mais recentes", value: brl(totals.water.billsLatest, 0), hint: totals.water.overdue > 0 ? <span className="text-rose-600">{plural(totals.water.overdue, "vencida", "vencidas")}</span> : `${brl(totals.water.paid12, 0)} em 12 meses` },
                                { label: "Custo por m³", value: totals.water.rateLatest === null ? "—" : brl(totals.water.rateLatest), hint: totals.water.spikes > 0 ? <span className="text-amber-700 dark:text-amber-400">{plural(totals.water.spikes, "pico de consumo", "picos de consumo")}</span> : "sem picos de consumo" },
                            ] : []}
                        />
                        <ModuleCard icon={<Building className="h-4 w-4" />} tone="emerald" title="Condomínio" href="/condominio" base={base} unavailable={failed.has("condominiums")}
                            figures={totals.condo ? [
                                { label: "Condomínios", value: totals.condo.condos, hint: `${plural(totals.condo.units, "unidade", "unidades")}` },
                                { label: "Receita do mês", value: brl(totals.condo.revenueLatest, 0), hint: `custos ${brl(totals.condo.costLatest, 0)}` },
                                { label: "Resultado do mês", value: <span className={totals.condo.resultLatest < 0 ? "text-rose-600" : undefined}>{brl(totals.condo.resultLatest, 0)}</span>, hint: totals.condo.negativeCondos > 0 ? <span className="text-rose-600">{plural(totals.condo.negativeCondos, "condomínio no vermelho", "condomínios no vermelho")}</span> : "todos no azul" },
                                { label: `Resultado ${totals.condo.year}`, value: <span className={totals.condo.resultYtd < 0 ? "text-rose-600" : undefined}>{brl(totals.condo.resultYtd, 0)}</span>, hint: totals.condo.monthsWithoutCosts > 0 ? <span className="text-amber-700 dark:text-amber-400">{plural(totals.condo.monthsWithoutCosts, "mês sem custos lançados", "meses sem custos lançados")}</span> : `margem ${pct1(totals.condo.marginYtd)}` },
                            ] : []}
                        />
                        <ModuleCard icon={<HardHat className="h-4 w-4" />} tone="amber" title="Projetos" href="/projetos" base={base} unavailable={failed.has("projects")}
                            figures={totals.projects ? [
                                { label: "Em andamento", value: totals.projects.all.active, hint: `${totals.projects.all.completed} em Imóveis · ${totals.projects.all.sold} vendidos` },
                                { label: "Investido até agora", value: brl(totals.projects.inProgress.paid, 0), hint: `${pct1(totals.projects.inProgress.paidPct)} do custo de ${brl(totals.projects.inProgress.committed, 0)}` },
                                { label: "Falta pagar", value: brl(totals.projects.inProgress.remaining, 0), hint: totals.projects.inProgress.nextDueOn ? `próxima parcela ${formatDateBR(totals.projects.inProgress.nextDueOn)} · ${brl(totals.projects.inProgress.nextDueAmount, 0)}` : "nenhuma parcela à vista" },
                                { label: "Parcelas em atraso", value: <span className={totals.projects.inProgress.overdue > 0 ? "text-rose-600" : undefined}>{totals.projects.inProgress.overdue}</span>, hint: totals.projects.sold.count > 0 ? `ganho realizado nas vendas ${brl(totals.projects.sold.realizedGain, 0)}` : "nenhuma venda registrada" },
                            ] : []}
                            note="Valores dos projetos em andamento, como no hub; os vendidos entram só no ganho realizado."
                        />
                        <ModuleCard icon={<Landmark className="h-4 w-4" />} tone="amber" title="Tributos" href="/imoveis" base={base} unavailable={failed.has("taxes")}
                            figures={totals.taxes ? [
                                { label: `IPTU pago por você (${totals.taxes.year})`, value: brl(totals.taxes.iptuLandlordYtd, 0), hint: `${brl(totals.taxes.iptuLandlordAllTime, 0)} desde o início · ${plural(totals.taxes.propertiesWithIptu, "imóvel no registro", "imóveis no registro")}` },
                                { label: `IPTU pago por inquilinos (${totals.taxes.year})`, value: brl(totals.taxes.iptuTenantYtd, 0), hint: "não é custo seu" },
                                { label: `ITBI e outros (${totals.taxes.year})`, value: brl(totals.taxes.itbiOtherYtd, 0), hint: `${brl(totals.taxes.itbiAllTime + totals.taxes.otherAllTime, 0)} desde o início` },
                                { label: "Impostos federais", value: "—", hint: "em breve, via Contábil & Fiscal" },
                            ] : []}
                            note="IPTU no mês do pagamento, até este mês, como na DRE; o registro fica em cada imóvel, em Tributos do imóvel."
                        />
                    </div>

                    {view.gateways && <GatewaysSection gateways={view.gateways} base={base} />}

                    {view.failed.length > 0 && (
                        <p className="flex items-start gap-2 text-xs text-rose-600"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Não foi possível carregar: {view.failed.map(f => LOADER_LABELS[f]).join(", ")}. Recarregue a página; se persistir, o módulo em questão mostra o erro completo.</p>
                    )}
                </>
            )}
        </div>
    );
}
