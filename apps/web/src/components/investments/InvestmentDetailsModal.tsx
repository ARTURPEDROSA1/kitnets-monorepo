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
 */
import React, { useState } from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INVESTMENT_KIND_LABELS, type InvestmentKind, type NewInvestment } from "@/lib/new-investments";

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
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm(prev => ({ ...prev, [key]: value }));

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
        });
        setSaving(false);
        if (ok) onClose();
        else setError("Não foi possível salvar os dados do investimento.");
    };

    return (
        <>
            <div className="space-y-3 min-w-0">
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
