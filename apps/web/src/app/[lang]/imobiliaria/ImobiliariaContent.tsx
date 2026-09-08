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
    ArrowRight,
    Search,
    CheckCircle2,
    AlertTriangle,
    MessageCircle,
    Plus,
    ChevronDown,
    ChevronUp,
    X,
    Upload,
    Trash2,
    ImageIcon,
    ExternalLink,
    Shield,
    Edit3,
    Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import AgencyProfileCard from '@/components/imobiliaria/AgencyProfileCard';
import { Badge } from '@/components/ui/badge';
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

type PageState = 'loading' | 'list' | 'form' | 'editing';

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
        additional_phone_whatsapp: false,
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
        main_phone_whatsapp: agency.main_phone_whatsapp ?? false,
        additional_phone_whatsapp: agency.additional_phone_whatsapp ?? false,
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

function getStatusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    switch (status) {
        case 'ACTIVE':
            return { label: 'Ativa', variant: 'default' };
        case 'VERIFIED':
            return { label: 'Verificada', variant: 'default' };
        case 'DRAFT':
            return { label: 'Rascunho', variant: 'secondary' };
        case 'SUSPENDED':
            return { label: 'Suspensa', variant: 'destructive' };
        default:
            return { label: status, variant: 'outline' };
    }
}

function getRoleLabel(role: string): string {
    switch (role) {
        case 'OWNER': return 'Proprietário';
        case 'ADMIN': return 'Administrador';
        case 'MANAGER': return 'Gerente';
        case 'AGENT': return 'Corretor';
        case 'VIEWER': return 'Visualizador';
        default: return role;
    }
}

// ── Component ────────────────────────────────────────────────────────

interface ImobiliariaContentProps {
    lang: string;
}

export default function ImobiliariaContent({ lang }: ImobiliariaContentProps) {
    const router = useRouter();

    // Page state
    const [pageState, setPageState] = useState<PageState>('loading');
    const [agencies, setAgencies] = useState<AgencyWithRole[]>([]);
    const [editingAgency, setEditingAgency] = useState<AgencyWithRole | null>(null);

    // Filter tab & detail modal states
    const [filterTab, setFilterTab] = useState<'all' | 'active' | 'verified'>('all');
    const [selectedAgencyForDetail, setSelectedAgencyForDetail] = useState<AgencyWithRole | null>(null);

    // Delete confirmation
    const [deletingAgency, setDeletingAgency] = useState<AgencyWithRole | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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

    // Logo upload state
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoUploading, setLogoUploading] = useState(false);
    const [logoError, setLogoError] = useState<string | null>(null);

    // ── Fetch agencies on mount ──────────────────────────────────────

    const fetchAgencies = useCallback(async () => {
        try {
            const res = await fetch('/api/agencies');
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setAgencies(data.agencies || []);
            setPageState('list');
        } catch (err) {
            console.error('[Imobiliária] Error fetching agencies:', err);
            setAgencies([]);
            setPageState('list');
        }
    }, []);

    useEffect(() => {
        fetchAgencies();
    }, [fetchAgencies]);


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

    // ── Logo upload helper ───────────────────────────────────────────

    const uploadLogo = useCallback(async (agencyId: string) => {
        if (!logoFile) return;

        setLogoUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', logoFile);

            const res = await fetch(`/api/agencies/${agencyId}/logo`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const data = await res.json();
                setLogoError(data.error || 'Erro ao fazer upload do logo.');
            }
        } catch {
            setLogoError('Erro de conexão ao fazer upload do logo.');
        } finally {
            setLogoUploading(false);
        }
    }, [logoFile]);

    // ── Submit handler ───────────────────────────────────────────────

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        const validationErrors = validate();
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
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
            const isEditing = pageState === 'editing' && editingAgency;
            const url = isEditing ? `/api/agencies/${editingAgency.id}` : '/api/agencies';
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

            setSubmitSuccess(true);

            // Upload logo if a new file was selected
            if (logoFile && data.agency?.id) {
                await uploadLogo(data.agency.id);
            }

            // Refetch agencies list to get updated data
            await fetchAgencies();
        } catch {
            setSubmitError('Erro de conexão. Verifique sua internet e tente novamente.');
        } finally {
            setSubmitting(false);
        }
    }, [form, validate, pageState, editingAgency, fetchAgencies, logoFile, uploadLogo]);

    // ── Navigation handlers ──────────────────────────────────────────

    const startAdding = useCallback(() => {
        setForm(getEmptyFormData());
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setCepFilled(false);
        setEditingAgency(null);
        setLogoPreview(null);
        setLogoFile(null);
        setLogoError(null);
        setPageState('form');
    }, []);

    const startEditing = useCallback((agency: AgencyWithRole) => {
        setForm(agencyToFormData(agency));
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setCepFilled(false);
        setEditingAgency(agency);
        setLogoPreview(agency.logo_url || null);
        setLogoFile(null);
        setLogoError(null);
        setPageState('editing');
    }, []);

    // ── Logo upload handlers ─────────────────────────────────────────

    const handleLogoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        if (!allowedTypes.includes(file.type)) {
            setLogoError('Formato não suportado. Use JPG, PNG, WebP ou SVG.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setLogoError('Arquivo muito grande. Máximo 2 MB.');
            return;
        }

        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
        setLogoError(null);
    }, []);

    const removeLogo = useCallback(async () => {
        if (editingAgency?.id && editingAgency.logo_url) {
            // Remove from server
            try {
                await fetch(`/api/agencies/${editingAgency.id}/logo`, { method: 'DELETE' });
            } catch {
                // Ignore — we still clear locally
            }
        }
        setLogoPreview(null);
        setLogoFile(null);
        setLogoError(null);
    }, [editingAgency]);

    const cancelForm = useCallback(() => {
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setEditingAgency(null);
        setPageState('list');
    }, []);

    // ── Delete handlers ──────────────────────────────────────────────

    const confirmDelete = useCallback((agency: AgencyWithRole) => {
        setDeletingAgency(agency);
        setDeleteError(null);
    }, []);

    const cancelDelete = useCallback(() => {
        setDeletingAgency(null);
        setDeleteError(null);
    }, []);

    const executeDelete = useCallback(async () => {
        if (!deletingAgency) return;

        setDeleteLoading(true);
        setDeleteError(null);

        try {
            const res = await fetch(`/api/agencies/${deletingAgency.id}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (!res.ok) {
                setDeleteError(data.error || 'Erro ao excluir imobiliária.');
                return;
            }

            // Remove from local state
            setAgencies(prev => prev.filter(a => a.id !== deletingAgency.id));
            if (selectedAgencyForDetail?.id === deletingAgency.id) {
                setSelectedAgencyForDetail(null);
            }
            setDeletingAgency(null);
        } catch {
            setDeleteError('Erro de conexão. Tente novamente.');
        } finally {
            setDeleteLoading(false);
        }
    }, [deletingAgency, selectedAgencyForDetail]);

    // ── Check if form has all required fields ────────────────────────

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
            <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                <p className="text-sm font-medium text-muted-foreground">
                    Carregando suas imobiliárias...
                </p>
            </div>
        );
    }

    // Counts for filter tabs
    const activeCount = agencies.filter(a => a.status === 'ACTIVE').length;
    const verifiedCount = agencies.filter(a => a.status === 'VERIFIED').length;

    const filteredAgencies = agencies.filter(a => {
        if (filterTab === 'active') return a.status === 'ACTIVE';
        if (filterTab === 'verified') return a.status === 'VERIFIED';
        return true;
    });

    // ── List view ────────────────────────────────────────────────────
    if (pageState === 'list') {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                {/* Top Navigation & Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Link
                                href={lang === 'pt' ? '/dashboard' : `/${lang}/dashboard`}
                                className="inline-flex items-center font-medium hover:text-foreground transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4 mr-1.5" />
                                Dashboard
                            </Link>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-600">
                                <Building2 className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                                    Gestão de Imobiliárias
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    Selecione a imobiliária para visualizar detalhes, CRECI, contatos e gerenciar o cadastro
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Header Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
                        <Button
                            onClick={startAdding}
                            className="bg-amber-600 hover:bg-amber-700 text-white gap-2 text-sm font-medium shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Adicionar Imobiliária
                        </Button>

                        <Link href={lang === 'pt' ? '/imoveis' : `/${lang}/imoveis`}>
                            <Button variant="outline" className="gap-2 text-sm font-medium">
                                <Building2 className="w-4 h-4" />
                                Meus Imóveis
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Success message */}
                {submitSuccess && (
                    <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-sm">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Dados salvos com sucesso!
                    </div>
                )}

                {/* Filter Tabs if user has agencies */}
                {agencies.length > 0 && (
                    <div className="flex items-center gap-2 border-b border-border pb-3">
                        <button
                            onClick={() => setFilterTab('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                filterTab === 'all'
                                    ? 'bg-foreground text-background shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            }`}
                        >
                            Todas as Imobiliárias ({agencies.length})
                        </button>
                        <button
                            onClick={() => setFilterTab('active')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                filterTab === 'active'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            }`}
                        >
                            <Building2 className="w-3.5 h-3.5" />
                            Ativas ({activeCount})
                        </button>
                        {verifiedCount > 0 && (
                            <button
                                onClick={() => setFilterTab('verified')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    filterTab === 'verified'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Verificadas ({verifiedCount})
                            </button>
                        )}
                    </div>
                )}

                {/* Agencies Grid */}
                {filteredAgencies.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredAgencies.map((agency) => {
                            const canEdit = agency.role === 'OWNER' || agency.role === 'ADMIN';
                            const canDelete = agency.role === 'OWNER';

                            const streetWithNumber = [agency.street, agency.street_number].filter(Boolean).join(', ');
                            const addressParts = [
                                streetWithNumber,
                                agency.neighborhood,
                                [agency.city, agency.state].filter(Boolean).join('/'),
                            ].filter(Boolean);
                            const formattedAddress = addressParts.join(' - ');

                            return (
                                <div
                                    key={agency.id}
                                    className={`group relative flex flex-col justify-between rounded-2xl border bg-card p-6 shadow-xs transition-all duration-200 hover:shadow-md ${
                                        agency.status === 'VERIFIED'
                                            ? 'border-emerald-500/40 dark:border-emerald-500/30 hover:border-emerald-500'
                                            : agency.status === 'ACTIVE'
                                            ? 'border-amber-500/40 dark:border-amber-500/30 hover:border-amber-500'
                                            : 'border-border hover:border-muted-foreground/40'
                                    }`}
                                >
                                    <div className="space-y-4">
                                        {/* Header: Name + Badges + Actions */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1 flex-1">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-semibold text-lg text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-1">
                                                        {agency.trade_name ? agency.trade_name.toUpperCase() : agency.name.toUpperCase()}
                                                    </h3>

                                                    {/* Quick Action Icons */}
                                                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                                        {canEdit && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    startEditing(agency);
                                                                }}
                                                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                                                title="Editar imobiliária"
                                                                aria-label="Editar imobiliária"
                                                            >
                                                                <Edit3 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        {canDelete && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    confirmDelete(agency);
                                                                }}
                                                                className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                                                title="Excluir imobiliária"
                                                                aria-label="Excluir imobiliária"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Address */}
                                                {formattedAddress ? (
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                                                        <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                                        {formattedAddress}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                                                        <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                                        Endereço não cadastrado
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Tags Row */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {/* Status Badge */}
                                            {agency.status === 'VERIFIED' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                    Imobiliária Verificada
                                                </span>
                                            ) : agency.status === 'ACTIVE' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                                    <Building2 className="w-3.5 h-3.5 text-amber-500" />
                                                    Cadastro Ativo
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-normal bg-muted text-muted-foreground">
                                                    {agency.status === 'DRAFT' ? 'Rascunho' : agency.status}
                                                </span>
                                            )}

                                            {/* CRECI Badge */}
                                            {agency.creci_number && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                                                    <Shield className="w-3.5 h-3.5 text-blue-500" />
                                                    CRECI {agency.creci_number}{agency.creci_state ? `/${agency.creci_state}` : ''}{agency.creci_type ? ` (${agency.creci_type})` : ''}
                                                </span>
                                            )}

                                            {/* CNPJ Monospace Badge (matching UC: ...) */}
                                            {agency.cnpj && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground">
                                                    CNPJ: {formatCNPJ(agency.cnpj)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Notes / Razão Social */}
                                        {agency.trade_name && agency.name !== agency.trade_name ? (
                                            <p className="text-[11px] text-muted-foreground/80 line-clamp-1 italic">
                                                Razão Social: {agency.name}
                                            </p>
                                        ) : agency.description ? (
                                            <p className="text-[11px] text-muted-foreground/80 line-clamp-1 italic">
                                                Obs: {agency.description}
                                            </p>
                                        ) : null}

                                        {/* Logo & Contact / WhatsApp Row */}
                                        <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                {agency.logo_url ? (
                                                    <div className="px-2 py-1 bg-background border border-border rounded-lg flex items-center justify-center max-h-8">
                                                        <img
                                                            src={agency.logo_url}
                                                            alt={agency.trade_name || agency.name}
                                                            className="h-6 max-w-[90px] object-contain"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="px-2 py-1 bg-muted/30 border border-border rounded-lg flex items-center gap-1.5 text-foreground font-medium text-xs">
                                                        <Building2 className="w-3.5 h-3.5 text-amber-500" />
                                                        <span className="truncate max-w-[120px]">
                                                            {agency.trade_name || agency.name}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="text-right">
                                                {agency.main_phone_whatsapp && agency.main_phone ? (
                                                    <a
                                                        href={`https://wa.me/${agency.main_phone.replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-foreground font-medium flex items-center gap-1 justify-end text-green-600 dark:text-green-400 hover:underline transition-colors"
                                                        title="Abrir WhatsApp"
                                                    >
                                                        <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                                                        <span>{formatPhone(agency.main_phone)}</span>
                                                    </a>
                                                ) : agency.main_phone ? (
                                                    <span className="text-muted-foreground flex items-center gap-1 justify-end">
                                                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                                                        {formatPhone(agency.main_phone)}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground flex items-center gap-1 justify-end">
                                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                                        Sem telefone
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom block: Responsável & Role + CTA Button */}
                                    <div className="pt-4 mt-4 border-t border-border/60 space-y-3">
                                        <div className="p-3 bg-muted/40 dark:bg-muted/20 border border-border/80 rounded-xl flex items-center justify-between">
                                            <div className="space-y-0.5">
                                                <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-1">
                                                    <User className="w-3 h-3 text-amber-500" />
                                                    Responsável Legal
                                                </span>
                                                <p className="text-xs font-semibold text-foreground truncate max-w-[140px] sm:max-w-[170px]">
                                                    {agency.owner_name || 'Não informado'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground block">
                                                    Seu Perfil
                                                </span>
                                                <span className="text-xs font-bold text-foreground">
                                                    {getRoleLabel(agency.role)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* CTA Action */}
                                        <Button
                                            onClick={() => setSelectedAgencyForDetail(agency)}
                                            className={`w-full justify-between group-hover:bg-amber-600 group-hover:text-white transition-all ${
                                                agency.status === 'VERIFIED'
                                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                                            }`}
                                        >
                                            <span>Gerenciar Imobiliária</span>
                                            <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* Empty state */
                    <div className="border-2 border-dashed border-border rounded-3xl p-12 text-center bg-card space-y-4 max-w-xl mx-auto">
                        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                            <Building2 className="w-8 h-8" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-foreground">
                                {agencies.length === 0
                                    ? 'Nenhuma imobiliária cadastrada'
                                    : 'Nenhuma imobiliária encontrada nesta categoria'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {agencies.length === 0
                                    ? 'Cadastre sua primeira imobiliária para gerenciar imóveis, corretores e anúncios no Kitnets.com.'
                                    : 'Alterne os filtros acima para visualizar suas imobiliárias cadastradas ou adicione uma nova.'}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                            <Button
                                onClick={startAdding}
                                className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-medium"
                            >
                                <Plus className="w-4 h-4" />
                                Adicionar Imobiliária
                            </Button>
                            <Link href={lang === 'pt' ? '/imoveis' : `/${lang}/imoveis`}>
                                <Button variant="outline" className="gap-2 font-medium">
                                    <Building2 className="w-4 h-4" />
                                    Meus Imóveis
                                </Button>
                            </Link>
                        </div>
                    </div>
                )}

                {/* Detail View Modal */}
                {selectedAgencyForDetail && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setSelectedAgencyForDetail(null)}
                        />
                        <div className="relative bg-card border border-border rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
                            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-amber-600" />
                                    <h2 className="text-lg font-semibold text-foreground">
                                        Detalhes da Imobiliária
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedAgencyForDetail(null)}
                                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    aria-label="Fechar modal"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <AgencyProfileCard
                                agency={selectedAgencyForDetail}
                                onEdit={() => {
                                    const agency = selectedAgencyForDetail;
                                    setSelectedAgencyForDetail(null);
                                    startEditing(agency);
                                }}
                                onDelete={() => {
                                    const agency = selectedAgencyForDetail;
                                    setSelectedAgencyForDetail(null);
                                    confirmDelete(agency);
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Delete confirmation modal */}
                {deletingAgency && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={cancelDelete}
                        />

                        {/* Modal */}
                        <div className="relative bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-8">
                            <button
                                type="button"
                                onClick={cancelDelete}
                                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Fechar"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="text-center mb-6">
                                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mx-auto mb-4">
                                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground mb-2">
                                    Excluir imobiliária?
                                </h2>
                                <p className="text-muted-foreground text-sm">
                                    Tem certeza de que deseja excluir{' '}
                                    <span className="font-semibold text-foreground">
                                        {deletingAgency.name}
                                    </span>
                                    ?
                                </p>
                            </div>

                            {deleteError && (
                                <div className="mb-4 flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    {deleteError}
                                </div>
                            )}

                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={cancelDelete}
                                    disabled={deleteLoading}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    variant="destructive"
                                    className="flex-1"
                                    onClick={executeDelete}
                                    disabled={deleteLoading}
                                >
                                    {deleteLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Excluindo...
                                        </>
                                    ) : (
                                        'Excluir imobiliária'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── Registration / Edit form ─────────────────────────────────────
    const isEditing = pageState === 'editing';

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Page Header */}
            <div className="mb-8 space-y-4">
                <button
                    type="button"
                    onClick={cancelForm}
                    className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    Voltar para a lista de imobiliárias
                </button>
                <div>
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
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">
                                Informações da imobiliária
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Razão social, nome fantasia e registros profissionais.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Logo Upload */}
                        <div>
                            <Label>Logo da imobiliária</Label>
                            <div className="mt-2 flex items-center gap-4">
                                {logoPreview ? (
                                    <div className="relative group">
                                        <img
                                            src={logoPreview}
                                            alt="Logo preview"
                                            className="w-20 h-20 rounded-xl object-contain border border-border bg-muted/30"
                                        />
                                        <button
                                            type="button"
                                            onClick={removeLogo}
                                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                                            title="Remover logo"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
                                        <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                                    </div>
                                )}
                                <div className="flex-1">
                                    <label
                                        htmlFor="logo-upload"
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-input bg-background hover:bg-accent cursor-pointer transition-colors"
                                    >
                                        <Upload className="w-4 h-4" />
                                        {logoPreview ? 'Trocar logo' : 'Escolher arquivo'}
                                    </label>
                                    <input
                                        id="logo-upload"
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                                        onChange={handleLogoSelect}
                                        className="hidden"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        JPG, PNG, WebP ou SVG. Máx. 2 MB.
                                    </p>
                                    {logoError && (
                                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            {logoError}
                                        </p>
                                    )}
                                    {logoUploading && (
                                        <p className="text-xs text-primary mt-1 flex items-center gap-1">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Enviando logo...
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Name */}
                        <div id="field-name">
                            <Label htmlFor="agency-name">
                                Razão social / Nome <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="agency-name"
                                value={form.name}
                                onChange={(e) => updateField('name', e.target.value)}
                                placeholder="Nome completo da imobiliária"
                                className={cn(errors.name && 'border-red-500')}
                                maxLength={200}
                            />
                            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                        </div>

                        {/* Trade name */}
                        <div id="field-trade_name">
                            <Label htmlFor="agency-trade-name">Nome fantasia</Label>
                            <Input
                                id="agency-trade-name"
                                value={form.trade_name}
                                onChange={(e) => updateField('trade_name', e.target.value)}
                                placeholder="Nome fantasia (opcional)"
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
                                className={cn(errors.cnpj && 'border-red-500')}
                                maxLength={18}
                            />
                            {errors.cnpj && <p className="text-xs text-red-500 mt-1">{errors.cnpj}</p>}
                        </div>

                        {/* CRECI */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div id="field-creci_number">
                                <Label htmlFor="agency-creci">Nº CRECI</Label>
                                <Input
                                    id="agency-creci"
                                    value={form.creci_number}
                                    onChange={(e) => updateField('creci_number', e.target.value)}
                                    placeholder="Ex: 6013"
                                    maxLength={20}
                                />
                            </div>
                            <div id="field-creci_state">
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
                            <div id="field-creci_type">
                                <Label htmlFor="agency-creci-type">Tipo CRECI</Label>
                                <select
                                    id="agency-creci-type"
                                    value={form.creci_type}
                                    onChange={(e) => updateField('creci_type', e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">Selecione</option>
                                    <option value="PJ">Pessoa Jurídica (PJ)</option>
                                    <option value="PF">Pessoa Física (PF)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Section 2: Responsável ─────────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Responsável</h2>
                            <p className="text-xs text-muted-foreground">
                                Nome do proprietário ou representante legal.
                            </p>
                        </div>
                    </div>

                    <div id="field-owner_name">
                        <Label htmlFor="agency-owner">Nome do responsável</Label>
                        <Input
                            id="agency-owner"
                            value={form.owner_name}
                            onChange={(e) => updateField('owner_name', e.target.value)}
                            placeholder="Nome completo do responsável"
                            maxLength={200}
                        />
                    </div>
                </section>

                {/* ── Section 3: Contato ────────────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Phone className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Contato</h2>
                            <p className="text-xs text-muted-foreground">
                                Telefone, e-mail e website da imobiliária.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Main phone + WhatsApp */}
                        <div>
                            <div className="flex items-end gap-4">
                                <div className="flex-1" id="field-main_phone">
                                    <Label htmlFor="agency-phone">
                                        Telefone principal <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="agency-phone"
                                        value={form.main_phone}
                                        onChange={(e) => handleMaskedInput('main_phone', e.target.value, maskPhone)}
                                        placeholder="(31) 99999-9999"
                                        className={cn(errors.main_phone && 'border-red-500')}
                                        maxLength={15}
                                    />
                                </div>
                                <label className="flex items-center gap-2 pb-2 cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={form.main_phone_whatsapp as boolean}
                                        onChange={(e) => updateField('main_phone_whatsapp', e.target.checked)}
                                        className="w-4 h-4 rounded border-input"
                                    />
                                    <MessageCircle className="w-4 h-4 text-green-600" />
                                    <span className="text-sm text-foreground">WhatsApp</span>
                                </label>
                            </div>
                            {errors.main_phone && <p className="text-xs text-red-500 mt-1">{errors.main_phone}</p>}
                        </div>

                        {/* Additional phone + WhatsApp */}
                        <div>
                            <div className="flex items-end gap-4">
                                <div className="flex-1" id="field-additional_phone">
                                    <Label htmlFor="agency-phone2">Telefone adicional</Label>
                                    <Input
                                        id="agency-phone2"
                                        value={form.additional_phone}
                                        onChange={(e) => {
                                            handleMaskedInput('additional_phone', e.target.value, maskPhone);
                                            if (!e.target.value.trim()) updateField('additional_phone_whatsapp', false);
                                        }}
                                        placeholder="(31) 3561-3173 (opcional)"
                                        className={cn(errors.additional_phone && 'border-red-500')}
                                        maxLength={15}
                                    />
                                </div>
                                <label className="flex items-center gap-2 pb-2 cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={form.additional_phone_whatsapp as boolean}
                                        onChange={(e) => updateField('additional_phone_whatsapp', e.target.checked)}
                                        className="w-4 h-4 rounded border-input"
                                    />
                                    <MessageCircle className="w-4 h-4 text-green-600" />
                                    <span className="text-sm text-foreground">WhatsApp</span>
                                </label>
                            </div>
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
                                placeholder="contato@imobiliaria.com.br (opcional)"
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
                                value={form.website}
                                onChange={(e) => updateField('website', e.target.value)}
                                placeholder="www.imobiliaria.com.br (opcional)"
                                className={cn(errors.website && 'border-red-500')}
                                maxLength={200}
                            />
                            {errors.website && <p className="text-xs text-red-500 mt-1">{errors.website}</p>}
                        </div>
                    </div>
                </section>

                {/* ── Section 4: Endereço ───────────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Endereço</h2>
                            <p className="text-xs text-muted-foreground">
                                Endereço comercial da imobiliária.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* CEP + Lookup */}
                        <div>
                            <div className="flex items-end gap-3">
                                <div className="flex-1" id="field-postal_code">
                                    <Label htmlFor="agency-cep">
                                        CEP <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="agency-cep"
                                        value={form.postal_code}
                                        onChange={(e) => handleMaskedInput('postal_code', e.target.value, maskCEP)}
                                        placeholder="35450-075"
                                        className={cn(errors.postal_code && 'border-red-500')}
                                        maxLength={9}
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={lookupCEP}
                                    disabled={cepLoading}
                                    className="shrink-0"
                                >
                                    {cepLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Search className="w-4 h-4 mr-2" />
                                    )}
                                    {cepLoading ? 'Buscando...' : 'Buscar CEP'}
                                </Button>
                            </div>
                            {errors.postal_code && <p className="text-xs text-red-500 mt-1">{errors.postal_code}</p>}
                            {cepError && (
                                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    {cepError}
                                </p>
                            )}
                            {cepFilled && (
                                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Endereço preenchido automaticamente.
                                </p>
                            )}
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
                                placeholder="Rua, Av., etc."
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
                                    placeholder="Nº"
                                    className={cn(errors.street_number && 'border-red-500')}
                                    maxLength={20}
                                />
                                {errors.street_number && <p className="text-xs text-red-500 mt-1">{errors.street_number}</p>}
                            </div>
                            <div id="field-address_complement">
                                <Label htmlFor="agency-complement">Complemento</Label>
                                <Input
                                    id="agency-complement"
                                    value={form.address_complement}
                                    onChange={(e) => updateField('address_complement', e.target.value)}
                                    placeholder="Sala, andar, bloco (opcional)"
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
                        onClick={cancelForm}
                        disabled={submitting}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {isEditing ? 'Cancelar' : 'Voltar à lista'}
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
