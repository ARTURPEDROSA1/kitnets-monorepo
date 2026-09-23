"use client";

/**
 * The pencil next to the title: what the investment *is*, as opposed to what it costs.
 *
 * Creation takes these from the contract — and the AI guesses the type from its wording, so a
 * studio sold as "unidade autônoma" lands on Apartamento and a garage on Outro. Until now none of
 * it could be corrected: the type shown on the card and the name on every screen were whatever the
 * import decided.
 *
 * The address is edited as the one line it is stored as, rather than being split back into street,
 * number and neighbourhood — that split is lossy, and re-splitting it to show it here would quietly
 * drop whatever did not fit.
 *
 * The second block is what the contract never says: what the unit should be worth at delivery
 * (typed, or area × a market R$/m²) and how far the works are. Both feed the "Valorização" and
 * "Chaves" tiles.
 */
import React, { useState } from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/DateInput";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INVESTMENT_KIND_LABELS, formatBRL, type InvestmentKind, type NewInvestment } from "@/lib/new-investments";

interface Props {
    open: boolean;
    onClose: () => void;
    investment: NewInvestment;
    onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}

/** Mounted only while open, so a cancelled edit dies with the unmount. */
export default function InvestmentDetailsModal({ open, onClose, investment, onSave }: Props) {
    return (
        <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Dados do investimento</DialogTitle>
                    <DialogDescription>
                        Nome, unidade, tipo e endereço — o que aparece no card e no cabeçalho do painel. Os valores e as
                        parcelas ficam em &ldquo;Plano de pagamento&rdquo;.
                    </DialogDescription>
                </DialogHeader>
                {open && <DetailsForm investment={investment} onSave={onSave} onClose={onClose} />}
            </DialogContent>
        </Dialog>
    );
}

const numberOrEmpty = (v: number | null): string => (v === null ? "" : String(v).replace(".", ","));
/** "27,5" → 27.5; blank → null. The API accepts the string too, but the preview below wants the number. */
const parseDecimal = (v: string): number | null => {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return v.trim() && Number.isFinite(n) ? n : null;
};

function DetailsForm({ investment, onSave, onClose }: Omit<Props, "open">) {
    const [form, setForm] = useState({
        name: investment.name,
        unit_label: investment.unit_label ?? "",
        kind: investment.kind,
        developer: investment.developer ?? "",
        address: investment.address ?? "",
        city: investment.city ?? "",
        state: investment.state ?? "",
        postal_code: investment.zip ?? "",
        description: investment.description ?? "",
        area_m2: numberOrEmpty(investment.area_m2),
        market_m2_price: numberOrEmpty(investment.market_m2_price),
        estimated_value_at_delivery: numberOrEmpty(investment.estimated_value_at_delivery),
        construction_pct: numberOrEmpty(investment.construction_pct),
        construction_updated_on: investment.construction_updated_on ?? "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm(prev => ({ ...prev, [key]: value }));

    const area = parseDecimal(form.area_m2);
    const m2 = parseDecimal(form.market_m2_price);
    const byArea = area && m2 ? area * m2 : null;

    const save = async () => {
        if (!form.name.trim()) {
            setError("Informe o nome do empreendimento.");
            return;
        }
        setSaving(true);
        setError(null);
        const blank = (v: string) => (v.trim() ? v.trim() : null);
        const ok = await onSave({
            name: form.name.trim(),
            unit_label: blank(form.unit_label),
            kind: form.kind,
            developer: blank(form.developer),
            address: blank(form.address),
            city: blank(form.city),
            state: blank(form.state),
            postal_code: blank(form.postal_code),
            description: blank(form.description),
            area_m2: blank(form.area_m2),
            market_m2_price: blank(form.market_m2_price),
            estimated_value_at_delivery: blank(form.estimated_value_at_delivery),
            construction_pct: blank(form.construction_pct),
            construction_updated_on: blank(form.construction_updated_on),
        });
        setSaving(false);
        if (ok) onClose();
        else setError("Não foi possível salvar os dados do investimento.");
    };

    return (
        <>
            <div className="space-y-4 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1 lg:col-span-2">
                        <Label htmlFor="details-name">Empreendimento *</Label>
                        <Input id="details-name" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Sun Place Home Clube" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="details-unit">Unidade</Label>
                        <Input id="details-unit" value={form.unit_label} onChange={e => set("unit_label", e.target.value)} placeholder="Studio 204" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="details-kind">Tipo</Label>
                        <select
                            id="details-kind"
                            value={form.kind}
                            onChange={e => set("kind", e.target.value as InvestmentKind)}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            {(Object.keys(INVESTMENT_KIND_LABELS) as InvestmentKind[]).map(k => (
                                <option key={k} value={k}>{INVESTMENT_KIND_LABELS[k]}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1 lg:col-span-2">
                        <Label htmlFor="details-developer">Construtora</Label>
                        <Input id="details-developer" value={form.developer} onChange={e => set("developer", e.target.value)} placeholder="Rofran Construtora" />
                    </div>
                    <div className="space-y-1 lg:col-span-2">
                        <Label htmlFor="details-address">Endereço</Label>
                        <Input id="details-address" value={form.address} onChange={e => set("address", e.target.value)} placeholder="Avenida Nereu Ramos, 4077 - Meia Praia" />
                    </div>
                    <div className="space-y-1 lg:col-span-2">
                        <Label htmlFor="details-city">Cidade</Label>
                        <Input id="details-city" value={form.city} onChange={e => set("city", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="details-state">UF</Label>
                        <Input id="details-state" maxLength={2} value={form.state} onChange={e => set("state", e.target.value.toUpperCase())} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="details-cep">CEP</Label>
                        <Input id="details-cep" inputMode="numeric" value={form.postal_code} onChange={e => set("postal_code", e.target.value)} placeholder="88220-000" />
                    </div>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="details-description">Descrição</Label>
                    <Input id="details-description" value={form.description} onChange={e => set("description", e.target.value)} placeholder="Studio mobiliado com vaga, frente mar" />
                </div>

                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Valorização e obra</h3>
                        <p className="text-xs text-muted-foreground">
                            O contrato não diz quanto a unidade vai valer. Informe a área e um R$/m² de mercado (anúncios do
                            prédio ou da rua) ou direto o valor esperado na entrega; e o andamento que a construtora informa.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="details-area">Área privativa (m²)</Label>
                            <Input id="details-area" inputMode="decimal" value={form.area_m2} onChange={e => set("area_m2", e.target.value)} placeholder="27,5" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="details-m2">R$/m² de mercado</Label>
                            <Input id="details-m2" inputMode="decimal" value={form.market_m2_price} onChange={e => set("market_m2_price", e.target.value)} placeholder="11.000" />
                        </div>
                        <div className="space-y-1 col-span-2">
                            <Label htmlFor="details-value">Valor esperado na entrega (R$)</Label>
                            <Input
                                id="details-value"
                                inputMode="decimal"
                                value={form.estimated_value_at_delivery}
                                onChange={e => set("estimated_value_at_delivery", e.target.value)}
                                placeholder={byArea ? formatBRL(byArea, 0) : "320.000"}
                            />
                            <p className="text-[11px] text-muted-foreground">
                                {byArea
                                    ? `Em branco, vale área × R$/m² = ${formatBRL(byArea, 0)}.`
                                    : "Em branco, vale área × R$/m² quando os dois estiverem preenchidos."}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="details-works">Andamento da obra (%)</Label>
                            <Input id="details-works" inputMode="decimal" value={form.construction_pct} onChange={e => set("construction_pct", e.target.value)} placeholder="35" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="details-works-on">Informado em</Label>
                            <DateInput id="details-works-on" value={form.construction_updated_on} onChange={iso => set("construction_updated_on", iso)} />
                        </div>
                    </div>
                </div>

                {error && (
                    <p className="flex items-start gap-2 text-sm text-rose-600">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                    </p>
                )}
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar dados
                </Button>
            </DialogFooter>
        </>
    );
}
