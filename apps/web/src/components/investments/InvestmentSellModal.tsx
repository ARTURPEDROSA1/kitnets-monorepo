"use client";

/**
 * "Registrar venda": the end of a project meant to be sold — or of any project the owner decides
 * to sell before the keys (a cessão de direitos: the buyer takes over the open instalments, so the
 * seller's result is the net sale against what was actually paid).
 *
 * The preview below the fields is the same arithmetic the dashboard shows afterwards, so there is
 * nothing to discover after confirming.
 */
import React, { useState } from "react";
import { AlertCircle, Handshake, Loader2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/DateInput";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, type NewInvestment } from "@/lib/new-investments";

interface Props {
    open: boolean;
    onClose: () => void;
    investment: NewInvestment;
    /** What was actually paid so far — the base the gain is measured against. */
    paidToDate: number;
    onSell: (input: { sold_on: string; sale_price: string; sale_costs_pct: string }) => Promise<string | null>;
}

const parseMoney = (v: string): number | null => {
    const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return v.trim() && Number.isFinite(n) ? n : null;
};
const parsePct = (v: string): number => {
    const n = Number(v.replace("%", "").replace(",", ".").trim());
    return v.trim() && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

export default function InvestmentSellModal({ open, onClose, investment, paidToDate, onSell }: Props) {
    return (
        <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="inline-flex items-center gap-2"><Handshake className="w-5 h-5 text-emerald-600" /> Registrar venda</DialogTitle>
                    <DialogDescription>
                        O projeto termina aqui: o ganho é a venda líquida contra o que você pagou até agora. As parcelas em
                        aberto passam ao comprador e deixam de contar.
                    </DialogDescription>
                </DialogHeader>
                {open && <SellForm investment={investment} paidToDate={paidToDate} onSell={onSell} onClose={onClose} />}
            </DialogContent>
        </Dialog>
    );
}

function SellForm({ investment, paidToDate, onSell, onClose }: Omit<Props, "open">) {
    const [form, setForm] = useState({
        sold_on: investment.sold_on ?? new Date().toISOString().slice(0, 10),
        sale_price: investment.sale_price !== null ? String(investment.sale_price).replace(".", ",") : "",
        sale_costs_pct: investment.sale_costs_pct ? String(investment.sale_costs_pct).replace(".", ",") : "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const price = parseMoney(form.sale_price);
    const costsPct = parsePct(form.sale_costs_pct);
    const net = price !== null ? Math.round(price * (1 - costsPct / 100) * 100) / 100 : null;
    const gain = net !== null ? net - paidToDate : null;

    const submit = async () => {
        if (!form.sold_on) { setError("Informe a data da venda."); return; }
        if (price === null || price <= 0) { setError("Informe o preço de venda."); return; }
        setSaving(true);
        setError(null);
        const problem = await onSell(form);
        setSaving(false);
        if (problem) setError(problem);
        else onClose();
    };

    return (
        <>
            <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <Label htmlFor="sell-date">Data da venda</Label>
                        <DateInput id="sell-date" value={form.sold_on} onChange={iso => setForm(f => ({ ...f, sold_on: iso }))} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="sell-price">Preço de venda (R$)</Label>
                        <Input id="sell-price" inputMode="decimal" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="320.000" autoFocus />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="sell-costs">Custos da venda (%)</Label>
                        <Input id="sell-costs" inputMode="decimal" value={form.sale_costs_pct} onChange={e => setForm(f => ({ ...f, sale_costs_pct: e.target.value }))} placeholder="6" title="Corretagem (em geral 5–6%), certidões e imposto de renda sobre o ganho, como % do preço" />
                    </div>
                </div>

                <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                    <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Venda líquida</dt>
                        <dd className="font-semibold tabular-nums">{net !== null ? formatBRL(net, 0) : "—"}</dd>
                        {price !== null && costsPct > 0 && <dd className="text-[10px] text-muted-foreground tabular-nums">− {formatBRL(price - net!, 0)} de custos</dd>}
                    </div>
                    <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Pago até agora</dt>
                        <dd className="font-semibold tabular-nums">{formatBRL(paidToDate, 0)}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Ganho</dt>
                        <dd className={`font-semibold tabular-nums ${gain === null ? "" : gain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {gain !== null ? `${gain > 0 ? "+" : ""}${formatBRL(gain, 0)}${paidToDate > 0 ? ` (${((gain / paidToDate) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%)` : ""}` : "—"}
                        </dd>
                    </div>
                </dl>

                {error && (
                    <p className="flex items-start gap-2 text-sm text-rose-600">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                    </p>
                )}
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                <Button onClick={submit} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Registrar venda
                </Button>
            </DialogFooter>
        </>
    );
}
