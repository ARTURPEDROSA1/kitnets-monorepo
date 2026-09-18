"use client";

/**
 * Public "Calculadora de Payback de Imóvel" — the investment engine's
 * simulator (`simulatePayback`) with a landing-page layout for SEO.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Calculator, CalendarClock, Gauge, Info, Percent, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { getDictionary } from "@/dictionaries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalculatorSuggestion } from "@/components/calculators/CalculatorSuggestion";
import { simulatePayback, type PaybackSimInput } from "@/lib/payback-simulator";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const formatBRL2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatK = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : `R$ ${v.toFixed(0)}`);
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const yearsLabel = (months: number | null) => {
    if (months === null) return "não se paga no horizonte";
    const y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return `${m} ${m === 1 ? "mês" : "meses"}`;
    return `${y} ${y === 1 ? "ano" : "anos"}${m ? ` e ${m} ${m === 1 ? "mês" : "meses"}` : ""}`;
};

const DEFAULTS: PaybackSimInput = {
    propertyValue: 400000, downPaymentPct: 20, closingCostsPct: 4, financed: true, system: "SAC", annualRatePct: 11, termMonths: 360,
    monthlyRent: 2400, feePct: 10, vacancyPct: 5, monthlyCosts: 150, rentGrowthPctYear: 4, appreciationPctYear: 4, horizonYears: 30, sellAtEnd: true, sellingCostPct: 6,
};

function Kpi({ icon, label, value, hint, tone = "text-emerald-600" }: { icon: React.ReactNode; label: string; value: string; hint: string; tone?: string }) {
    return (
        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><span className={tone}>{icon}</span>{label}</span>
            <span className="text-xl font-bold text-foreground block tabular-nums">{value}</span>
            <span className="text-[11px] text-muted-foreground block leading-snug">{hint}</span>
        </div>
    );
}

function NumField({ id, label, value, onChange, step = "1", suffix, min, max }: { id: string; label: string; value: number; onChange: (v: number) => void; step?: string; suffix?: string; min?: number; max?: number }) {
    return (
        <div className="space-y-1">
            <Label htmlFor={id} className="text-xs">{label}</Label>
            <div className="relative">
                <Input id={id} type="number" inputMode="decimal" step={step} min={min} max={max} value={Number.isFinite(value) ? value : ""} onChange={e => onChange(Number(e.target.value))} className="h-9 text-sm pr-10 tabular-nums" />
                {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
            </div>
        </div>
    );
}

export default function PaybackCalculatorClient() {
    const params = useParams();
    const lang = (params?.lang as string) || "pt";
    const dict = getDictionary(lang);
    const [input, setInput] = useState<PaybackSimInput>(DEFAULTS);
    const set = <K extends keyof PaybackSimInput>(k: K) => (v: PaybackSimInput[K]) => setInput(prev => ({ ...prev, [k]: v }));
    const result = useMemo(() => simulatePayback(input), [input]);

    const chart = useMemo(() => {
        const step = result.series.length > 240 ? 3 : 1;
        return result.series.filter((_, i) => i % step === 0 || i === result.series.length - 1).map(p => ({
            label: `${Math.floor(p.month / 12)}a${p.month % 12 ? `${p.month % 12}m` : ""}`, month: p.month, investido: p.cumInvested, renda: p.cumNoi,
        }));
    }, [result]);
    const paybackLabel = result.monthsToPayback !== null ? chart.find(c => c.month >= result.monthsToPayback!)?.label : undefined;

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-8 animate-in fade-in duration-500">
            <div className="space-y-4 max-w-3xl">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Calculadora de Payback de Imóvel para Aluguel</h1>
                <p className="text-lg text-muted-foreground">
                    Em quantos anos um imóvel alugado se paga? Informe o valor, o financiamento e o aluguel e veja o payback, o yield, o fluxo de caixa mês a mês e a TIR com ou sem venda ao final. Grátis, sem cadastro.
                </p>
            </div>

            <div className="grid lg:grid-cols-5 gap-6 items-start">
                {/* Inputs */}
                <div className="lg:col-span-2 space-y-5 rounded-2xl border border-border bg-card p-5 shadow-xs">
                    <h2 className="font-bold text-sm text-foreground flex items-center gap-2"><Calculator className="w-4 h-4 text-emerald-600" /> Compra</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2"><NumField id="value" label="Valor do imóvel" value={input.propertyValue} onChange={set("propertyValue")} step="1000" suffix="R$" min={0} /></div>
                        <NumField id="down" label="Entrada" value={input.downPaymentPct} onChange={set("downPaymentPct")} step="1" suffix="%" min={0} max={100} />
                        <NumField id="closing" label="ITBI + registro + corretagem" value={input.closingCostsPct} onChange={set("closingCostsPct")} step="0.5" suffix="%" min={0} max={30} />
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" className="accent-emerald-600" checked={input.financed} onChange={e => set("financed")(e.target.checked)} /> Financiar o restante
                    </label>
                    {input.financed && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Sistema</Label>
                                <div className="flex rounded-md border border-input overflow-hidden text-sm">
                                    {(["SAC", "PRICE"] as const).map(sys => (
                                        <button key={sys} type="button" onClick={() => set("system")(sys)} className={`flex-1 h-9 ${input.system === sys ? "bg-emerald-600 text-white" : "bg-background text-foreground hover:bg-muted"}`}>{sys}</button>
                                    ))}
                                </div>
                            </div>
                            <NumField id="rate" label="Juros" value={input.annualRatePct} onChange={set("annualRatePct")} step="0.1" suffix="% a.a." min={0} max={40} />
                            <NumField id="term" label="Prazo" value={input.termMonths} onChange={set("termMonths")} step="12" suffix="meses" min={12} max={420} />
                        </div>
                    )}

                    <h2 className="font-bold text-sm text-foreground flex items-center gap-2 pt-2"><Wallet className="w-4 h-4 text-blue-600" /> Aluguel e custos</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <NumField id="rent" label="Aluguel mensal" value={input.monthlyRent} onChange={set("monthlyRent")} step="50" suffix="R$" min={0} />
                        <NumField id="fee" label="Taxa de administração" value={input.feePct} onChange={set("feePct")} step="0.5" suffix="%" min={0} max={50} />
                        <NumField id="vac" label="Vacância" value={input.vacancyPct} onChange={set("vacancyPct")} step="1" suffix="% do ano" min={0} max={90} />
                        <NumField id="costs" label="IPTU + condomínio + manutenção" value={input.monthlyCosts} onChange={set("monthlyCosts")} step="10" suffix="R$/mês" min={0} />
                    </div>

                    <h2 className="font-bold text-sm text-foreground flex items-center gap-2 pt-2"><TrendingUp className="w-4 h-4 text-violet-600" /> Horizonte</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <NumField id="growth" label="Reajuste do aluguel" value={input.rentGrowthPctYear} onChange={set("rentGrowthPctYear")} step="0.5" suffix="% a.a." min={-20} max={30} />
                        <NumField id="appr" label="Valorização" value={input.appreciationPctYear} onChange={set("appreciationPctYear")} step="0.5" suffix="% a.a." min={-20} max={30} />
                        <NumField id="years" label="Anos simulados" value={input.horizonYears} onChange={set("horizonYears")} step="1" suffix="anos" min={1} max={50} />
                        <NumField id="sellcost" label="Custos de venda" value={input.sellingCostPct} onChange={set("sellingCostPct")} step="0.5" suffix="%" min={0} max={50} />
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" className="accent-emerald-600" checked={input.sellAtEnd} onChange={e => set("sellAtEnd")(e.target.checked)} /> Vender ao final do horizonte
                    </label>
                    <Button variant="outline" size="sm" onClick={() => setInput(DEFAULTS)} className="w-full">Restaurar exemplo</Button>
                </div>

                {/* Results */}
                <div className="lg:col-span-3 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Kpi icon={<CalendarClock className="w-3.5 h-3.5" />} label="Payback" value={yearsLabel(result.monthsToPayback)}
                            hint={result.monthsToPaybackInitial !== null && result.monthsToPaybackInitial !== result.monthsToPayback ? `Sobre a entrada + custos: ${yearsLabel(result.monthsToPaybackInitial)}` : "Quando a renda líquida acumulada cobre tudo o que foi pago"} />
                        <Kpi icon={<PiggyBank className="w-3.5 h-3.5" />} label="Desembolso inicial" value={formatBRL(result.initialCash)}
                            hint={input.financed ? `Entrada ${formatBRL(result.downPayment)} + custos ${formatBRL(result.closingCosts)} · financiado ${formatBRL(result.financedAmount)}` : `À vista + custos ${formatBRL(result.closingCosts)}`} />
                        <Kpi icon={<Percent className="w-3.5 h-3.5" />} label="Yield bruto / líquido" value={`${pct(result.grossYieldPct)} / ${pct(result.netYieldPct)}`} tone="text-blue-600"
                            hint="Bruto = 12 × aluguel ÷ valor · líquido = renda líquida do 1º ano ÷ custo total (entrada, custos e prestações)" />
                        <Kpi icon={<Wallet className="w-3.5 h-3.5" />} label="Renda líquida / mês" value={formatBRL2(result.noiFirstMonth)} tone="text-blue-600"
                            hint={input.financed && result.firstInstalment !== null ? `1ª prestação ${formatBRL2(result.firstInstalment)} · fluxo ${formatBRL2(result.noiFirstMonth - result.firstInstalment)}${result.dscr !== null ? ` · DSCR ${result.dscr.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : ""}` : "Aluguel − taxa − vacância − custos"} />
                        <Kpi icon={<Gauge className="w-3.5 h-3.5" />} label={`TIR em ${input.horizonYears} anos`} value={result.irrPct !== null ? `${pct(result.irrPct)} a.a.` : "—"} tone={result.irrPct !== null && result.irrPct >= 0 ? "text-emerald-600" : "text-slate-500"}
                            hint={input.sellAtEnd ? `Com venda por ${formatBRL(result.valueAtEnd)} (líquido ${formatBRL(result.saleProceeds ?? 0)})` : "Sem venda: só a renda do aluguel"} />
                        <Kpi icon={<TrendingUp className="w-3.5 h-3.5" />} label="Múltiplo do capital" value={result.multiple !== null ? `${result.multiple.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×` : "—"} tone="text-violet-600"
                            hint={`Renda total ${formatBRL(result.totalNoi)}${input.sellAtEnd ? " + venda" : ""} ÷ tudo o que foi pago ${formatBRL(result.cashInvested)}${input.financed ? ` (juros ${formatBRL(result.totalInterest)})` : ""}`} />
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-2">
                        <h3 className="font-bold text-sm text-foreground">Curva de payback</h3>
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chart} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="pb-inv" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} width={64} tickFormatter={(v: number) => formatK(v)} />
                                    <RechartsTooltip formatter={(value, name) => [formatBRL2(Number(value ?? 0)), name ?? ""]} contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} />
                                    <Legend wrapperStyle={{ paddingTop: "8px", fontSize: "12px" }} />
                                    <Area type="stepAfter" dataKey="investido" name="Pago acumulado" stroke="#10b981" strokeWidth={2} fill="url(#pb-inv)" dot={false} isAnimationActive={false} />
                                    <Line type="monotone" dataKey="renda" name="Renda líquida acumulada" stroke="#3b82f6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                                    {paybackLabel && <ReferenceLine x={paybackLabel} stroke="#8b5cf6" strokeDasharray="3 3" label={{ value: "Payback", position: "insideTopRight", fontSize: 11, fill: "#8b5cf6" }} />}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            “Pago acumulado” = entrada + custos + todas as prestações. A renda líquida cresce pelo reajuste anual. Sem seguros (MIP/DFI) e sem inflação nos custos.
                        </p>
                    </div>
                </div>
            </div>

            {/* Educational */}
            <div className="mt-16 pt-8 border-t space-y-8">
                <div className="bg-muted/30 rounded-2xl p-8 md:p-10 space-y-4">
                    <h3 className="font-bold text-xl flex items-center gap-2"><Info className="w-6 h-6 text-primary" /> Como ler o payback de um imóvel</h3>
                    <div className="grid md:grid-cols-2 gap-8 text-muted-foreground leading-relaxed text-sm md:text-base">
                        <p>
                            O payback é o tempo até a renda líquida acumulada do aluguel igualar tudo o que você pagou: entrada, custos de aquisição, prestações e reformas. Um payback de 15 anos equivale a um yield líquido médio de cerca de 6,7% ao ano. Com financiamento, as prestações entram na conta mês a mês, por isso o payback sobre o total costuma vir depois do payback sobre a entrada.
                        </p>
                        <p>
                            O yield bruto (12 × aluguel ÷ valor) é a medida rápida de mercado; o yield líquido desconta taxa de administração, vacância e custos do proprietário. A TIR junta tudo — renda, prestações e a venda ao final — em uma taxa anual comparável com o CDI ou o Tesouro. No Kitnets.com o mesmo motor roda com os seus números reais: receitas recebidas, prestações pagas, IPTU e o valor de mercado do imóvel.
                        </p>
                    </div>
                </div>
                <div className="text-center text-xs text-muted-foreground max-w-2xl mx-auto pb-8">
                    <p className="font-semibold mb-1">Aviso Legal</p>
                    <p>Esta calculadora é uma ferramenta estimativa para fins informativos. Resultados dependem das premissas informadas e não constituem recomendação de investimento.</p>
                </div>
            </div>

            <div className="mt-16 text-center space-y-8 bg-muted/30 p-8 md:p-12 rounded-[2.5rem] border relative overflow-hidden">
                <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight whitespace-pre-line text-foreground">{dict.calculatorCta?.title}</h2>
                    <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">{dict.calculatorCta?.description}</p>
                    <div className="pt-2">
                        <Link href={`/${lang}/lista-vip?step=landing`}>
                            <Button size="lg" className="h-14 px-8 text-lg rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all border-0">{dict.calculatorCta?.button}</Button>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="mt-16"><CalculatorSuggestion /></div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        name: "Calculadora de Payback de Imóvel",
                        applicationCategory: "FinanceApplication",
                        operatingSystem: "Any",
                        offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
                        description: "Calcule em quantos anos um imóvel alugado se paga: payback, yield bruto e líquido, fluxo de caixa e TIR com ou sem financiamento.",
                    }),
                }}
            />
        </div>
    );
}
