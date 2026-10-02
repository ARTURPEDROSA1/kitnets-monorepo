"use client";

/**
 * The owner's billing decisions: how long before the due date an invoice goes out, the late fee and
 * the interest it states, and how long after the due date it still takes the payment. Each one is the
 * owner's to make — a blank field means "not decided" and nothing is assumed in its place: an invoice
 * created meanwhile simply states no late terms.
 */
import React, { useState } from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BillingSettingsView } from "@/lib/invoice-views";

interface Props {
    settings: BillingSettingsView;
    onSaved: (settings: BillingSettingsView) => void;
}

type Field = keyof BillingSettingsView;

const FIELDS: Array<{ key: Field; label: string; suffix: string; placeholder: string; help: string; decimal: boolean }> = [
    { key: "days_in_advance", label: "Antecedência da emissão", suffix: "dias antes do vencimento", placeholder: "a decidir", decimal: false, help: "Quantos dias antes do vencimento a fatura sai para o inquilino, quando a emissão automática estiver ligada. De 1 a 25." },
    { key: "fine_pct", label: "Multa por atraso", suffix: "% do valor", placeholder: "a decidir", decimal: true, help: "Cobrada uma vez sobre o valor da fatura paga depois do vencimento. Use a multa prevista no contrato de locação." },
    { key: "interest_pct_month", label: "Juros de mora", suffix: "% ao mês", placeholder: "a decidir", decimal: true, help: "Calculados por dia de atraso (pro rata). Use os juros previstos no contrato de locação." },
    { key: "days_payable_after_due", label: "Pagamento após o vencimento", suffix: "dias", placeholder: "a decidir", decimal: false, help: "Por quantos dias depois do vencimento o boleto e o PIX ainda aceitam o pagamento (com multa e juros). De 0 a 60." },
];

const show = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

export default function BillingSettingsPanel({ settings, onSaved }: Props) {
    const [form, setForm] = useState<Record<Field, string>>(() => ({
        days_in_advance: show(settings.days_in_advance),
        fine_pct: show(settings.fine_pct),
        interest_pct_month: show(settings.interest_pct_month),
        days_payable_after_due: show(settings.days_payable_after_due),
    }));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const save = async () => {
        setSaving(true);
        setSaved(false);
        setErrors({});
        try {
            const res = await fetch("/api/faturas/configuracoes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setErrors(json.errors ?? { _form: typeof json.error === "string" ? json.error : "Erro ao salvar a configuração." });
                return;
            }
            onSaved(json.settings as BillingSettingsView);
            setSaved(true);
        } catch {
            setErrors({ _form: "Erro de conexão. Tente novamente." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="border-b border-border/60 px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">Condições de cobrança</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Valem para as faturas criadas a partir de agora. Um campo em branco fica como &ldquo;a decidir&rdquo;: nenhum valor é presumido no lugar.
                </p>
            </header>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
                {FIELDS.map(f => (
                    <div key={f.key}>
                        <Label htmlFor={`billing-${f.key}`} className="text-xs">{f.label}</Label>
                        <div className="mt-1 flex items-center gap-2">
                            <Input
                                id={`billing-${f.key}`}
                                value={form[f.key]}
                                onChange={e => { setSaved(false); setForm(prev => ({ ...prev, [f.key]: e.target.value.replace(f.decimal ? /[^\d.,]/g : /\D/g, "") })); }}
                                inputMode={f.decimal ? "decimal" : "numeric"}
                                placeholder={f.placeholder}
                                className="h-9 w-28"
                                aria-invalid={Boolean(errors[f.key])}
                            />
                            <span className="text-xs text-muted-foreground">{f.suffix}</span>
                        </div>
                        {errors[f.key]
                            ? <p className="mt-1 text-xs text-rose-600">{errors[f.key]}</p>
                            : <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
                    </div>
                ))}
            </div>
            <footer className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-3">
                <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar
                </Button>
                {saved && <span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">Configuração salva.</span>}
                {errors._form && <span className="inline-flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5" /> {errors._form}</span>}
            </footer>
        </section>
    );
}
