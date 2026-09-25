"use client";

/**
 * The tenant form — "Cadastrar Inquilino" and "Editar Inquilino": personal data (with the
 * occupation), the social links, the current address (CEP auto-fill), the property, the
 * management, the occupancy dates and status, the emergency contact and notes. The photo is not
 * here: it goes on the tenant's dashboard, which is where a saved tenant lands.
 */
import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowLeft, AtSign, Building2, Calendar, CheckCircle2, Home, Loader2, Save, Search, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeInstagram, normalizeLinkedin } from "@/lib/social-links";
import type { AgencyOption, AgentOption, PropertyOption, TenantFormData, TenantWithDetails } from "@/types/tenant";
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

const selectClass = "w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">{icon} {title}</h2>
            <p className="mb-6 text-sm text-muted-foreground">{description}</p>
            {children}
        </section>
    );
}

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
    const err = (field: string) => (errors[field] ? <p className="mt-1 text-sm text-red-500">{errors[field]}</p> : null);

    return (
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8">
                {topSlot}
                <button type="button" onClick={onCancel} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <h1 className="text-3xl font-bold text-foreground">{editingId ? "Editar Inquilino" : "Cadastrar Inquilino"}</h1>
                <p className="mt-2 text-muted-foreground">{editingId ? "Atualize os dados do inquilino." : "Cadastre os dados do inquilino para associar ao seu imóvel."}</p>
                <p className="mt-2 text-xs text-muted-foreground">Campos marcados com <span className="text-red-500">*</span> são obrigatórios. A foto vai no painel do inquilino.</p>
            </div>

            {submitError && (
                <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {submitError}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
                <Section icon={<User className="h-5 w-5 text-primary" />} title="Informações Pessoais" description="Quem é o inquilino e como falar com ele.">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2" id="field-full_name">
                            <Label htmlFor="full_name">Nome completo <span className="text-red-500">*</span></Label>
                            <Input id="full_name" value={form.full_name} onChange={e => updateField("full_name", e.target.value)} placeholder="Nome completo do inquilino" className={cn(errors.full_name && "border-red-500")} />
                            {err("full_name")}
                        </div>
                        <div id="field-cpf">
                            <Label htmlFor="cpf">CPF <span className="text-red-500">*</span></Label>
                            <Input id="cpf" value={form.cpf} onChange={e => masked("cpf", e.target.value, maskCPF)} placeholder="000.000.000-00" className={cn(errors.cpf && "border-red-500")} />
                            {err("cpf")}
                        </div>
                        <div id="field-occupation">
                            <Label htmlFor="occupation">Profissão / ocupação</Label>
                            <Input id="occupation" value={form.occupation} onChange={e => updateField("occupation", e.target.value)} placeholder="Ex: Enfermeira, motorista de aplicativo, estudante" maxLength={120} />
                        </div>
                        <div id="field-main_phone">
                            <Label htmlFor="main_phone">Telefone principal (WhatsApp)</Label>
                            <Input id="main_phone" value={form.main_phone} onChange={e => masked("main_phone", e.target.value, maskPhone)} placeholder="(00) 00000-0000" className={cn(errors.main_phone && "border-red-500")} />
                            {err("main_phone")}
                        </div>
                        <div id="field-email">
                            <Label htmlFor="email">E-mail</Label>
                            <Input id="email" type="email" value={form.email} onChange={e => updateField("email", e.target.value)} placeholder="email@exemplo.com" className={cn(errors.email && "border-red-500")} />
                            {err("email")}
                        </div>
                        <div id="field-additional_phone">
                            <Label htmlFor="additional_phone">Telefone adicional</Label>
                            <Input id="additional_phone" value={form.additional_phone} onChange={e => masked("additional_phone", e.target.value, maskPhone)} placeholder="(00) 00000-0000" className={cn(errors.additional_phone && "border-red-500")} />
                            {err("additional_phone")}
                        </div>
                        <div id="field-date_of_birth">
                            <Label htmlFor="date_of_birth">Data de nascimento</Label>
                            <Input id="date_of_birth" value={form.date_of_birth} onChange={e => masked("date_of_birth", e.target.value, maskDate)} placeholder="DD/MM/AAAA" maxLength={10} className={cn(errors.date_of_birth && "border-red-500")} />
                            {err("date_of_birth")}
                        </div>
                        <div>
                            <Label htmlFor="rg">RG / Documento de identidade</Label>
                            <Input id="rg" value={form.rg} onChange={e => updateField("rg", e.target.value)} placeholder="Número do RG" />
                        </div>
                    </div>
                </Section>

                <Section icon={<AtSign className="h-5 w-5 text-primary" />} title="Redes sociais" description="Os perfis viram atalhos no card e no painel do inquilino.">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div id="field-instagram">
                            <Label htmlFor="instagram">Instagram</Label>
                            <Input id="instagram" value={form.instagram} onChange={e => updateField("instagram", e.target.value)} placeholder="@usuario ou link do perfil" className={cn(errors.instagram && "border-red-500")} />
                            {err("instagram")}
                        </div>
                        <div id="field-linkedin">
                            <Label htmlFor="linkedin">LinkedIn</Label>
                            <Input id="linkedin" value={form.linkedin} onChange={e => updateField("linkedin", e.target.value)} placeholder="linkedin.com/in/usuario" className={cn(errors.linkedin && "border-red-500")} />
                            {err("linkedin")}
                        </div>
                    </div>
                </Section>

                <Section icon={<Home className="h-5 w-5 text-primary" />} title="Endereço Atual" description="Onde o inquilino mora hoje.">
                    <label className="mb-4 flex cursor-pointer select-none items-center gap-2">
                        <input type="checkbox" checked={form.use_property_address} onChange={e => updateField("use_property_address", e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20" />
                        <span className="text-sm text-foreground">Utilizar endereço do imóvel alugado como endereço atual</span>
                    </label>
                    {!form.use_property_address && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div id="field-postal_code">
                                <Label htmlFor="postal_code">CEP</Label>
                                <div className="flex gap-2">
                                    <Input id="postal_code" value={form.postal_code} onChange={e => masked("postal_code", e.target.value, maskCEP)} onBlur={() => { if (parseCEP(form.postal_code).length === 8) void lookupCEP(); }} placeholder="00000-000" className={cn("flex-1", errors.postal_code && "border-red-500")} />
                                    <Button type="button" variant="outline" onClick={() => void lookupCEP()} disabled={cepLoading || parseCEP(form.postal_code).length !== 8} className="shrink-0" aria-label="Buscar CEP">
                                        {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : cepFilled ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Search className="h-4 w-4" />}
                                    </Button>
                                </div>
                                {err("postal_code")}
                                {cepError && <p className="mt-1 text-sm text-red-500">{cepError}</p>}
                            </div>
                            <div />
                            <div className="sm:col-span-2">
                                <Label htmlFor="street">Logradouro</Label>
                                <Input id="street" value={form.street} onChange={e => updateField("street", e.target.value)} placeholder="Rua, Avenida..." />
                            </div>
                            <div>
                                <Label htmlFor="street_number">Número</Label>
                                <Input id="street_number" value={form.street_number} onChange={e => updateField("street_number", e.target.value)} placeholder="Nº" />
                            </div>
                            <div>
                                <Label htmlFor="address_complement">Complemento</Label>
                                <Input id="address_complement" value={form.address_complement} onChange={e => updateField("address_complement", e.target.value)} placeholder="Apto, Bloco..." />
                            </div>
                            <div>
                                <Label htmlFor="neighborhood">Bairro</Label>
                                <Input id="neighborhood" value={form.neighborhood} onChange={e => updateField("neighborhood", e.target.value)} placeholder="Bairro" />
                            </div>
                            <div>
                                <Label htmlFor="city">Cidade</Label>
                                <Input id="city" value={form.city} onChange={e => updateField("city", e.target.value)} placeholder="Cidade" />
                            </div>
                            <div>
                                <Label htmlFor="state">Estado</Label>
                                <select id="state" value={form.state} onChange={e => updateField("state", e.target.value)} className={selectClass}>
                                    <option value="">Selecione o estado</option>
                                    {BRAZILIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </Section>

                <Section icon={<Home className="h-5 w-5 text-primary" />} title="Imóvel Associado" description="O imóvel que o inquilino ocupa ou vai ocupar. A unidade e os valores ficam no contrato.">
                    <div id="field-property_id">
                        <Label htmlFor="property_id">Imóvel <span className="text-red-500">*</span></Label>
                        {properties.length === 0 ? (
                            <div className="mt-1 rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
                                <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-500" /> Nenhum imóvel cadastrado. Cadastre um imóvel antes de adicionar inquilinos.
                            </div>
                        ) : (
                            <select id="property_id" value={form.property_id} onChange={e => updateField("property_id", e.target.value)} className={cn(selectClass, errors.property_id && "border-red-500")}>
                                <option value="">Selecione o imóvel</option>
                                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        )}
                        {err("property_id")}
                    </div>
                </Section>

                <Section icon={<Building2 className="h-5 w-5 text-primary" />} title="Gestão" description="Como o imóvel é administrado.">
                    <div className="space-y-4">
                        <div id="field-management_type">
                            <Label>Administrado por <span className="text-red-500">*</span></Label>
                            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                                {([["SELF_MANAGED", "Gestão própria", "Administrado diretamente pelo proprietário"], ["AGENCY", "Imobiliária", "Administrado por uma imobiliária"]] as const).map(([value, title, sub]) => (
                                    <label key={value} className={cn("flex flex-1 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors", form.management_type === value ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50")}>
                                        <input type="radio" name="management_type" value={value} checked={form.management_type === value} onChange={() => { updateField("management_type", value); if (value === "SELF_MANAGED") { updateField("agency_id", ""); updateField("agent_id", ""); } }} className="h-4 w-4 text-primary focus:ring-primary/20" />
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{title}</p>
                                            <p className="text-xs text-muted-foreground">{sub}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            {err("management_type")}
                        </div>
                        {form.management_type === "AGENCY" && (
                            <div className="space-y-4">
                                <div id="field-agency_id">
                                    <Label htmlFor="agency_id">Imobiliária <span className="text-red-500">*</span></Label>
                                    {agencies.length === 0 ? (
                                        <div className="mt-1 rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground"><AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-500" /> Nenhuma imobiliária cadastrada. Cadastre uma imobiliária primeiro.</div>
                                    ) : (
                                        <select id="agency_id" value={form.agency_id} onChange={e => { updateField("agency_id", e.target.value); updateField("agent_id", ""); }} className={cn(selectClass, errors.agency_id && "border-red-500")}>
                                            <option value="">Selecione a imobiliária</option>
                                            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                        </select>
                                    )}
                                    {err("agency_id")}
                                </div>
                                {form.agency_id && (
                                    <div id="field-agent_id">
                                        <Label htmlFor="agent_id">Corretor</Label>
                                        {filteredAgents.length === 0 ? (
                                            <div className="mt-1 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">Nenhum corretor vinculado a esta imobiliária.</div>
                                        ) : (
                                            <select id="agent_id" value={form.agent_id} onChange={e => updateField("agent_id", e.target.value)} className={selectClass}>
                                                <option value="">Selecione o corretor (opcional)</option>
                                                {filteredAgents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                                            </select>
                                        )}
                                        {err("agent_id")}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Section>

                <Section icon={<Calendar className="h-5 w-5 text-primary" />} title="Ocupação do imóvel" description="Quando entrou (ou entra) e quando saiu. Quem sai vira &ldquo;Antigo&rdquo; e fica no histórico.">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div id="field-move_in_date">
                            <Label htmlFor="move_in_date">Data de entrada</Label>
                            <Input id="move_in_date" value={form.move_in_date} onChange={e => masked("move_in_date", e.target.value, maskDate)} placeholder="DD/MM/AAAA" maxLength={10} className={cn(errors.move_in_date && "border-red-500")} />
                            {err("move_in_date")}
                        </div>
                        <div id="field-move_out_date">
                            <Label htmlFor="move_out_date">Data de saída</Label>
                            <Input id="move_out_date" value={form.move_out_date} onChange={e => masked("move_out_date", e.target.value, maskDate)} placeholder="DD/MM/AAAA" maxLength={10} className={cn(errors.move_out_date && "border-red-500")} />
                            {err("move_out_date")}
                        </div>
                        <div>
                            <Label htmlFor="status">Status</Label>
                            <select id="status" value={form.status} onChange={e => updateField("status", e.target.value)} className={selectClass}>
                                <option value="ACTIVE">Atual — mora no imóvel</option>
                                <option value="FUTURE">Futuro — vai entrar</option>
                                <option value="FORMER">Antigo — já saiu</option>
                            </select>
                        </div>
                    </div>
                </Section>

                <Section icon={<Shield className="h-5 w-5 text-primary" />} title="Informações Adicionais" description="Contato de emergência e observações.">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="emergency_contact_name">Nome do contato de emergência</Label>
                            <Input id="emergency_contact_name" value={form.emergency_contact_name} onChange={e => updateField("emergency_contact_name", e.target.value)} placeholder="Nome do contato" />
                        </div>
                        <div id="field-emergency_contact_phone">
                            <Label htmlFor="emergency_contact_phone">Telefone de emergência</Label>
                            <Input id="emergency_contact_phone" value={form.emergency_contact_phone} onChange={e => masked("emergency_contact_phone", e.target.value, maskPhone)} placeholder="(00) 00000-0000" className={cn(errors.emergency_contact_phone && "border-red-500")} />
                            {err("emergency_contact_phone")}
                        </div>
                        <div className="sm:col-span-2">
                            <Label htmlFor="notes">Observações</Label>
                            <textarea id="notes" value={form.notes} onChange={e => updateField("notes", e.target.value)} placeholder="Anotações sobre o inquilino..." rows={3} className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                    </div>
                </Section>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancelar</Button>
                    <Button type="submit" disabled={submitting}>
                        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="mr-2 h-4 w-4" /> {editingId ? "Salvar alterações" : "Cadastrar inquilino"}</>}
                    </Button>
                </div>
            </form>
        </div>
    );
}
