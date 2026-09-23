"use client";

/**
 * The gear on the dashboard: the contract's quadro resumo, after the fact.
 *
 * Creation reads the plan from the contract once, but a plan does not stay still — the delivery
 * slips, the developer renegotiates, a block was read wrong, or the contract is amended. This is
 * where that is fixed, and it is the only way to change the forecast: the blocks drive "próximas
 * parcelas", "falta pagar" and the hollow bars of the cash-flow chart.
 *
 * The blocks are replaced as a whole (PATCH `schedules`), never patched one by one, which is why
 * the dialog holds a draft and saves once.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/DateInput";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import InvestmentScheduleEditor, { INDEX_CODES, type ScheduleDraft, scheduleTotal } from "./InvestmentScheduleEditor";
import {
    INDEX_LABELS,
    expandSchedules,
    formatBRL,
    type IndexCode,
    type InvestmentSchedule,
    type NewInvestment,
} from "@/lib/new-investments";
import { formatMonthLabel } from "@/lib/new-investment-cashflow";

interface Props {
    open: boolean;
    onClose: () => void;
    investment: NewInvestment;
    schedules: InvestmentSchedule[];
    /** How many payments are already recorded — changing the plan does not touch them. */
    paymentCount: number;
    onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}

const toDraft = (s: InvestmentSchedule): ScheduleDraft => ({
    label: s.label,
    kind: s.kind,
    installments: s.installments,
    amount: s.amount,
    first_due_on: s.first_due_on,
    periodicity: s.periodicity,
    index_code: s.index_code,
});

const moneyText = (v: number | null | undefined) => (v == null || v === 0 ? "" : String(v));

/**
 * The dialog is a shell; the form below is mounted only while it is open and seeds its state from
 * the props once. That is what makes a cancelled edit leave nothing behind — the draft dies with
 * the unmount, instead of being synced back from an effect on every open.
 */
export default function InvestmentPlanModal({ open, onClose, investment, schedules, paymentCount, onSave }: Props) {
    return (
        <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Plano de pagamento</DialogTitle>
                    <DialogDescription>
                        O quadro resumo do contrato. Ele define a previsão de parcelas: o que falta pagar, as próximas
                        parcelas e as barras vazadas do gráfico.
                    </DialogDescription>
                </DialogHeader>
                {open && (
                    <PlanForm
                        investment={investment}
                        schedules={schedules}
                        paymentCount={paymentCount}
                        onSave={onSave}
                        onClose={onClose}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function PlanForm({ investment, schedules, paymentCount, onSave, onClose }: Omit<Props, "open">) {
    const [drafts, setDrafts] = useState<ScheduleDraft[]>(() => schedules.map(toDraft));
    const [header, setHeader] = useState({
        total_price: moneyText(investment.total_price),
        down_payment: moneyText(investment.down_payment),
        financed_amount: moneyText(investment.financed_amount),
        contract_date: investment.contract_date ?? "",
        keys_expected_on: investment.keys_expected_on ?? "",
        index_before_keys: investment.index_before_keys,
        index_after_keys: investment.index_after_keys,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const total = useMemo(() => scheduleTotal(drafts), [drafts]);
    const contractPrice = Number(header.total_price.replace(/\./g, "").replace(",", ".")) || 0;
    const difference = contractPrice > 0 ? total - contractPrice : 0;

    // What the plan will look like once saved: the reader's sanity check before committing.
    const preview = useMemo(() => {
        const expanded = expandSchedules(
            drafts
                .filter(s => s.first_due_on)
                .map((s, i) => ({ ...s, id: `draft-${i}`, investment_id: investment.id, position: i }))
        );
        if (expanded.length === 0) return null;
        return {
            count: expanded.length,
            first: expanded[0].dueOn.slice(0, 7),
            last: expanded[expanded.length - 1].dueOn.slice(0, 7),
        };
    }, [drafts, investment.id]);

    const set = <K extends keyof typeof header>(key: K, value: (typeof header)[K]) =>
        setHeader(prev => ({ ...prev, [key]: value }));

    const save = async () => {
        const missing = drafts.some(s => !s.first_due_on);
        if (missing) {
            setError("Informe o primeiro vencimento de cada bloco.");
            return;
        }
        setSaving(true);
        setError(null);
        const ok = await onSave({
            total_price: header.total_price || 0,
            down_payment: header.down_payment || 0,
            financed_amount: header.financed_amount || 0,
            contract_date: header.contract_date || null,
            keys_expected_on: header.keys_expected_on || null,
            index_before_keys: header.index_before_keys,
            index_after_keys: header.index_after_keys,
            schedules: drafts.map(s => ({
                label: s.label || "Parcelas",
                kind: s.kind,
                installments: s.installments,
                amount: s.amount,
                first_due_on: s.first_due_on,
                periodicity: s.periodicity,
                index_code: s.index_code,
            })),
        });
        setSaving(false);
        if (ok) onClose();
        else setError("Não foi possível salvar o plano de pagamento.");
    };

    return (
        <>
            <div className="space-y-5 min-w-0">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                        <Label htmlFor="plan-total">Preço total (R$)</Label>
                        <Input id="plan-total" inputMode="decimal" value={header.total_price} onChange={e => set("total_price", e.target.value)} placeholder="141900,00" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="plan-down">Entrada / sinal (R$)</Label>
                        <Input id="plan-down" inputMode="decimal" value={header.down_payment} onChange={e => set("down_payment", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="plan-financed">Valor a parcelar (R$)</Label>
                        <Input id="plan-financed" inputMode="decimal" value={header.financed_amount} onChange={e => set("financed_amount", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="plan-contract-date">Data do contrato</Label>
                        <DateInput id="plan-contract-date" value={header.contract_date} onChange={iso => set("contract_date", iso)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="plan-keys">Entrega das chaves</Label>
                        <DateInput id="plan-keys" value={header.keys_expected_on} onChange={iso => set("keys_expected_on", iso)} />
                        <p className="text-[11px] text-muted-foreground">Marca a linha vertical do gráfico.</p>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="plan-index-before">Índice até as chaves</Label>
                        <select
                            id="plan-index-before"
                            value={header.index_before_keys}
                            onChange={e => set("index_before_keys", e.target.value as IndexCode)}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            {INDEX_CODES.map(c => <option key={c} value={c}>{INDEX_LABELS[c]}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="plan-index-after">Índice após as chaves</Label>
                        <select
                            id="plan-index-after"
                            value={header.index_after_keys}
                            onChange={e => set("index_after_keys", e.target.value as IndexCode)}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            {INDEX_CODES.map(c => <option key={c} value={c}>{INDEX_LABELS[c]}</option>)}
                        </select>
                    </div>
                </div>

                <InvestmentScheduleEditor
                    schedules={drafts}
                    onChange={setDrafts}
                    defaultIndex={header.index_before_keys}
                    disabled={saving}
                />

                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-1 text-xs text-muted-foreground">
                    {preview ? (
                        <p>
                            O plano passa a ter <strong className="text-foreground">{preview.count} parcelas</strong>, de{" "}
                            {formatMonthLabel(preview.first)} a {formatMonthLabel(preview.last)}, somando{" "}
                            <strong className="text-foreground tabular-nums">{formatBRL(total)}</strong>.
                        </p>
                    ) : (
                        <p>Sem blocos, o investimento fica sem previsão de parcelas: o gráfico mostra só o que já foi pago.</p>
                    )}
                    {contractPrice > 0 && Math.abs(difference) >= 0.01 && (
                        <p>
                            {difference > 0 ? "Acima" : "Abaixo"} do preço do contrato em{" "}
                            <span className="tabular-nums">{formatBRL(Math.abs(difference))}</span>. Isso é normal quando
                            o sinal foi pago fora do plano ou uma parcela já embute correção.
                        </p>
                    )}
                    {paymentCount > 0 && (
                        <p>
                            Os {paymentCount} lançamento{paymentCount === 1 ? "" : "s"} já registrado
                            {paymentCount === 1 ? "" : "s"} não são alterados. As parcelas que eles já quitaram somem da
                            previsão automaticamente, pelo mês e pelo tipo.
                        </p>
                    )}
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
                    {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar plano
                </Button>
            </DialogFooter>
        </>
    );
}
