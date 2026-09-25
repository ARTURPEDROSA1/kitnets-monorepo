"use client";

/**
 * The agency form — "Cadastrar Imobiliária" and "Editar Imobiliária": the company and its
 * registrations, contact, address (CEP auto-fill), the service agreement (document, fee, term) and
 * internal notes. The logo can be picked here because the AI reads it from a contract; on the
 * dashboard it can be changed at any time.
 */
import React, { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, Eye, FileText, ImageIcon, Loader2, MapPin, MessageCircle, Pencil, Phone, Save, Search, Sparkles, Trash2, Upload, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyFormData, AgencyWithRole } from "@/types/agency";
import { BRAZILIAN_STATES, formatCEP, formatCNPJ, formatPhone, maskCEP, maskCNPJ, maskPhone, parseCEP, parseCNPJ, validateCEP, validateCNPJ, validateEmail, validatePhone, validateWebsite } from "@/lib/validators";

type FieldErrors = Record<string, string>;

/** What the form starts from: the fields, plus the logo and the agreement the AI may have read from a document. */
export interface AgencyPrefill {
    form: AgencyFormData;
    logoFile: File | null;
    logoPreview: string | null;
    agreementFile: File | null;
    aiExtracted: boolean;
}

interface Props {
    /** null = creating */
    editingId: string | null;
    /** the stored record when editing (its logo and agreement are already on the server) */
    editing: AgencyWithRole | null;
    prefill: AgencyPrefill;
    onSaved: (agencyId: string) => void;
    onCancel: () => void;
    topSlot?: React.ReactNode;
}

export function emptyAgencyForm(): AgencyFormData {
    return {
        name: "", trade_name: "", cnpj: "", creci_number: "", creci_state: "", creci_type: "", owner_name: "",
        main_phone: "", additional_phone: "", main_phone_whatsapp: false, additional_phone_whatsapp: false, email: "", website: "",
        postal_code: "", street: "", street_number: "", address_complement: "", neighborhood: "", city: "", state: "", country: "BR",
        description: "", service_agreement_url: "", service_agreement_filename: "", management_fee: "", agreement_start_date: "", agreement_end_date: "",
    };
}

export function agencyToForm(agency: AgencyWithRole): AgencyFormData {
    return {
        name: agency.name || "",
        trade_name: agency.trade_name || "",
        cnpj: agency.cnpj ? formatCNPJ(agency.cnpj) : "",
        creci_number: agency.creci_number || "",
        creci_state: agency.creci_state || "",
        creci_type: agency.creci_type || "",
        owner_name: agency.owner_name || "",
        main_phone: agency.main_phone ? formatPhone(agency.main_phone) : "",
        additional_phone: agency.additional_phone ? formatPhone(agency.additional_phone) : "",
        main_phone_whatsapp: agency.main_phone_whatsapp ?? false,
        additional_phone_whatsapp: agency.additional_phone_whatsapp ?? false,
        email: agency.email || "",
        website: agency.website?.replace(/^https?:\/\//, "") || "",
        postal_code: agency.postal_code ? formatCEP(agency.postal_code) : "",
        street: agency.street || "",
        street_number: agency.street_number || "",
        address_complement: agency.address_complement || "",
        neighborhood: agency.neighborhood || "",
        city: agency.city || "",
        state: agency.state || "",
        country: agency.country || "BR",
        description: agency.description || "",
        service_agreement_url: agency.service_agreement_url || "",
        service_agreement_filename: agency.service_agreement_filename || "",
        management_fee: agency.management_fee !== undefined && agency.management_fee !== null ? String(agency.management_fee) : "",
        agreement_start_date: agency.agreement_start_date || "",
        agreement_end_date: agency.agreement_end_date || "",
    };
}

export function prefillFor(agency: AgencyWithRole | null): AgencyPrefill {
    return { form: agency ? agencyToForm(agency) : emptyAgencyForm(), logoFile: null, logoPreview: agency?.logo_url ?? null, agreementFile: null, aiExtracted: false };
}

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const AGREEMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

function Section({ icon, iconClass, title, description, children }: { icon: React.ReactNode; iconClass?: string; title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconClass ?? "bg-primary/10")}>{icon}</div>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            {children}
        </section>
    );
}

export default function AgencyForm({ editingId, editing, prefill, onSaved, onCancel, topSlot }: Props) {
    const [form, setForm] = useState<AgencyFormData>(() => ({ ...prefill.form }));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [cepLoading, setCepLoading] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const [cepFilled, setCepFilled] = useState(prefill.aiExtracted && Boolean(prefill.form.street && prefill.form.city));

    const [logoPreview, setLogoPreview] = useState<string | null>(prefill.logoPreview);
    const [logoFile, setLogoFile] = useState<File | null>(prefill.logoFile);
    const [logoUploading, setLogoUploading] = useState(false);
    const [logoError, setLogoError] = useState<string | null>(null);

    const [agreementFile, setAgreementFile] = useState<File | null>(prefill.agreementFile);
    const [agreementUploading, setAgreementUploading] = useState(false);
    const [agreementError, setAgreementError] = useState<string | null>(null);
    const [showDeleteAgreement, setShowDeleteAgreement] = useState(false);
    const [deletingAgreement, setDeletingAgreement] = useState(false);
    const agreementInput = useRef<HTMLInputElement>(null);

    const updateField = useCallback((field: keyof AgencyFormData, value: string | boolean) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setErrors(prev => { if (!prev[field]) return prev; const next = { ...prev }; delete next[field]; return next; });
        setSubmitError(null);
    }, []);
    const masked = (field: keyof AgencyFormData, value: string, mask: (v: string) => string) => updateField(field, mask(value));

    // ── CEP auto-fill ────────────────────────────────────────────
    const lookupCEP = async () => {
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
            setErrors(prev => { const next = { ...prev }; delete next.street; delete next.neighborhood; delete next.city; delete next.state; return next; });
            setCepFilled(true);
        } catch {
            setCepError("Erro ao consultar CEP. Tente novamente.");
        } finally {
            setCepLoading(false);
        }
    };

    // ── Validation ───────────────────────────────────────────────
    const validate = (): FieldErrors => {
        const errs: FieldErrors = {};
        if (!form.name.trim()) errs.name = "Nome da imobiliária é obrigatório.";
        if (!form.main_phone.trim()) errs.main_phone = "Telefone principal é obrigatório.";
        else if (!validatePhone(form.main_phone)) errs.main_phone = "Telefone inválido. Use (XX) XXXXX-XXXX.";
        if (!form.postal_code.trim() || !validateCEP(form.postal_code)) errs.postal_code = "CEP é obrigatório (8 dígitos).";
        if (!form.street.trim()) errs.street = "Logradouro é obrigatório.";
        if (!form.street_number.trim()) errs.street_number = "Número é obrigatório.";
        if (!form.neighborhood.trim()) errs.neighborhood = "Bairro é obrigatório.";
        if (!form.city.trim()) errs.city = "Cidade é obrigatória.";
        if (!form.state.trim()) errs.state = "Estado é obrigatório.";
        const cnpjDigits = parseCNPJ(form.cnpj);
        if (cnpjDigits.length > 0 && cnpjDigits.length !== 14) errs.cnpj = "CNPJ deve ter 14 dígitos.";
        else if (cnpjDigits.length === 14 && !validateCNPJ(cnpjDigits)) errs.cnpj = "CNPJ inválido. Verifique os dígitos.";
        if (form.email.trim() && !validateEmail(form.email)) errs.email = "E-mail inválido.";
        if (form.additional_phone.trim() && !validatePhone(form.additional_phone)) errs.additional_phone = "Telefone inválido.";
        if (form.website.trim() && !validateWebsite(form.website)) errs.website = "Website inválido.";
        return errs;
    };

    const scrollTo = (errs: FieldErrors) => {
        const first = Object.keys(errs)[0];
        if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    // ── Uploads after the save ───────────────────────────────────
    const uploadLogo = async (agencyId: string) => {
        if (!logoFile) return;
        setLogoUploading(true);
        try {
            const body = new FormData();
            body.append("file", logoFile);
            const res = await fetch(`/api/agencies/${agencyId}/logo`, { method: "POST", body });
            if (!res.ok) setLogoError((await res.json().catch(() => ({}))).error || "Erro ao fazer upload do logo.");
        } catch {
            setLogoError("Erro de conexão ao fazer upload do logo.");
        } finally {
            setLogoUploading(false);
        }
    };

    const uploadAgreement = async (agencyId: string) => {
        if (!agreementFile) return;
        setAgreementUploading(true);
        setAgreementError(null);
        try {
            const body = new FormData();
            body.append("file", agreementFile);
            if (form.management_fee) body.append("management_fee", form.management_fee);
            if (form.agreement_start_date) body.append("agreement_start_date", form.agreement_start_date);
            if (form.agreement_end_date) body.append("agreement_end_date", form.agreement_end_date);
            const res = await fetch(`/api/agencies/${agencyId}/agreement`, { method: "POST", body });
            if (!res.ok) setAgreementError((await res.json().catch(() => ({}))).error || "Erro ao enviar o contrato.");
        } catch {
            setAgreementError("Erro de conexão ao salvar contrato.");
        } finally {
            setAgreementUploading(false);
        }
    };

    // ── Submit ───────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) { setErrors(errs); scrollTo(errs); return; }
        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await fetch(editingId ? `/api/agencies/${editingId}` : "/api/agencies", {
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
            const id = (data.agency?.id as string | undefined) ?? editingId;
            if (!id) { setSubmitError("Erro ao salvar. Tente novamente."); return; }
            await uploadLogo(id);
            await uploadAgreement(id);
            onSaved(id);
        } catch {
            setSubmitError("Erro de conexão. Verifique sua internet e tente novamente.");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Logo & agreement pickers ─────────────────────────────────
    const pickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!LOGO_TYPES.includes(file.type)) { setLogoError("Formato não suportado. Use JPG, PNG, WebP ou SVG."); return; }
        if (file.size > 2 * 1024 * 1024) { setLogoError("Arquivo muito grande. Máximo 2 MB."); return; }
        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
        setLogoError(null);
    };

    const removeLogo = async () => {
        if (editing?.id && editing.logo_url) {
            try { await fetch(`/api/agencies/${editing.id}/logo`, { method: "DELETE" }); } catch { /* cleared locally anyway */ }
        }
        setLogoPreview(null);
        setLogoFile(null);
        setLogoError(null);
    };

    const pickAgreement = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!AGREEMENT_TYPES.includes(file.type)) { setAgreementError("Formato de arquivo não suportado. Use PDF, JPG, PNG ou WebP."); return; }
        if (file.size > 15 * 1024 * 1024) { setAgreementError("Arquivo muito grande. Limite máximo: 15MB."); return; }
        setAgreementFile(file);
        setForm(prev => ({ ...prev, service_agreement_filename: file.name }));
        setAgreementError(null);
    };

    const confirmRemoveAgreement = async () => {
        setDeletingAgreement(true);
        try {
            if (editing?.id && editing.service_agreement_url) {
                try { await fetch(`/api/agencies/${editing.id}/agreement`, { method: "DELETE" }); } catch { /* cleared locally anyway */ }
            }
            setAgreementFile(null);
            setForm(prev => ({ ...prev, service_agreement_url: "", service_agreement_filename: "" }));
            setAgreementError(null);
            setShowDeleteAgreement(false);
        } finally {
            setDeletingAgreement(false);
        }
    };

    const err = (field: string) => (errors[field] ? <p className="mt-1 text-xs text-red-500">{errors[field]}</p> : null);
    const hasAgreement = Boolean(agreementFile || form.service_agreement_url || form.service_agreement_filename);

    return (
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 space-y-4">
                {topSlot}
                <button type="button" onClick={onCancel} className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{editingId ? "Editar Imobiliária" : "Cadastrar Imobiliária"}</h1>
                    <p className="mt-2 text-muted-foreground">{editingId ? "Atualize os dados da imobiliária." : "Cadastre quem administra os seus contratos."}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Campos marcados com <span className="text-red-500">*</span> são obrigatórios.</p>
                </div>
            </div>

            {submitError && (
                <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {submitError}
                </div>
            )}

            {prefill.aiExtracted && (
                <div className="mb-6 flex items-start gap-3.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="shrink-0 rounded-xl bg-amber-100 p-2 text-amber-600 dark:bg-amber-900/50"><Sparkles className="h-5 w-5" /></div>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Dados preenchidos automaticamente via IA!</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">As informações foram extraídas do documento enviado. Revise os campos e complete o que faltar antes de salvar.</p>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
                <Section icon={<Building2 className="h-5 w-5 text-primary" />} title="Informações da imobiliária" description="Razão social, nome fantasia, registros profissionais e responsável legal.">
                    <div className="space-y-4">
                        <div>
                            <Label>Logo da imobiliária</Label>
                            <div className="mt-2 flex items-center gap-4">
                                {logoPreview ? (
                                    <div className="group relative">
                                        <Image src={logoPreview} alt="Logo" width={80} height={80} className="h-20 w-20 rounded-xl border border-border bg-white object-contain p-1" unoptimized />
                                        <button type="button" onClick={removeLogo} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-sm transition-opacity hover:bg-red-600 group-hover:opacity-100" title="Remover logo" aria-label="Remover logo">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30">
                                        <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                                    </div>
                                )}
                                <div className="flex-1">
                                    <label htmlFor="logo-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent">
                                        <Upload className="h-4 w-4" /> {logoPreview ? "Trocar logo" : "Escolher arquivo"}
                                    </label>
                                    <input id="logo-upload" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={pickLogo} className="hidden" />
                                    <p className="mt-1.5 text-xs text-muted-foreground">JPG, PNG, WebP ou SVG. Máx. 2 MB. É a capa do card em Imobiliárias.</p>
                                    {logoError && <p className="mt-1 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3 w-3" /> {logoError}</p>}
                                    {logoUploading && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><Loader2 className="h-3 w-3 animate-spin" /> Enviando logo...</p>}
                                </div>
                            </div>
                        </div>

                        <div id="field-name">
                            <Label htmlFor="agency-name">Razão social / Nome <span className="text-red-500">*</span></Label>
                            <Input id="agency-name" value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="Nome completo da imobiliária" className={cn(errors.name && "border-red-500")} maxLength={200} />
                            {err("name")}
                        </div>
                        <div id="field-trade_name">
                            <Label htmlFor="agency-trade-name">Nome fantasia</Label>
                            <Input id="agency-trade-name" value={form.trade_name} onChange={e => updateField("trade_name", e.target.value)} placeholder="Nome fantasia (opcional)" maxLength={200} />
                        </div>
                        <div id="field-cnpj">
                            <Label htmlFor="agency-cnpj">CNPJ</Label>
                            <Input id="agency-cnpj" value={form.cnpj} onChange={e => masked("cnpj", e.target.value, maskCNPJ)} placeholder="00.000.000/0000-00" className={cn(errors.cnpj && "border-red-500")} maxLength={18} />
                            {err("cnpj")}
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div id="field-creci_number">
                                <Label htmlFor="agency-creci">Nº CRECI</Label>
                                <Input id="agency-creci" value={form.creci_number} onChange={e => updateField("creci_number", e.target.value)} placeholder="Ex: 6013" maxLength={20} />
                            </div>
                            <div id="field-creci_state">
                                <Label htmlFor="agency-creci-state">UF CRECI</Label>
                                <select id="agency-creci-state" value={form.creci_state} onChange={e => updateField("creci_state", e.target.value)} className={selectClass}>
                                    <option value="">Selecione</option>
                                    {BRAZILIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                                </select>
                            </div>
                            <div id="field-creci_type">
                                <Label htmlFor="agency-creci-type">Tipo CRECI</Label>
                                <select id="agency-creci-type" value={form.creci_type} onChange={e => updateField("creci_type", e.target.value)} className={selectClass}>
                                    <option value="">Selecione</option>
                                    <option value="PJ">Pessoa Jurídica (PJ)</option>
                                    <option value="PF">Pessoa Física (PF)</option>
                                </select>
                            </div>
                        </div>
                        <div id="field-owner_name">
                            <Label htmlFor="agency-owner" className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" /> Responsável legal / Representante</Label>
                            <Input id="agency-owner" value={form.owner_name} onChange={e => updateField("owner_name", e.target.value)} placeholder="Nome completo do responsável ou representante legal" maxLength={200} />
                            <p className="mt-1 text-[11px] text-muted-foreground">Sócio administrador, corretor responsável ou representante citado no contrato.</p>
                        </div>
                    </div>
                </Section>

                <Section icon={<Phone className="h-5 w-5 text-primary" />} title="Contato" description="Telefone, e-mail e website da imobiliária.">
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-end gap-4">
                                <div className="flex-1" id="field-main_phone">
                                    <Label htmlFor="agency-phone">Telefone principal <span className="text-red-500">*</span></Label>
                                    <Input id="agency-phone" value={form.main_phone} onChange={e => masked("main_phone", e.target.value, maskPhone)} placeholder="(31) 99999-9999" className={cn(errors.main_phone && "border-red-500")} maxLength={15} />
                                </div>
                                <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap pb-2">
                                    <input type="checkbox" checked={form.main_phone_whatsapp} onChange={e => updateField("main_phone_whatsapp", e.target.checked)} className="h-4 w-4 rounded border-input" />
                                    <MessageCircle className="h-4 w-4 text-green-600" /><span className="text-sm text-foreground">WhatsApp</span>
                                </label>
                            </div>
                            {err("main_phone")}
                        </div>
                        <div>
                            <div className="flex items-end gap-4">
                                <div className="flex-1" id="field-additional_phone">
                                    <Label htmlFor="agency-phone2">Telefone adicional</Label>
                                    <Input id="agency-phone2" value={form.additional_phone} onChange={e => { masked("additional_phone", e.target.value, maskPhone); if (!e.target.value.trim()) updateField("additional_phone_whatsapp", false); }} placeholder="(31) 3561-3173 (opcional)" className={cn(errors.additional_phone && "border-red-500")} maxLength={15} />
                                </div>
                                <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap pb-2">
                                    <input type="checkbox" checked={form.additional_phone_whatsapp} onChange={e => updateField("additional_phone_whatsapp", e.target.checked)} className="h-4 w-4 rounded border-input" />
                                    <MessageCircle className="h-4 w-4 text-green-600" /><span className="text-sm text-foreground">WhatsApp</span>
                                </label>
                            </div>
                            {err("additional_phone")}
                        </div>
                        <div id="field-email">
                            <Label htmlFor="agency-email">E-mail</Label>
                            <Input id="agency-email" type="email" value={form.email} onChange={e => updateField("email", e.target.value)} placeholder="contato@imobiliaria.com.br (opcional)" className={cn(errors.email && "border-red-500")} maxLength={254} />
                            {err("email")}
                        </div>
                        <div id="field-website">
                            <Label htmlFor="agency-website">Website</Label>
                            <Input id="agency-website" value={form.website} onChange={e => updateField("website", e.target.value)} placeholder="www.imobiliaria.com.br (opcional)" className={cn(errors.website && "border-red-500")} maxLength={200} />
                            {err("website")}
                        </div>
                    </div>
                </Section>

                <Section icon={<MapPin className="h-5 w-5 text-primary" />} title="Endereço" description="Endereço comercial da imobiliária.">
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-end gap-3">
                                <div className="flex-1" id="field-postal_code">
                                    <Label htmlFor="agency-cep">CEP <span className="text-red-500">*</span></Label>
                                    <Input id="agency-cep" value={form.postal_code} onChange={e => masked("postal_code", e.target.value, maskCEP)} placeholder="35450-075" className={cn(errors.postal_code && "border-red-500")} maxLength={9} />
                                </div>
                                <Button type="button" variant="outline" onClick={lookupCEP} disabled={cepLoading} className="shrink-0">
                                    {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                    {cepLoading ? "Buscando..." : "Buscar CEP"}
                                </Button>
                            </div>
                            {err("postal_code")}
                            {cepError && <p className="mt-1 flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> {cepError}</p>}
                            {cepFilled && <p className="mt-1 flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" /> Endereço preenchido automaticamente.</p>}
                        </div>
                        <div id="field-street">
                            <Label htmlFor="agency-street">Logradouro <span className="text-red-500">*</span></Label>
                            <Input id="agency-street" value={form.street} onChange={e => updateField("street", e.target.value)} placeholder="Rua, Av., etc." className={cn(errors.street && "border-red-500")} maxLength={300} />
                            {err("street")}
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div id="field-street_number">
                                <Label htmlFor="agency-number">Número <span className="text-red-500">*</span></Label>
                                <Input id="agency-number" value={form.street_number} onChange={e => updateField("street_number", e.target.value)} placeholder="Nº" className={cn(errors.street_number && "border-red-500")} maxLength={20} />
                                {err("street_number")}
                            </div>
                            <div id="field-address_complement">
                                <Label htmlFor="agency-complement">Complemento</Label>
                                <Input id="agency-complement" value={form.address_complement} onChange={e => updateField("address_complement", e.target.value)} placeholder="Sala, andar, bloco (opcional)" maxLength={200} />
                            </div>
                        </div>
                        <div id="field-neighborhood">
                            <Label htmlFor="agency-neighborhood">Bairro <span className="text-red-500">*</span></Label>
                            <Input id="agency-neighborhood" value={form.neighborhood} onChange={e => updateField("neighborhood", e.target.value)} placeholder="Bairro" className={cn(errors.neighborhood && "border-red-500")} maxLength={200} />
                            {err("neighborhood")}
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div id="field-city">
                                <Label htmlFor="agency-city">Cidade <span className="text-red-500">*</span></Label>
                                <Input id="agency-city" value={form.city} onChange={e => updateField("city", e.target.value)} placeholder="Cidade" className={cn(errors.city && "border-red-500")} maxLength={200} />
                                {err("city")}
                            </div>
                            <div id="field-state">
                                <Label htmlFor="agency-state">Estado <span className="text-red-500">*</span></Label>
                                <select id="agency-state" value={form.state} onChange={e => updateField("state", e.target.value)} className={cn(selectClass, errors.state && "border-red-500")}>
                                    <option value="">Selecione o estado</option>
                                    {BRAZILIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                                {err("state")}
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="agency-country">País</Label>
                            <Input id="agency-country" value="Brasil" readOnly disabled className="bg-muted" />
                        </div>
                    </div>
                </Section>

                <Section icon={<FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />} iconClass="bg-amber-500/10" title="Contrato de Prestação de Serviços" description="O contrato de administração, a taxa de gestão acordada e a vigência.">
                    <div className="space-y-5">
                        <div>
                            <Label>Documento do Contrato (PDF ou Imagem)</Label>
                            <div className="mt-2">
                                {hasAgreement ? (
                                    <div className="flex flex-col items-start justify-between gap-3 overflow-hidden rounded-xl border border-amber-500/30 bg-amber-50/50 p-4 dark:bg-amber-950/20 sm:flex-row sm:items-center">
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <div className="shrink-0 rounded-xl bg-amber-100 p-2.5 text-amber-600 dark:bg-amber-900/50"><FileText className="h-6 w-6" /></div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="break-all text-sm font-semibold text-foreground">{agreementFile?.name || form.service_agreement_filename || "Contrato de Prestação de Serviços"}</p>
                                                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-900 dark:text-amber-200">{agreementFile ? "Novo arquivo" : "Anexado"}</span>
                                                </div>
                                                <p className="mt-0.5 text-xs text-muted-foreground">{agreementFile ? `${(agreementFile.size / (1024 * 1024)).toFixed(2)} MB • Será salvo ao enviar o formulário` : "Arquivo armazenado com segurança no sistema"}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                                            {(form.service_agreement_url || agreementFile) && (
                                                <a href={form.service_agreement_url || (agreementFile ? URL.createObjectURL(agreementFile) : "#")} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center rounded-lg border border-input bg-background p-2 text-foreground shadow-2xs transition-colors hover:bg-accent hover:text-amber-600" title="Visualizar documento" aria-label="Visualizar documento">
                                                    <Eye className="h-4 w-4" />
                                                </a>
                                            )}
                                            <label htmlFor="replace-agreement-file" className="flex cursor-pointer items-center justify-center rounded-lg border border-input bg-background p-2 text-foreground shadow-2xs transition-colors hover:bg-accent hover:text-amber-600" title="Substituir documento" aria-label="Substituir documento">
                                                <Pencil className="h-4 w-4" />
                                            </label>
                                            <input id="replace-agreement-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={pickAgreement} className="hidden" />
                                            <button type="button" onClick={() => setShowDeleteAgreement(true)} className="flex items-center justify-center rounded-lg border border-input bg-background p-2 text-red-600 shadow-2xs transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-900/50 dark:hover:bg-red-950/40" title="Remover documento" aria-label="Remover documento">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center transition-colors hover:border-amber-500/60">
                                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40"><FileText className="h-6 w-6" /></div>
                                        <p className="text-sm font-medium text-foreground">Anexar contrato de prestação de serviços</p>
                                        <p className="mb-4 mt-1 text-xs text-muted-foreground">PDF, JPG, PNG ou WebP de até 15MB</p>
                                        <label htmlFor="service-agreement-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90">
                                            <Upload className="h-4 w-4" /> Selecionar Contrato
                                        </label>
                                        <input id="service-agreement-upload" ref={agreementInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={pickAgreement} className="hidden" />
                                    </div>
                                )}
                                {agreementError && <p className="mt-1 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" /> {agreementError}</p>}
                                {agreementUploading && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando contrato...</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
                            <div id="field-management_fee">
                                <Label htmlFor="agency-management-fee">Taxa de Administração (%)</Label>
                                <div className="relative mt-1">
                                    <Input id="agency-management-fee" type="number" step="0.1" min="0" max="100" value={form.management_fee} onChange={e => updateField("management_fee", e.target.value)} placeholder="Ex: 10.0" className="pr-8" />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">Percentual do aluguel retido pela imobiliária: com ele o painel calcula o custo da gestão.</p>
                            </div>
                            <div id="field-agreement_start_date">
                                <Label htmlFor="agency-start-date">Início da Vigência</Label>
                                <Input id="agency-start-date" type="date" value={form.agreement_start_date} onChange={e => updateField("agreement_start_date", e.target.value)} className="mt-1" />
                                <p className="mt-1 text-[11px] text-muted-foreground">Data de início da contratação</p>
                            </div>
                            <div id="field-agreement_end_date">
                                <Label htmlFor="agency-end-date">Término da Vigência</Label>
                                <Input id="agency-end-date" type="date" value={form.agreement_end_date} onChange={e => updateField("agreement_end_date", e.target.value)} className="mt-1" />
                                <p className="mt-1 text-[11px] text-muted-foreground">O painel avisa 90 dias antes.</p>
                            </div>
                        </div>
                    </div>
                </Section>

                <Section icon={<MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />} iconClass="bg-blue-500/10" title="Observações e Comentários" description="Anotações internas sobre a imobiliária, regras de repasse, contatos especiais ou acordos particulares.">
                    <div id="field-description">
                        <Label htmlFor="agency-description">Notas Internas</Label>
                        <textarea id="agency-description" rows={4} value={form.description} onChange={e => updateField("description", e.target.value)} placeholder="Adicione anotações internas sobre esta imobiliária (ex: dia do repasse de aluguel, cláusulas especiais, dados bancários de depósito, contatos de corretores parceiros)..." className="mt-2 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">Visível apenas para você e administradores da sua conta.</p>
                    </div>
                </Section>

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Cancelar
                    </Button>
                    <Button type="submit" disabled={submitting} className="min-w-[200px]">
                        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="mr-2 h-4 w-4" /> {editingId ? "Salvar alterações" : "Cadastrar imobiliária"}</>}
                    </Button>
                </div>
            </form>

            {showDeleteAgreement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deletingAgreement && setShowDeleteAgreement(false)} />
                    <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
                        <button type="button" onClick={() => !deletingAgreement && setShowDeleteAgreement(false)} disabled={deletingAgreement} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
                        <div className="mb-6 text-center">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50"><AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" /></div>
                            <h2 className="mb-2 text-xl font-bold text-foreground">Remover contrato anexado?</h2>
                            <p className="text-sm text-muted-foreground">
                                Tem certeza de que deseja remover o documento <span className="font-semibold text-foreground">{agreementFile?.name || form.service_agreement_filename || "Contrato de Prestação de Serviços"}</span>? {editing?.id && form.service_agreement_url ? "O arquivo armazenado no sistema será excluído." : "O documento selecionado será desvinculado."}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowDeleteAgreement(false)} disabled={deletingAgreement}>Cancelar</Button>
                            <Button type="button" variant="destructive" className="flex-1" onClick={confirmRemoveAgreement} disabled={deletingAgreement}>
                                {deletingAgreement ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removendo...</> : "Sim, remover contrato"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
