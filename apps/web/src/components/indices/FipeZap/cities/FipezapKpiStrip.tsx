import { Banknote, CalendarRange, Percent, TrendingUp, Wallet } from "lucide-react";
import Tile from "@/components/properties/Tile";
import { Delta } from "./Delta";
import type { CitySnapshot } from "@/lib/fipezap-cities-server";
import type { Benchmark } from "@/lib/fipezap-insights";
import { fill, fmtBRL, fmtPct, monthShort } from "@/lib/fipezap-compare";
import type { FipezapTipo } from "@/lib/fipezap-cities-params";
import type { Dictionary } from "@/dictionaries";

type Kpi = Dictionary["fipezapCitiesPage"]["kpi"];

/** The headline figures of the selected place: month, year, 12 months, price per m² and rental yield. */
export function FipezapKpiStrip({ focus, tipo, tipoLabel, ipca, igpm, cdi12m, lang, t }: { focus: CitySnapshot; tipo: FipezapTipo; tipoLabel: string; ipca: Benchmark | null; igpm: Benchmark | null; cdi12m: number | null; lang: string; t: Kpi }) {
    const pct = (v: number | null | undefined) => fmtPct(v, { lang });
    const rate = (v: number | null | undefined) => fmtPct(v, { lang, sign: false });
    const ref = `${focus.city.name} · ${monthShort(focus.month, lang)}`;
    const priceHint = fill(t.hintPrice, { tipo: tipoLabel });
    const yieldTile = (
        <Tile key="yield" label={t.yield} tone="slate" icon={<Percent className="w-4 h-4" />} value={focus.yieldAnual !== null ? fmtPct(focus.yieldAnual, { lang, sign: false }) : "–"} hint={fill(t.hintYield, { cdi: rate(cdi12m) })} info={{ what: t.whatYield, formula: "((1 + aluguel/m² ÷ preço/m²) ^ 12 − 1)", example: ref }} />
    );
    if (tipo === "yield") {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {yieldTile}
                <Tile label={`${t.yield} · 12m`} tone="slate" icon={<CalendarRange className="w-4 h-4" />} value={focus.yield12m !== null ? fmtPct(focus.yield12m, { lang, sign: false }) : "–"} hint={ref} info={{ what: t.whatM12, formula: "média das rentabilidades anualizadas dos últimos 12 meses", example: ref }} />
                <Tile label={t.price} tone="slate" icon={<Banknote className="w-4 h-4" />} value={fmtBRL(focus.precoM2, { lang })} hint={priceHint} info={{ what: t.whatPrice, formula: "Σ preço anunciado ÷ Σ m² (amostra do mês)", example: ref }} />
                <Tile label={t.m12} tone="slate" icon={<TrendingUp className="w-4 h-4" />} value={<Delta value={focus.var12m} lang={lang} />} hint={fill(t.hintM12, { ipca: pct(ipca?.acc12m), igpm: pct(igpm?.acc12m) })} info={{ what: t.whatM12, formula: "(índice hoje ÷ índice 12 meses atrás − 1)", example: ref }} />
            </div>
        );
    }
    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label={t.month} tone="slate" icon={<TrendingUp className="w-4 h-4" />} value={<Delta value={focus.varMensal} lang={lang} />} hint={fill(t.hintMonth, { ipca: pct(ipca?.varMensal) })} info={{ what: t.whatMonth, formula: "(preço médio do mês ÷ preço médio do mês anterior − 1)", example: ref }} />
            <Tile label={t.year} tone="slate" icon={<CalendarRange className="w-4 h-4" />} value={<Delta value={focus.ytd} lang={lang} />} hint={fill(t.hintYear, { ipca: pct(ipca?.ytd) })} info={{ what: t.whatYear, formula: "Π (1 + variação mensal) − 1, de janeiro ao mês", example: ref }} />
            <Tile label={t.m12} tone="slate" icon={<Wallet className="w-4 h-4" />} value={<Delta value={focus.var12m} lang={lang} />} hint={fill(t.hintM12, { ipca: pct(ipca?.acc12m), igpm: pct(igpm?.acc12m) })} info={{ what: t.whatM12, formula: "(índice hoje ÷ índice 12 meses atrás − 1)", example: ref }} />
            <Tile label={t.price} tone="slate" icon={<Banknote className="w-4 h-4" />} value={fmtBRL(focus.precoM2, { lang })} hint={priceHint} info={{ what: t.whatPrice, formula: "Σ preço anunciado ÷ Σ m² (amostra do mês)", example: ref }} />
            {yieldTile}
        </div>
    );
}
