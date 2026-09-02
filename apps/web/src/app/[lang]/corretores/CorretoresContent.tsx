"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    User,
    Phone,
    Loader2,
    Save,
    ArrowLeft,
    AlertTriangle,
    MessageCircle,
    Plus,
    ChevronDown,
    ChevronUp,
    X,
    Upload,
    Trash2,
    ImageIcon,
    Shield,
    CheckCircle2,
    FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AgentProfileCard from '@/components/corretores/AgentProfileCard';
import { Badge } from '@/components/ui/badge';
import type { AgentWithAgency, AgentFormData, AgentStatus } from '@/types/agent';
import type { AgencyWithRole } from '@/types/agency';
import {
    maskPhone,
    validatePhone,
    validateEmail,
    validateWebsite,
    maskCPF,
    parseCPF,
    validateCPF,
    formatPhone,
    formatCPF,
    formatCRECI,
    BRAZILIAN_STATES,
} from '@/lib/validators';

// ── Types ────────────────────────────────────────────────────────────

type PageState = 'loading' | 'list' | 'form' | 'editing';

interface FieldErrors {
    [key: string]: string;
}

// ── Initial form state ───────────────────────────────────────────────

function getEmptyFormData(): AgentFormData {
    return {
        full_name: '',
        cpf: '',
        creci_number: '',
        creci_state: '',
        agent_type: 'AUTONOMO',
        agency_id: '',
        main_phone: '',
        additional_phone: '',
        whatsapp_phone: '',
        email: '',
        website: '',
        notes: '',
        status: 'ACTIVE',
    };
}

function agentToFormData(agent: AgentWithAgency): AgentFormData {
    return {
        full_name: agent.full_name || '',
        cpf: agent.cpf ? formatCPF(agent.cpf) : '',
        creci_number: agent.creci_number || '',
        creci_state: agent.creci_state || '',
        agent_type: agent.agent_type || 'AUTONOMO',
        agency_id: agent.agency_id || '',
        main_phone: formatPhone(agent.main_phone),
        additional_phone: agent.additional_phone ? formatPhone(agent.additional_phone) : '',
        whatsapp_phone: agent.whatsapp_phone ? formatPhone(agent.whatsapp_phone) : '',
        email: agent.email || '',
        website: agent.website?.replace(/^https?:\/\//, '') || '',
        notes: agent.notes || '',
        status: agent.status || 'ACTIVE',
    };
}

function getStatusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    switch (status) {
        case 'ACTIVE':
            return { label: 'Ativo', variant: 'default' };
        case 'INACTIVE':
            return { label: 'Inativo', variant: 'secondary' };
        default:
            return { label: status, variant: 'outline' };
    }
}

// ── Component ────────────────────────────────────────────────────────

interface CorretoresContentProps {
    lang: string;
}

export default function CorretoresContent({ lang }: CorretoresContentProps) {
    // Page state
    const [pageState, setPageState] = useState<PageState>('loading');
    const [agents, setAgents] = useState<AgentWithAgency[]>([]);
    const [editingAgent, setEditingAgent] = useState<AgentWithAgency | null>(null);

    // User's agencies for the dropdown
    const [userAgencies, setUserAgencies] = useState<AgencyWithRole[]>([]);

    // Accordion state — which agent is expanded
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Delete confirmation
    const [deletingAgent, setDeletingAgent] = useState<AgentWithAgency | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState<AgentFormData>(getEmptyFormData());
    const [errors, setErrors] = useState<FieldErrors>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    // Photo upload state
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);

    // ── Fetch agents on mount ────────────────────────────────────────

    const fetchAgents = useCallback(async () => {
        try {
            const res = await fetch('/api/agents');
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setAgents(data.agents || []);
            setPageState('list');
        } catch (err) {
            console.error('[Corretores] Error fetching agents:', err);
            setAgents([]);
            setPageState('list');
        }
    }, []);

    const fetchAgencies = useCallback(async () => {
        try {
            const res = await fetch('/api/agencies');
            if (!res.ok) throw new Error('Failed to fetch agencies');
            const data = await res.json();
            setUserAgencies(data.agencies || []);
        } catch (err) {
            console.error('[Corretores] Error fetching agencies:', err);
            setUserAgencies([]);
        }
    }, []);

    useEffect(() => {
        fetchAgents();
        fetchAgencies();
    }, [fetchAgents, fetchAgencies]);

    // ── Accordion toggle ─────────────────────────────────────────────

    const toggleExpand = useCallback((id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    }, []);

    // ── Form field handlers ──────────────────────────────────────────

    const updateField = useCallback((field: keyof AgentFormData, value: string | boolean) => {
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

    const handleMaskedInput = useCallback((field: keyof AgentFormData, value: string, maskFn: (v: string) => string) => {
        updateField(field, maskFn(value));
    }, [updateField]);

    // ── Client-side validation ───────────────────────────────────────

    const validate = useCallback((): FieldErrors => {
        const errs: FieldErrors = {};

        if (!form.full_name.trim()) errs.full_name = 'Nome completo é obrigatório.';
        if (!form.creci_number.trim()) errs.creci_number = 'CRECI é obrigatório.';
        if (!form.creci_state.trim()) errs.creci_state = 'UF do CRECI é obrigatório.';
        if (!form.agent_type) errs.agent_type = 'Tipo de atuação é obrigatório.';
        if (form.agent_type === 'IMOBILIARIA' && !form.agency_id.trim()) {
            errs.agency_id = 'Selecione a imobiliária.';
        }
        if (!form.main_phone.trim()) {
            errs.main_phone = 'Telefone principal é obrigatório.';
        } else if (!validatePhone(form.main_phone)) {
            errs.main_phone = 'Telefone inválido. Use (XX) XXXXX-XXXX.';
        }

        // Optional field validation
        const cpfDigits = parseCPF(form.cpf);
        if (cpfDigits.length > 0 && cpfDigits.length !== 11) {
            errs.cpf = 'CPF deve ter 11 dígitos.';
        } else if (cpfDigits.length === 11 && !validateCPF(cpfDigits)) {
            errs.cpf = 'CPF inválido. Verifique os dígitos.';
        }

        if (form.email.trim() && !validateEmail(form.email)) {
            errs.email = 'E-mail inválido.';
        }

        if (form.additional_phone.trim() && !validatePhone(form.additional_phone)) {
            errs.additional_phone = 'Telefone inválido.';
        }

        if (form.whatsapp_phone.trim() && !validatePhone(form.whatsapp_phone)) {
            errs.whatsapp_phone = 'WhatsApp inválido.';
        }

        if (form.website.trim() && !validateWebsite(form.website)) {
            errs.website = 'Website inválido.';
        }

        return errs;
    }, [form]);

    // ── Photo upload helper ──────────────────────────────────────────

    const uploadPhoto = useCallback(async (agentId: string) => {
        if (!photoFile) return;

        setPhotoUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', photoFile);

            const res = await fetch(`/api/agents/${agentId}/photo`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const data = await res.json();
                setPhotoError(data.error || 'Erro ao fazer upload da foto.');
            }
        } catch {
            setPhotoError('Erro de conexão ao fazer upload da foto.');
        } finally {
            setPhotoUploading(false);
        }
    }, [photoFile]);

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
            const isEditing = pageState === 'editing' && editingAgent;
            const url = isEditing ? `/api/agents/${editingAgent.id}` : '/api/agents';
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

            // Upload photo if a new file was selected
            if (photoFile && data.agent?.id) {
                await uploadPhoto(data.agent.id);
            }

            // Refetch agents list to get updated data
            await fetchAgents();
        } catch {
            setSubmitError('Erro de conexão. Verifique sua internet e tente novamente.');
        } finally {
            setSubmitting(false);
        }
    }, [form, validate, pageState, editingAgent, fetchAgents, photoFile, uploadPhoto]);

    // ── Navigation handlers ──────────────────────────────────────────

    const startAdding = useCallback(() => {
        setForm(getEmptyFormData());
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setEditingAgent(null);
        setPhotoPreview(null);
        setPhotoFile(null);
        setPhotoError(null);
        setPageState('form');
    }, []);

    const startEditing = useCallback((agent: AgentWithAgency) => {
        setForm(agentToFormData(agent));
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setEditingAgent(agent);
        setPhotoPreview(agent.photo_url || null);
        setPhotoFile(null);
        setPhotoError(null);
        setPageState('editing');
    }, []);

    // ── Photo upload handlers ────────────────────────────────────────

    const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            setPhotoError('Formato não suportado. Use JPG, PNG ou WebP.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setPhotoError('Arquivo muito grande. Máximo 2 MB.');
            return;
        }

        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(file));
        setPhotoError(null);
    }, []);

    const removePhoto = useCallback(async () => {
        if (editingAgent?.id && editingAgent.photo_url) {
            // Remove from server
            try {
                await fetch(`/api/agents/${editingAgent.id}/photo`, { method: 'DELETE' });
            } catch {
                // Ignore — we still clear locally
            }
        }
        setPhotoPreview(null);
        setPhotoFile(null);
        setPhotoError(null);
    }, [editingAgent]);

    const cancelForm = useCallback(() => {
        setErrors({});
        setSubmitError(null);
        setSubmitSuccess(false);
        setEditingAgent(null);
        setPageState('list');
    }, []);

    // ── Delete handlers ──────────────────────────────────────────────

    const confirmDelete = useCallback((agent: AgentWithAgency) => {
        setDeletingAgent(agent);
        setDeleteError(null);
    }, []);

    const cancelDelete = useCallback(() => {
        setDeletingAgent(null);
        setDeleteError(null);
    }, []);

    const executeDelete = useCallback(async () => {
        if (!deletingAgent) return;

        setDeleteLoading(true);
        setDeleteError(null);

        try {
            const res = await fetch(`/api/agents/${deletingAgent.id}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (!res.ok) {
                setDeleteError(data.error || 'Erro ao excluir corretor.');
                return;
            }

            // Remove from local state
            setAgents(prev => prev.filter(a => a.id !== deletingAgent.id));
            if (expandedId === deletingAgent.id) {
                setExpandedId(null);
            }
            setDeletingAgent(null);
        } catch {
            setDeleteError('Erro de conexão. Tente novamente.');
        } finally {
            setDeleteLoading(false);
        }
    }, [deletingAgent, expandedId]);

    // ── Toggle status handler ────────────────────────────────────────

    const toggleStatus = useCallback(async (agent: AgentWithAgency) => {
        const newStatus: AgentStatus = agent.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

        try {
            const formData = agentToFormData(agent);
            formData.status = newStatus;

            const res = await fetch(`/api/agents/${agent.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                // Update local state
                setAgents(prev => prev.map(a =>
                    a.id === agent.id ? { ...a, status: newStatus } : a
                ));
            }
        } catch (err) {
            console.error('[Corretores] Error toggling status:', err);
        }
    }, []);

    // ── Check if form has all required fields ────────────────────────

    const isFormValid = form.full_name.trim() !== '' &&
        form.creci_number.trim() !== '' &&
        form.creci_state.trim() !== '' &&
        form.main_phone.trim() !== '' &&
        validatePhone(form.main_phone) &&
        (form.agent_type !== 'IMOBILIARIA' || form.agency_id.trim() !== '');

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
                        <h1 className="text-3xl font-bold text-foreground">Corretores</h1>
                        <p className="text-muted-foreground mt-1">
                            Gerencie seus corretores de imóveis cadastrados.
                        </p>
                    </div>
                    <Button onClick={startAdding} className="shrink-0">
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar corretor
                    </Button>
                </div>

                {/* Success message */}
                {submitSuccess && (
                    <div className="mb-6 flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-sm">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Dados salvos com sucesso!
                    </div>
                )}

                {/* Empty state */}
                {agents.length === 0 ? (
                    <div className="bg-card border border-border rounded-2xl p-12 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <User className="w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground mb-2">
                            Nenhum corretor cadastrado
                        </h2>
                        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                            Cadastre seu primeiro corretor de imóveis para gerenciar sua equipe no Kitnets.com.
                        </p>
                        <Button onClick={startAdding}>
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar corretor
                        </Button>
                    </div>
                ) : (
                    /* Agent list */
                    <div className="space-y-3">
                        {agents.map((agent) => {
                            const isExpanded = expandedId === agent.id;
                            const status = getStatusLabel(agent.status);
                            const creciDisplay = formatCRECI(agent.creci_number, agent.creci_state);
                            const agencyDisplay = agent.agent_type === 'AUTONOMO'
                                ? 'Corretor(a) Autônomo(a)'
                                : agent.agency_name || 'Sem imobiliária';

                            return (
                                <div key={agent.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-shadow hover:shadow-md">
                                    {/* Compact Row */}
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(agent.id)}
                                        className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-accent/50 transition-colors cursor-pointer"
                                        aria-expanded={isExpanded}
                                        aria-controls={`agent-detail-${agent.id}`}
                                    >
                                        {/* Expand/collapse icon */}
                                        <div className="shrink-0 text-muted-foreground">
                                            {isExpanded ? (
                                                <ChevronUp className="w-5 h-5" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5" />
                                            )}
                                        </div>

                                        {/* Photo thumbnail */}
                                        {agent.photo_url ? (
                                            <img
                                                src={agent.photo_url}
                                                alt={`Foto ${agent.full_name}`}
                                                className="w-10 h-10 rounded-full object-cover border border-border shrink-0 hidden sm:block"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 hidden sm:block">
                                                <User className="w-5 h-5 text-primary" />
                                            </div>
                                        )}

                                        {/* Agent info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-foreground truncate">
                                                {agent.full_name}
                                            </p>
                                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                                                {creciDisplay} · {agencyDisplay}
                                            </p>
                                        </div>

                                        {/* WhatsApp / Phone link */}
                                        {agent.whatsapp_phone ? (
                                            <a
                                                href={`https://wa.me/${agent.whatsapp_phone.replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
                                                title="Abrir WhatsApp"
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                                <span>{formatPhone(agent.whatsapp_phone)}</span>
                                            </a>
                                        ) : (
                                            <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-sm text-muted-foreground">
                                                <Phone className="w-4 h-4" />
                                                <span>{formatPhone(agent.main_phone)}</span>
                                            </span>
                                        )}

                                        {/* Status badge */}
                                        <Badge variant={status.variant} className="shrink-0">
                                            {status.label}
                                        </Badge>
                                    </button>

                                    {/* Expanded detail card */}
                                    {isExpanded && (
                                        <div
                                            id={`agent-detail-${agent.id}`}
                                            className="border-t border-border p-4 sm:p-6"
                                        >
                                            <AgentProfileCard
                                                agent={agent}
                                                onEdit={() => startEditing(agent)}
                                                onDelete={() => confirmDelete(agent)}
                                                onToggleStatus={() => toggleStatus(agent)}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Delete confirmation modal */}
                {deletingAgent && (
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
                                    Excluir corretor?
                                </h2>
                                <p className="text-muted-foreground text-sm">
                                    Tem certeza de que deseja excluir{' '}
                                    <span className="font-semibold text-foreground">
                                        {deletingAgent.full_name}
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
                                        'Excluir corretor'
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
                <h1 className="text-3xl font-bold text-foreground">
                    {isEditing ? 'Editar Corretor' : 'Cadastrar Corretor'}
                </h1>
                <p className="text-muted-foreground mt-2">
                    {isEditing
                        ? 'Atualize os dados do corretor.'
                        : 'Cadastre os dados do corretor de imóveis.'}
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
                {/* ── Section 1: Dados do corretor ──────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">
                                Dados do corretor
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Informações pessoais e registro profissional.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Photo Upload */}
                        <div>
                            <Label>Foto do corretor</Label>
                            <div className="mt-2 flex items-center gap-4">
                                {photoPreview ? (
                                    <div className="relative group">
                                        <img
                                            src={photoPreview}
                                            alt="Foto preview"
                                            className="w-20 h-20 rounded-full object-cover border border-border"
                                        />
                                        <button
                                            type="button"
                                            onClick={removePhoto}
                                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                                            title="Remover foto"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
                                        <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                                    </div>
                                )}
                                <div className="flex-1">
                                    <label
                                        htmlFor="photo-upload"
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-input bg-background hover:bg-accent cursor-pointer transition-colors"
                                    >
                                        <Upload className="w-4 h-4" />
                                        {photoPreview ? 'Trocar foto' : 'Escolher arquivo'}
                                    </label>
                                    <input
                                        id="photo-upload"
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={handlePhotoSelect}
                                        className="hidden"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        JPG, PNG ou WebP. Máx. 2 MB.
                                    </p>
                                    {photoError && (
                                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            {photoError}
                                        </p>
                                    )}
                                    {photoUploading && (
                                        <p className="text-xs text-primary mt-1 flex items-center gap-1">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Enviando foto...
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Full name */}
                        <div id="field-full_name">
                            <Label htmlFor="agent-full-name">
                                Nome completo <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="agent-full-name"
                                value={form.full_name}
                                onChange={(e) => updateField('full_name', e.target.value)}
                                placeholder="Nome completo do corretor"
                                className={cn(errors.full_name && 'border-red-500')}
                                maxLength={200}
                            />
                            {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
                        </div>

                        {/* CPF */}
                        <div id="field-cpf">
                            <Label htmlFor="agent-cpf">CPF</Label>
                            <Input
                                id="agent-cpf"
                                value={form.cpf}
                                onChange={(e) => handleMaskedInput('cpf', e.target.value, maskCPF)}
                                placeholder="000.000.000-00"
                                className={cn(errors.cpf && 'border-red-500')}
                                maxLength={14}
                            />
                            {errors.cpf && <p className="text-xs text-red-500 mt-1">{errors.cpf}</p>}
                        </div>

                        {/* CRECI */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div id="field-creci_number">
                                <Label htmlFor="agent-creci">
                                    Nº CRECI <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="agent-creci"
                                    value={form.creci_number}
                                    onChange={(e) => updateField('creci_number', e.target.value)}
                                    placeholder="Ex: 12345"
                                    className={cn(errors.creci_number && 'border-red-500')}
                                    maxLength={20}
                                />
                                {errors.creci_number && <p className="text-xs text-red-500 mt-1">{errors.creci_number}</p>}
                            </div>
                            <div id="field-creci_state">
                                <Label htmlFor="agent-creci-state">
                                    UF CRECI <span className="text-red-500">*</span>
                                </Label>
                                <select
                                    id="agent-creci-state"
                                    value={form.creci_state}
                                    onChange={(e) => updateField('creci_state', e.target.value)}
                                    className={cn(
                                        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                        errors.creci_state && 'border-red-500'
                                    )}
                                >
                                    <option value="">Selecione</option>
                                    {BRAZILIAN_STATES.map(s => (
                                        <option key={s.code} value={s.code}>{s.code}</option>
                                    ))}
                                </select>
                                {errors.creci_state && <p className="text-xs text-red-500 mt-1">{errors.creci_state}</p>}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Section 2: Tipo de atuação ───────────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Tipo de atuação</h2>
                            <p className="text-xs text-muted-foreground">
                                Defina se o corretor atua de forma autônoma ou vinculado a uma imobiliária.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Agent type radio buttons */}
                        <div id="field-agent_type" className="space-y-3">
                            <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent/50 transition-colors cursor-pointer">
                                <input
                                    type="radio"
                                    name="agent_type"
                                    value="AUTONOMO"
                                    checked={form.agent_type === 'AUTONOMO'}
                                    onChange={() => {
                                        updateField('agent_type', 'AUTONOMO');
                                        updateField('agency_id', '');
                                    }}
                                    className="w-4 h-4 text-primary"
                                />
                                <div>
                                    <p className="text-sm font-medium text-foreground">Corretor autônomo</p>
                                    <p className="text-xs text-muted-foreground">Atua de forma independente, sem vínculo com imobiliária.</p>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent/50 transition-colors cursor-pointer">
                                <input
                                    type="radio"
                                    name="agent_type"
                                    value="IMOBILIARIA"
                                    checked={form.agent_type === 'IMOBILIARIA'}
                                    onChange={() => updateField('agent_type', 'IMOBILIARIA')}
                                    className="w-4 h-4 text-primary"
                                />
                                <div>
                                    <p className="text-sm font-medium text-foreground">Trabalha em imobiliária</p>
                                    <p className="text-xs text-muted-foreground">Vinculado a uma imobiliária cadastrada.</p>
                                </div>
                            </label>
                            {errors.agent_type && <p className="text-xs text-red-500 mt-1">{errors.agent_type}</p>}
                        </div>

                        {/* Agency selector (conditional) */}
                        {form.agent_type === 'IMOBILIARIA' && (
                            <div id="field-agency_id">
                                <Label htmlFor="agent-agency">
                                    Imobiliária <span className="text-red-500">*</span>
                                </Label>
                                <select
                                    id="agent-agency"
                                    value={form.agency_id}
                                    onChange={(e) => updateField('agency_id', e.target.value)}
                                    className={cn(
                                        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                        errors.agency_id && 'border-red-500'
                                    )}
                                >
                                    <option value="">Selecionar imobiliária cadastrada</option>
                                    {userAgencies.map(a => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}{a.trade_name ? ` (${a.trade_name})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {errors.agency_id && <p className="text-xs text-red-500 mt-1">{errors.agency_id}</p>}
                                {userAgencies.length === 0 && (
                                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Nenhuma imobiliária cadastrada. Cadastre uma imobiliária primeiro.
                                    </p>
                                )}
                            </div>
                        )}
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
                                Telefone, WhatsApp, e-mail e perfil profissional.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Main phone */}
                        <div id="field-main_phone">
                            <Label htmlFor="agent-phone">
                                Telefone principal <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="agent-phone"
                                value={form.main_phone}
                                onChange={(e) => handleMaskedInput('main_phone', e.target.value, maskPhone)}
                                placeholder="(31) 99999-9999"
                                className={cn(errors.main_phone && 'border-red-500')}
                                maxLength={15}
                            />
                            {errors.main_phone && <p className="text-xs text-red-500 mt-1">{errors.main_phone}</p>}
                        </div>

                        {/* Additional phone */}
                        <div id="field-additional_phone">
                            <Label htmlFor="agent-phone2">Telefone adicional</Label>
                            <Input
                                id="agent-phone2"
                                value={form.additional_phone}
                                onChange={(e) => handleMaskedInput('additional_phone', e.target.value, maskPhone)}
                                placeholder="(31) 3561-3173 (opcional)"
                                className={cn(errors.additional_phone && 'border-red-500')}
                                maxLength={15}
                            />
                            {errors.additional_phone && <p className="text-xs text-red-500 mt-1">{errors.additional_phone}</p>}
                        </div>

                        {/* WhatsApp */}
                        <div id="field-whatsapp_phone">
                            <Label htmlFor="agent-whatsapp">
                                <span className="inline-flex items-center gap-1.5">
                                    <MessageCircle className="w-4 h-4 text-green-600" />
                                    WhatsApp
                                </span>
                            </Label>
                            <Input
                                id="agent-whatsapp"
                                value={form.whatsapp_phone}
                                onChange={(e) => handleMaskedInput('whatsapp_phone', e.target.value, maskPhone)}
                                placeholder="(31) 99999-9999 (opcional)"
                                className={cn(errors.whatsapp_phone && 'border-red-500')}
                                maxLength={15}
                            />
                            {errors.whatsapp_phone && <p className="text-xs text-red-500 mt-1">{errors.whatsapp_phone}</p>}
                        </div>

                        {/* Email */}
                        <div id="field-email">
                            <Label htmlFor="agent-email">E-mail</Label>
                            <Input
                                id="agent-email"
                                type="email"
                                value={form.email}
                                onChange={(e) => updateField('email', e.target.value)}
                                placeholder="corretor@email.com (opcional)"
                                className={cn(errors.email && 'border-red-500')}
                                maxLength={254}
                            />
                            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                        </div>

                        {/* Website */}
                        <div id="field-website">
                            <Label htmlFor="agent-website">Website / Perfil profissional</Label>
                            <Input
                                id="agent-website"
                                value={form.website}
                                onChange={(e) => updateField('website', e.target.value)}
                                placeholder="www.corretor.com.br (opcional)"
                                className={cn(errors.website && 'border-red-500')}
                                maxLength={200}
                            />
                            {errors.website && <p className="text-xs text-red-500 mt-1">{errors.website}</p>}
                        </div>
                    </div>
                </section>

                {/* ── Section 4: Observações e Status ──────────────── */}
                <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Observações e Status</h2>
                            <p className="text-xs text-muted-foreground">
                                Notas adicionais e status do corretor.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Notes */}
                        <div id="field-notes">
                            <Label htmlFor="agent-notes">Observações</Label>
                            <textarea
                                id="agent-notes"
                                value={form.notes}
                                onChange={(e) => updateField('notes', e.target.value)}
                                placeholder="Informações adicionais sobre o corretor (opcional)"
                                rows={3}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                                maxLength={2000}
                            />
                        </div>

                        {/* Status */}
                        <div id="field-status">
                            <Label>
                                Status <span className="text-red-500">*</span>
                            </Label>
                            <div className="flex items-center gap-4 mt-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="agent_status"
                                        value="ACTIVE"
                                        checked={form.status === 'ACTIVE'}
                                        onChange={() => updateField('status', 'ACTIVE')}
                                        className="w-4 h-4 text-primary"
                                    />
                                    <span className="text-sm text-foreground">Ativo</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="agent_status"
                                        value="INACTIVE"
                                        checked={form.status === 'INACTIVE'}
                                        onChange={() => updateField('status', 'INACTIVE')}
                                        className="w-4 h-4 text-primary"
                                    />
                                    <span className="text-sm text-foreground">Inativo</span>
                                </label>
                            </div>
                            {errors.status && <p className="text-xs text-red-500 mt-1">{errors.status}</p>}
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
                                {isEditing ? 'Salvar alterações' : 'Cadastrar corretor'}
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
