"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Loader2,
    Save,
    ArrowLeft,
    Search,
    AlertTriangle,
    Plus,
    ChevronDown,
    ChevronUp,
    X,
    Home,
    Building2,
    Calendar,
    FileText,
    DollarSign,
    TrendingUp,
    Zap,
    Upload,
    Trash2,
    Download,
    Users,
    Ban,
    PenLine,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import LeaseProfileCard from '@/components/contratos/LeaseProfileCard';
import { Badge } from '@/components/ui/badge';
import type {
    LeaseWithDetails,
    LeaseFormData,
    LeaseStatus,
    LeaseManagementType,
    AdditionalTenantFormItem,
    ChargeFormItem,
    ChargeType,
    ChargeResponsibility,
    LeaseTenantRole,
    LeaseDocument,
    LeasePropertyOption,
    LeaseTenantOption,
    LeaseAgencyOption,
    LeaseAgentOption,
} from '@/types/lease';

// ── Types ────────────────────────────────────────────────────────────

type PageState = 'loading' | 'list' | 'form' | 'editing';

interface FieldErrors {
    [key: string]: string;
}

// ── Date helpers (DD/MM/YYYY ↔ ISO) ─────────────────────────────────

function maskDate(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDateBR(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length !== 3 || parts[2].length !== 4) return '';
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function formatDateBR(isoDate: string | null): string {
    if (!isoDate) return '';
    const parts = isoDate.split('T')[0].split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ── Currency helpers ─────────────────────────────────────────────────

function maskCurrency(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const num = parseInt(digits, 10) / 100;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrencyBRL(value: number | null): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Status helpers ───────────────────────────────────────────────────

function getStatusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    switch (status) {
        case 'ACTIVE': return { label: 'Ativo', variant: 'default' };
        case 'DRAFT': return { label: 'Rascunho', variant: 'outline' };
        case 'EXPIRING_SOON': return { label: 'Vencendo', variant: 'secondary' };
        case 'EXPIRED': return { label: 'Expirado', variant: 'destructive' };
        case 'TERMINATED': return { label: 'Rescindido', variant: 'destructive' };
        case 'CANCELLED': return { label: 'Cancelado', variant: 'secondary' };
        default: return { label: status, variant: 'outline' };
    }
}

function getManagementLabel(type: string): string {
    switch (type) {
        case 'SELF_MANAGED': return 'Gestão própria';
        case 'AGENCY': return 'Imobiliária';
        case 'AGENT': return 'Corretor';
        default: return type;
    }
}

function computeDisplayStatus(lease: LeaseWithDetails): LeaseStatus {
    if (lease.status === 'TERMINATED' || lease.status === 'CANCELLED') return lease.status;
    if (lease.end_date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = new Date(lease.end_date + 'T00:00:00');
        if (end < today) return 'EXPIRED';
        const diffMs = end.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays <= 30 && lease.status === 'ACTIVE') return 'EXPIRING_SOON';
    }
    return lease.status;
}

// ── Empty form ───────────────────────────────────────────────────────

const EMPTY_FORM: LeaseFormData = {
    reference_name: '',
    property_id: '',
    primary_tenant_id: '',
    management_type: 'SELF_MANAGED',
    agency_id: '',
    agent_id: '',
    start_date: '',
    end_date: '',
    monthly_rent: '',
    rent_due_day: '',
    security_deposit: '',
    deposit_months: '',
    adjustment_index: '',
    adjustment_frequency: '12',
    next_adjustment_date: '',
    status: 'ACTIVE',
    notes: '',
};

const CHARGE_TYPES: { value: ChargeType; label: string }[] = [
    { value: 'CONDOMINIUM', label: 'Condomínio' },
    { value: 'IPTU', label: 'IPTU' },
    { value: 'WATER', label: 'Água' },
    { value: 'ELECTRICITY', label: 'Energia Elétrica' },
    { value: 'GAS', label: 'Gás' },
    { value: 'INTERNET', label: 'Internet' },
    { value: 'OTHER', label: 'Outro' },
];

const RESPONSIBILITY_OPTIONS: { value: ChargeResponsibility; label: string }[] = [
    { value: 'TENANT', label: 'Inquilino' },
    { value: 'LANDLORD', label: 'Proprietário' },
    { value: 'INCLUDED', label: 'Incluso no aluguel' },
];

const ADJUSTMENT_OPTIONS = [
    { value: '', label: 'Selecionar...' },
    { value: 'IPCA', label: 'IPCA' },
    { value: 'IGP_M', label: 'IGP-M' },
    { value: 'INPC', label: 'INPC' },
    { value: 'IVAR', label: 'IVAR' },
    { value: 'CUSTOM', label: 'Personalizado' },
    { value: 'NONE', label: 'Sem reajuste automático' },
];

const DOCUMENT_TYPE_OPTIONS = [
    { value: 'CONTRACT', label: 'Contrato' },
    { value: 'ADDENDUM', label: 'Aditivo' },
    { value: 'INSPECTION', label: 'Laudo de Vistoria' },
    { value: 'TENANT_DOC', label: 'Documento do Inquilino' },
    { value: 'DEPOSIT_RECEIPT', label: 'Recibo de Caução' },
    { value: 'OTHER', label: 'Outro' },
];

// ── Component ────────────────────────────────────────────────────────

export default function ContratosContent({ lang }: { lang: string }) {
    // State
    const [pageState, setPageState] = useState<PageState>('loading');
    const [leases, setLeases] = useState<LeaseWithDetails[]>([]);
    const [form, setForm] = useState<LeaseFormData>({ ...EMPTY_FORM });
    const [additionalTenants, setAdditionalTenants] = useState<AdditionalTenantFormItem[]>([]);
    const [charges, setCharges] = useState<ChargeFormItem[]>([]);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<LeaseWithDetails | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    // Dropdowns
    const [properties, setProperties] = useState<LeasePropertyOption[]>([]);
    const [tenants, setTenants] = useState<LeaseTenantOption[]>([]);
    const [agencies, setAgencies] = useState<LeaseAgencyOption[]>([]);
    const [agents, setAgents] = useState<LeaseAgentOption[]>([]);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterProperty, setFilterProperty] = useState('');
    const [filterManagement, setFilterManagement] = useState('');

    // Collapsible form sections
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        property_tenant: true,
        terms: true,
        management: true,
        adjustment: false,
        charges: false,
        documents: false,
        notes: false,
    });

    // Documents state (for editing)
    const [existingDocuments, setExistingDocuments] = useState<LeaseDocument[]>([]);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [uploadDocType, setUploadDocType] = useState('CONTRACT');

    // Terminate modal
    const [terminateTarget, setTerminateTarget] = useState<LeaseWithDetails | null>(null);
    const [terminateDate, setTerminateDate] = useState('');
    const [terminateReason, setTerminateReason] = useState('');
    const [terminating, setTerminating] = useState(false);

    // ── Fetch leases ──────────────────────────────────────────────

    const fetchLeases = useCallback(async () => {
        try {
            const res = await fetch('/api/leases');
            const data = await res.json();
            setLeases(data.leases || []);
        } catch {
            console.error('Error fetching leases');
        }
    }, []);

    const fetchDropdowns = useCallback(async () => {
        try {
            const res = await fetch('/api/leases/dropdowns');
            const data = await res.json();
            setProperties(data.properties || []);
            setTenants(data.tenants || []);
            setAgencies(data.agencies || []);
            setAgents(data.agents || []);
        } catch {
            console.error('Error fetching dropdowns');
        }
    }, []);

    useEffect(() => {
        Promise.all([fetchLeases(), fetchDropdowns()]).then(() => {
            setPageState('list');
        });
    }, [fetchLeases, fetchDropdowns]);

    // ── Filter logic ──────────────────────────────────────────────

    const filteredLeases = useMemo(() => {
        return leases.filter(l => {
            const displayStatus = computeDisplayStatus(l);

            if (filterStatus && displayStatus !== filterStatus) return false;
            if (filterProperty && l.property_id !== filterProperty) return false;
            if (filterManagement && l.management_type !== filterManagement) return false;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const searchable = [
                    l.reference_name,
                    l.property_name,
                    l.primary_tenant_name,
                ].filter(Boolean).join(' ').toLowerCase();
                if (!searchable.includes(q)) return false;
            }

            return true;
        });
    }, [leases, searchQuery, filterStatus, filterProperty, filterManagement]);

    // ── Form helpers ──────────────────────────────────────────────

    const toggleSection = (key: string) => {
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const updateForm = (field: keyof LeaseFormData, value: string | LeaseStatus | LeaseManagementType) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    };

    const resetForm = () => {
        setForm({ ...EMPTY_FORM });
        setAdditionalTenants([]);
        setCharges([]);
        setErrors({});
        setEditingId(null);
        setWarning(null);
        setExistingDocuments([]);
        setOpenSections({
            property_tenant: true,
            terms: true,
            management: true,
            adjustment: false,
            charges: false,
            documents: false,
            notes: false,
        });
    };

    // ── Validation ────────────────────────────────────────────────

    const validate = (): boolean => {
        const e: FieldErrors = {};

        if (!form.property_id) e.property_id = 'Selecione um imóvel.';
        if (!form.primary_tenant_id) e.primary_tenant_id = 'Selecione um inquilino.';
        if (!form.management_type) e.management_type = 'Tipo de gestão é obrigatório.';
        if (form.management_type === 'AGENCY' && !form.agency_id) e.agency_id = 'Selecione a imobiliária.';
        if (form.management_type === 'AGENT' && !form.agent_id) e.agent_id = 'Selecione o corretor.';
        if (!form.start_date) e.start_date = 'Data de início é obrigatória.';
        else if (parseDateBR(form.start_date) === '') e.start_date = 'Data inválida. Use DD/MM/AAAA.';

        if (form.end_date) {
            const endIso = parseDateBR(form.end_date);
            const startIso = parseDateBR(form.start_date);
            if (endIso === '') e.end_date = 'Data inválida. Use DD/MM/AAAA.';
            else if (startIso && endIso <= startIso) e.end_date = 'Data de término deve ser posterior à data de início.';
        }

        if (!form.monthly_rent) e.monthly_rent = 'Valor do aluguel é obrigatório.';
        else {
            const val = parseFloat(form.monthly_rent.replace(/\D/g, ''));
            if (val <= 0) e.monthly_rent = 'Valor do aluguel deve ser maior que zero.';
        }

        if (!form.rent_due_day) e.rent_due_day = 'Dia de vencimento é obrigatório.';
        else {
            const day = parseInt(form.rent_due_day, 10);
            if (isNaN(day) || day < 1 || day > 31) e.rent_due_day = 'Dia de vencimento deve ser entre 1 e 31.';
        }

        if (form.next_adjustment_date && parseDateBR(form.next_adjustment_date) === '') {
            e.next_adjustment_date = 'Data inválida. Use DD/MM/AAAA.';
        }

        setErrors(e);

        if (Object.keys(e).length > 0) {
            const firstField = Object.keys(e)[0];
            const el = document.getElementById(`field-${firstField}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
        }

        return true;
    };

    // ── Save ──────────────────────────────────────────────────────

    const handleSave = async (forceDraft?: boolean) => {
        if (!validate()) return;

        setSaving(true);
        setWarning(null);

        const payload = {
            reference_name: form.reference_name,
            property_id: form.property_id,
            primary_tenant_id: form.primary_tenant_id,
            management_type: form.management_type,
            agency_id: form.agency_id || null,
            agent_id: form.agent_id || null,
            start_date: parseDateBR(form.start_date),
            end_date: form.end_date ? parseDateBR(form.end_date) : null,
            monthly_rent: form.monthly_rent,
            rent_due_day: form.rent_due_day,
            security_deposit: form.security_deposit || null,
            deposit_months: form.deposit_months || null,
            adjustment_index: form.adjustment_index || null,
            adjustment_frequency: form.adjustment_frequency || '12',
            next_adjustment_date: form.next_adjustment_date ? parseDateBR(form.next_adjustment_date) : null,
            status: forceDraft ? 'DRAFT' : form.status,
            notes: form.notes || null,
            additional_tenants: additionalTenants.filter(t => t.tenant_id),
            charges: charges.filter(c => c.charge_type),
        };

        try {
            const url = editingId ? `/api/leases/${editingId}` : '/api/leases';
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.errors) {
                    setErrors(data.errors);
                    const firstField = Object.keys(data.errors)[0];
                    const el = document.getElementById(`field-${firstField}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }

            if (data.warning) {
                setWarning(data.warning);
            }

            resetForm();
            await fetchLeases();
            setPageState('list');
        } catch {
            console.error('Error saving lease');
        } finally {
            setSaving(false);
        }
    };

    // ── Edit ──────────────────────────────────────────────────────

    const handleEdit = async (lease: LeaseWithDetails) => {
        // Fetch full lease details
        try {
            const res = await fetch(`/api/leases/${lease.id}`);
            const data = await res.json();
            const full = data.lease as LeaseWithDetails;

            setForm({
                reference_name: full.reference_name || '',
                property_id: full.property_id,
                primary_tenant_id: full.primary_tenant_id,
                management_type: full.management_type,
                agency_id: full.agency_id || '',
                agent_id: full.agent_id || '',
                start_date: formatDateBR(full.start_date),
                end_date: formatDateBR(full.end_date),
                monthly_rent: full.monthly_rent ? maskCurrency((full.monthly_rent * 100).toFixed(0)) : '',
                rent_due_day: full.rent_due_day?.toString() || '',
                security_deposit: full.security_deposit ? maskCurrency((full.security_deposit * 100).toFixed(0)) : '',
                deposit_months: full.deposit_months?.toString() || '',
                adjustment_index: full.adjustment_index || '',
                adjustment_frequency: full.adjustment_frequency?.toString() || '12',
                next_adjustment_date: formatDateBR(full.next_adjustment_date),
                status: full.status,
                notes: full.notes || '',
            });

            setAdditionalTenants(
                (full.additional_tenants || []).map(t => ({
                    tenant_id: t.tenant_id,
                    role: t.role,
                }))
            );

            setCharges(
                (full.charges || []).map(c => ({
                    charge_type: c.charge_type,
                    label: c.label || '',
                    responsibility: c.responsibility,
                    amount: c.amount ? maskCurrency((c.amount * 100).toFixed(0)) : '',
                }))
            );

            setExistingDocuments(full.documents || []);
            setEditingId(lease.id);
            setPageState('editing');
        } catch {
            console.error('Error loading lease for edit');
        }
    };

    // ── Delete ────────────────────────────────────────────────────

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await fetch(`/api/leases/${deleteTarget.id}`, { method: 'DELETE' });
            setDeleteTarget(null);
            await fetchLeases();
        } catch {
            console.error('Error deleting lease');
        }
    };

    // ── Terminate ─────────────────────────────────────────────────

    const handleTerminate = async () => {
        if (!terminateTarget || !terminateDate) return;
        setTerminating(true);
        try {
            const res = await fetch(`/api/leases/${terminateTarget.id}/terminate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    termination_date: parseDateBR(terminateDate),
                    termination_reason: terminateReason,
                }),
            });

            if (res.ok) {
                setTerminateTarget(null);
                setTerminateDate('');
                setTerminateReason('');
                await fetchLeases();
            }
        } catch {
            console.error('Error terminating lease');
        } finally {
            setTerminating(false);
        }
    };

    // ── Document upload ───────────────────────────────────────────

    const handleDocUpload = async (file: File) => {
        if (!editingId) return;
        setUploadingDoc(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('document_type', uploadDocType);

            const res = await fetch(`/api/leases/${editingId}/documents`, {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                setExistingDocuments(prev => [data.document, ...prev]);
            }
        } catch {
            console.error('Error uploading document');
        } finally {
            setUploadingDoc(false);
        }
    };

    const handleDocDelete = async (docId: string) => {
        if (!editingId) return;
        try {
            await fetch(`/api/leases/${editingId}/documents?doc_id=${docId}`, { method: 'DELETE' });
            setExistingDocuments(prev => prev.filter(d => d.id !== docId));
        } catch {
            console.error('Error deleting document');
        }
    };

    // ── Auto-generate reference name ──────────────────────────────

    const autoReferenceName = useMemo(() => {
        const prop = properties.find(p => p.id === form.property_id);
        const tenant = tenants.find(t => t.id === form.primary_tenant_id);
        if (!prop || !tenant) return '';
        const year = new Date().getFullYear();
        return `${prop.name} - ${tenant.full_name} - ${year}`;
    }, [form.property_id, form.primary_tenant_id, properties, tenants]);

    // Filtered agents based on management type / agency
    const filteredAgents = useMemo(() => {
        if (form.management_type === 'AGENCY' && form.agency_id) {
            return agents.filter(a => a.agency_id === form.agency_id);
        }
        return agents;
    }, [agents, form.management_type, form.agency_id]);

    // ── Render: Loading ───────────────────────────────────────────

    if (pageState === 'loading') {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // ── Render: Form (add / edit) ─────────────────────────────────

    if (pageState === 'form' || pageState === 'editing') {
        return (
            <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => { resetForm(); setPageState('list'); }}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {pageState === 'editing' ? 'Editar Contrato' : 'Novo Contrato de Locação'}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {pageState === 'editing' ? 'Atualize os dados do contrato.' : 'Preencha os dados para criar um novo contrato.'}
                        </p>
                    </div>
                </div>

                {warning && (
                    <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">{warning}</p>
                    </div>
                )}

                {/* ── Section 1: Property & Tenant ─────────────────────── */}
                <FormSection
                    id="property_tenant"
                    title="Imóvel & Inquilino"
                    description="Selecione o imóvel e o inquilino principal."
                    icon={<Home className="h-5 w-5" />}
                    open={openSections.property_tenant}
                    onToggle={() => toggleSection('property_tenant')}
                >
                    {/* Reference name */}
                    <div id="field-reference_name">
                        <Label>Nome / Referência do Contrato</Label>
                        <Input
                            value={form.reference_name}
                            onChange={e => updateForm('reference_name', e.target.value)}
                            placeholder={autoReferenceName || 'Ex: Kitnet 03 - João Silva - 2026'}
                        />
                        {autoReferenceName && !form.reference_name && (
                            <button
                                type="button"
                                className="mt-1 text-xs text-primary hover:underline"
                                onClick={() => updateForm('reference_name', autoReferenceName)}
                            >
                                Usar sugestão: &ldquo;{autoReferenceName}&rdquo;
                            </button>
                        )}
                    </div>

                    {/* Property */}
                    <div id="field-property_id">
                        <Label>Imóvel *</Label>
                        <select
                            className={cn('flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm', errors.property_id && 'border-red-500')}
                            value={form.property_id}
                            onChange={e => updateForm('property_id', e.target.value)}
                        >
                            <option value="">Selecione um imóvel...</option>
                            {properties.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        {errors.property_id && <p className="mt-1 text-xs text-red-500">{errors.property_id}</p>}
                    </div>

                    {/* Primary tenant */}
                    <div id="field-primary_tenant_id">
                        <Label>Inquilino Principal *</Label>
                        <select
                            className={cn('flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm', errors.primary_tenant_id && 'border-red-500')}
                            value={form.primary_tenant_id}
                            onChange={e => updateForm('primary_tenant_id', e.target.value)}
                        >
                            <option value="">Selecione um inquilino...</option>
                            {tenants.map(t => (
                                <option key={t.id} value={t.id}>{t.full_name}</option>
                            ))}
                        </select>
                        {errors.primary_tenant_id && <p className="mt-1 text-xs text-red-500">{errors.primary_tenant_id}</p>}
                    </div>

                    {/* Additional tenants */}
                    <div>
                        <Label>Inquilinos Adicionais</Label>
                        {additionalTenants.map((at, idx) => (
                            <div key={idx} className="mt-2 flex items-center gap-2">
                                <select
                                    className="flex h-10 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                                    value={at.tenant_id}
                                    onChange={e => {
                                        const next = [...additionalTenants];
                                        next[idx].tenant_id = e.target.value;
                                        setAdditionalTenants(next);
                                    }}
                                >
                                    <option value="">Selecionar inquilino...</option>
                                    {tenants.filter(t => t.id !== form.primary_tenant_id).map(t => (
                                        <option key={t.id} value={t.id}>{t.full_name}</option>
                                    ))}
                                </select>
                                <select
                                    className="flex h-10 w-40 rounded-md border bg-background px-3 py-2 text-sm"
                                    value={at.role}
                                    onChange={e => {
                                        const next = [...additionalTenants];
                                        next[idx].role = e.target.value as LeaseTenantRole;
                                        setAdditionalTenants(next);
                                    }}
                                >
                                    <option value="CO_TENANT">Co-inquilino</option>
                                    <option value="OCCUPANT">Ocupante</option>
                                </select>
                                <Button variant="ghost" size="icon" onClick={() => setAdditionalTenants(prev => prev.filter((_, i) => i !== idx))}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => setAdditionalTenants(prev => [...prev, { tenant_id: '', role: 'CO_TENANT' }])}
                        >
                            <Plus className="mr-1 h-4 w-4" /> Adicionar Inquilino
                        </Button>
                    </div>
                </FormSection>

                {/* ── Section 2: Lease Terms ───────────────────────────── */}
                <FormSection
                    id="terms"
                    title="Termos do Contrato"
                    description="Datas, valor do aluguel e caução."
                    icon={<Calendar className="h-5 w-5" />}
                    open={openSections.terms}
                    onToggle={() => toggleSection('terms')}
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div id="field-start_date">
                            <Label>Data de Início *</Label>
                            <Input
                                value={form.start_date}
                                onChange={e => updateForm('start_date', maskDate(e.target.value))}
                                placeholder="DD/MM/AAAA"
                                maxLength={10}
                                className={errors.start_date ? 'border-red-500' : ''}
                            />
                            {errors.start_date && <p className="mt-1 text-xs text-red-500">{errors.start_date}</p>}
                        </div>

                        <div id="field-end_date">
                            <Label>Data de Término</Label>
                            <Input
                                value={form.end_date}
                                onChange={e => updateForm('end_date', maskDate(e.target.value))}
                                placeholder="DD/MM/AAAA (opcional)"
                                maxLength={10}
                                className={errors.end_date ? 'border-red-500' : ''}
                            />
                            {errors.end_date && <p className="mt-1 text-xs text-red-500">{errors.end_date}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">Deixe vazio para contrato sem prazo definido.</p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div id="field-monthly_rent">
                            <Label>Aluguel Mensal (R$) *</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                <Input
                                    value={form.monthly_rent}
                                    onChange={e => updateForm('monthly_rent', maskCurrency(e.target.value))}
                                    placeholder="0,00"
                                    className={cn('pl-10', errors.monthly_rent && 'border-red-500')}
                                />
                            </div>
                            {errors.monthly_rent && <p className="mt-1 text-xs text-red-500">{errors.monthly_rent}</p>}
                        </div>

                        <div id="field-rent_due_day">
                            <Label>Dia de Vencimento *</Label>
                            <Input
                                type="number"
                                min={1}
                                max={31}
                                value={form.rent_due_day}
                                onChange={e => updateForm('rent_due_day', e.target.value)}
                                placeholder="Ex: 10"
                                className={errors.rent_due_day ? 'border-red-500' : ''}
                            />
                            {errors.rent_due_day && <p className="mt-1 text-xs text-red-500">{errors.rent_due_day}</p>}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div id="field-security_deposit">
                            <Label>Caução (R$)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                <Input
                                    value={form.security_deposit}
                                    onChange={e => updateForm('security_deposit', maskCurrency(e.target.value))}
                                    placeholder="0,00"
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        <div id="field-deposit_months">
                            <Label>Meses de Caução</Label>
                            <Input
                                type="number"
                                min={0}
                                value={form.deposit_months}
                                onChange={e => updateForm('deposit_months', e.target.value)}
                                placeholder="Ex: 3"
                            />
                        </div>
                    </div>

                    {/* Status selector */}
                    <div id="field-status">
                        <Label>Status do Contrato *</Label>
                        <select
                            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={form.status}
                            onChange={e => updateForm('status', e.target.value as LeaseStatus)}
                        >
                            <option value="ACTIVE">Ativo</option>
                            <option value="DRAFT">Rascunho</option>
                            <option value="EXPIRED">Expirado</option>
                            <option value="CANCELLED">Cancelado</option>
                        </select>
                    </div>
                </FormSection>

                {/* ── Section 3: Management ────────────────────────────── */}
                <FormSection
                    id="management"
                    title="Administração"
                    description="Quem gerencia este contrato?"
                    icon={<Building2 className="h-5 w-5" />}
                    open={openSections.management}
                    onToggle={() => toggleSection('management')}
                >
                    <div id="field-management_type">
                        <Label>Tipo de Gestão *</Label>
                        <div className="mt-2 flex flex-wrap gap-3">
                            {([
                                { value: 'SELF_MANAGED', label: 'Gestão Própria', icon: <Home className="h-4 w-4" /> },
                                { value: 'AGENCY', label: 'Imobiliária', icon: <Building2 className="h-4 w-4" /> },
                                { value: 'AGENT', label: 'Corretor', icon: <Users className="h-4 w-4" /> },
                            ] as { value: LeaseManagementType; label: string; icon: React.ReactNode }[]).map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={cn(
                                        'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition',
                                        form.management_type === opt.value
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-background text-foreground hover:bg-accent'
                                    )}
                                    onClick={() => {
                                        updateForm('management_type', opt.value);
                                        if (opt.value === 'SELF_MANAGED') {
                                            updateForm('agency_id', '');
                                            updateForm('agent_id', '');
                                        }
                                    }}
                                >
                                    {opt.icon} {opt.label}
                                </button>
                            ))}
                        </div>
                        {errors.management_type && <p className="mt-1 text-xs text-red-500">{errors.management_type}</p>}
                    </div>

                    {form.management_type === 'AGENCY' && (
                        <div id="field-agency_id">
                            <Label>Imobiliária *</Label>
                            <select
                                className={cn('flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm', errors.agency_id && 'border-red-500')}
                                value={form.agency_id}
                                onChange={e => updateForm('agency_id', e.target.value)}
                            >
                                <option value="">Selecione uma imobiliária...</option>
                                {agencies.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                            {errors.agency_id && <p className="mt-1 text-xs text-red-500">{errors.agency_id}</p>}
                        </div>
                    )}

                    {(form.management_type === 'AGENCY' || form.management_type === 'AGENT') && (
                        <div id="field-agent_id">
                            <Label>{form.management_type === 'AGENT' ? 'Corretor *' : 'Corretor (opcional)'}</Label>
                            <select
                                className={cn('flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm', errors.agent_id && 'border-red-500')}
                                value={form.agent_id}
                                onChange={e => {
                                    updateForm('agent_id', e.target.value);
                                    // Auto-fill agency if agent has one
                                    if (form.management_type === 'AGENT' && e.target.value) {
                                        const selectedAgent = agents.find(a => a.id === e.target.value);
                                        if (selectedAgent?.agency_id) {
                                            updateForm('agency_id', selectedAgent.agency_id);
                                        }
                                    }
                                }}
                            >
                                <option value="">Selecione um corretor...</option>
                                {filteredAgents.map(a => (
                                    <option key={a.id} value={a.id}>{a.full_name}</option>
                                ))}
                            </select>
                            {errors.agent_id && <p className="mt-1 text-xs text-red-500">{errors.agent_id}</p>}
                            {form.management_type === 'AGENT' && form.agent_id && (() => {
                                const sel = agents.find(a => a.id === form.agent_id);
                                if (sel?.agency_id) {
                                    const ag = agencies.find(a => a.id === sel.agency_id);
                                    if (ag) return <p className="mt-1 text-xs text-muted-foreground">Vinculado à imobiliária: {ag.name}</p>;
                                }
                                return null;
                            })()}
                        </div>
                    )}
                </FormSection>

                {/* ── Section 4: Rent Adjustment ───────────────────────── */}
                <FormSection
                    id="adjustment"
                    title="Reajuste do Aluguel"
                    description="Índice e frequência de reajuste."
                    icon={<TrendingUp className="h-5 w-5" />}
                    open={openSections.adjustment}
                    onToggle={() => toggleSection('adjustment')}
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div id="field-adjustment_index">
                            <Label>Índice de Reajuste</Label>
                            <select
                                className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                value={form.adjustment_index}
                                onChange={e => updateForm('adjustment_index', e.target.value)}
                            >
                                {ADJUSTMENT_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div id="field-adjustment_frequency">
                            <Label>Frequência (meses)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={form.adjustment_frequency}
                                onChange={e => updateForm('adjustment_frequency', e.target.value)}
                                placeholder="12"
                            />
                        </div>
                    </div>

                    <div id="field-next_adjustment_date">
                        <Label>Próximo Reajuste</Label>
                        <Input
                            value={form.next_adjustment_date}
                            onChange={e => updateForm('next_adjustment_date', maskDate(e.target.value))}
                            placeholder="DD/MM/AAAA"
                            maxLength={10}
                            className={errors.next_adjustment_date ? 'border-red-500' : ''}
                        />
                        {errors.next_adjustment_date && <p className="mt-1 text-xs text-red-500">{errors.next_adjustment_date}</p>}
                    </div>
                </FormSection>

                {/* ── Section 5: Additional Charges ────────────────────── */}
                <FormSection
                    id="charges"
                    title="Encargos Adicionais"
                    description="Condomínio, IPTU, contas e responsabilidades."
                    icon={<Zap className="h-5 w-5" />}
                    open={openSections.charges}
                    onToggle={() => toggleSection('charges')}
                >
                    {charges.map((charge, idx) => (
                        <div key={idx} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end sm:gap-3">
                            <div className="flex-1">
                                <Label className="text-xs">Tipo</Label>
                                <select
                                    className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm"
                                    value={charge.charge_type}
                                    onChange={e => {
                                        const next = [...charges];
                                        next[idx].charge_type = e.target.value as ChargeType;
                                        setCharges(next);
                                    }}
                                >
                                    {CHARGE_TYPES.map(ct => (
                                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                                    ))}
                                </select>
                            </div>

                            {charge.charge_type === 'OTHER' && (
                                <div className="flex-1">
                                    <Label className="text-xs">Descrição</Label>
                                    <Input
                                        value={charge.label}
                                        onChange={e => {
                                            const next = [...charges];
                                            next[idx].label = e.target.value;
                                            setCharges(next);
                                        }}
                                        placeholder="Descreva..."
                                        className="h-9"
                                    />
                                </div>
                            )}

                            <div className="w-full sm:w-44">
                                <Label className="text-xs">Responsabilidade</Label>
                                <select
                                    className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm"
                                    value={charge.responsibility}
                                    onChange={e => {
                                        const next = [...charges];
                                        next[idx].responsibility = e.target.value as ChargeResponsibility;
                                        setCharges(next);
                                    }}
                                >
                                    {RESPONSIBILITY_OPTIONS.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="w-full sm:w-32">
                                <Label className="text-xs">Valor (R$)</Label>
                                <Input
                                    value={charge.amount}
                                    onChange={e => {
                                        const next = [...charges];
                                        next[idx].amount = maskCurrency(e.target.value);
                                        setCharges(next);
                                    }}
                                    placeholder="0,00"
                                    className="h-9"
                                />
                            </div>

                            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCharges(prev => prev.filter((_, i) => i !== idx))}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCharges(prev => [...prev, { charge_type: 'CONDOMINIUM', label: '', responsibility: 'TENANT', amount: '' }])}
                    >
                        <Plus className="mr-1 h-4 w-4" /> Adicionar Encargo
                    </Button>
                </FormSection>

                {/* ── Section 6: Documents (only in edit mode) ──────────── */}
                {pageState === 'editing' && (
                    <FormSection
                        id="documents"
                        title="Documentos"
                        description="Contrato, laudos, aditivos e recibos."
                        icon={<FileText className="h-5 w-5" />}
                        open={openSections.documents}
                        onToggle={() => toggleSection('documents')}
                    >
                        {/* Upload */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="flex-1">
                                <Label className="text-xs">Tipo do Documento</Label>
                                <select
                                    className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm"
                                    value={uploadDocType}
                                    onChange={e => setUploadDocType(e.target.value)}
                                >
                                    {DOCUMENT_TYPE_OPTIONS.map(d => (
                                        <option key={d.value} value={d.value}>{d.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
                                    {uploadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    Enviar Arquivo
                                    <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        className="hidden"
                                        onChange={e => {
                                            const f = e.target.files?.[0];
                                            if (f) handleDocUpload(f);
                                            e.target.value = '';
                                        }}
                                        disabled={uploadingDoc}
                                    />
                                </label>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">PDF, JPG ou PNG. Máximo 5 MB.</p>

                        {/* List */}
                        {existingDocuments.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {existingDocuments.map(doc => (
                                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                                        <div className="flex items-center gap-2 text-sm">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium">{doc.file_name}</span>
                                            <Badge variant="outline" className="text-xs">
                                                {DOCUMENT_TYPE_OPTIONS.find(d => d.value === doc.document_type)?.label || doc.document_type}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <a href={doc.file_url} target="_blank" rel="noreferrer">
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            </a>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => handleDocDelete(doc.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </FormSection>
                )}

                {/* ── Section 7: Notes ─────────────────────────────────── */}
                <FormSection
                    id="notes"
                    title="Observações"
                    description="Notas internas e privadas."
                    icon={<PenLine className="h-5 w-5" />}
                    open={openSections.notes}
                    onToggle={() => toggleSection('notes')}
                >
                    <div id="field-notes">
                        <Label>Observações Internas</Label>
                        <textarea
                            className="flex min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={form.notes}
                            onChange={e => updateForm('notes', e.target.value)}
                            placeholder="Informações adicionais sobre o contrato..."
                        />
                    </div>
                </FormSection>

                {/* ── Actions ──────────────────────────────────────────── */}
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={() => { resetForm(); setPageState('list'); }} disabled={saving}>
                        Cancelar
                    </Button>
                    {!editingId && (
                        <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                            Salvar como Rascunho
                        </Button>
                    )}
                    <Button onClick={() => handleSave(false)} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {editingId ? 'Salvar Alterações' : 'Salvar Contrato'}
                    </Button>
                </div>
            </div>
        );
    }

    // ── Render: List ──────────────────────────────────────────────

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Contratos de Locação</h1>
                    <p className="text-sm text-muted-foreground">
                        {leases.length} {leases.length === 1 ? 'contrato registrado' : 'contratos registrados'}
                    </p>
                </div>
                <Button onClick={() => { resetForm(); setPageState('form'); }}>
                    <Plus className="mr-2 h-4 w-4" /> Novo Contrato
                </Button>
            </div>

            {/* Search & filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Buscar por imóvel, inquilino ou referência..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        className="flex h-10 rounded-md border bg-background px-3 py-2 text-sm"
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                    >
                        <option value="">Todos os status</option>
                        <option value="ACTIVE">Ativo</option>
                        <option value="DRAFT">Rascunho</option>
                        <option value="EXPIRING_SOON">Vencendo</option>
                        <option value="EXPIRED">Expirado</option>
                        <option value="TERMINATED">Rescindido</option>
                        <option value="CANCELLED">Cancelado</option>
                    </select>
                    <select
                        className="flex h-10 rounded-md border bg-background px-3 py-2 text-sm"
                        value={filterProperty}
                        onChange={e => setFilterProperty(e.target.value)}
                    >
                        <option value="">Todos os imóveis</option>
                        {properties.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <select
                        className="flex h-10 rounded-md border bg-background px-3 py-2 text-sm"
                        value={filterManagement}
                        onChange={e => setFilterManagement(e.target.value)}
                    >
                        <option value="">Todas as gestões</option>
                        <option value="SELF_MANAGED">Gestão própria</option>
                        <option value="AGENCY">Imobiliária</option>
                        <option value="AGENT">Corretor</option>
                    </select>
                    {(searchQuery || filterStatus || filterProperty || filterManagement) && (
                        <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setFilterStatus(''); setFilterProperty(''); setFilterManagement(''); }}>
                            <X className="mr-1 h-4 w-4" /> Limpar
                        </Button>
                    )}
                </div>
            </div>

            {/* Empty state */}
            {filteredLeases.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
                    <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-semibold text-foreground">
                        {leases.length === 0 ? 'Nenhum contrato registrado' : 'Nenhum contrato encontrado'}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {leases.length === 0
                            ? 'Clique em "Novo Contrato" para criar o primeiro.'
                            : 'Tente ajustar os filtros de busca.'
                        }
                    </p>
                </div>
            )}

            {/* Lease rows */}
            <div className="space-y-3">
                {filteredLeases.map(lease => {
                    const displayStatus = computeDisplayStatus(lease);
                    const statusInfo = getStatusLabel(displayStatus);
                    const isExpanded = expandedId === lease.id;

                    return (
                        <div key={lease.id} className="overflow-hidden rounded-lg border border-border bg-card">
                            {/* Row header */}
                            <div className="flex items-center gap-3 p-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-foreground truncate">
                                            {lease.reference_name || lease.property_name || 'Contrato'}
                                        </h3>
                                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Home className="h-3.5 w-3.5" /> {lease.property_name || '—'}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5" /> {lease.primary_tenant_name || '—'}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <DollarSign className="h-3.5 w-3.5" /> {formatCurrencyBRL(lease.monthly_rent)}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {formatDateBR(lease.start_date)}
                                            {lease.end_date ? ` — ${formatDateBR(lease.end_date)}` : ' — Indeterminado'}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Building2 className="h-3.5 w-3.5" /> {getManagementLabel(lease.management_type)}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedId(isExpanded ? null : lease.id)}>
                                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(lease)}>
                                        <PenLine className="h-4 w-4" />
                                    </Button>
                                    {displayStatus === 'ACTIVE' && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-orange-500 hover:text-orange-700"
                                            onClick={() => { setTerminateTarget(lease); setTerminateDate(''); setTerminateReason(''); }}
                                            title="Rescindir contrato"
                                        >
                                            <Ban className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700"
                                        onClick={() => setDeleteTarget(lease)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                                <div className="border-t border-border">
                                    <LeaseProfileCard
                                        lease={{ ...lease, status: displayStatus }}
                                        agencies={agencies}
                                        agents={agents}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Delete modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-foreground">Excluir Contrato</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Tem certeza que deseja excluir o contrato <strong>&ldquo;{deleteTarget.reference_name || deleteTarget.property_name}&rdquo;</strong>?
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">O registro será mantido no histórico.</p>
                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Terminate modal */}
            {terminateTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <Ban className="h-5 w-5 text-orange-500" /> Rescindir Contrato
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Rescindir <strong>&ldquo;{terminateTarget.reference_name || terminateTarget.property_name}&rdquo;</strong>.
                            O contrato será mantido no histórico.
                        </p>

                        <div className="mt-4 space-y-3">
                            <div>
                                <Label>Data de Rescisão *</Label>
                                <Input
                                    value={terminateDate}
                                    onChange={e => setTerminateDate(maskDate(e.target.value))}
                                    placeholder="DD/MM/AAAA"
                                    maxLength={10}
                                />
                            </div>
                            <div>
                                <Label>Motivo da Rescisão</Label>
                                <textarea
                                    className="flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    value={terminateReason}
                                    onChange={e => setTerminateReason(e.target.value)}
                                    placeholder="Motivo (opcional)..."
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setTerminateTarget(null)} disabled={terminating}>
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleTerminate}
                                disabled={!terminateDate || terminating}
                            >
                                {terminating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                                Rescindir
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Collapsible Form Section Component ───────────────────────────────

function FormSection({
    id,
    title,
    description,
    icon,
    open,
    onToggle,
    children,
}: {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
            <button
                type="button"
                className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/50 transition"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">{title}</h3>
                        <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                </div>
                {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
            </button>
            {open && (
                <div className="space-y-4 border-t border-border p-4">
                    {children}
                </div>
            )}
        </div>
    );
}
