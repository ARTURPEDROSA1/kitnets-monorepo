"use client";

/**
 * The owner's billing decisions: how long before the due date an invoice goes out, the late fee and
 * the interest it states, how long after the due date it still takes the payment, how the tenant sees
 * the sender of the e-mails, and whether the daily run does it all on its own. Each one is the owner's
 * to make — a blank field means "not decided" and nothing is assumed in its place: an invoice created
 * meanwhile simply states no late terms, and the automation cannot be switched on until every decision
 * it needs is made.
 */
import React, { useState } from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BillingSettingsView } from "@/lib/invoice-views";

interface Props {
    settings: BillingSettingsView;
    /** the server can e-mail (RESEND_API_KEY and BILLING_EMAIL_FROM set) */
    emailAvailable?: boolean;
    onSaved: (settings: BillingSettingsView) => void;
}

type NumberField = "days_in_advance" | "fine_pct" | "interest_pct_month" | "days_payable_after_due";
type Form = Record<NumberField | "sender_name" | "reply_to_email" | "automation_from_month", string> & { automation_enabled: boolean };

const FIELDS: Array<{ key: NumberField; label: string; suffix: string; placeholder: string; help: string; decimal: boolean }> = [
    { key: "days_in_advance", label: "Antecedência da emissão", suffix: "dias antes do vencimento", placeholder: "a decidir", decimal: false, help: "Quantos dias antes do vencimento a fatura sai para o inquilino, quando a emissão automática estiver ligada. De 1 a 25." },
    { key: "fine_pct", label: "Multa por atraso", suffix: "% do valor", placeholder: "a decidir", decimal: true, help: "Cobrada uma vez sobre o valor da fatura paga depois do vencimento. Use a multa prevista no contrato de locação." },
    { key: "interest_pct_month", label: "Juros de mora", suffix: "% ao mês", placeholder: "a decidir", decimal: true, help: "Calculados por dia de atraso (pro rata). Use os juros previstos no contrato de locação." },
    { key: "days_payable_after_due", label: "Pagamento após o vencimento", suffix: "dias", placeholder: "a decidir", decimal: false, help: "Por quantos dias depois do vencimento o boleto e o PIX ainda aceitam o pagamento (com multa e juros). De 0 a 60." },
];

const show = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

export default function BillingSettingsPanel({ settings, emailAvailable = true, onSaved }: Props) {
    const [form, setForm] = useState<Form>(() => ({
        days_in_advance: show(settings.days_in_advance),
        fine_pct: show(settings.fine_pct),
        interest_pct_month: show(settings.interest_pct_month),
        days_payable_after_due: show(settings.days_payable_after_due),
        sender_name: settings.sender_name ?? "",
        reply_to_email: settings.reply_to_email ?? "",
        automation_enabled: settings.automation_enabled,
        automation_from_month: settings.automation_from_month ?? "",
    }));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const set = <K extends keyof Form>(key: K, value: Form[K]) => { setSaved(false); setForm(prev => ({ ...prev, [key]: value })); };
    const decided = FIELDS.every(f => form[f.key].trim() !== "") && form.automation_from_month.trim() !== "";

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

    const error = (key: string, help: string) => errors[key]
        ? <p className="mt-1 text-xs text-rose-600">{errors[key]}</p>
        : <p className="mt-1 text-xs text-muted-foreground">{help}</p>;

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
                                onChange={e => set(f.key, e.target.value.replace(f.decimal ? /[^\d.,]/g : /\D/g, ""))}
                                inputMode={f.decimal ? "decimal" : "numeric"}
                                placeholder={f.placeholder}
                                className="h-9 w-28"
                                aria-invalid={Boolean(errors[f.key])}
                            />
                            <span className="text-xs text-muted-foreground">{f.suffix}</span>
                        </div>
                        {error(f.key, f.help)}
                    </div>
                ))}
            </div>

            <div className="border-t border-border/60 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail ao inquilino</h3>
                {!emailAvailable && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertCircle className="h-3.5 w-3.5" /> O envio de e-mail ainda não está configurado neste servidor: as faturas ficam emitidas, mas não são enviadas.</p>
                )}
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="billing-sender_name" className="text-xs">Nome do remetente</Label>
                        <Input id="billing-sender_name" value={form.sender_name} onChange={e => set("sender_name", e.target.value)} placeholder="nome da holding" className="mt-1 h-9" maxLength={80} aria-invalid={Boolean(errors.sender_name)} />
                        {error("sender_name", "Como o inquilino vê quem enviou: “<nome> via Kitnets”. Em branco, o nome da holding.")}
                    </div>
                    <div>
                        <Label htmlFor="billing-reply_to_email" className="text-xs">E-mail para respostas</Label>
                        <Input id="billing-reply_to_email" type="email" value={form.reply_to_email} onChange={e => set("reply_to_email", e.target.value)} placeholder="o e-mail do seu cadastro" className="mt-1 h-9" maxLength={120} aria-invalid={Boolean(errors.reply_to_email)} />
                        {error("reply_to_email", "Para onde vai a resposta do inquilino. Em branco, o e-mail do seu cadastro.")}
                    </div>
                </div>
            </div>

            <div className="border-t border-border/60 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emissão automática</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border accent-emerald-600"
                                checked={form.automation_enabled}
                                disabled={!decided && !form.automation_enabled}
                                onChange={e => set("automation_enabled", e.target.checked)}
                                aria-invalid={Boolean(errors.automation_enabled)}
                            />
                            Gerar, emitir e enviar as faturas todo dia
                        </label>
                        {error("automation_enabled", decided
                            ? "Todo dia às 8h o Kitnets cria as faturas que vencem dentro da antecedência, emite o boleto e o PIX no banco e envia o e-mail ao inquilino."
                            : "Decida as quatro condições acima e o mês inicial para poder ligar.")}
                    </div>
                    <div>
                        <Label htmlFor="billing-automation_from_month" className="text-xs">A partir do mês</Label>
                        <Input id="billing-automation_from_month" type="month" value={form.automation_from_month} onChange={e => set("automation_from_month", e.target.value)} className="mt-1 h-9 w-44" aria-invalid={Boolean(errors.automation_from_month)} />
                        {error("automation_from_month", "Meses anteriores nunca são criados pela automação; gere-os à mão se precisar.")}
                    </div>
                </div>
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
