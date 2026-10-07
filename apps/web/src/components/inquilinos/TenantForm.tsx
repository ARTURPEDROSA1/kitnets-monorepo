"use client";

/**
 * The tenant form — "Cadastrar inquilino" and "Editar inquilino" — in colour-coded sections
 * (who they are, how to reach them, where they live, who manages, current address, emergency & notes)
 * beside a sticky preview of the tenant's card with the required fields and the save buttons, the same
 * shape as the contract form (LeaseForm). The photo is not here: it goes on the tenant's dashboard,
 * which is where a saved tenant lands.
 *
 * Dates are typed as DD/MM/AAAA and sent as ISO.
 */
import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    AlertTriangle,
    ArrowLeft,
    AtSign,
    Building2,
    CalendarClock,
    CheckCircle2,
    Circle,
    Home,
    IdCard,
    Instagram,
    Linkedin,
    Loader2,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    Save,
    Search,
    ShieldAlert,
    User,
    Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy";
import { linkedinLabel, normalizeInstagram, normalizeLinkedin } from "@/lib/social-links";
import { TENANT_STATUS_META, ageOn, monthsElapsed, monthsLabel } from "@/lib/tenant-dashboard";
import { todayBRT } from "@/lib/lease-dashboard";
import type { AgencyOption, AgentOption, PropertyOption, TenantFormData, TenantStatus, TenantWithDetails } from "@/types/tenant";
import { BRAZILIAN_STATES, formatCPF, formatPhone, maskCEP, maskCPF, maskPhone, parseCEP, parseCPF, validateCEP, validateCPF, validateEmail, validatePhone } from "@/lib/validators";

type FieldErrors = Record<string, string>;

export interface TenantFormDropdowns {
    properties: PropertyOption[];
    agencies: AgencyOption[];
    agents: AgentOption[];
}

interface Props {
    /** null = creating */
    editingId: string | null;
    initial: TenantFormData;
    dropdowns: TenantFormDropdowns;
    onSaved: (tenantId: string) => void;
    onCancel: () => void;
    topSlot?: React.ReactNode;
}

// ── Date helpers (DD/MM/YYYY ↔ ISO) ─────────────────────────────────

export function maskDate(value: string): string {
    const d = value.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function parseDateBR(brDate: string): string {
    if (!brDate) return "";
    const parts = brDate.split("/");
    if (parts.length !== 3 || parts[2].length !== 4) return "";
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function formatDateBR(isoDate: string | null): string {
    if (!isoDate) return "";
    const parts = isoDate.slice(0, 10).split("-");
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function emptyTenantForm(): TenantFormData {
    return {
        full_name: "", cpf: "", main_phone: "", email: "",
        date_of_birth: "", rg: "", additional_phone: "", occupation: "", instagram: "", linkedin: "",
        postal_code: "", street: "", street_number: "", address_complement: "", neighborhood: "", city: "", state: "",
        property_id: "", use_property_address: false,
        management_type: "SELF_MANAGED", agency_id: "", agent_id: "",
        move_in_date: "", move_out_date: "", status: "ACTIVE",
        emergency_contact_name: "", emergency_contact_phone: "", notes: "",
    };
}

export function tenantToForm(tenant: TenantWithDetails): TenantFormData {
    return {
        full_name: tenant.full_name || "",
        cpf: tenant.cpf ? formatCPF(tenant.cpf) : "",
        main_phone: tenant.main_phone ? formatPhone(tenant.main_phone) : "",
        email: tenant.email || "",
        date_of_birth: formatDateBR(tenant.date_of_birth),
        rg: tenant.rg || "",
        additional_phone: tenant.additional_phone ? formatPhone(tenant.additional_phone) : "",
        occupation: tenant.occupation || "",
        instagram: tenant.instagram ? `@${tenant.instagram}` : "",
        linkedin: tenant.linkedin || "",
        postal_code: tenant.postal_code ? tenant.postal_code.replace(/(\d{5})(\d{3})/, "$1-$2") : "",
        street: tenant.street || "",
        street_number: tenant.street_number || "",
        address_complement: tenant.address_complement || "",
        neighborhood: tenant.neighborhood || "",
        city: tenant.city || "",
        state: tenant.state || "",
        property_id: tenant.property_id || "",
        use_property_address: tenant.use_property_address ?? false,
        management_type: tenant.management_type || "SELF_MANAGED",
        agency_id: tenant.agency_id || "",
        agent_id: tenant.agent_id || "",
        move_in_date: formatDateBR(tenant.move_in_date),
        move_out_date: formatDateBR(tenant.move_out_date),
        status: tenant.status || "ACTIVE",
        emergency_contact_name: tenant.emergency_contact_name || "",
        emergency_contact_phone: tenant.emergency_contact_phone ? formatPhone(tenant.emergency_contact_phone) : "",
        notes: tenant.notes || "",
    };
}

const STATUS_OPTIONS: { value: TenantStatus; label: string; hint: string; on: string }[] = [
    { value: "ACTIVE", label: "Atual", hint: "Mora no imóvel hoje.", on: "bg-emerald-600 text-white" },
    { value: "FUTURE", label: "Futuro", hint: "Ainda vai entrar.", on: "bg-sky-600 text-white" },
    { value: "FORMER", label: "Antigo", hint: "Já saiu: fica no histórico, em Antigos.", on: "bg-slate-600 text-white" },
];

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(w => w[0]).filter((_, i, all) => i === 0 || i === all.length - 1).join("").toUpperCase();

export default function TenantForm({ editingId, initial, dropdowns, onSaved, onCancel, topSlot }: Props) {
    const { properties, agencies, agents } = dropdowns;
    const [form, setForm] = useState<TenantFormData>(() => ({ ...initial }));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [cepLoading, setCepLoading] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const [cepFilled, setCepFilled] = useState(false);

    const updateField = useCallback((field: keyof TenantFormData, value: string | boolean) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setErrors(prev => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
        setSubmitError(null);
    }, []);

    const masked = (field: keyof TenantFormData, value: string, mask: (v: string) => string) => updateField(field, mask(value));

    // ── CEP auto-fill ────────────────────────────────────────────────
    const lookupCEP = useCallback(async () => {
        const digits = parseCEP(form.postal_code);
        if (!validateCEP(digits)) { setCepError("CEP deve ter 8 dígitos."); return; }
        setCepLoading(true);
        setCepError(null);
        setCepFilled(false);
        try {
            const res = await fetch(`/api/cep?code=${digits}`);
            const data = await res.json();
            if (!res.ok) { setCepError(data.error || "CEP não encontrado."); return; }
            setForm(prev => ({ ...prev, street: data.street || prev.street, neighborhood: data.neighborhood || prev.neighborhood, city: data.city || prev.city, state: data.state || prev.state }));
            setCepFilled(true);
        } catch {
            setCepError("Erro ao consultar CEP. Tente novamente.");
        } finally {
            setCepLoading(false);
        }
    }, [form.postal_code]);

    // ── Validation ───────────────────────────────────────────────────
    const validate = (): FieldErrors => {
        const errs: FieldErrors = {};
        if (!form.full_name.trim()) errs.full_name = "Nome completo é obrigatório.";
        if (!form.cpf.trim()) errs.cpf = "CPF é obrigatório.";
        else if (!validateCPF(parseCPF(form.cpf))) errs.cpf = "CPF inválido. Verifique os dígitos.";
        if (form.main_phone.trim() && !validatePhone(form.main_phone)) errs.main_phone = "Telefone inválido. Use (XX) XXXXX-XXXX.";
        if (form.email.trim() && !validateEmail(form.email)) errs.email = "E-mail inválido.";
        if (form.instagram.trim() && !normalizeInstagram(form.instagram)) errs.instagram = "Instagram inválido: use o @ ou o link do perfil.";
        if (form.linkedin.trim() && !normalizeLinkedin(form.linkedin)) errs.linkedin = "LinkedIn inválido: use o link do perfil.";
        if (!form.property_id) errs.property_id = "Selecione um imóvel.";
        if (!form.management_type) errs.management_type = "Tipo de gestão é obrigatório.";
        if (form.management_type === "AGENCY" && !form.agency_id) errs.agency_id = "Selecione a imobiliária.";
        if (form.additional_phone.trim() && !validatePhone(form.additional_phone)) errs.additional_phone = "Telefone inválido.";
        if (form.emergency_contact_phone.trim() && !validatePhone(form.emergency_contact_phone)) errs.emergency_contact_phone = "Telefone inválido.";
        if (form.postal_code.trim()) {
            const digits = parseCEP(form.postal_code);
            if (digits.length > 0 && !validateCEP(digits)) errs.postal_code = "CEP inválido (8 dígitos).";
        }
        for (const [field, label] of [["date_of_birth", "Data de nascimento"], ["move_in_date", "Data de entrada"], ["move_out_date", "Data de saída"]] as const) {
            if (form[field] && !parseDateBR(form[field])) errs[field] = `${label} inválida. Use DD/MM/AAAA.`;
        }
        return errs;
    };

    const scrollTo = (errs: FieldErrors) => {
        const first = Object.keys(errs)[0];
        if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    // ── Submit ───────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) { setErrors(errs); scrollTo(errs); return; }
        setSubmitting(true);
        setSubmitError(null);
        try {
            const payload = { ...form, date_of_birth: parseDateBR(form.date_of_birth), move_in_date: parseDateBR(form.move_in_date), move_out_date: parseDateBR(form.move_out_date) };
            const res = await fetch(editingId ? `/api/tenants/${editingId}` : "/api/tenants", {
                method: editingId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (data.errors) { setErrors(data.errors); scrollTo(data.errors); }
                else setSubmitError(data.error || "Erro ao salvar. Tente novamente.");
                return;
            }
            const id = (data.tenant?.id as string | undefined) ?? editingId;
            if (id) onSaved(id);
        } catch {
            setSubmitError("Erro de conexão. Verifique sua internet e tente novamente.");
        } finally {
            setSubmitting(false);
        }
    };

    const filteredAgents = useMemo(() => (form.agency_id ? agents.filter(a => a.agency_id === form.agency_id) : []), [agents, form.agency_id]);

    // ── What the card beside the form shows ──────────────────────────
    const today = todayBRT();
    const birth = parseDateBR(form.date_of_birth);
    const age = birth ? ageOn(birth, today) : null;
    const moveIn = parseDateBR(form.move_in_date);
    const moveOut = parseDateBR(form.move_out_date);
    const instagram = form.instagram.trim() ? normalizeInstagram(form.instagram) : null;
    const linkedin = form.linkedin.trim() ? normalizeLinkedin(form.linkedin) : null;
    const phoneOk = !!form.main_phone.trim() && validatePhone(form.main_phone);
    const property = properties.find(p => p.id === form.property_id)?.name ?? null;
    const agency = agencies.find(a => a.id === form.agency_id)?.name ?? null;
    const manager = form.management_type === "AGENCY" ? agency ?? "Imobiliária (escolha qual)" : "Gestão própria";
    const living = moveIn
        ? moveIn > today
            ? `Entra em ${formatDateBR(moveIn)}`
            : `Desde ${formatDateBR(moveIn)} · ${monthsLabel(monthsElapsed(moveIn, moveOut && moveOut < today ? moveOut : today))}`
        : null;
    const steps = [
        { label: "Nome", done: !!form.full_name.trim() },
        { label: "CPF", done: validateCPF(parseCPF(form.cpf)) },
        { label: "Imóvel", done: !!form.property_id },
        { label: "Gestão", done: form.management_type === "SELF_MANAGED" || (form.management_type === "AGENCY" && !!form.agency_id) },
    ];
    const stepsDone = steps.filter(s => s.done).length;
    const status = STATUS_OPTIONS.find(s => s.value === form.status) ?? STATUS_OPTIONS[0];
    const contacts = [
        { key: "whatsapp", on: phoneOk, icon: <MessageCircle className="h-3.5 w-3.5" />, label: "WhatsApp" },
        { key: "email", on: !!form.email.trim() && validateEmail(form.email), icon: <Mail className="h-3.5 w-3.5" />, label: "E-mail" },
        { key: "instagram", on: !!instagram, icon: <Instagram className="h-3.5 w-3.5" />, label: "Instagram" },
        { key: "linkedin", on: !!linkedin, icon: <Linkedin className="h-3.5 w-3.5" />, label: "LinkedIn" },
    ];

    // ── Render ───────────────────────────────────────────────────────
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
            {topSlot}
            <div className="flex items-start gap-3">
                <Button type="button" variant="ghost" size="icon" onClick={onCancel} disabled={submitting} aria-label="Voltar" className="mt-0.5 shrink-0">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Users className="h-6 w-6 text-emerald-600" />
                        {editingId ? "Editar inquilino" : "Cadastrar inquilino"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {editingId ? "Atualize os dados do inquilino. O cartão dele mostra como aparece em Inquilinos." : "Quem é, como falar com ele, onde mora e quem administra. O cartão do inquilino acompanha o que você preenche."}
                    </p>
                </div>
            </div>

            {submitError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {submitError}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-5">
                    {/* ── 1. Who ───────────────────────────────────── */}
                    <Section tone="violet" icon={<User className="h-4 w-4" />} title="Quem é" description="Nome, documentos e o que faz.">
                        <Field id="full_name" label="Nome completo" required error={errors.full_name}>
                            <Input id="full_name" value={form.full_name} onChange={e => updateField("full_name", e.target.value)} placeholder="Nome completo do inquilino" className={cn(inputCls, errors.full_name && "border-red-500")} />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="cpf" label="CPF" required error={errors.cpf}>
                                <Input id="cpf" inputMode="numeric" value={form.cpf} onChange={e => masked("cpf", e.target.value, maskCPF)} placeholder="000.000.000-00" className={cn(inputCls, "tabular-nums", errors.cpf && "border-red-500")} />
                            </Field>
                            <Field id="rg" label="RG / documento de identidade">
                                <IconInput icon={<IdCard className="h-4 w-4" />} id="rg" value={form.rg} onChange={e => updateField("rg", e.target.value)} placeholder="Número do RG" />
                            </Field>
                            <Field id="date_of_birth" label="Data de nascimento" error={errors.date_of_birth} hint={age !== null ? `${age} anos` : undefined}>
                                <Input id="date_of_birth" inputMode="numeric" value={form.date_of_birth} onChange={e => masked("date_of_birth", e.target.value, maskDate)} placeholder="DD/MM/AAAA" maxLength={10} className={cn(inputCls, "tabular-nums", errors.date_of_birth && "border-red-500")} />
                            </Field>
                            <Field id="occupation" label="Profissão / ocupação">
                                <Input id="occupation" value={form.occupation} onChange={e => updateField("occupation", e.target.value)} placeholder="Ex.: enfermeira, estudante" maxLength={120} className={inputCls} />
                            </Field>
                        </div>
                    </Section>

                    {/* ── 2. Contact ───────────────────────────────── */}
                    <Section tone="emerald" icon={<Phone className="h-4 w-4" />} title="Contato" description="Telefones, e-mail e redes: viram atalhos no cartão e no painel do inquilino.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="main_phone" label="Telefone principal (WhatsApp)" error={errors.main_phone} hint={phoneOk ? "Atalho do WhatsApp no cartão." : undefined}>
                                <IconInput icon={<MessageCircle className="h-4 w-4" />} id="main_phone" inputMode="tel" value={form.main_phone} onChange={e => masked("main_phone", e.target.value, maskPhone)} placeholder="(00) 00000-0000" invalid={!!errors.main_phone} />
                            </Field>
                            <Field id="additional_phone" label="Telefone adicional" error={errors.additional_phone}>
                                <IconInput icon={<Phone className="h-4 w-4" />} id="additional_phone" inputMode="tel" value={form.additional_phone} onChange={e => masked("additional_phone", e.target.value, maskPhone)} placeholder="(00) 00000-0000" invalid={!!errors.additional_phone} />
                            </Field>
                            <div className="sm:col-span-2">
                                <Field id="email" label="E-mail" error={errors.email}>
                                    <IconInput icon={<Mail className="h-4 w-4" />} id="email" type="email" inputMode="email" value={form.email} onChange={e => updateField("email", e.target.value)} placeholder="email@exemplo.com" invalid={!!errors.email} />
                                </Field>
                            </div>
                            <Field id="instagram" label="Instagram" error={errors.instagram} hint={instagram ? `instagram.com/${instagram}` : undefined}>
                                <IconInput icon={<AtSign className="h-4 w-4" />} id="instagram" value={form.instagram} onChange={e => updateField("instagram", e.target.value)} placeholder="@usuario ou link do perfil" invalid={!!errors.instagram} />
                            </Field>
                            <Field id="linkedin" label="LinkedIn" error={errors.linkedin} hint={linkedin ? linkedinLabel(linkedin) : undefined}>
                                <IconInput icon={<Linkedin className="h-4 w-4" />} id="linkedin" value={form.linkedin} onChange={e => updateField("linkedin", e.target.value)} placeholder="linkedin.com/in/usuario" invalid={!!errors.linkedin} />
                            </Field>
                        </div>
                    </Section>

                    {/* ── 3. Where they live ───────────────────────── */}
                    <Section tone="sky" icon={<Home className="h-4 w-4" />} title="Moradia" description="O imóvel que ocupa (a unidade e os valores ficam no contrato) e desde quando.">
                        <Field id="property_id" label="Imóvel" required error={errors.property_id}>
                            {properties.length === 0 ? (
                                <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                    <AlertTriangle className="h-4 w-4 shrink-0" /> Nenhum imóvel cadastrado. Cadastre um imóvel antes de adicionar inquilinos.
                                </p>
                            ) : (
                                <select id="property_id" value={form.property_id} onChange={e => updateField("property_id", e.target.value)} className={cn(control, errors.property_id && "border-red-500")}>
                                    <option value="">Selecione o imóvel</option>
                                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            )}
                        </Field>
                        <Field id="status" label="Situação" hint={`${status.hint} Muda sozinha quando um contrato dele começa ou termina.`}>
                            <div role="radiogroup" aria-label="Situação" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-background p-1">
                                {STATUS_OPTIONS.map(o => (
                                    <button
                                        key={o.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={form.status === o.value}
                                        onClick={() => updateField("status", o.value)}
                                        className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", form.status === o.value ? o.on : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                                    >
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="move_in_date" label={form.status === "FUTURE" ? "Data de entrada (prevista)" : "Data de entrada"} error={errors.move_in_date} hint={!form.move_in_date ? "Vazia: vale o início do contrato." : undefined}>
                                <IconInput icon={<CalendarClock className="h-4 w-4" />} id="move_in_date" inputMode="numeric" value={form.move_in_date} onChange={e => masked("move_in_date", e.target.value, maskDate)} placeholder="DD/MM/AAAA" maxLength={10} invalid={!!errors.move_in_date} />
                            </Field>
                            {(form.status === "FORMER" || form.move_out_date) && (
                                <Field id="move_out_date" label="Data de saída" error={errors.move_out_date} hint={!form.move_out_date ? "Vazia: vale o fim do último contrato." : undefined}>
                                    <IconInput icon={<CalendarClock className="h-4 w-4" />} id="move_out_date" inputMode="numeric" value={form.move_out_date} onChange={e => masked("move_out_date", e.target.value, maskDate)} placeholder="DD/MM/AAAA" maxLength={10} invalid={!!errors.move_out_date} />
                                </Field>
                            )}
                        </div>
                    </Section>

                    {/* ── 4. Management ────────────────────────────── */}
                    <Section tone="indigo" icon={<Building2 className="h-4 w-4" />} title="Administração" description="Quem cuida da locação deste inquilino.">
                        <Field id="management_type" label="Gestão" required error={errors.management_type}>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {([
                                    { value: "SELF_MANAGED", label: "Gestão própria", hint: "Você administra", icon: <Home className="h-4 w-4" /> },
                                    { value: "AGENCY", label: "Imobiliária", hint: "Uma imobiliária administra", icon: <Building2 className="h-4 w-4" /> },
                                ] as const).map(opt => {
                                    const on = form.management_type === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => {
                                                updateField("management_type", opt.value);
                                                if (opt.value === "SELF_MANAGED") { updateField("agency_id", ""); updateField("agent_id", ""); }
                                            }}
                                            className={cn(
                                                "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                                                on ? "border-indigo-500 bg-indigo-500/10" : "border-border bg-background hover:border-indigo-300 hover:bg-indigo-500/5"
                                            )}
                                        >
                                            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", on ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground")}>{opt.icon}</span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-foreground">{opt.label}</span>
                                                <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>
                        {form.management_type === "AGENCY" && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field id="agency_id" label="Imobiliária" required error={errors.agency_id}>
                                    {agencies.length === 0 ? (
                                        <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Nenhuma imobiliária cadastrada. Cadastre uma em Imobiliária.</p>
                                    ) : (
                                        <select id="agency_id" value={form.agency_id} onChange={e => { updateField("agency_id", e.target.value); updateField("agent_id", ""); }} className={cn(control, errors.agency_id && "border-red-500")}>
                                            <option value="">Selecione a imobiliária</option>
                                            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                        </select>
                                    )}
                                </Field>
                                <Field id="agent_id" label="Corretor (opcional)" error={errors.agent_id} hint={form.agency_id && filteredAgents.length === 0 ? "Nenhum corretor desta imobiliária cadastrado." : undefined}>
                                    <select id="agent_id" value={form.agent_id} onChange={e => updateField("agent_id", e.target.value)} disabled={!form.agency_id || filteredAgents.length === 0} className={control}>
                                        <option value="">{form.agency_id ? "Selecione o corretor" : "Escolha a imobiliária antes"}</option>
                                        {filteredAgents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                                    </select>
                                </Field>
                            </div>
                        )}
                    </Section>

                    {/* ── 5. Current address ───────────────────────── */}
                    <Section tone="amber" icon={<MapPin className="h-4 w-4" />} title="Endereço atual" description="Onde o inquilino mora hoje.">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={form.use_property_address}
                            onClick={() => updateField("use_property_address", !form.use_property_address)}
                            className={cn(
                                "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                                form.use_property_address ? "border-amber-500/60 bg-amber-500/10" : "border-border bg-background hover:border-amber-300"
                            )}
                        >
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-foreground">Mora no imóvel alugado</span>
                                <span className="block text-xs text-muted-foreground">{form.use_property_address ? "O endereço é o do imóvel associado." : "Informe abaixo onde ele mora."}</span>
                            </span>
                            <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", form.use_property_address ? "bg-amber-500" : "bg-muted-foreground/30")}>
                                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", form.use_property_address ? "left-[22px]" : "left-0.5")} />
                            </span>
                        </button>
                        {!form.use_property_address && (
                            <div className="grid gap-4 sm:grid-cols-6">
                                <div className="sm:col-span-2">
                                    <Field id="postal_code" label="CEP" error={errors.postal_code ?? cepError ?? undefined} hint={cepFilled ? "Endereço preenchido pelo CEP." : undefined}>
                                        <div className="flex gap-2">
                                            <Input id="postal_code" inputMode="numeric" value={form.postal_code} onChange={e => masked("postal_code", e.target.value, maskCEP)} onBlur={() => { if (parseCEP(form.postal_code).length === 8) void lookupCEP(); }} placeholder="00000-000" className={cn(inputCls, "flex-1 tabular-nums", errors.postal_code && "border-red-500")} />
                                            <Button type="button" variant="outline" onClick={() => void lookupCEP()} disabled={cepLoading || parseCEP(form.postal_code).length !== 8} className="h-10 shrink-0" aria-label="Buscar CEP">
                                                {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : cepFilled ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Search className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </Field>
                                </div>
                                <div className="sm:col-span-4">
                                    <Field id="street" label="Logradouro">
                                        <Input id="street" value={form.street} onChange={e => updateField("street", e.target.value)} placeholder="Rua, avenida…" className={inputCls} />
                                    </Field>
                                </div>
                                <div className="sm:col-span-2">
                                    <Field id="street_number" label="Número">
                                        <Input id="street_number" value={form.street_number} onChange={e => updateField("street_number", e.target.value)} placeholder="Nº" className={inputCls} />
                                    </Field>
                                </div>
                                <div className="sm:col-span-4">
                                    <Field id="address_complement" label="Complemento">
                                        <Input id="address_complement" value={form.address_complement} onChange={e => updateField("address_complement", e.target.value)} placeholder="Apto, bloco…" className={inputCls} />
                                    </Field>
                                </div>
                                <div className="sm:col-span-2">
                                    <Field id="neighborhood" label="Bairro">
                                        <Input id="neighborhood" value={form.neighborhood} onChange={e => updateField("neighborhood", e.target.value)} placeholder="Bairro" className={inputCls} />
                                    </Field>
                                </div>
                                <div className="sm:col-span-2">
                                    <Field id="city" label="Cidade">
                                        <Input id="city" value={form.city} onChange={e => updateField("city", e.target.value)} placeholder="Cidade" className={inputCls} />
                                    </Field>
                                </div>
                                <div className="sm:col-span-2">
                                    <Field id="state" label="Estado">
                                        <select id="state" value={form.state} onChange={e => updateField("state", e.target.value)} className={control}>
                                            <option value="">Selecione</option>
                                            {BRAZILIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                    </Field>
                                </div>
                            </div>
                        )}
                    </Section>

                    {/* ── 6. Emergency & notes ─────────────────────── */}
                    <Section tone="slate" icon={<ShieldAlert className="h-4 w-4" />} title="Emergência e observações" description="Quem avisar se precisar, e notas internas: só você vê.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="emergency_contact_name" label="Contato de emergência">
                                <IconInput icon={<User className="h-4 w-4" />} id="emergency_contact_name" value={form.emergency_contact_name} onChange={e => updateField("emergency_contact_name", e.target.value)} placeholder="Nome e parentesco" />
                            </Field>
                            <Field id="emergency_contact_phone" label="Telefone de emergência" error={errors.emergency_contact_phone}>
                                <IconInput icon={<Phone className="h-4 w-4" />} id="emergency_contact_phone" inputMode="tel" value={form.emergency_contact_phone} onChange={e => masked("emergency_contact_phone", e.target.value, maskPhone)} placeholder="(00) 00000-0000" invalid={!!errors.emergency_contact_phone} />
                            </Field>
                        </div>
                        <Field id="notes" label="Observações">
                            <textarea id="notes" value={form.notes} onChange={e => updateField("notes", e.target.value)} placeholder="Combinados, preferências, histórico…" rows={3} className={cn(control, "h-auto min-h-[96px] resize-y py-2")} />
                        </Field>
                    </Section>
                </div>

                {/* ── The tenant's card and the actions: beside the form on a wide screen (sticky), after it on a phone ── */}
                <aside className="space-y-4 lg:sticky lg:top-4">
                    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                        <div className="relative h-16 bg-gradient-to-br from-emerald-500/20 via-sky-500/10 to-violet-500/20">
                            <span className={cn("absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", TENANT_STATUS_META[status.value].pill)}>
                                {TENANT_STATUS_META[status.value].label}
                            </span>
                        </div>
                        <div className="px-4 pb-4">
                            <span className="-mt-8 grid h-16 w-16 place-items-center rounded-2xl border-4 border-card bg-emerald-100 text-xl font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                {form.full_name.trim() ? <Sensitive>{initials(form.full_name)}</Sensitive> : <User className="h-7 w-7" />}
                            </span>
                            <p className="mt-2 break-words font-semibold leading-tight text-foreground">
                                {form.full_name.trim() ? <Sensitive>{form.full_name.trim()}</Sensitive> : <span className="text-muted-foreground">Nome do inquilino</span>}
                            </p>
                            <p className={cn("text-xs", form.occupation.trim() ? "text-muted-foreground" : "italic text-muted-foreground/70")}>
                                {form.occupation.trim() || "Ocupação não informada"}{age !== null && <> · {age} anos</>}
                            </p>
                            <div className="mt-3 flex gap-1.5">
                                {contacts.map(c => (
                                    <span
                                        key={c.key}
                                        title={`${c.label}: ${c.on ? "informado" : "não informado"}`}
                                        className={cn("grid h-7 w-7 place-items-center rounded-md border", c.on ? "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400" : "border-border text-muted-foreground/50")}
                                    >
                                        {c.icon}
                                    </span>
                                ))}
                            </div>
                            <dl className="mt-4 space-y-2.5 border-t border-border/60 pt-3 text-sm">
                                <SummaryRow label="Imóvel" value={property} />
                                <SummaryRow label="Moradia" value={living} />
                                <SummaryRow label="Gestão" value={manager} />
                                <SummaryRow label="CPF" value={validateCPF(parseCPF(form.cpf)) ? <Sensitive>{form.cpf}</Sensitive> : null} />
                            </dl>
                            <div className="mt-4">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-foreground">Obrigatórios</span>
                                    <span className="tabular-nums text-muted-foreground">{stepsDone} de {steps.length}</span>
                                </div>
                                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                                    <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(stepsDone / steps.length) * 100}%` }} />
                                </span>
                                <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                    {steps.map(s => (
                                        <li key={s.label} className={cn("flex items-center gap-1.5", s.done ? "text-foreground" : "text-muted-foreground")}>
                                            {s.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 shrink-0" />}
                                            {s.label}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Button type="submit" disabled={submitting} className="h-11">
                            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {submitting ? "Salvando…" : editingId ? "Salvar alterações" : "Cadastrar inquilino"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancelar</Button>
                    </div>
                    <p className="text-center text-xs text-muted-foreground">A foto do inquilino se troca no painel dele.</p>
                </aside>
            </form>
        </div>
    );
}

// ── Building blocks ──────────────────────────────────────────────────

/** Every select and textarea of the form: the input's border colour (a bare `border` would be black), its height and focus. */
const control = "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-colors focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50";
/** The shared Input, brought to the selects' size. */
const inputCls = "h-10 rounded-lg text-sm";

/** One colour per section, the hub's palette: full class names (Tailwind reads them here). */
const SECTION_TONE = {
    violet: "bg-violet-500/15 text-violet-600",
    emerald: "bg-emerald-500/15 text-emerald-600",
    sky: "bg-sky-500/15 text-sky-600",
    indigo: "bg-indigo-500/15 text-indigo-600",
    amber: "bg-amber-500/15 text-amber-600",
    slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
} as const;

/** A part of the form, always open: its colour and icon tell it apart. */
function Section({ tone, icon, title, description, children }: { tone: keyof typeof SECTION_TONE; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-border bg-card shadow-xs">
            <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", SECTION_TONE[tone])}>
                    {icon}
                </span>
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </header>
            <div className="space-y-4 p-4 sm:p-5">{children}</div>
        </section>
    );
}

/** A label, the control, then its error or its hint. `id` keeps the `field-<name>` anchor the validation scrolls to. */
function Field({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
    return (
        <div id={`field-${id}`}>
            <Label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {label}{required && <span className="text-rose-500"> *</span>}
            </Label>
            {children}
            {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

/** The shared Input with an icon inside, on the left. */
function IconInput({ icon, invalid, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode; invalid?: boolean }) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
            <Input {...props} className={cn(inputCls, "pl-9", invalid && "border-red-500", className)} />
        </div>
    );
}

/** One line of the card: the label, then the value or a dash. */
function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn("min-w-0 break-words text-sm", value ? "font-medium text-foreground" : "text-muted-foreground")}>{value ?? "—"}</dd>
        </div>
    );
}
