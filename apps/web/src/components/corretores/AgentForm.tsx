"use client";

/**
 * The corretor form — "Cadastrar Corretor" and "Editar Corretor": the person and their CRECI, how
 * they work (autonomous or for an agency), how to reach them, notes and status. The photo is not
 * here: it goes on the corretor's dashboard, which is where a saved corretor lands.
 */
import React, { useState } from "react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowLeft, FileText, Loader2, MessageCircle, Phone, Save, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentFormData, AgentWithAgency } from "@/types/agent";
import { BRAZILIAN_STATES, formatCPF, formatPhone, maskCPF, maskPhone, parseCPF, validateCPF, validateEmail, validatePhone, validateWebsite } from "@/lib/validators";

type FieldErrors = Record<string, string>;

export interface AgencyChoice { id: string; name: string; trade_name?: string | null }

interface Props {
    /** null = creating */
    editingId: string | null;
    initial: AgentFormData;
    agencies: AgencyChoice[];
    onSaved: (agentId: string) => void;
    onCancel: () => void;
    topSlot?: React.ReactNode;
}

export function emptyAgentForm(): AgentFormData {
    return {
        full_name: "", cpf: "", creci_number: "", creci_state: "", agent_type: "AUTONOMO", agency_id: "",
        main_phone: "", main_phone_whatsapp: false, additional_phone: "", additional_phone_whatsapp: false,
        email: "", website: "", notes: "", status: "ACTIVE",
    };
}

export function agentToForm(agent: AgentWithAgency): AgentFormData {
    return {
        full_name: agent.full_name || "",
        cpf: agent.cpf ? formatCPF(agent.cpf) : "",
        creci_number: agent.creci_number || "",
        creci_state: agent.creci_state || "",
        agent_type: agent.agent_type || "AUTONOMO",
        agency_id: agent.agency_id || "",
        main_phone: agent.main_phone ? formatPhone(agent.main_phone) : "",
        main_phone_whatsapp: agent.main_phone_whatsapp ?? false,
        additional_phone: agent.additional_phone ? formatPhone(agent.additional_phone) : "",
        additional_phone_whatsapp: agent.additional_phone_whatsapp ?? false,
        email: agent.email || "",
        website: agent.website?.replace(/^https?:\/\//, "") || "",
        notes: agent.notes || "",
        status: agent.status || "ACTIVE",
    };
}

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">{icon}</div>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            {children}
        </section>
    );
}

export default function AgentForm({ editingId, initial, agencies, onSaved, onCancel, topSlot }: Props) {
    const [form, setForm] = useState<AgentFormData>(() => ({ ...initial }));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const updateField = (field: keyof AgentFormData, value: string | boolean) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setErrors(prev => { if (!prev[field]) return prev; const next = { ...prev }; delete next[field]; return next; });
        setSubmitError(null);
    };
    const masked = (field: keyof AgentFormData, value: string, mask: (v: string) => string) => updateField(field, mask(value));

    const validate = (): FieldErrors => {
        const errs: FieldErrors = {};
        if (!form.full_name.trim()) errs.full_name = "Nome completo é obrigatório.";
        if (!form.creci_number.trim()) errs.creci_number = "CRECI é obrigatório.";
        if (!form.creci_state.trim()) errs.creci_state = "UF do CRECI é obrigatório.";
        if (form.agent_type === "IMOBILIARIA" && !form.agency_id.trim()) errs.agency_id = "Selecione a imobiliária.";
        if (form.main_phone.trim() && !validatePhone(form.main_phone)) errs.main_phone = "Telefone inválido. Use (XX) XXXXX-XXXX.";
        const cpfDigits = parseCPF(form.cpf);
        if (cpfDigits.length > 0 && cpfDigits.length !== 11) errs.cpf = "CPF deve ter 11 dígitos.";
        else if (cpfDigits.length === 11 && !validateCPF(cpfDigits)) errs.cpf = "CPF inválido. Verifique os dígitos.";
        if (form.email.trim() && !validateEmail(form.email)) errs.email = "E-mail inválido.";
        if (form.additional_phone.trim() && !validatePhone(form.additional_phone)) errs.additional_phone = "Telefone inválido.";
        if (form.website.trim() && !validateWebsite(form.website)) errs.website = "Website inválido.";
        return errs;
    };

    const scrollTo = (errs: FieldErrors) => {
        const first = Object.keys(errs)[0];
        if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) { setErrors(errs); scrollTo(errs); return; }
        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await fetch(editingId ? `/api/agents/${editingId}` : "/api/agents", {
                method: editingId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (data.errors) { setErrors(data.errors); scrollTo(data.errors); }
                else setSubmitError(data.error || "Erro ao salvar. Tente novamente.");
                return;
            }
            const id = (data.agent?.id as string | undefined) ?? editingId;
            if (id) onSaved(id);
        } catch {
            setSubmitError("Erro de conexão. Verifique sua internet e tente novamente.");
        } finally {
            setSubmitting(false);
        }
    };

    const err = (field: string) => (errors[field] ? <p className="mt-1 text-xs text-red-500">{errors[field]}</p> : null);

    return (
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8">
                {topSlot}
                <button type="button" onClick={onCancel} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <h1 className="text-3xl font-bold text-foreground">{editingId ? "Editar Corretor" : "Cadastrar Corretor"}</h1>
                <p className="mt-2 text-muted-foreground">{editingId ? "Atualize os dados do corretor." : "Cadastre os dados do corretor de imóveis."}</p>
                <p className="mt-2 text-xs text-muted-foreground">Campos marcados com <span className="text-red-500">*</span> são obrigatórios. A foto vai no painel do corretor.</p>
            </div>

            {submitError && (
                <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {submitError}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
                <Section icon={<User className="h-5 w-5 text-primary" />} title="Dados do corretor" description="Informações pessoais e registro profissional.">
                    <div className="space-y-4">
                        <div id="field-full_name">
                            <Label htmlFor="agent-full-name">Nome completo <span className="text-red-500">*</span></Label>
                            <Input id="agent-full-name" value={form.full_name} onChange={e => updateField("full_name", e.target.value)} placeholder="Nome completo do corretor" className={cn(errors.full_name && "border-red-500")} maxLength={200} />
                            {err("full_name")}
                        </div>
                        <div id="field-cpf">
                            <Label htmlFor="agent-cpf">CPF</Label>
                            <Input id="agent-cpf" value={form.cpf} onChange={e => masked("cpf", e.target.value, maskCPF)} placeholder="000.000.000-00" className={cn(errors.cpf && "border-red-500")} maxLength={14} />
                            {err("cpf")}
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div id="field-creci_number">
                                <Label htmlFor="agent-creci">Nº CRECI <span className="text-red-500">*</span></Label>
                                <Input id="agent-creci" value={form.creci_number} onChange={e => updateField("creci_number", e.target.value)} placeholder="Ex: 12345" className={cn(errors.creci_number && "border-red-500")} maxLength={20} />
                                {err("creci_number")}
                            </div>
                            <div id="field-creci_state">
                                <Label htmlFor="agent-creci-state">UF CRECI <span className="text-red-500">*</span></Label>
                                <select id="agent-creci-state" value={form.creci_state} onChange={e => updateField("creci_state", e.target.value)} className={cn(selectClass, errors.creci_state && "border-red-500")}>
                                    <option value="">Selecione</option>
                                    {BRAZILIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                                </select>
                                {err("creci_state")}
                            </div>
                        </div>
                    </div>
                </Section>

                <Section icon={<Shield className="h-5 w-5 text-primary" />} title="Tipo de atuação" description="Defina se o corretor atua de forma autônoma ou vinculado a uma imobiliária.">
                    <div className="space-y-4">
                        <div id="field-agent_type" className="space-y-3">
                            {([["AUTONOMO", "Corretor autônomo", "Atua de forma independente, sem vínculo com imobiliária."], ["IMOBILIARIA", "Trabalha em imobiliária", "Vinculado a uma imobiliária cadastrada."]] as const).map(([value, title, sub]) => (
                                <label key={value} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/50", form.agent_type === value ? "border-primary bg-primary/5" : "border-border")}>
                                    <input type="radio" name="agent_type" value={value} checked={form.agent_type === value} onChange={() => { updateField("agent_type", value); if (value === "AUTONOMO") updateField("agency_id", ""); }} className="h-4 w-4 text-primary" />
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{title}</p>
                                        <p className="text-xs text-muted-foreground">{sub}</p>
                                    </div>
                                </label>
                            ))}
                            {err("agent_type")}
                        </div>
                        {form.agent_type === "IMOBILIARIA" && (
                            <div id="field-agency_id">
                                <Label htmlFor="agent-agency">Imobiliária <span className="text-red-500">*</span></Label>
                                <select id="agent-agency" value={form.agency_id} onChange={e => updateField("agency_id", e.target.value)} className={cn(selectClass, errors.agency_id && "border-red-500")}>
                                    <option value="">Selecionar imobiliária cadastrada</option>
                                    {agencies.map(a => <option key={a.id} value={a.id}>{a.name}{a.trade_name ? ` (${a.trade_name})` : ""}</option>)}
                                </select>
                                {err("agency_id")}
                                {agencies.length === 0 && (
                                    <p className="mt-1 flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> Nenhuma imobiliária cadastrada. Cadastre uma imobiliária primeiro.</p>
                                )}
                            </div>
                        )}
                    </div>
                </Section>

                <Section icon={<Phone className="h-5 w-5 text-primary" />} title="Contato" description="Telefone, WhatsApp, e-mail e perfil profissional. Um corretor lido de um contrato pode ficar sem telefone até você completar.">
                    <div className="space-y-4">
                        <div id="field-main_phone">
                            <div className="mb-1 flex items-center justify-between">
                                <Label htmlFor="agent-phone">Telefone principal</Label>
                                <label className="flex cursor-pointer select-none items-center gap-1.5">
                                    <input type="checkbox" checked={form.main_phone_whatsapp} onChange={e => updateField("main_phone_whatsapp", e.target.checked)} className="h-4 w-4 rounded accent-green-600" disabled={!form.main_phone.trim()} />
                                    <span className="flex items-center gap-1 text-sm text-muted-foreground"><MessageCircle className="h-3.5 w-3.5 text-green-600" /> WhatsApp</span>
                                </label>
                            </div>
                            <Input id="agent-phone" value={form.main_phone} onChange={e => { masked("main_phone", e.target.value, maskPhone); if (!e.target.value.trim()) updateField("main_phone_whatsapp", false); }} placeholder="(31) 99999-9999" className={cn(errors.main_phone && "border-red-500")} maxLength={15} />
                            {err("main_phone")}
                        </div>
                        <div id="field-additional_phone">
                            <div className="mb-1 flex items-center justify-between">
                                <Label htmlFor="agent-phone2">Telefone adicional</Label>
                                <label className="flex cursor-pointer select-none items-center gap-1.5">
                                    <input type="checkbox" checked={form.additional_phone_whatsapp} onChange={e => updateField("additional_phone_whatsapp", e.target.checked)} className="h-4 w-4 rounded accent-green-600" disabled={!form.additional_phone.trim()} />
                                    <span className="flex items-center gap-1 text-sm text-muted-foreground"><MessageCircle className="h-3.5 w-3.5 text-green-600" /> WhatsApp</span>
                                </label>
                            </div>
                            <Input id="agent-phone2" value={form.additional_phone} onChange={e => { masked("additional_phone", e.target.value, maskPhone); if (!e.target.value.trim()) updateField("additional_phone_whatsapp", false); }} placeholder="(31) 3561-3173 (opcional)" className={cn(errors.additional_phone && "border-red-500")} maxLength={15} />
                            {err("additional_phone")}
                        </div>
                        <div id="field-email">
                            <Label htmlFor="agent-email">E-mail</Label>
                            <Input id="agent-email" type="email" value={form.email} onChange={e => updateField("email", e.target.value)} placeholder="corretor@email.com (opcional)" className={cn(errors.email && "border-red-500")} maxLength={254} />
                            {err("email")}
                        </div>
                        <div id="field-website">
                            <Label htmlFor="agent-website">Website / Perfil profissional</Label>
                            <Input id="agent-website" value={form.website} onChange={e => updateField("website", e.target.value)} placeholder="www.corretor.com.br (opcional)" className={cn(errors.website && "border-red-500")} maxLength={200} />
                            {err("website")}
                        </div>
                    </div>
                </Section>

                <Section icon={<FileText className="h-5 w-5 text-primary" />} title="Observações e Status" description="Notas adicionais e status do corretor.">
                    <div className="space-y-4">
                        <div id="field-notes">
                            <Label htmlFor="agent-notes">Observações</Label>
                            <textarea id="agent-notes" value={form.notes} onChange={e => updateField("notes", e.target.value)} placeholder="Informações adicionais sobre o corretor (opcional)" rows={3} className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" maxLength={2000} />
                        </div>
                        <div id="field-status">
                            <Label>Status <span className="text-red-500">*</span></Label>
                            <div className="mt-2 flex items-center gap-4">
                                {(["ACTIVE", "INACTIVE"] as const).map(value => (
                                    <label key={value} className="flex cursor-pointer items-center gap-2">
                                        <input type="radio" name="agent_status" value={value} checked={form.status === value} onChange={() => updateField("status", value)} className="h-4 w-4 text-primary" />
                                        <span className="text-sm text-foreground">{value === "ACTIVE" ? "Ativo" : "Inativo"}</span>
                                    </label>
                                ))}
                            </div>
                            {err("status")}
                        </div>
                    </div>
                </Section>

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Cancelar
                    </Button>
                    <Button type="submit" disabled={submitting} className="min-w-[200px]">
                        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="mr-2 h-4 w-4" /> {editingId ? "Salvar alterações" : "Cadastrar corretor"}</>}
                    </Button>
                </div>
            </form>
        </div>
    );
}
