"use client";

/**
 * The owner's billing decisions, one card per subject so each stands apart: what the boleto and the
 * Pix charge a late payer, the card fee passed on, the e-mails to the tenant (sender, reminders,
 * receipt), and the daily run that does it all on its own. Each decision is the owner's to make — a
 * blank field means "not decided" and nothing is assumed in its place: an invoice created meanwhile
 * states no late terms (it takes them when it is issued), no card is offered without its fee, and the
 * automation cannot be switched on until every decision it needs is made. One "Salvar" for all.
 */
import React, { useState } from "react";
import { AlertCircle, CalendarClock, CreditCard, Landmark, Loader2, Mail, Save } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BillingSettingsView } from "@/lib/invoice-views";

interface Props {
    settings: BillingSettingsView;
    /** the server can e-mail (RESEND_API_KEY and BILLING_EMAIL_FROM set) */
    emailAvailable?: boolean;
    onSaved: (settings: BillingSettingsView) => void;
}

type NumberField = "days_in_advance" | "fine_pct" | "interest_pct_month" | "days_payable_after_due" | "card_fee_pct" | "card_fee_fixed" | "reminder_days_before" | "overdue_notice_days";
type Form = Record<NumberField | "sender_name" | "reply_to_email" | "automation_from_month", string> & { automation_enabled: boolean; send_receipts: boolean };

/** what the automation needs decided before it can be switched on (the table's CHECK and the schema say the same) */
const AUTOMATION_NEEDS: NumberField[] = ["days_in_advance", "fine_pct", "interest_pct_month", "days_payable_after_due"];

const show = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

const TONES = {
    orange: { bar: "border-l-orange-400", icon: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" },
    violet: { bar: "border-l-violet-400", icon: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
    sky: { bar: "border-l-sky-400", icon: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
    emerald: { bar: "border-l-emerald-500", icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
} as const;

/** One subject of the settings: its own card, a coloured edge and a header, so it cannot be mistaken for the next. */
function Group({ tone, icon, title, description, children }: { tone: keyof typeof TONES; icon: React.ReactNode; title: string; description: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className={cn("overflow-hidden rounded-xl border border-l-4 border-border/80 bg-card", TONES[tone].bar)}>
            <header className="flex items-start gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
                <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONES[tone].icon)}>{icon}</span>
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                </div>
            </header>
            <div className="p-4">{children}</div>
        </section>
    );
}

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
        card_fee_pct: show(settings.card_fee_pct),
        card_fee_fixed: show(settings.card_fee_fixed),
        reminder_days_before: show(settings.reminder_days_before),
        overdue_notice_days: show(settings.overdue_notice_days),
        send_receipts: settings.send_receipts !== false,
    }));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const set = <K extends keyof Form>(key: K, value: Form[K]) => { setSaved(false); setForm(prev => ({ ...prev, [key]: value })); };
    const decided = AUTOMATION_NEEDS.every(k => form[k].trim() !== "") && form.automation_from_month.trim() !== "";

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

    const hint = (key: string, help: string) => errors[key]
        ? <p className="mt-1 text-xs text-rose-600">{errors[key]}</p>
        : <p className="mt-1 text-xs text-muted-foreground">{help}</p>;

    /** A number the owner decides: blank = "a decidir". */
    const number = (key: NumberField, label: string, suffix: string, help: string, opts: { decimal?: boolean; prefix?: string } = {}) => (
        <div>
            <Label htmlFor={`billing-${key}`} className="text-xs">{label}</Label>
            <div className="mt-1 flex items-center gap-2">
                {opts.prefix && <span className="text-xs text-muted-foreground">{opts.prefix}</span>}
                <Input
                    id={`billing-${key}`}
                    value={form[key]}
                    onChange={e => set(key, e.target.value.replace(opts.decimal ? /[^\d.,]/g : /\D/g, ""))}
                    inputMode={opts.decimal ? "decimal" : "numeric"}
                    placeholder="a decidir"
                    className="h-9 w-28"
                    aria-invalid={Boolean(errors[key])}
                />
                <span className="text-xs text-muted-foreground">{suffix}</span>
            </div>
            {hint(key, help)}
        </div>
    );
    const anyError = Object.keys(errors).some(k => k !== "_form");

    return (
        <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
                Suas decisões de cobrança, por assunto. Um campo em branco fica como &ldquo;a decidir&rdquo;: nenhum valor é presumido no lugar. Valem para as faturas criadas a partir de agora; o botão Salvar, no fim, grava tudo de uma vez.
            </p>

            <Group tone="orange" icon={<Landmark className="h-4 w-4" />} title="Boleto e PIX"
                description="O que o boleto e o PIX cobram de quem paga depois do vencimento, e até quando ainda aceitam o pagamento. Use o que está no contrato de locação.">
                <div className="grid gap-4 sm:grid-cols-3">
                    {number("fine_pct", "Multa por atraso", "% do valor", "Cobrada uma vez sobre o valor da fatura paga depois do vencimento.", { decimal: true })}
                    {number("interest_pct_month", "Juros de mora", "% ao mês", "Calculados por dia de atraso (pro rata).", { decimal: true })}
                    {number("days_payable_after_due", "Pagamento após o vencimento", "dias", "Por quantos dias depois do vencimento o boleto e o PIX ainda aceitam o pagamento, com multa e juros. De 0 a 60.")}
                </div>
            </Group>

            <Group tone="violet" icon={<CreditCard className="h-4 w-4" />} title="Cartão de crédito"
                description="A tarifa que a sua conta Stripe cobra de você, somada à fatura paga por cartão para que você receba o valor cheio. Consulte-a no painel da Stripe (Configurações → Tarifas). Em branco, o cartão não é oferecido ao inquilino.">
                <div className="grid gap-4 sm:grid-cols-3">
                    {number("card_fee_pct", "Taxa do cartão", "% do valor cobrado", "A parte percentual da tarifa por transação.", { decimal: true })}
                    {number("card_fee_fixed", "Parte fixa", "por pagamento", "A parte fixa da tarifa por transação. Zero é uma resposta; em branco não é.", { decimal: true, prefix: "R$" })}
                </div>
            </Group>

            <Group tone="sky" icon={<Mail className="h-4 w-4" />} title="E-mail ao inquilino"
                description="Quem aparece como remetente da fatura, para onde vai a resposta, e os avisos que saem além da própria fatura.">
                {!emailAvailable && (
                    <p className="mb-3 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertCircle className="h-3.5 w-3.5" /> O envio de e-mail ainda não está configurado neste servidor: as faturas ficam emitidas, mas não são enviadas.</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="billing-sender_name" className="text-xs">Nome do remetente</Label>
                        <Input id="billing-sender_name" value={form.sender_name} onChange={e => set("sender_name", e.target.value)} placeholder="nome da holding" className="mt-1 h-9" maxLength={80} aria-invalid={Boolean(errors.sender_name)} />
                        {hint("sender_name", "Como o inquilino vê quem enviou: “<nome> via Kitnets”. Em branco, o nome da holding.")}
                    </div>
                    <div>
                        <Label htmlFor="billing-reply_to_email" className="text-xs">E-mail para respostas</Label>
                        <Input id="billing-reply_to_email" type="email" value={form.reply_to_email} onChange={e => set("reply_to_email", e.target.value)} placeholder="o e-mail do seu cadastro" className="mt-1 h-9" maxLength={120} aria-invalid={Boolean(errors.reply_to_email)} />
                        {hint("reply_to_email", "Para onde vai a resposta do inquilino. Em branco, o e-mail do seu cadastro.")}
                    </div>
                </div>
                <h3 className="mt-5 border-t border-border/60 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lembretes e recibo</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {number("reminder_days_before", "Lembrete antes do vencimento", "dias antes", "Um e-mail lembrando a fatura ainda não paga, uma vez, tantos dias antes do vencimento. Em branco, nenhum lembrete. De 1 a 15.")}
                    {number("overdue_notice_days", "Aviso de atraso", "dias depois do vencimento", "Um e-mail avisando que a fatura venceu, com multa e juros do dia, uma vez, tantos dias depois. Em branco, nenhum aviso. De 1 a 30.")}
                    <div className="sm:col-span-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                            <input type="checkbox" className="h-4 w-4 rounded border-border accent-emerald-600" checked={form.send_receipts} onChange={e => set("send_receipts", e.target.checked)} />
                            Enviar recibo por e-mail quando a fatura for paga
                        </label>
                        {hint("send_receipts", "Vale para pagamento por boleto, PIX, cartão e para a baixa manual.")}
                    </div>
                </div>
            </Group>

            <Group tone="emerald" icon={<CalendarClock className="h-4 w-4" />} title="Emissão automática"
                description="Todo dia às 8h o Kitnets cria as faturas que vencem dentro da antecedência, emite o boleto e o PIX no banco e envia o e-mail ao inquilino. Desligada, cada passo é seu: Gerar faturas, Emitir, Enviar.">
                <div className="grid gap-4 sm:grid-cols-3">
                    {number("days_in_advance", "Antecedência da emissão", "dias antes do vencimento", "Quantos dias antes do vencimento a fatura sai para o inquilino. De 1 a 25.")}
                    <div>
                        <Label htmlFor="billing-automation_from_month" className="text-xs">A partir do mês</Label>
                        <Input id="billing-automation_from_month" type="month" value={form.automation_from_month} onChange={e => set("automation_from_month", e.target.value)} className="mt-1 h-9 w-44" aria-invalid={Boolean(errors.automation_from_month)} />
                        {hint("automation_from_month", "Meses anteriores nunca são criados pela automação; gere-os à mão se precisar.")}
                    </div>
                    <div>
                        <span className="block text-xs font-medium text-foreground">Ligar</span>
                        <label className={cn("mt-1 inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground", !decided && !form.automation_enabled && "cursor-not-allowed opacity-60")}>
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
                        {hint("automation_enabled", decided
                            ? form.automation_enabled ? "Ligada: o ciclo roda sozinho todo dia às 8h." : "Tudo decidido: marque e salve para ligar."
                            : "Decida multa, juros e prazo (Boleto e PIX), a antecedência e o mês inicial para poder ligar.")}
                    </div>
                </div>
            </Group>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/80 bg-card px-4 py-3">
                <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar
                </Button>
                {saved && <span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">Configuração salva.</span>}
                {errors._form && <span className="inline-flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5" /> {errors._form}</span>}
                {anyError && !errors._form && <span className="inline-flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5" /> Há campos a corrigir acima.</span>}
            </div>
        </div>
    );
}
