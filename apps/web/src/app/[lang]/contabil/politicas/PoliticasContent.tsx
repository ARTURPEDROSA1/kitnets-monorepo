"use client";

/**
 * Contábil & Fiscal › Políticas contábeis.
 *
 * The holding's identity for the books, the responsible contador, and the policies he
 * decides — first of all the standard and the measurement model of the rented properties
 * (A: NBC TG 1002, cost less depreciation; B: full standards, CPC 28 at fair value), with a
 * side-by-side simulation of what each model does to the exempt distribution and to the
 * tax on a future sale under Lucro Presumido (lib/accounting-simulation.ts).
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpenCheck, Building2, Calculator, CheckCircle2, Loader2, Save, Scale, UserCheck } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/DateInput";
import { ContabilNav } from "@/components/contabil/ContabilNav";
import { Money, Sensitive } from "@/components/privacy";
import { cn } from "@/lib/utils";
import {
    BRAZIL_UFS, COMPANY_SIZE_LABELS, LEGAL_NATURE_LABELS, REIMBURSEMENTS_LABELS, STANDARD_LABELS, TAX_BASIS_LABELS, TAX_REGIME_LABELS,
    USEFUL_LIFE_BASIS_LABELS, allowsFairValue, type AccountingSettings, type AccountingStandard,
} from "@/lib/accounting-policies";
import { simulateMeasurementModels, type MeasurementSimulationInput } from "@/lib/accounting-simulation";
import { formatMoney } from "@/lib/accounting-journal";
import type { PropertyMeasurement } from "@/lib/accounting-chart";

interface Props { lang: "en" | "pt" | "es" }

interface Identity { person_type: string | null; cnpj: string | null; business_name: string | null; trade_name: string | null }
interface Defaults { properties: number; purchaseTotal: number; marketValueTotal: number; grossRent12m: number; expenses12m: number; monthsWithIncome: number }

const SELECT = "h-10 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LABEL = "text-xs font-medium text-muted-foreground";
const CARD = "bg-card border border-border rounded-2xl p-5 md:p-6 shadow-xs space-y-4";

const formatCnpj = (v: string | null) => {
    const d = (v ?? "").replace(/\D/g, "");
    return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : v || "—";
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <label className="space-y-1 block">
            <span className={LABEL}>{label}</span>
            {children}
            {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
        </label>
    );
}

function NumberInput({ value, onChange, step = "0.01", min }: { value: number; onChange: (n: number) => void; step?: string; min?: number }) {
    return (
        <Input
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            value={Number.isFinite(value) ? value : 0}
            onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-10 rounded-lg text-sm"
        />
    );
}

export default function PoliticasContent({ lang }: Props) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [form, setForm] = useState<AccountingSettings | null>(null);
    const [savedJson, setSavedJson] = useState<string>("");
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [pending, setPending] = useState<string[]>([]);
    const [sim, setSim] = useState<MeasurementSimulationInput | null>(null);
    const [landPct, setLandPct] = useState(20);
    const [defaults, setDefaults] = useState<Defaults | null>(null);
    const [firstBankDate, setFirstBankDate] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/accounting/settings");
                const d = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(d.error || "Erro ao carregar");
                setForm(d.settings);
                setSavedJson(JSON.stringify(d.settings));
                setIdentity(d.identity);
                setPending(d.pending ?? []);
                setFirstBankDate(d.firstBankDate ?? null);
                const def = d.defaults as Defaults;
                setDefaults(def);
                const cost = def.purchaseTotal || def.marketValueTotal;
                setSim({
                    startYear: new Date().getFullYear(),
                    horizonYears: 10,
                    annualGrossRent: def.grossRent12m,
                    rentGrowthPct: 4,
                    annualExpenses: def.expenses12m,
                    landCost: Math.round(cost * 0.2),
                    buildingCost: Math.round(cost * 0.8),
                    usefulLifeYears: d.settings.building_useful_life_years,
                    accumulatedDepreciationAtStart: 0,
                    initialFairValue: def.marketValueTotal || cost,
                    appreciationPct: 4,
                    annualValuationCost: 0,
                });
            } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
        })();
    }, []);

    const dirty = form !== null && JSON.stringify(form) !== savedJson;
    const patch = (p: Partial<AccountingSettings>) => setForm(f => (f ? { ...f, ...p } : f));
    const patchSim = (p: Partial<MeasurementSimulationInput>) => setSim(s => (s ? { ...s, ...p } : s));

    // NBC TG 1002 only has the cost model; fair value needs a standard that allows it
    const setModel = (standard: AccountingStandard | null, measurement: PropertyMeasurement | null) => {
        const m = standard === "NBC_TG_1002" ? "COST" : measurement === "FAIR_VALUE" && !allowsFairValue(standard) ? null : measurement;
        patch({ accounting_standard: standard, property_measurement: m });
    };

    const splitLand = (pct: number) => {
        setLandPct(pct);
        if (!sim) return;
        const total = sim.landCost + sim.buildingCost;
        patchSim({ landCost: Math.round(total * pct / 100), buildingCost: Math.round(total * (100 - pct) / 100) });
    };

    const result = useMemo(() => (sim ? simulateMeasurementModels(sim) : null), [sim]);

    const save = async () => {
        if (!form) return;
        setSaving(true); setError(null); setNotice(null);
        try {
            const res = await fetch("/api/accounting/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao salvar");
            setForm(d.settings);
            setSavedJson(JSON.stringify(d.settings));
            setPending(d.pending ?? []);
            setNotice("Políticas salvas.");
        } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
    };

    const modelA = form?.accounting_standard === "NBC_TG_1002";
    const modelB = form?.accounting_standard === "NBC_TG_COMPLETAS" && form.property_measurement === "FAIR_VALUE";

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <BookOpenCheck className="w-8 h-8 text-emerald-600" /> Políticas contábeis
                </h1>
                <p className="text-base text-muted-foreground">
                    As escolhas que o contador responsável faz para os livros da holding. A principal é o modelo de mensuração dos imóveis alugados: ele muda quanto lucro pode ser distribuído com isenção e quanto imposto uma venda futura paga.
                </p>
            </div>
            <ContabilNav lang={lang} />

            {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>}
            {error && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}

            {form && (
                <>
                    {pending.length > 0 && (
                        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-2">
                            <h2 className="font-semibold text-sm flex items-center gap-2 text-amber-800 dark:text-amber-200"><AlertTriangle className="w-4 h-4" /> Decisões pendentes do contador</h2>
                            <ul className="list-disc pl-5 text-sm text-amber-900 dark:text-amber-100 space-y-0.5">
                                {pending.map(p => <li key={p}>{p}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Holding */}
                    <section className={CARD}>
                        <h2 className="font-bold text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-600" /> Holding</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <span className={LABEL}>CNPJ</span>
                                <Sensitive as="p" className="text-sm font-medium">{formatCnpj(identity?.cnpj ?? null)}</Sensitive>
                            </div>
                            <div className="space-y-1 md:col-span-2">
                                <span className={LABEL}>Razão social</span>
                                <p className="text-sm font-medium">{identity?.business_name || "—"} <Link href={lang === "pt" ? "/profile" : `/${lang}/profile`} className="ml-2 text-xs text-emerald-700 hover:underline">editar no perfil</Link></p>
                            </div>
                            <Field label="Natureza jurídica">
                                <select className={SELECT} value={form.legal_nature ?? ""} onChange={e => patch({ legal_nature: (e.target.value || null) as AccountingSettings["legal_nature"] })}>
                                    <option value="">—</option>
                                    {Object.entries(LEGAL_NATURE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Field>
                            <Field label="Porte">
                                <select className={SELECT} value={form.company_size ?? ""} onChange={e => patch({ company_size: (e.target.value || null) as AccountingSettings["company_size"] })}>
                                    <option value="">—</option>
                                    {Object.entries(COMPANY_SIZE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Field>
                            <Field label="NIRE (Junta Comercial)">
                                <Input value={form.nire ?? ""} onChange={e => patch({ nire: e.target.value || null })} className="h-10 rounded-lg text-sm" />
                            </Field>
                            <Field label="Regime tributário">
                                <select className={SELECT} value={form.tax_regime} onChange={e => patch({ tax_regime: e.target.value as AccountingSettings["tax_regime"] })}>
                                    {Object.entries(TAX_REGIME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Field>
                            <Field label="Apuração dos tributos" hint="A contabilidade é sempre por competência; a apuração do Lucro Presumido pode ser por caixa.">
                                <select className={SELECT} value={form.tax_basis ?? ""} onChange={e => patch({ tax_basis: (e.target.value || null) as AccountingSettings["tax_basis"] })}>
                                    <option value="">A definir</option>
                                    {Object.entries(TAX_BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Field>
                            <Field
                                label="Início da escrituração na Kitnets.com *"
                                hint={`Você decide, com o contador: o mês em que os livros começam aqui (o saldo de abertura é o do dia anterior). Enquanto não estiver definido, o extrato não é contabilizado.${firstBankDate ? ` Seu extrato importado mais antigo é de ${firstBankDate.slice(5, 7)}/${firstBankDate.slice(0, 4)}.` : ""}`}
                            >
                                <DateInput mode="month" value={form.opening_date ? form.opening_date.slice(0, 7) : ""} onChange={ym => patch({ opening_date: ym ? `${ym}-01` : null })}
                                    className={cn("h-10 rounded-lg text-sm", !form.opening_date && "border-amber-500")} />
                            </Field>
                        </div>
                    </section>

                    {/* Contador */}
                    <section className={CARD}>
                        <h2 className="font-bold text-base flex items-center gap-2"><UserCheck className="w-4 h-4 text-emerald-600" /> Contador responsável</h2>
                        <p className="text-xs text-muted-foreground">Quem revisa, assina e transmite a escrituração. Por enquanto a decisão é tomada fora da plataforma; registre aqui quem decidiu e quando.</p>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Field label="Nome"><Input value={form.accountant_name ?? ""} onChange={e => patch({ accountant_name: e.target.value || null })} className="h-10 rounded-lg text-sm" /></Field>
                            <Field label="Registro no CRC"><Input value={form.accountant_crc ?? ""} placeholder="ex.: 123456/O" onChange={e => patch({ accountant_crc: e.target.value || null })} className="h-10 rounded-lg text-sm" /></Field>
                            <Field label="UF do CRC">
                                <select className={SELECT} value={form.accountant_crc_uf ?? ""} onChange={e => patch({ accountant_crc_uf: e.target.value || null })}>
                                    <option value="">—</option>
                                    {BRAZIL_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                </select>
                            </Field>
                            <Field label="E-mail"><Input type="email" value={form.accountant_email ?? ""} onChange={e => patch({ accountant_email: e.target.value || null })} className="h-10 rounded-lg text-sm" /></Field>
                            <Field label="Políticas decididas por"><Input value={form.policies_decided_by ?? ""} placeholder="Nome e CRC do contador" onChange={e => patch({ policies_decided_by: e.target.value || null })} className="h-10 rounded-lg text-sm" /></Field>
                            <Field label="Em"><DateInput value={form.policies_decided_on} onChange={iso => patch({ policies_decided_on: iso || null })} className="h-10 rounded-lg text-sm" /></Field>
                        </div>
                    </section>

                    {/* Model */}
                    <section className={CARD}>
                        <h2 className="font-bold text-base flex items-center gap-2"><Scale className="w-4 h-4 text-emerald-600" /> Norma e modelo de mensuração dos imóveis alugados</h2>
                        <p className="text-xs text-muted-foreground">
                            Os imóveis alugados são <strong>propriedades para investimento</strong> (CPC 28). Imobilizado fica só para imóvel de uso da própria holding (CPC 27), e estoque só para imóvel mantido para revenda (CPC 16).
                            {" "}Não há modelo padrão: enquanto a norma e o modelo não forem escolhidos com o contador, a depreciação e o ajuste a valor justo não são lançados.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button type="button" onClick={() => setModel("NBC_TG_1002", "COST")}
                                className={cn("text-left rounded-xl border p-4 space-y-1 transition-colors", modelA ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-border hover:bg-accent")}>
                                <p className="text-sm font-semibold">A · NBC TG 1002 — custo menos depreciação</p>
                                <p className="text-xs text-muted-foreground">A norma das microentidades (receita até R$ 4,8 mi). Seção 17: custo menos depreciação acumulada, em linha reta pela vida útil da Receita (edificações, 25 anos); o terreno não deprecia. Não tem opção de valor justo.</p>
                            </button>
                            <button type="button" onClick={() => setModel("NBC_TG_COMPLETAS", "FAIR_VALUE")}
                                className={cn("text-left rounded-xl border p-4 space-y-1 transition-colors", modelB ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-border hover:bg-accent")}>
                                <p className="text-sm font-semibold">B · Normas completas — CPC 28 a valor justo</p>
                                <p className="text-xs text-muted-foreground">Adoção voluntária (NBC TG 1002, item P5), por pelo menos 2 anos. Sem depreciação; a variação do valor justo vai para o resultado e os ganhos não realizados ficam em reserva. Exige avaliação a cada balanço.</p>
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Field label="Norma">
                                <select className={cn(SELECT, !form.accounting_standard && "border-amber-500")} value={form.accounting_standard ?? ""}
                                    onChange={e => setModel((e.target.value || null) as AccountingStandard | null, form.property_measurement)}>
                                    <option value="">A definir</option>
                                    {Object.entries(STANDARD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Field>
                            <Field label="Mensuração">
                                <select className={cn(SELECT, !form.property_measurement && "border-amber-500")} value={form.property_measurement ?? ""}
                                    onChange={e => patch({ property_measurement: (e.target.value || null) as PropertyMeasurement | null })}>
                                    <option value="">A definir</option>
                                    <option value="COST">Custo menos depreciação</option>
                                    <option value="FAIR_VALUE" disabled={!allowsFairValue(form.accounting_standard)}>Valor justo (CPC 28)</option>
                                </select>
                            </Field>
                            {form.property_measurement === "COST" && (
                                <>
                                    <Field label="Vida útil das edificações">
                                        <select className={SELECT} value={form.useful_life_basis} onChange={e => patch({ useful_life_basis: e.target.value as AccountingSettings["useful_life_basis"], building_useful_life_years: e.target.value === "RFB" ? 25 : form.building_useful_life_years })}>
                                            {Object.entries(USEFUL_LIFE_BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Anos">
                                        <NumberInput value={form.building_useful_life_years} step="1" min={1} onChange={n => patch({ building_useful_life_years: n })} />
                                    </Field>
                                </>
                            )}
                            <Field label="Energia, condomínio e IPTU pagos pelo inquilino" hint="Receita entra na receita bruta (e nos tributos); repasse abate a despesa que a holding paga.">
                                <select className={cn(SELECT, !form.reimbursements_policy && "border-amber-500")} value={form.reimbursements_policy ?? ""} onChange={e => patch({ reimbursements_policy: (e.target.value || null) as AccountingSettings["reimbursements_policy"] })}>
                                    <option value="">A definir</option>
                                    {Object.entries(REIMBURSEMENTS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Field>
                            <Field label="Primeira adoção formal da norma?" hint="Só na primeira adoção a NBC TG 1002 (item 35.3) permite o custo atribuído.">
                                <select className={SELECT} value={form.first_adoption_deemed_cost === null ? "" : String(form.first_adoption_deemed_cost)}
                                    onChange={e => patch({ first_adoption_deemed_cost: e.target.value === "" ? null : e.target.value === "true" })}>
                                    <option value="">A definir</option>
                                    <option value="true">Sim — avaliar custo atribuído</option>
                                    <option value="false">Não</option>
                                </select>
                            </Field>
                        </div>
                    </section>

                    <div className="flex items-center gap-3">
                        <Button onClick={save} disabled={saving || !dirty} className="gap-2">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar políticas
                        </Button>
                        {notice && <span className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {notice}</span>}
                        {dirty && !saving && <span className="text-xs text-muted-foreground">Alterações não salvas</span>}
                    </div>
                </>
            )}

            {/* Simulation */}
            {sim && result && (
                <section className={CARD}>
                    <div className="space-y-1">
                        <h2 className="font-bold text-base flex items-center gap-2"><Calculator className="w-4 h-4 text-emerald-600" /> Simulação: modelo A × modelo B no Lucro Presumido</h2>
                        <p className="text-xs text-muted-foreground">
                            O imposto do ano é o mesmo nos dois modelos (o Presumido ignora despesas). Muda o <strong>lucro efetivo</strong>, que permite distribuir com isenção acima do lucro presumido (RIR/2018, art. 725, §2º), e o <strong>ganho tributável numa venda</strong> (Lei 9.430, art. 25, §§1º e 4º).
                            {defaults && defaults.monthsWithIncome > 0 && <> Valores iniciais: aluguel e despesas dos últimos 12 meses registrados ({defaults.monthsWithIncome} meses), custo de compra e última avaliação dos imóveis.</>}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="Aluguel bruto anual"><NumberInput value={sim.annualGrossRent} onChange={n => patchSim({ annualGrossRent: n })} /></Field>
                        <Field label="Despesas anuais (sem depreciação e tributos)"><NumberInput value={sim.annualExpenses} onChange={n => patchSim({ annualExpenses: n })} /></Field>
                        <Field label="Reajuste do aluguel (% a.a.)"><NumberInput value={sim.rentGrowthPct} step="0.1" onChange={n => patchSim({ rentGrowthPct: n })} /></Field>
                        <Field label="Horizonte (anos)"><NumberInput value={sim.horizonYears} step="1" min={1} onChange={n => patchSim({ horizonYears: n })} /></Field>
                        <Field label="Custo do terreno"><NumberInput value={sim.landCost} onChange={n => patchSim({ landCost: n })} /></Field>
                        <Field label="Custo da edificação e benfeitorias"><NumberInput value={sim.buildingCost} onChange={n => patchSim({ buildingCost: n })} /></Field>
                        <Field label="% do custo que é terreno" hint="Separação a confirmar com o contador (laudo ou IPTU).">
                            <NumberInput value={landPct} step="1" min={0} onChange={n => splitLand(Math.min(100, Math.max(0, n)))} />
                        </Field>
                        <Field label="Depreciação já acumulada"><NumberInput value={sim.accumulatedDepreciationAtStart} onChange={n => patchSim({ accumulatedDepreciationAtStart: n })} /></Field>
                        <Field label="Vida útil (anos, modelo A)"><NumberInput value={sim.usefulLifeYears} step="1" min={1} onChange={n => patchSim({ usefulLifeYears: n })} /></Field>
                        <Field label="Valor de mercado hoje"><NumberInput value={sim.initialFairValue} onChange={n => patchSim({ initialFairValue: n })} /></Field>
                        <Field label="Valorização (% a.a.)"><NumberInput value={sim.appreciationPct} step="0.1" onChange={n => patchSim({ appreciationPct: n })} /></Field>
                        <Field label="Custo anual da avaliação (modelo B)"><NumberInput value={sim.annualValuationCost} onChange={n => patchSim({ annualValuationCost: n })} /></Field>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-border p-4 space-y-1">
                            <p className={LABEL}>Distribuível com isenção em {sim.horizonYears} anos</p>
                            <p className="text-sm">A: <Money as="strong">{formatMoney(result.totals.distributableA)}</Money></p>
                            <p className="text-sm">B: <Money as="strong">{formatMoney(result.totals.distributableB)}</Money></p>
                            <p className="text-xs text-muted-foreground">Diferença: <Money>{formatMoney(result.totals.distributableB - result.totals.distributableA)}</Money></p>
                        </div>
                        <div className="rounded-xl border border-border p-4 space-y-1">
                            <p className={LABEL}>Venda ao fim do horizonte por <Money>{formatMoney(result.sale.saleValue)}</Money></p>
                            <p className="text-sm">Ganho tributável A: <Money as="strong">{formatMoney(result.sale.gainA)}</Money> · imposto <Money>{formatMoney(result.sale.taxA)}</Money></p>
                            <p className="text-sm">Ganho tributável B: <Money as="strong">{formatMoney(result.sale.gainB)}</Money> · imposto <Money>{formatMoney(result.sale.taxB)}</Money></p>
                            <p className="text-xs text-muted-foreground">Diferença no imposto: <Money>{formatMoney(result.sale.taxA - result.sale.taxB)}</Money></p>
                        </div>
                        <div className="rounded-xl border border-border p-4 space-y-1">
                            <p className={LABEL}>No período</p>
                            <p className="text-sm">Depreciação (A): <Money>{formatMoney(result.totals.depreciation)}</Money></p>
                            <p className="text-sm">Reserva de valor justo (B): <Money>{formatMoney(result.totals.fairValueReserve)}</Money></p>
                            <p className="text-sm">Custo das avaliações (B): <Money>{formatMoney(result.totals.valuationCost)}</Money></p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border">
                                    <th className="text-left py-1.5 pr-2 font-medium">Ano</th>
                                    <th className="text-right px-2 font-medium">Aluguel bruto</th>
                                    <th className="text-right px-2 font-medium">Tributos</th>
                                    <th className="text-right px-2 font-medium">Presumido − tributos</th>
                                    <th className="text-right px-2 font-medium">Depreciação</th>
                                    <th className="text-right px-2 font-medium">Lucro efetivo A</th>
                                    <th className="text-right px-2 font-medium">Lucro efetivo B</th>
                                    <th className="text-right px-2 font-medium">Valor justo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.years.map(y => (
                                    <tr key={y.year} className="border-b border-border/60">
                                        <td className="py-1.5 pr-2">{y.year}</td>
                                        <Money as="td" className="text-right px-2">{formatMoney(y.grossRent)}</Money>
                                        <Money as="td" className="text-right px-2">{formatMoney(y.taxes)}</Money>
                                        <Money as="td" className="text-right px-2">{formatMoney(y.presumedDistributable)}</Money>
                                        <Money as="td" className="text-right px-2">{formatMoney(y.depreciation)}</Money>
                                        <Money as="td" className="text-right px-2">{formatMoney(y.profitA)}</Money>
                                        <Money as="td" className="text-right px-2">{formatMoney(y.profitB)}</Money>
                                        <Money as="td" className="text-right px-2">{formatMoney(y.fairValue)}</Money>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Estimativa para a decisão do contador, não um cálculo fiscal. Tributos do ano pelas alíquotas do Lucro Presumido (PIS/COFINS até 2026, CBS/IBS de 2027 em diante, sem o redutor social por unidade); em 2026 a CBS/IBS de teste fica de fora. Venda tributada como ganho de capital num único trimestre.
                    </p>
                </section>
            )}
        </div>
    );
}
