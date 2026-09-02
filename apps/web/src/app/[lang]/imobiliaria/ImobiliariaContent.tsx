"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Building2,
    Phone,
    MapPin,
    User,
    Loader2,
    Save,
    ArrowLeft,
    Search,
    CheckCircle2,
    AlertTriangle,
    MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import AgencyProfileCard from '@/components/imobiliaria/AgencyProfileCard';
import type { AgencyWithRole, AgencyFormData } from '@/types/agency';
import {
    maskCNPJ,
    parseCNPJ,
    validateCNPJ,
    maskPhone,
    validatePhone,
    maskCEP,
    parseCEP,
    validateCEP,
    validateEmail,
    validateWebsite,
    BRAZILIAN_STATES,
    formatPhone,
    formatCEP,
    formatCNPJ,
} from '@/lib/validators';

// ── Types ────────────────────────────────────────────────────────────

type PageState = 'loading' | 'form' | 'profile' | 'editing';

interface FieldErrors {
    [key: string]: string;
}

// ── Initial form state ───────────────────────────────────────────────

function getEmptyFormData(): AgencyFormData {
    return {
        name: '',
        trade_name: '',
        cnpj: '',
        creci_number: '',
        creci_state: '',
        creci_type: '',
        owner_name: '',
        main_phone: '',
        additional_phone: '',
        main_phone_whatsapp: false,
        email: '',
        website: '',
        postal_code: '',
        street: '',
        street_number: '',
        address_complement: '',
        neighborhood: '',
        city: '',
        state: '',
        country: 'BR',
    };
}

function agencyToFormData(agency: AgencyWithRole): AgencyFormData {
    return {
        name: agency.name || '',
        trade_name: agency.trade_name || '',
        cnpj: agency.cnpj ? formatCNPJ(agency.cnpj) : '',
        creci_number: agency.creci_number || '',
        creci_state: agency.creci_state || '',
        creci_type: agency.creci_type || '',
        owner_name: agency.owner_name || '',
        main_phone: formatPhone(agency.main_phone),
        additional_phone: agency.additional_phone ? formatPhone(agency.additional_phone) : '',
        main_phone_whatsapp: agency.main_phone_whatsapp,
        email: agency.email || '',
        website: agency.website?.replace(/^https?:\/\//, '') || '',
        postal_code: formatCEP(agency.postal_code),
        street: agency.street || '',
        street_number: agency.street_number || '',
        address_complement: agency.address_complement || '',
        neighborhood: agency.neighborhood || '',
        city: agency.city || '',
        state: agency.state || '',
        country: agency.country || 'BR',
    };
}

// ── Component ────────────────────────────────────────────────────────

interface ImobiliariaContentProps {
    lang: string;
}

export default function ImobiliariaContent({ lang }: ImobiliariaContentProps) {
    const router = useRouter();

    // Page state
    const [pageState, setPageState] = useState<PageState>('loading');
    const [agency, setAgency] = useState<AgencyWithRole | null>(null);

    // Form state
    const [form, setForm] = useState<AgencyFormData>(getEmptyFormData());
    const [errors, setErrors] = useState<FieldErrors>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    // CEP lookup state
    const [cepLoading, setCepLoading] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const [cepFilled, setCepFilled] = useState(false);

    // ── Fetch agency on mount ────────────────────────────────────────

    useEffect(() => {
        async function fetchAgency() {
            try {
                const res = await fetch('/api/agencies');
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                if (data.agency) {
                    setAgency(data.agency);
                    setPageState('profile');
                } else {
                    setPageState('form');
                }
            } catch (err) {
                console.error('[Imobiliária] Error fetching agency:', err);
                setPageState('form');
            }
        }
        fetchAgency();
    }, []);

    // ── Form field handlers ──────────────────────────────────────────

    const updateField = useCallback((field: keyof AgencyFormData, value: string | boolean) => {
        setForm(prev => ({ ...prev, [field]: value }));
        // Clear field error on change
        setErrors(prev => {
            if (prev[field]) {
                const next = { ...prev };
                delete next[field];
                return next;
            }
            return prev;
        });
        setSubmitError(null);
        setSubmitSuccess(false);
    }, []);

    const handleMaskedInput = useCallback((field: keyof AgencyFormData, value: string, maskFn: (v: string) => string) => {
        updateField(field, maskFn(value));
    }, [updateField]);

    // ── CEP auto-fill ────────────────────────────────────────────────

    const lookupCEP = useCallback(async () => {
        const digits = parseCEP(form.postal_code);
        if (!validateCEP(digits)) {
            setCepError('CEP deve ter 8 dígitos.');
            return;
        }

        setCepLoading(true);
        setCepError(null);
        setCepFilled(false);

        try {
            const res = await fetch(`/api/cep?code=${digits}`);
            const data = await res.json();

            if (!res.ok) {
                setCepError(data.error || 'CEP não encontrado.');
                return;
            }

            setForm(prev => ({
                ...prev,
                street: data.street || prev.street,
                neighborhood: data.neighborhood || prev.neighborhood,
                city: data.city || prev.city,
                state: data.state || prev.state,
            }));

            // Clear errors for auto-filled fields
            setErrors(prev => {
                const next = { ...prev };
                delete next.street;
                delete next.neighborhood;
                delete next.city;
                delete next.state;
                return next;
            });

            setCepFilled(true);
        } catch {
            setCepError('Erro ao consultar CEP. Tente novamente.');
        } finally {
            setCepLoading(false);
        }
    }, [form.postal_code]);

    // ── Client-side validation ───────────────────────────────────────

    const validate = useCallback((): FieldErrors => {
        const errs: FieldErrors = {};

        if (!form.name.trim()) errs.name = 'Nome da imobiliária é obrigatório.';
        if (!form.main_phone.trim()) {
            errs.main_phone = 'Telefone principal é obrigatório.';
        } else if (!validatePhone(form.main_phone)) {
            errs.main_phone = 'Telefone inválido. Use (XX) XXXXX-XXXX.';
        }
        if (!form.postal_code.trim() || !validateCEP(form.postal_code)) {
            errs.postal_code = 'CEP é obrigatório (8 dígitos).';
        }
        if (!form.street.trim()) errs.street = 'Logradouro é obrigatório.';
        if (!form.street_number.trim()) errs.street_number = 'Número é obrigatório.';
        if (!form.neighborhood.trim()) errs.neighborhood = 'Bairro é obrigatório.';
        if (!form.city.trim()) errs.city = 'Cidade é obrigatória.';
        if (!form.state.trim()) errs.state = 'Estado é obrigatório.';

        // Optional field validation
        const cnpjDigits = parseCNPJ(form.cnpj);
        if (cnpjDigits.length > 0 && cnpjDigits.length !== 14) {
            errs.cnpj = 'CNPJ deve ter 14 dígitos.';
        } else if (cnpjDigits.length === 14 && !validateCNPJ(cnpjDigits)) {
            errs.cnpj = 'CNPJ inválido. Verifique os dígitos.';
        }

        if (form.email.trim() && !validateEmail(form.email)) {
            errs.email = 'E-mail inválido.';
        }

        if (form.additional_phone.trim() && !validatePhone(form.additional_phone)) {
            errs.additional_phone = 'Telefone inválido.';
        }

        if (form.website.trim() && !validateWebsite(form.website)) {
            errs.website = 'Website inválido.';
        }

        return errs;
    }, [form]);

    // ── Submit handler ───────────────────────────────────────────────

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        const validationErrors = validate();
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            // Scroll to first error
            const firstErrorField = Object.keys(validationErrors)[0];
            document.getElementById(`field-${firstErrorField}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
            return;
        }

        setSubmitting(true);
        setSubmitError(null);

        try {
            const isEditing = pageState === 'editing' && agency;
            const url = isEditing ? `/api/agencies/${agency.id}` : '/api/agencies';
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.errors) {
                    setErrors(data.errors);
                    const firstErrorField = Object.keys(data.errors)[0];
                    document.getElementById(`field-${firstErrorField}`)?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                    });
                } else {
                    setSubmitError(data.error || 'Erro ao salvar. Tente novamente.');
                }
                return;
            }

            setAgency(data.agency);
            setSubmitSuccess(true);
            setPageState('profile');
        } catch {
            setSubmitError('Erro de conexão. Verifique sua internet e tente novamente.');
        } finally {
            setSubmitting(false);
        }
    }, [form, validate, pageState, agency]);

    // ── Edit mode handler ────────────────────────────────────────────

    const startEditing = useCallback(() => {
        if (agency) {
            setForm(agencyToFormData(agency));
            setErrors({});
            setSubmitError(null);
            setSubmitSuccess(false);
            setCepFilled(false);
            setPageState('editing');
        }
    }, [agency]);

    const cancelEditing = useCallback(() => {
        setErrors({});
        setSubmitError(null);
        if (agency) {
            setPageState('profile');
        } else {
            router.push(`/${lang}/dashboard`);
        }
    }, [agency, router, lang]);

    // ── Check if form has all required fields for submit ──────────────

    const isFormValid = form.name.trim() !== '' &&
        form.main_phone.trim() !== '' &&
        validatePhone(form.main_phone) &&
        validateCEP(form.postal_code) &&
        form.street.trim() !== '' &&
        form.street_number.trim() !== '' &&
        form.neighborhood.trim() !== '' &&
        form.city.trim() !== '' &&
        form.state.trim() !== '';

    // ── Render ───────────────────────────────────────────────────────

    // Loading state
    if (pageState === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Carregando...</p>
                </div>
            </div>
        );
    }

    // Profile view
    if (pageState === 'profile' && agency) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-foreground">Imobiliária</h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie os dados da sua imobiliária.
                    </p>
                </div>

                {submitSuccess && (
                    <div className="mb-6 flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-sm">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Dados salvos com sucesso!
                    </div>
                )}

                <AgencyProfileCard agency={agency} onEdit={startEditing} />
            </div>
        );
    }

    // Registration / Edit form
    const isEditing = pageState === 'editing';

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Page Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground">
                    {isEditing ? 'Editar Imobiliária' : 'Cadastrar Imobiliária'}
                </h1>
                <p className="text-muted-foreground mt-2">
                    {isEditing
                        ? 'Atualize os dados da sua imobiliária.'
                        : 'Cadastre os dados da sua imobiliária para gerenciar imóveis, corretores e anúncios no Kitnets.com.'
                    }
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                    Campos marcados com <span className="text-red-500">*</span> são obrigatórios.
                </p>
            </div>

            {/* Global error */}
            {submitError && (
                <div className="mb-6 flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {submitError}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
                {/* ── Section 1: Informações da imobiliária ──────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">Informações da imobiliária</h2>
                    </div>

                    <div className="space-y-5">
                        {/* Name */}
                        <div id="field-name">
                            <Label htmlFor="agency-name">
                                Nome da imobiliária <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="agency-name"
                                value={form.name}
                                onChange={(e) => updateField('name', e.target.value)}
                                placeholder="Ex: Imobiliária Central Ltda"
                                className={cn(errors.name && 'border-red-500')}
                                maxLength={200}
                            />
                            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                        </div>

                        {/* Trade Name */}
                        <div>
                            <Label htmlFor="agency-trade-name">Nome fantasia</Label>
                            <Input
                                id="agency-trade-name"
                                value={form.trade_name}
                                onChange={(e) => updateField('trade_name', e.target.value)}
                                placeholder="Ex: Central Imóveis"
                                maxLength={200}
                            />
                        </div>

                        {/* CNPJ */}
                        <div id="field-cnpj">
                            <Label htmlFor="agency-cnpj">CNPJ</Label>
                            <Input
                                id="agency-cnpj"
                                value={form.cnpj}
                                onChange={(e) => handleMaskedInput('cnpj', e.target.value, maskCNPJ)}
                                placeholder="00.000.000/0000-00"
                                className={cn('font-mono', errors.cnpj && 'border-red-500')}
                                maxLength={18}
                            />
                            {errors.cnpj && <p className="text-xs text-red-500 mt-1">{errors.cnpj}</p>}
                        </div>

                        {/* CRECI */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-1">
                                <Label htmlFor="agency-creci">Nº CRECI</Label>
                                <Input
                                    id="agency-creci"
                                    value={form.creci_number}
                                    onChange={(e) => updateField('creci_number', e.target.value)}
                                    placeholder="Ex: 12345"
                                    maxLength={20}
                                />
                            </div>
                            <div>
                                <Label htmlFor="agency-creci-state">UF CRECI</Label>
                                <select
                                    id="agency-creci-state"
                                    value={form.creci_state}
                                    onChange={(e) => updateField('creci_state', e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">Selecione</option>
                                    {BRAZILIAN_STATES.map(s => (
                                        <option key={s.code} value={s.code}>{s.code}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="agency-creci-type">Tipo CRECI</Label>
                                <select
                                    id="agency-creci-type"
                                    value={form.creci_type}
                                    onChange={(e) => updateField('creci_type', e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">Selecione</option>
                                    <option value="PJ">PJ (Pessoa Jurídica)</option>
                                    <option value="PF">PF (Pessoa Física)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Section 2: Responsável ──────────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <User className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">Responsável</h2>
                    </div>

                    <div>
                        <Label htmlFor="agency-owner-name">Nome do responsável legal</Label>
                        <Input
                            id="agency-owner-name"
                            value={form.owner_name}
                            onChange={(e) => updateField('owner_name', e.target.value)}
                            placeholder="Ex: João da Silva"
                            maxLength={200}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Representante legal ou sócio administrador.
                        </p>
                    </div>
                </section>

                {/* ── Section 3: Contato ──────────────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Phone className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">Contato</h2>
                    </div>

                    <div className="space-y-5">
                        {/* Main Phone */}
                        <div id="field-main_phone">
                            <Label htmlFor="agency-phone">
                                Telefone principal <span className="text-red-500">*</span>
                            </Label>
                            <div className="flex items-center gap-3">
                                <Input
                                    id="agency-phone"
                                    value={form.main_phone}
                                    onChange={(e) => handleMaskedInput('main_phone', e.target.value, maskPhone)}
                                    placeholder="(41) 99999-9999"
                                    className={cn('flex-1', errors.main_phone && 'border-red-500')}
                                    maxLength={15}
                                />
                                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={form.main_phone_whatsapp}
                                        onChange={(e) => updateField('main_phone_whatsapp', e.target.checked)}
                                        className="rounded border-input"
                                    />
                                    <MessageCircle className="w-4 h-4 text-green-600" />
                                    WhatsApp
                                </label>
                            </div>
                            {errors.main_phone && <p className="text-xs text-red-500 mt-1">{errors.main_phone}</p>}
                        </div>

                        {/* Additional Phone */}
                        <div id="field-additional_phone">
                            <Label htmlFor="agency-phone2">Telefone adicional</Label>
                            <Input
                                id="agency-phone2"
                                value={form.additional_phone}
                                onChange={(e) => handleMaskedInput('additional_phone', e.target.value, maskPhone)}
                                placeholder="(41) 3333-4444"
                                className={cn(errors.additional_phone && 'border-red-500')}
                                maxLength={15}
                            />
                            {errors.additional_phone && <p className="text-xs text-red-500 mt-1">{errors.additional_phone}</p>}
                        </div>

                        {/* Email */}
                        <div id="field-email">
                            <Label htmlFor="agency-email">E-mail</Label>
                            <Input
                                id="agency-email"
                                type="email"
                                value={form.email}
                                onChange={(e) => updateField('email', e.target.value)}
                                placeholder="contato@imobiliaria.com.br"
                                className={cn(errors.email && 'border-red-500')}
                                maxLength={254}
                            />
                            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                        </div>

                        {/* Website */}
                        <div id="field-website">
                            <Label htmlFor="agency-website">Website</Label>
                            <Input
                                id="agency-website"
                                type="url"
                                value={form.website}
                                onChange={(e) => updateField('website', e.target.value)}
                                placeholder="www.imobiliaria.com.br"
                                className={cn(errors.website && 'border-red-500')}
                                maxLength={500}
                            />
                            {errors.website && <p className="text-xs text-red-500 mt-1">{errors.website}</p>}
                        </div>
                    </div>
                </section>

                {/* ── Section 4: Endereço ─────────────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <MapPin className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">Endereço</h2>
                    </div>

                    <div className="space-y-5">
                        {/* CEP */}
                        <div id="field-postal_code">
                            <Label htmlFor="agency-cep">
                                CEP <span className="text-red-500">*</span>
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="agency-cep"
                                    value={form.postal_code}
                                    onChange={(e) => {
                                        handleMaskedInput('postal_code', e.target.value, maskCEP);
                                        setCepFilled(false);
                                        setCepError(null);
                                    }}
                                    placeholder="80000-000"
                                    className={cn('w-40 font-mono', errors.postal_code && 'border-red-500')}
                                    maxLength={9}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={lookupCEP}
                                    disabled={cepLoading || !validateCEP(form.postal_code)}
                                >
                                    {cepLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    ) : (
                                        <Search className="w-4 h-4 mr-1" />
                                    )}
                                    Buscar CEP
                                </Button>
                                {cepFilled && (
                                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                                )}
                            </div>
                            {errors.postal_code && <p className="text-xs text-red-500 mt-1">{errors.postal_code}</p>}
                            {cepError && <p className="text-xs text-red-500 mt-1">{cepError}</p>}
                        </div>

                        {/* Street */}
                        <div id="field-street">
                            <Label htmlFor="agency-street">
                                Logradouro <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="agency-street"
                                value={form.street}
                                onChange={(e) => updateField('street', e.target.value)}
                                placeholder="Rua, Avenida, Travessa..."
                                className={cn(errors.street && 'border-red-500')}
                                maxLength={300}
                            />
                            {errors.street && <p className="text-xs text-red-500 mt-1">{errors.street}</p>}
                        </div>

                        {/* Number + Complement */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div id="field-street_number">
                                <Label htmlFor="agency-number">
                                    Número <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="agency-number"
                                    value={form.street_number}
                                    onChange={(e) => updateField('street_number', e.target.value)}
                                    placeholder="123 ou S/N"
                                    className={cn(errors.street_number && 'border-red-500')}
                                    maxLength={20}
                                />
                                {errors.street_number && <p className="text-xs text-red-500 mt-1">{errors.street_number}</p>}
                            </div>
                            <div>
                                <Label htmlFor="agency-complement">Complemento</Label>
                                <Input
                                    id="agency-complement"
                                    value={form.address_complement}
                                    onChange={(e) => updateField('address_complement', e.target.value)}
                                    placeholder="Sala, Andar, Bloco..."
                                    maxLength={200}
                                />
                            </div>
                        </div>

                        {/* Neighborhood */}
                        <div id="field-neighborhood">
                            <Label htmlFor="agency-neighborhood">
                                Bairro <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="agency-neighborhood"
                                value={form.neighborhood}
                                onChange={(e) => updateField('neighborhood', e.target.value)}
                                placeholder="Bairro"
                                className={cn(errors.neighborhood && 'border-red-500')}
                                maxLength={200}
                            />
                            {errors.neighborhood && <p className="text-xs text-red-500 mt-1">{errors.neighborhood}</p>}
                        </div>

                        {/* City + State */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div id="field-city">
                                <Label htmlFor="agency-city">
                                    Cidade <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="agency-city"
                                    value={form.city}
                                    onChange={(e) => updateField('city', e.target.value)}
                                    placeholder="Cidade"
                                    className={cn(errors.city && 'border-red-500')}
                                    maxLength={200}
                                />
                                {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
                            </div>
                            <div id="field-state">
                                <Label htmlFor="agency-state">
                                    Estado <span className="text-red-500">*</span>
                                </Label>
                                <select
                                    id="agency-state"
                                    value={form.state}
                                    onChange={(e) => updateField('state', e.target.value)}
                                    className={cn(
                                        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                        errors.state && 'border-red-500'
                                    )}
                                >
                                    <option value="">Selecione o estado</option>
                                    {BRAZILIAN_STATES.map(s => (
                                        <option key={s.code} value={s.code}>{s.name}</option>
                                    ))}
                                </select>
                                {errors.state && <p className="text-xs text-red-500 mt-1">{errors.state}</p>}
                            </div>
                        </div>

                        {/* Country (auto-filled, read-only) */}
                        <div>
                            <Label htmlFor="agency-country">País</Label>
                            <Input
                                id="agency-country"
                                value="Brasil"
                                readOnly
                                disabled
                                className="bg-muted"
                            />
                        </div>
                    </div>
                </section>

                {/* ── Form Footer ──────────────────────────────────────── */}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3 pt-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={cancelEditing}
                        disabled={submitting}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {isEditing ? 'Cancelar' : 'Voltar ao Dashboard'}
                    </Button>

                    <Button
                        type="submit"
                        disabled={submitting || !isFormValid}
                        className="min-w-[200px]"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                {isEditing ? 'Salvar alterações' : 'Cadastrar imobiliária'}
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
