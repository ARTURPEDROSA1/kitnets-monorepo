"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    User,
    Phone,
    Loader2,
    Save,
    ArrowLeft,
    Search,
    CheckCircle2,
    AlertTriangle,
    Plus,
    ChevronDown,
    ChevronUp,
    X,
    Home,
    Building2,
    Calendar,
    Shield,
    FileText,
    Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TenantProfileCard from '@/components/inquilinos/TenantProfileCard';
import { Badge } from '@/components/ui/badge';
import type { TenantWithDetails, TenantFormData, TenantStatus, TenantManagementType, PropertyOption, AgencyOption, AgentOption } from '@/types/tenant';
import {
    maskPhone,
    validatePhone,
    validateEmail,
    maskCPF,
    parseCPF,
    validateCPF,
    maskCEP,
    parseCEP,
    validateCEP,
    formatPhone,
    formatCPF,
    BRAZILIAN_STATES,
} from '@/lib/validators';

// ── Types ────────────────────────────────────────────────────────────

type PageState = 'loading' | 'list' | 'form' | 'editing';

interface FieldErrors {
    [key: string]: string;
}

// ── Initial form state ───────────────────────────────────────────────

function getEmptyFormData(): TenantFormData {
    return {
        full_name: '',
        cpf: '',
        main_phone: '',
        email: '',
        date_of_birth: '',
        rg: '',
        additional_phone: '',
        postal_code: '',
        street: '',
        street_number: '',
        address_complement: '',
        neighborhood: '',
        city: '',
        state: '',
        property_id: '',
        use_property_address: false,
        management_type: 'SELF_MANAGED',
        agency_id: '',
        agent_id: '',
        move_in_date: '',
        move_out_date: '',
        status: 'ACTIVE',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        notes: '',
    };
}

function tenantToFormData(tenant: TenantWithDetails): TenantFormData {
    return {
        full_name: tenant.full_name || '',
        cpf: tenant.cpf ? formatCPF(tenant.cpf) : '',
        main_phone: formatPhone(tenant.main_phone),
        email: tenant.email || '',
        date_of_birth: tenant.date_of_birth || '',
        rg: tenant.rg || '',
        additional_phone: tenant.additional_phone ? formatPhone(tenant.additional_phone) : '',
        postal_code: tenant.postal_code ? tenant.postal_code.replace(/(\d{5})(\d{3})/, '$1-$2') : '',
        street: tenant.street || '',
        street_number: tenant.street_number || '',
        address_complement: tenant.address_complement || '',
        neighborhood: tenant.neighborhood || '',
        city: tenant.city || '',
        state: tenant.state || '',
        property_id: tenant.property_id || '',
        use_property_address: tenant.use_property_address ?? false,
        management_type: tenant.management_type || 'SELF_MANAGED',
        agency_id: tenant.agency_id || '',
        agent_id: tenant.agent_id || '',
        move_in_date: tenant.move_in_date || '',
        move_out_date: tenant.move_out_date || '',
        status: tenant.status || 'ACTIVE',
        emergency_contact_name: tenant.emergency_contact_name || '',
        emergency_contact_phone: tenant.emergency_contact_phone ? formatPhone(tenant.emergency_contact_phone) : '',
        notes: tenant.notes || '',
    };
}

function getStatusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    switch (status) {
        case 'ACTIVE':
            return { label: 'Ativo', variant: 'default' };
        case 'FUTURE':
            return { label: 'Futuro', variant: 'outline' };
        case 'FORMER':
            return { label: 'Ex-Inquilino', variant: 'secondary' };
        default:
            return { label: status, variant: 'outline' };
    }
}

function maskCPFDisplay(cpf: string): string {
    const formatted = formatCPF(cpf);
    if (formatted.length === 14) {
        return `***.${formatted.slice(4, 11)}-**`;
    }
    return formatted;
}

// ── Component ────────────────────────────────────────────────────────

interface InquilinosContentProps {
    lang: string;
}

export default function InquilinosContent({ lang }: InquilinosContentProps) {
    // Page state
    const [pageState, setPageState] = useState<PageState>('loading');
    const [tenants, setTenants] = useState<TenantWithDetails[]>([]);
    const [editingTenant, setEditingTenant] = useState<TenantWithDetails | null>(null);

    // Accordion state
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Delete confirmation
    const [deletingTenant, setDeletingTenant] = useState<TenantWithDetails | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState<TenantFormData>(getEmptyFormData());
    const [errors, setErrors] = useState<FieldErrors>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    // CEP lookup state
    const [cepLoading, setCepLoading] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const [cepFilled, setCepFilled] = useState(false);

    // Dropdown data
    const [properties, setProperties] = useState<PropertyOption[]>([]);
    const [agencies, setAgencies] = useState<AgencyOption[]>([]);
    const [agents, setAgents] = useState<AgentOption[]>([]);

    // Search and filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterProperty, setFilterProperty] = useState<string>('');
    const [filterManagement, setFilterManagement] = useState<string>('');

    // ── Fetch tenants on mount ───────────────────────────────────────

    const fetchTenants = useCallback(async () => {
        try {
            const res = await fetch('/api/tenants');
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setTenants(data.tenants || []);
            setPageState('list');
        } catch (err) {
            console.error('[Inquilinos] Error fetching tenants:', err);
            setTenants([]);
            setPageState('list');
        }
    }, []);

    const fetchDropdownData = useCallback(async () => {
        try {
            const [propsRes, agenciesRes, agentsRes] = await Promise.all([
                fetch('/api/tenants/properties'),
                fetch('/api/agencies'),
                fetch('/api/agents'),
            ]);

            if (propsRes.ok) {
                const data = await propsRes.json();
                setProperties(data.properties || []);
            }
            if (agenciesRes.ok) {
                const data = await agenciesRes.json();
                setAgencies((data.agencies || []).map((a: { id: string; name: string }) => ({
                    id: a.id,
                    name: a.name,
                })));
            }
            if (agentsRes.ok) {
                const data = await agentsRes.json();
                setAgents((data.agents || []).map((a: { id: string; full_name: string; agency_id: string | null }) => ({
                    id: a.id,
                    full_name: a.full_name,
                    agency_id: a.agency_id,
                })));
            }
        } catch (err) {
            console.error('[Inquilinos] Error fetching dropdown data:', err);
        }
    }, []);

    useEffect(() => {
        fetchTenants();
        fetchDropdownData();
    }, [fetchTenants, fetchDropdownData]);

    // ── Filtered tenants ─────────────────────────────────────────────

    const filteredTenants = useMemo(() => {
        let result = tenants;

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.full_name.toLowerCase().includes(q) ||
                t.cpf.includes(q.replace(/\D/g, '')) ||
                formatPhone(t.main_phone).includes(q) ||
                (t.property_name && t.property_name.toLowerCase().includes(q))
            );
        }

        // Status filter
        if (filterStatus) {
            result = result.filter(t => t.status === filterStatus);
        }

        // Property filter
        if (filterProperty) {
            result = result.filter(t => t.property_id === filterProperty);
        }

        // Management filter
        if (filterManagement) {
            result = result.filter(t => t.management_type === filterManagement);
        }

        return result;
    }, [tenants, searchQuery, filterStatus, filterProperty, filterManagement]);

    // ── Accordion toggle ─────────────────────────────────────────────

    const toggleExpand = useCallback((id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    }, []);

    // ── Form field handlers ──────────────────────────────────────────

    const updateField = useCallback((field: keyof TenantFormData, value: string | boolean) => {
        setForm(prev => ({ ...prev, [field]: value }));
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

    const handleMaskedInput = useCallback((field: keyof TenantFormData, value: string, maskFn: (v: string) => string) => {
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

        if (!form.full_name.trim()) errs.full_name = 'Nome completo é obrigatório.';

        if (!form.cpf.trim()) {
            errs.cpf = 'CPF é obrigatório.';
        } else {
            const cpfDigits = parseCPF(form.cpf);
            if (!validateCPF(cpfDigits)) {
                errs.cpf = 'CPF inválido. Verifique os dígitos.';
            }
        }

        if (!form.main_phone.trim()) {
            errs.main_phone = 'Telefone principal é obrigatório.';
        } else if (!validatePhone(form.main_phone)) {
            errs.main_phone = 'Telefone inválido. Use (XX) XXXXX-XXXX.';
        }

        if (!form.email.trim()) {
            errs.email = 'E-mail é obrigatório.';
        } else if (!validateEmail(form.email)) {
            errs.email = 'E-mail inválido.';
        }

        if (!form.property_id) errs.property_id = 'Selecione um imóvel.';

        if (!form.management_type) {
            errs.management_type = 'Tipo de gestão é obrigatório.';
        }

        if (form.management_type === 'AGENCY' && !form.agency_id) {
            errs.agency_id = 'Selecione a imobiliária.';
        }

        // Optional field validation
        if (form.additional_phone.trim() && !validatePhone(form.additional_phone)) {
            errs.additional_phone = 'Telefone inválido.';
        }
        if (form.emergency_contact_phone.trim() && !validatePhone(form.emergency_contact_phone)) {
            errs.emergency_contact_phone = 'Telefone inválido.';
        }
        if (form.postal_code.trim()) {
            const cepDigits = parseCEP(form.postal_code);
            if (cepDigits.length > 0 && !validateCEP(cepDigits)) {
                errs.postal_code = 'CEP inválido (8 dígitos).';
            }
        }

        return errs;
    }, [form]);

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
            const isEditing = pageState === 'editing' && editingTenant;
            const url = isEditing ? `/api/tenants/${editingTenant.id}` : '/api/tenants';
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
            await fetchTenants();
        } catch {
            setSubmitError('Erro de conexão. Verifique sua internet e tente novamente.');
        } finally {
            setSubmitting(false);
        }
    }, [form, validate, pageState, editingTenant, fetchTenants]);

    // ── Navigation handlers ──────────────────────────────────────────

    const startAdding = useCallback(() => {
        setForm(getEmptyFormData());
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setCepFilled(false);
        setEditingTenant(null);
        setPageState('form');
    }, []);

    const startEditing = useCallback((tenant: TenantWithDetails) => {
        setForm(tenantToFormData(tenant));
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setCepFilled(false);
        setEditingTenant(tenant);
        setPageState('editing');
    }, []);

    const cancelForm = useCallback(() => {
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setEditingTenant(null);
        setPageState('list');
    }, []);

    // ── Delete handlers ──────────────────────────────────────────────

    const confirmDelete = useCallback((tenant: TenantWithDetails) => {
        setDeletingTenant(tenant);
        setDeleteError(null);
    }, []);

    const cancelDelete = useCallback(() => {
        setDeletingTenant(null);
        setDeleteError(null);
    }, []);

    const executeDelete = useCallback(async () => {
        if (!deletingTenant) return;

        setDeleteLoading(true);
        setDeleteError(null);

        try {
            const res = await fetch(`/api/tenants/${deletingTenant.id}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (!res.ok) {
                setDeleteError(data.error || 'Erro ao excluir inquilino.');
                return;
            }

            setTenants(prev => prev.filter(t => t.id !== deletingTenant.id));
            if (expandedId === deletingTenant.id) {
                setExpandedId(null);
            }
            setDeletingTenant(null);
        } catch {
            setDeleteError('Erro de conexão. Tente novamente.');
        } finally {
            setDeleteLoading(false);
        }
    }, [deletingTenant, expandedId]);

    // ── Filtered agents by selected agency ───────────────────────────

    const filteredAgents = useMemo(() => {
        if (!form.agency_id) return [];
        return agents.filter(a => a.agency_id === form.agency_id);
    }, [agents, form.agency_id]);

    // ── Unique properties from tenants (for list filter) ─────────────

    const tenantPropertyOptions = useMemo(() => {
        const map = new Map<string, string>();
        tenants.forEach(t => {
            if (t.property_id && t.property_name) {
                map.set(t.property_id, t.property_name);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [tenants]);

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

    // ── List view ────────────────────────────────────────────────────
    if (pageState === 'list') {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Inquilinos</h1>
                        <p className="text-muted-foreground mt-1">
                            Gerencie seus inquilinos cadastrados.
                        </p>
                    </div>
                    <Button onClick={startAdding} className="shrink-0">
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar inquilino
                    </Button>
                </div>

                {/* Success message */}
                {submitSuccess && (
                    <div className="mb-6 flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-sm">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Dados salvos com sucesso!
                    </div>
                )}

                {/* Search & Filters */}
                {tenants.length > 0 && (
                    <div className="mb-6 space-y-3">
                        {/* Search bar */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Buscar por nome, CPF, telefone ou imóvel..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        {/* Filter pills */}
                        <div className="flex flex-wrap gap-2">
                            {/* Status filter */}
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">Todos os status</option>
                                <option value="ACTIVE">Ativo</option>
                                <option value="FUTURE">Futuro Inquilino</option>
                                <option value="FORMER">Ex-Inquilino</option>
                            </select>

                            {/* Property filter */}
                            {tenantPropertyOptions.length > 0 && (
                                <select
                                    value={filterProperty}
                                    onChange={(e) => setFilterProperty(e.target.value)}
                                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="">Todos os imóveis</option>
                                    {tenantPropertyOptions.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            )}

                            {/* Management filter */}
                            <select
                                value={filterManagement}
                                onChange={(e) => setFilterManagement(e.target.value)}
                                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">Todos os tipos de gestão</option>
                                <option value="SELF_MANAGED">Gestão própria</option>
                                <option value="AGENCY">Imobiliária</option>
                            </select>

                            {/* Clear filters */}
                            {(searchQuery || filterStatus || filterProperty || filterManagement) && (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setFilterStatus('');
                                        setFilterProperty('');
                                        setFilterManagement('');
                                    }}
                                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                    Limpar filtros
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {tenants.length === 0 ? (
                    <div className="bg-card border border-border rounded-2xl p-12 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <User className="w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground mb-2">
                            Nenhum inquilino cadastrado
                        </h2>
                        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                            Cadastre seu primeiro inquilino para gerenciar ocupações e contratos dos seus imóveis.
                        </p>
                        <Button onClick={startAdding}>
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar inquilino
                        </Button>
                    </div>
                ) : filteredTenants.length === 0 ? (
                    <div className="bg-card border border-border rounded-2xl p-12 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                            <Search className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground mb-2">
                            Nenhum resultado encontrado
                        </h2>
                        <p className="text-muted-foreground mb-6">
                            Tente ajustar os filtros ou a busca.
                        </p>
                    </div>
                ) : (
                    /* Tenant list */
                    <div className="space-y-3">
                        {filteredTenants.map((tenant) => {
                            const isExpanded = expandedId === tenant.id;
                            const status = getStatusLabel(tenant.status);
                            const managementLabel = tenant.management_type === 'AGENCY'
                                ? (tenant.agency_name || 'Imobiliária')
                                : 'Gestão própria';

                            return (
                                <div key={tenant.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-shadow hover:shadow-md">
                                    {/* Compact Row */}
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(tenant.id)}
                                        className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-accent/50 transition-colors cursor-pointer"
                                        aria-expanded={isExpanded}
                                        aria-controls={`tenant-detail-${tenant.id}`}
                                    >
                                        {/* Expand/collapse icon */}
                                        <div className="shrink-0 text-muted-foreground">
                                            {isExpanded ? (
                                                <ChevronUp className="w-5 h-5" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5" />
                                            )}
                                        </div>

                                        {/* Tenant info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-foreground truncate">
                                                {tenant.full_name}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                                                <span>CPF {maskCPFDisplay(tenant.cpf)}</span>
                                                <span className="hidden sm:inline">•</span>
                                                <span className="hidden sm:inline">{tenant.property_name || '—'}</span>
                                                <span className="hidden md:inline">•</span>
                                                <span className="hidden md:inline">{managementLabel}</span>
                                            </div>
                                        </div>

                                        {/* Phone (desktop) */}
                                        <span className="hidden lg:inline text-sm text-muted-foreground shrink-0">
                                            {formatPhone(tenant.main_phone)}
                                        </span>

                                        {/* Status badge */}
                                        <Badge variant={status.variant} className="shrink-0">
                                            {status.label}
                                        </Badge>
                                    </button>

                                    {/* Expanded detail card */}
                                    {isExpanded && (
                                        <div
                                            id={`tenant-detail-${tenant.id}`}
                                            className="border-t border-border p-4 sm:p-6"
                                        >
                                            <TenantProfileCard
                                                tenant={tenant}
                                                lang={lang}
                                                onEdit={() => startEditing(tenant)}
                                                onDelete={() => confirmDelete(tenant)}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Delete confirmation modal */}
                {deletingTenant && (
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
                                    Excluir inquilino?
                                </h2>
                                <p className="text-muted-foreground text-sm">
                                    Tem certeza de que deseja excluir{' '}
                                    <span className="font-semibold text-foreground">
                                        {deletingTenant.full_name}
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
                                        'Excluir inquilino'
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
            <div className="mb-8">
                <button
                    onClick={cancelForm}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar para lista
                </button>
                <h1 className="text-3xl font-bold text-foreground">
                    {isEditing ? 'Editar Inquilino' : 'Cadastrar Inquilino'}
                </h1>
                <p className="text-muted-foreground mt-2">
                    {isEditing
                        ? 'Atualize os dados do inquilino.'
                        : 'Cadastre os dados do inquilino para associar ao seu imóvel.'}
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

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* ── Section 1: Personal Information ──────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" />
                        Informações Pessoais
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        Dados pessoais do inquilino.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Full name */}
                        <div className="sm:col-span-2" id="field-full_name">
                            <Label htmlFor="full_name">Nome completo <span className="text-red-500">*</span></Label>
                            <Input
                                id="full_name"
                                value={form.full_name}
                                onChange={(e) => updateField('full_name', e.target.value)}
                                placeholder="Nome completo do inquilino"
                                className={cn(errors.full_name && 'border-red-500')}
                            />
                            {errors.full_name && <p className="text-sm text-red-500 mt-1">{errors.full_name}</p>}
                        </div>

                        {/* CPF */}
                        <div id="field-cpf">
                            <Label htmlFor="cpf">CPF <span className="text-red-500">*</span></Label>
                            <Input
                                id="cpf"
                                value={form.cpf}
                                onChange={(e) => handleMaskedInput('cpf', e.target.value, maskCPF)}
                                placeholder="000.000.000-00"
                                className={cn(errors.cpf && 'border-red-500')}
                            />
                            {errors.cpf && <p className="text-sm text-red-500 mt-1">{errors.cpf}</p>}
                        </div>

                        {/* Main phone */}
                        <div id="field-main_phone">
                            <Label htmlFor="main_phone">Telefone principal <span className="text-red-500">*</span></Label>
                            <Input
                                id="main_phone"
                                value={form.main_phone}
                                onChange={(e) => handleMaskedInput('main_phone', e.target.value, maskPhone)}
                                placeholder="(00) 00000-0000"
                                className={cn(errors.main_phone && 'border-red-500')}
                            />
                            {errors.main_phone && <p className="text-sm text-red-500 mt-1">{errors.main_phone}</p>}
                        </div>

                        {/* Email */}
                        <div id="field-email">
                            <Label htmlFor="email">E-mail <span className="text-red-500">*</span></Label>
                            <Input
                                id="email"
                                type="email"
                                value={form.email}
                                onChange={(e) => updateField('email', e.target.value)}
                                placeholder="email@exemplo.com"
                                className={cn(errors.email && 'border-red-500')}
                            />
                            {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
                        </div>

                        {/* Additional phone */}
                        <div id="field-additional_phone">
                            <Label htmlFor="additional_phone">Telefone adicional</Label>
                            <Input
                                id="additional_phone"
                                value={form.additional_phone}
                                onChange={(e) => handleMaskedInput('additional_phone', e.target.value, maskPhone)}
                                placeholder="(00) 00000-0000"
                                className={cn(errors.additional_phone && 'border-red-500')}
                            />
                            {errors.additional_phone && <p className="text-sm text-red-500 mt-1">{errors.additional_phone}</p>}
                        </div>

                        {/* Date of birth */}
                        <div>
                            <Label htmlFor="date_of_birth">Data de nascimento</Label>
                            <Input
                                id="date_of_birth"
                                type="date"
                                value={form.date_of_birth}
                                onChange={(e) => updateField('date_of_birth', e.target.value)}
                            />
                        </div>

                        {/* RG */}
                        <div>
                            <Label htmlFor="rg">RG / Documento de identidade</Label>
                            <Input
                                id="rg"
                                value={form.rg}
                                onChange={(e) => updateField('rg', e.target.value)}
                                placeholder="Número do RG"
                            />
                        </div>
                    </div>
                </section>

                {/* ── Section 2: Address ───────────────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                        <Home className="w-5 h-5 text-primary" />
                        Endereço Atual
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        Endereço atual do inquilino.
                    </p>

                    {/* Use property address checkbox */}
                    <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={form.use_property_address}
                            onChange={(e) => updateField('use_property_address', e.target.checked)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
                        />
                        <span className="text-sm text-foreground">
                            Utilizar endereço do imóvel alugado como endereço atual
                        </span>
                    </label>

                    {!form.use_property_address && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* CEP */}
                            <div id="field-postal_code">
                                <Label htmlFor="postal_code">CEP</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="postal_code"
                                        value={form.postal_code}
                                        onChange={(e) => handleMaskedInput('postal_code', e.target.value, maskCEP)}
                                        onBlur={() => {
                                            if (parseCEP(form.postal_code).length === 8) lookupCEP();
                                        }}
                                        placeholder="00000-000"
                                        className={cn('flex-1', errors.postal_code && 'border-red-500')}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={lookupCEP}
                                        disabled={cepLoading || parseCEP(form.postal_code).length !== 8}
                                        className="shrink-0"
                                    >
                                        {cepLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : cepFilled ? (
                                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <Search className="w-4 h-4" />
                                        )}
                                    </Button>
                                </div>
                                {errors.postal_code && <p className="text-sm text-red-500 mt-1">{errors.postal_code}</p>}
                                {cepError && <p className="text-sm text-red-500 mt-1">{cepError}</p>}
                            </div>

                            <div /> {/* spacer */}

                            {/* Street */}
                            <div className="sm:col-span-2">
                                <Label htmlFor="street">Logradouro</Label>
                                <Input
                                    id="street"
                                    value={form.street}
                                    onChange={(e) => updateField('street', e.target.value)}
                                    placeholder="Rua, Avenida..."
                                />
                            </div>

                            {/* Number */}
                            <div>
                                <Label htmlFor="street_number">Número</Label>
                                <Input
                                    id="street_number"
                                    value={form.street_number}
                                    onChange={(e) => updateField('street_number', e.target.value)}
                                    placeholder="Nº"
                                />
                            </div>

                            {/* Complement */}
                            <div>
                                <Label htmlFor="address_complement">Complemento</Label>
                                <Input
                                    id="address_complement"
                                    value={form.address_complement}
                                    onChange={(e) => updateField('address_complement', e.target.value)}
                                    placeholder="Apto, Bloco..."
                                />
                            </div>

                            {/* Neighborhood */}
                            <div>
                                <Label htmlFor="neighborhood">Bairro</Label>
                                <Input
                                    id="neighborhood"
                                    value={form.neighborhood}
                                    onChange={(e) => updateField('neighborhood', e.target.value)}
                                    placeholder="Bairro"
                                />
                            </div>

                            {/* City */}
                            <div>
                                <Label htmlFor="city">Cidade</Label>
                                <Input
                                    id="city"
                                    value={form.city}
                                    onChange={(e) => updateField('city', e.target.value)}
                                    placeholder="Cidade"
                                />
                            </div>

                            {/* State */}
                            <div>
                                <Label htmlFor="state">Estado</Label>
                                <select
                                    id="state"
                                    value={form.state}
                                    onChange={(e) => updateField('state', e.target.value)}
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">Selecione o estado</option>
                                    {BRAZILIAN_STATES.map(s => (
                                        <option key={s.code} value={s.code}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </section>

                {/* ── Section 3: Property Association ──────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                        <Home className="w-5 h-5 text-primary" />
                        Imóvel Associado
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        Selecione o imóvel que o inquilino ocupa ou irá ocupar.
                    </p>

                    <div id="field-property_id">
                        <Label htmlFor="property_id">Imóvel <span className="text-red-500">*</span></Label>
                        {properties.length === 0 ? (
                            <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4 mt-1">
                                <AlertTriangle className="w-4 h-4 inline mr-1.5 text-amber-500" />
                                Nenhum imóvel cadastrado. Cadastre um imóvel no seu perfil antes de adicionar inquilinos.
                            </div>
                        ) : (
                            <select
                                id="property_id"
                                value={form.property_id}
                                onChange={(e) => updateField('property_id', e.target.value)}
                                className={cn(
                                    'w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                    errors.property_id && 'border-red-500'
                                )}
                            >
                                <option value="">Selecione o imóvel</option>
                                {properties.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        )}
                        {errors.property_id && <p className="text-sm text-red-500 mt-1">{errors.property_id}</p>}
                    </div>
                </section>

                {/* ── Section 4: Management ────────────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-primary" />
                        Gestão
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        Como o imóvel é administrado.
                    </p>

                    <div className="space-y-4">
                        {/* Management type radio */}
                        <div id="field-management_type">
                            <Label>Administrado por <span className="text-red-500">*</span></Label>
                            <div className="flex flex-col sm:flex-row gap-3 mt-2">
                                <label className={cn(
                                    'flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors flex-1',
                                    form.management_type === 'SELF_MANAGED'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:bg-accent/50'
                                )}>
                                    <input
                                        type="radio"
                                        name="management_type"
                                        value="SELF_MANAGED"
                                        checked={form.management_type === 'SELF_MANAGED'}
                                        onChange={(e) => {
                                            updateField('management_type', e.target.value);
                                            updateField('agency_id', '');
                                            updateField('agent_id', '');
                                        }}
                                        className="w-4 h-4 text-primary focus:ring-primary/20"
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-foreground">Gestão própria</p>
                                        <p className="text-xs text-muted-foreground">Administrado diretamente pelo proprietário</p>
                                    </div>
                                </label>

                                <label className={cn(
                                    'flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors flex-1',
                                    form.management_type === 'AGENCY'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:bg-accent/50'
                                )}>
                                    <input
                                        type="radio"
                                        name="management_type"
                                        value="AGENCY"
                                        checked={form.management_type === 'AGENCY'}
                                        onChange={(e) => updateField('management_type', e.target.value)}
                                        className="w-4 h-4 text-primary focus:ring-primary/20"
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-foreground">Imobiliária</p>
                                        <p className="text-xs text-muted-foreground">Administrado por uma imobiliária</p>
                                    </div>
                                </label>
                            </div>
                            {errors.management_type && <p className="text-sm text-red-500 mt-1">{errors.management_type}</p>}
                        </div>

                        {/* Self-managed message */}
                        {form.management_type === 'SELF_MANAGED' && (
                            <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                                Administrado diretamente pelo proprietário da conta.
                            </div>
                        )}

                        {/* Agency dropdown (conditional) */}
                        {form.management_type === 'AGENCY' && (
                            <div className="space-y-4">
                                <div id="field-agency_id">
                                    <Label htmlFor="agency_id">Imobiliária <span className="text-red-500">*</span></Label>
                                    {agencies.length === 0 ? (
                                        <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4 mt-1">
                                            <AlertTriangle className="w-4 h-4 inline mr-1.5 text-amber-500" />
                                            Nenhuma imobiliária cadastrada. Cadastre uma imobiliária primeiro.
                                        </div>
                                    ) : (
                                        <select
                                            id="agency_id"
                                            value={form.agency_id}
                                            onChange={(e) => {
                                                updateField('agency_id', e.target.value);
                                                updateField('agent_id', ''); // Reset agent when agency changes
                                            }}
                                            className={cn(
                                                'w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                                errors.agency_id && 'border-red-500'
                                            )}
                                        >
                                            <option value="">Selecione a imobiliária</option>
                                            {agencies.map(a => (
                                                <option key={a.id} value={a.id}>{a.name}</option>
                                            ))}
                                        </select>
                                    )}
                                    {errors.agency_id && <p className="text-sm text-red-500 mt-1">{errors.agency_id}</p>}
                                </div>

                                {/* Agent dropdown (optional, filtered by agency) */}
                                {form.agency_id && (
                                    <div id="field-agent_id">
                                        <Label htmlFor="agent_id">Corretor</Label>
                                        {filteredAgents.length === 0 ? (
                                            <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3 mt-1">
                                                Nenhum corretor vinculado a esta imobiliária.
                                            </div>
                                        ) : (
                                            <select
                                                id="agent_id"
                                                value={form.agent_id}
                                                onChange={(e) => updateField('agent_id', e.target.value)}
                                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            >
                                                <option value="">Selecione o corretor (opcional)</option>
                                                {filteredAgents.map(a => (
                                                    <option key={a.id} value={a.id}>{a.full_name}</option>
                                                ))}
                                            </select>
                                        )}
                                        {errors.agent_id && <p className="text-sm text-red-500 mt-1">{errors.agent_id}</p>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── Section 5: Rental Information ────────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        Informações de Ocupação
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        Dados básicos de ocupação. Informações contratuais detalhadas pertencem ao registro de Contrato/Locação.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Move-in date */}
                        <div>
                            <Label htmlFor="move_in_date">Data de entrada</Label>
                            <Input
                                id="move_in_date"
                                type="date"
                                value={form.move_in_date}
                                onChange={(e) => updateField('move_in_date', e.target.value)}
                            />
                        </div>

                        {/* Move-out date */}
                        <div>
                            <Label htmlFor="move_out_date">Data de saída</Label>
                            <Input
                                id="move_out_date"
                                type="date"
                                value={form.move_out_date}
                                onChange={(e) => updateField('move_out_date', e.target.value)}
                            />
                        </div>

                        {/* Status */}
                        <div>
                            <Label htmlFor="status">Status</Label>
                            <select
                                id="status"
                                value={form.status}
                                onChange={(e) => updateField('status', e.target.value)}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                <option value="ACTIVE">Ativo</option>
                                <option value="FUTURE">Futuro Inquilino</option>
                                <option value="FORMER">Ex-Inquilino</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* ── Section 6: Additional Information ────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Informações Adicionais
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        Contato de emergência e observações.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Emergency contact name */}
                        <div>
                            <Label htmlFor="emergency_contact_name">Nome do contato de emergência</Label>
                            <Input
                                id="emergency_contact_name"
                                value={form.emergency_contact_name}
                                onChange={(e) => updateField('emergency_contact_name', e.target.value)}
                                placeholder="Nome do contato"
                            />
                        </div>

                        {/* Emergency contact phone */}
                        <div id="field-emergency_contact_phone">
                            <Label htmlFor="emergency_contact_phone">Telefone de emergência</Label>
                            <Input
                                id="emergency_contact_phone"
                                value={form.emergency_contact_phone}
                                onChange={(e) => handleMaskedInput('emergency_contact_phone', e.target.value, maskPhone)}
                                placeholder="(00) 00000-0000"
                                className={cn(errors.emergency_contact_phone && 'border-red-500')}
                            />
                            {errors.emergency_contact_phone && <p className="text-sm text-red-500 mt-1">{errors.emergency_contact_phone}</p>}
                        </div>

                        {/* Notes */}
                        <div className="sm:col-span-2">
                            <Label htmlFor="notes">Observações</Label>
                            <textarea
                                id="notes"
                                value={form.notes}
                                onChange={(e) => updateField('notes', e.target.value)}
                                placeholder="Anotações sobre o inquilino..."
                                rows={3}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                            />
                        </div>
                    </div>
                </section>

                {/* ── Form actions ─────────────────────────────────────── */}
                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={cancelForm}
                        disabled={submitting}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                {isEditing ? 'Salvar alterações' : 'Cadastrar inquilino'}
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
