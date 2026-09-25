"use client";

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AlertTriangle,
    Building2,
    CheckCircle2,
    Edit3,
    FileText,
    Home,
    Loader2,
    Sparkles,
    Upload,
    Users,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCNPJ, formatCPF, maskCEP, maskCNPJ, maskCPF, maskPhone } from '@/lib/validators';
import type { ExtractedLease, ExtractedTenantRole, MatchResult } from '@/lib/lease-extract';
import type { AdditionalTenantFormItem, LeaseAgencyOption, LeasePropertyOption } from '@/types/lease';
import { ROUTE_BODY_SAFE_SIZE, stageLeaseFile } from '@/lib/lease-upload-client';

/**
 * "Novo Contrato" entry point: upload a lease agreement, let the AI read it,
 * then settle who is who before the form opens. Whatever the contract names
 * that the account does not have yet (property, agency, tenants) is only
 * created after the user says so here.
 */

export interface LeaseImportResult {
    /** The uploaded agreement, attached to the lease once it is saved. */
    file: File;
    /** Where the agreement already sits in storage (uploaded directly): the lease adopts it instead of a second upload */
    storagePath: string | null;
    data: ExtractedLease;
    propertyId: string;
    agencyId: string;
    /** the corretor named on the contract (matched or created here), '' when none */
    agentId: string;
    primaryTenantId: string;
    additionalTenants: AdditionalTenantFormItem[];
}

interface Props {
    properties: LeasePropertyOption[];
    agencies: LeaseAgencyOption[];
    onClose: () => void;
    /** "Digitar manualmente": open the empty form. Without it the option is not offered. */
    onManual?: () => void;
    /**
     * Receives what was settled. A caller that creates the lease itself (`createsLease`)
     * returns the messages to show when it could not; the modal then stays open.
     */
    onComplete: (result: LeaseImportResult) => void | string[] | Promise<void | string[]>;
    /** Import started from a known property (a unit card on Imóveis): nothing to match or create */
    fixedProperty?: { id: string; label: string };
    /** A file already picked outside: skips the upload step */
    initialFile?: File;
    /** The caller creates the lease on completion instead of opening the form */
    createsLease?: boolean;
    /** Import started from an agency's dashboard (Imobiliárias): the agency is settled, nothing to match or create */
    fixedAgency?: { id: string; label: string };
}

type FieldErrors = Record<string, string>;
/** create = register it from the contract; existing = use the picked record; skip = leave the form field empty. */
type EntityMode = 'create' | 'existing' | 'skip';

interface PropertyDraft {
    name: string; postal_code: string; street: string; street_number: string;
    address_complement: string; neighborhood: string; city: string; state: string;
}

interface AgencyDraft {
    name: string; cnpj: string; main_phone: string; email: string; postal_code: string; street: string;
    street_number: string; address_complement: string; neighborhood: string; city: string; state: string;
}

interface TenantDraft {
    role: ExtractedTenantRole;
    /** Set when the tenant already exists (matched) or has just been created. */
    tenantId: string;
    matchedBy: MatchResult['by'] | null;
    create: boolean;
    full_name: string; cpf: string; main_phone: string; email: string;
    rg: string | null;
    date_of_birth: string | null;
    errors: FieldErrors;
}

/** The corretor the contract names: the agency's representative, or an autonomous broker. */
interface AgentDraft {
    /** Set when the corretor already exists (matched) or has just been created. */
    agentId: string;
    matchedBy: MatchResult['by'] | null;
    create: boolean;
    full_name: string; cpf: string; creci_number: string; creci_state: string; main_phone: string; email: string;
    role: 'REPRESENTANTE' | 'CORRETOR';
    errors: FieldErrors;
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const selectClass = 'flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm';

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function formatMoney(value: number | null): string {
    return value == null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function addressLine(p: { street?: string | null; street_number?: string | null; address_complement?: string | null; neighborhood?: string | null; city?: string | null; state?: string | null }): string {
    const street = [p.street, p.street_number].filter(Boolean).join(', ');
    const cityState = [p.city, p.state].filter(Boolean).join('/');
    return [street, p.address_complement, p.neighborhood, cityState].filter(Boolean).join(' - ');
}

async function postJson(url: string, payload: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
}

function errorsFrom(json: Record<string, unknown>, fallback: string): FieldErrors {
    if (json.errors && typeof json.errors === 'object') return json.errors as FieldErrors;
    return { _form: typeof json.error === 'string' ? json.error : fallback };
}

export default function LeaseImportModal({ properties, agencies, onClose, onManual, onComplete, fixedProperty, initialFile, createsLease, fixedAgency }: Props) {
    const [step, setStep] = useState<'upload' | 'review'>('upload');
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractError, setExtractError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [storagePath, setStoragePath] = useState<string | null>(null);
    const [data, setData] = useState<ExtractedLease | null>(null);

    const [propertyMode, setPropertyMode] = useState<EntityMode>('skip');
    const [propertyMatch, setPropertyMatch] = useState<MatchResult | null>(null);
    const [propertyId, setPropertyId] = useState('');
    const [propertyDraft, setPropertyDraft] = useState<PropertyDraft | null>(null);
    const [propertyErrors, setPropertyErrors] = useState<FieldErrors>({});
    // Records created here are not in the parent's dropdown lists yet.
    const [createdProperty, setCreatedProperty] = useState<LeasePropertyOption | null>(null);
    // "Alterar" on a matched record: show the choices instead of the green banner.
    const [propertyEditing, setPropertyEditing] = useState(false);

    const [agencyMode, setAgencyMode] = useState<EntityMode>('skip');
    const [agencyMatch, setAgencyMatch] = useState<MatchResult | null>(null);
    const [agencyId, setAgencyId] = useState('');
    const [agencyDraft, setAgencyDraft] = useState<AgencyDraft | null>(null);
    const [agencyErrors, setAgencyErrors] = useState<FieldErrors>({});
    const [createdAgency, setCreatedAgency] = useState<LeaseAgencyOption | null>(null);
    const [agencyEditing, setAgencyEditing] = useState(false);
    /** the logo read from the contract's header (a data URL): it becomes the logo of the agency created here */
    const [agencyLogo, setAgencyLogo] = useState<string | null>(null);

    const [tenantDrafts, setTenantDrafts] = useState<TenantDraft[]>([]);
    const [agentDrafts, setAgentDrafts] = useState<AgentDraft[]>([]);
    const [applying, setApplying] = useState(false);
    const [completeErrors, setCompleteErrors] = useState<string[]>([]);

    const busy = isExtracting || applying;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const propertyOptions = createdProperty ? [...properties, createdProperty] : properties;
    const agencyOptions = createdAgency ? [...agencies, createdAgency] : agencies;
    const propertySettled = propertyMode === 'existing' && !propertyEditing && !!propertyId &&
        (propertyMatch?.id === propertyId || createdProperty?.id === propertyId);
    const agencySettled = !!fixedAgency || (agencyMode === 'existing' && !agencyEditing && !!agencyId &&
        (agencyMatch?.id === agencyId || createdAgency?.id === agencyId));

    // ── Step 1: upload + extraction ───────────────────────────────

    const handleUpload = async (picked: File) => {
        if (!ALLOWED_TYPES.includes(picked.type)) {
            setExtractError('Formato de arquivo não suportado. Use PDF, JPG, PNG ou WebP.');
            return;
        }
        if (picked.size > MAX_FILE_SIZE) {
            setExtractError('Arquivo muito grande. O limite máximo é 10MB.');
            return;
        }

        setIsExtracting(true);
        setExtractError(null);
        try {
            // Straight to storage: a route body stops at 4.5 MB, less than many signed, scanned leases
            const staged = await stageLeaseFile(picked);
            let res: Response;
            if ('path' in staged) {
                setStoragePath(staged.path);
                res = await fetch('/api/leases/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ storage_path: staged.path }),
                });
            } else if (picked.size <= ROUTE_BODY_SAFE_SIZE) {
                setStoragePath(null);
                const formData = new FormData();
                formData.append('file', picked);
                res = await fetch('/api/leases/extract', { method: 'POST', body: formData });
            } else {
                setExtractError(staged.error);
                return;
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.data) {
                setExtractError(json.error || 'Não foi possível extrair os dados do contrato. Tente novamente ou preencha manualmente.');
                return;
            }

            const extracted = json.data as ExtractedLease;
            const matches = (json.matches || {}) as { property?: MatchResult | null; agency?: MatchResult | null; agents?: (MatchResult | null)[]; tenants?: (MatchResult | null)[] };

            setFile(picked);
            setData(extracted);
            setAgencyLogo(typeof json.agency_logo === 'string' ? json.agency_logo : null);

            const p = extracted.property;
            const streetAndNumber = [p?.street, p?.street_number].filter(Boolean).join(', ');
            setPropertyMatch(matches.property ?? null);
            setPropertyId(fixedProperty?.id ?? matches.property?.id ?? '');
            setPropertyMode(fixedProperty || matches.property ? 'existing' : p ? 'create' : 'skip');
            setPropertyDraft(p ? {
                // "Apartamento 302" alone says little in a list of properties: add the street (unless the name has it).
                name: (p.name && p.street && p.name.toLowerCase().includes(p.street.toLowerCase())
                    ? p.name
                    : [p.name, streetAndNumber].filter(Boolean).join(' - ')).slice(0, 120),
                postal_code: p.postal_code ? maskCEP(p.postal_code) : '',
                street: p.street ?? '',
                street_number: p.street_number ?? '',
                address_complement: p.address_complement ?? '',
                neighborhood: p.neighborhood ?? '',
                city: p.city ?? '',
                state: p.state ?? '',
            } : null);
            setPropertyErrors({});

            const a = extracted.agency;
            setAgencyMatch(matches.agency ?? null);
            setAgencyId(fixedAgency?.id ?? matches.agency?.id ?? '');
            setAgencyMode(fixedAgency || matches.agency ? 'existing' : a ? 'create' : 'skip');
            setAgencyDraft(a ? {
                name: a.name,
                cnpj: a.cnpj ? formatCNPJ(a.cnpj) : '',
                main_phone: a.main_phone ? maskPhone(a.main_phone) : '',
                email: a.email ?? '',
                postal_code: a.postal_code ? maskCEP(a.postal_code) : '',
                street: a.street ?? '',
                street_number: a.street_number ?? '',
                address_complement: a.address_complement ?? '',
                neighborhood: a.neighborhood ?? '',
                city: a.city ?? '',
                state: a.state ?? '',
            } : null);
            setAgencyErrors({});

            setTenantDrafts(extracted.tenants.map((t, i) => {
                const match = matches.tenants?.[i] ?? null;
                return {
                    role: t.role,
                    tenantId: match?.id ?? '',
                    matchedBy: match?.by ?? null,
                    create: !match,
                    full_name: match?.name ?? t.full_name,
                    cpf: t.cpf ? formatCPF(t.cpf) : '',
                    main_phone: t.main_phone ? maskPhone(t.main_phone) : '',
                    email: t.email ?? '',
                    rg: t.rg,
                    date_of_birth: t.date_of_birth,
                    errors: {},
                };
            }));

            setAgentDrafts((extracted.agents ?? []).map((g, i) => {
                const match = matches.agents?.[i] ?? null;
                return {
                    agentId: match?.id ?? '',
                    matchedBy: match?.by ?? null,
                    create: !match,
                    full_name: match?.name ?? g.full_name,
                    cpf: g.cpf ? formatCPF(g.cpf) : '',
                    creci_number: g.creci_number ?? '',
                    creci_state: g.creci_state ?? '',
                    main_phone: g.main_phone ? maskPhone(g.main_phone) : '',
                    email: g.email ?? '',
                    role: g.role,
                    errors: {},
                };
            }));

            setStep('review');
        } catch {
            setExtractError('Erro de conexão ao processar o documento. Tente novamente.');
        } finally {
            setIsExtracting(false);
        }
    };

    const startedRef = useRef(false);
    useEffect(() => {
        if (!initialFile || startedRef.current) return;
        startedRef.current = true;
        void handleUpload(initialFile);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialFile]);

    // ── Step 2: create what the user approved, then hand over ─────

    const updateTenant = (idx: number, patch: Partial<TenantDraft>) => {
        setTenantDrafts(prev => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    };

    const handleApply = async () => {
        if (!data || !file) return;
        setApplying(true);
        setPropertyErrors({});
        setAgencyErrors({});
        setCompleteErrors([]);

        try {
            // 1. Property. Each successful step flips to "existing", so a retry after a later failure creates nothing twice.
            let finalPropertyId = propertyMode === 'existing' ? propertyId : '';
            if (propertyMode === 'create' && propertyDraft) {
                const { ok, json } = await postJson('/api/properties', propertyDraft);
                const created = json.property as LeasePropertyOption | undefined;
                if (!ok || !created) {
                    setPropertyErrors(errorsFrom(json, 'Não foi possível criar o imóvel.'));
                    return;
                }
                finalPropertyId = created.id;
                setCreatedProperty(created);
                setPropertyId(created.id);
                setPropertyMode('existing');
                setPropertyEditing(false);
            }

            // 2. Agency.
            let finalAgencyId = agencyMode === 'existing' ? agencyId : '';
            if (agencyMode === 'create' && agencyDraft) {
                const a = data.agency;
                const { ok, json } = await postJson('/api/agencies', {
                    ...agencyDraft,
                    trade_name: a?.trade_name,
                    creci_number: a?.creci_number,
                    creci_state: a?.creci_state,
                    creci_type: a?.creci_number ? 'PJ' : null,
                    owner_name: a?.owner_name,
                    website: a?.website,
                    management_fee: a?.management_fee,
                });
                const created = json.agency as LeaseAgencyOption | undefined;
                if (!ok || !created) {
                    setAgencyErrors(errorsFrom(json, 'Não foi possível criar a imobiliária.'));
                    return;
                }
                finalAgencyId = created.id;
                setCreatedAgency({ id: created.id, name: created.name });
                setAgencyId(created.id);
                setAgencyMode('existing');
                setAgencyEditing(false);
                if (agencyLogo) {
                    // The logo read from the contract's header becomes the agency's logo (the cover of its card); a failure here is no reason to stop
                    try {
                        const blob = await fetch(agencyLogo).then(r => r.blob());
                        const body = new FormData();
                        body.append('file', new File([blob], 'logo-contrato.png', { type: 'image/png' }));
                        await fetch(`/api/agencies/${created.id}/logo`, { method: 'POST', body });
                    } catch {
                        // the logo can be sent later in Imobiliárias
                    }
                }
            }

            // 2b. Corretores: the agency's representative (or the autonomous broker), with their own CRECI.
            const agentsNext = [...agentDrafts];
            let agentFailed = false;
            for (let i = 0; i < agentsNext.length; i++) {
                const g = agentsNext[i];
                if (g.agentId || !g.create) continue;
                const errors: FieldErrors = {};
                if (!g.full_name.trim()) errors.full_name = 'Nome é obrigatório.';
                if (!g.creci_number.trim()) errors.creci_number = 'Informe o CRECI do corretor (o contrato não traz).';
                if (!g.creci_state.trim()) errors.creci_state = 'UF do CRECI.';
                if (Object.keys(errors).length > 0) {
                    agentsNext[i] = { ...g, errors };
                    agentFailed = true;
                    continue;
                }
                const { ok, json } = await postJson('/api/agents', {
                    full_name: g.full_name,
                    cpf: g.cpf,
                    creci_number: g.creci_number,
                    creci_state: g.creci_state,
                    agent_type: finalAgencyId ? 'IMOBILIARIA' : 'AUTONOMO',
                    agency_id: finalAgencyId || '',
                    main_phone: g.main_phone,
                    main_phone_whatsapp: !!g.main_phone.trim(),
                    additional_phone: '',
                    email: g.email,
                    website: '',
                    notes: 'Cadastrado a partir do contrato de locação.',
                    status: 'ACTIVE',
                });
                const created = json.agent as { id: string } | undefined;
                if (!ok || !created) {
                    agentsNext[i] = { ...g, errors: errorsFrom(json, 'Não foi possível cadastrar o corretor.') };
                    agentFailed = true;
                    continue;
                }
                agentsNext[i] = { ...g, agentId: created.id, create: false, errors: {} };
            }
            setAgentDrafts(agentsNext);
            if (agentFailed) return;
            const finalAgentId = agentsNext.find(g => g.agentId)?.agentId ?? '';

            // 3. Tenants (a tenant record needs a property).
            const drafts = [...tenantDrafts];
            let failed = false;
            for (let i = 0; i < drafts.length; i++) {
                const t = drafts[i];
                if (t.tenantId || !t.create || !finalPropertyId) continue;
                const { ok, json } = await postJson('/api/tenants', {
                    full_name: t.full_name,
                    cpf: t.cpf,
                    main_phone: t.main_phone,
                    email: t.email,
                    rg: t.rg,
                    date_of_birth: t.date_of_birth,
                    property_id: finalPropertyId,
                    use_property_address: true,
                    management_type: finalAgencyId ? 'AGENCY' : 'SELF_MANAGED',
                    agency_id: finalAgencyId || null,
                    agent_id: finalAgentId || null,
                    move_in_date: data.lease.start_date,
                    status: 'ACTIVE',
                });
                const created = json.tenant as { id: string } | undefined;
                if (!ok || !created) {
                    drafts[i] = { ...t, errors: errorsFrom(json, 'Não foi possível cadastrar o inquilino.') };
                    failed = true;
                    continue;
                }
                drafts[i] = { ...t, tenantId: created.id, create: false, errors: {} };
            }
            setTenantDrafts(drafts);
            if (failed) return;

            const linked = drafts.filter(t => t.tenantId);
            const primary = linked.find(t => t.role === 'PRIMARY') ?? linked[0];
            const problems = await onComplete({
                file,
                storagePath,
                data,
                propertyId: finalPropertyId,
                agencyId: finalAgencyId,
                agentId: finalAgentId,
                primaryTenantId: primary?.tenantId ?? '',
                additionalTenants: linked
                    .filter(t => t !== primary)
                    .map(t => ({ tenant_id: t.tenantId, role: t.role === 'OCCUPANT' ? 'OCCUPANT' : 'CO_TENANT' })),
            });
            if (problems && problems.length > 0) setCompleteErrors(problems);
        } catch {
            setPropertyErrors(prev => ({ ...prev, _form: 'Erro de conexão. Tente novamente.' }));
        } finally {
            setApplying(false);
        }
    };

    // ── Render helpers ────────────────────────────────────────────

    const fieldError = (errors: FieldErrors, field: string) =>
        errors[field] ? <p className="mt-1 text-xs text-red-500">{errors[field]}</p> : null;

    /** Errors whose field has no input in this modal still have to be seen. */
    const otherErrors = (errors: FieldErrors, shown: string[]) => {
        const rest = Object.entries(errors).filter(([k]) => !shown.includes(k));
        if (rest.length === 0) return null;
        return (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>{rest.map(([k, msg]) => <p key={k}>{msg}</p>)}</div>
            </div>
        );
    };

    const modeButtons = (mode: EntityMode, setMode: (m: EntityMode) => void, options: { mode: EntityMode; label: string; show?: boolean }[]) => (
        <div className="flex flex-wrap gap-2">
            {options.filter(o => o.show !== false).map(o => (
                <button
                    key={o.mode}
                    type="button"
                    disabled={applying}
                    onClick={() => setMode(o.mode)}
                    className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        mode === o.mode ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:bg-accent'
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );

    const matchedBanner = (text: React.ReactNode, onChange: () => void) => (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
            <span className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> <span>{text}</span>
            </span>
            <button type="button" className="shrink-0 text-xs text-muted-foreground hover:underline" onClick={onChange} disabled={applying}>
                Alterar
            </button>
        </div>
    );

    const tenantsToCreate = tenantDrafts.filter(t => !t.tenantId && t.create);
    const willHaveProperty = propertyMode === 'create' || (propertyMode === 'existing' && !!propertyId);
    const agentsToCreate = agentDrafts.filter(g => !g.agentId && g.create);
    const createLabels = [
        propertyMode === 'create' ? 'imóvel' : null,
        agencyMode === 'create' ? 'imobiliária' : null,
        agentsToCreate.length > 0 ? (agentsToCreate.length === 1 ? 'corretor' : `${agentsToCreate.length} corretores`) : null,
        tenantsToCreate.length > 0 && willHaveProperty ? (tenantsToCreate.length === 1 ? 'inquilino' : `${tenantsToCreate.length} inquilinos`) : null,
    ].filter(Boolean);

    // ── Render ────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !busy && onClose()} />

            <div className={cn(
                'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl',
                step === 'upload' ? 'max-w-lg' : 'max-w-2xl'
            )}>
                {!busy && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute right-4 top-4 z-10 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Fechar modal"
                    >
                        <X className="h-5 w-5" />
                    </button>
                )}

                {/* Header */}
                <div className="flex items-start gap-3.5 p-6 pb-4 sm:p-7 sm:pb-4">
                    <div className="shrink-0 rounded-xl bg-amber-100 p-2.5 text-amber-600 dark:bg-amber-900/40">
                        <Sparkles className="h-6 w-6" />
                    </div>
                    <div className="space-y-1 pr-6">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                            {step === 'upload' ? 'Novo Contrato' : 'Confira o que a IA encontrou'}
                        </h2>
                        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                            {step === 'upload'
                                ? <>Envie o <strong className="text-foreground">contrato de locação</strong> para a IA preencher o contrato, cadastrar os inquilinos e vincular imóvel e imobiliária, ou digite manualmente.</>
                                : <>Nada é criado sem a sua confirmação. Depois você revisa o contrato completo antes de salvar.</>}
                        </p>
                    </div>
                </div>

                {step === 'upload' && (
                    <div className="px-6 pb-6 sm:px-7 sm:pb-7">
                        {extractError && (
                            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 sm:text-sm">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <div className="flex-1 leading-snug">{extractError}</div>
                            </div>
                        )}

                        {isExtracting ? (
                            <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-8 text-center dark:bg-amber-950/20">
                                <div className="relative">
                                    <div className="h-14 w-14 animate-spin rounded-full border-4 border-amber-500/20 border-t-amber-600" />
                                    <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-amber-600" />
                                </div>
                                <div className="max-w-sm space-y-1">
                                    <p className="text-sm font-semibold text-foreground">Analisando contrato com IA...</p>
                                    <p className="text-xs text-muted-foreground">
                                        Lendo partes, imóvel, valores, prazos, reajuste e encargos. Contratos longos podem levar até um minuto.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDragging(false);
                                    const dropped = e.dataTransfer.files?.[0];
                                    if (dropped) handleUpload(dropped);
                                }}
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    'group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 sm:p-8',
                                    isDragging ? 'scale-[1.01] border-amber-500 bg-amber-500/10' : 'border-border hover:border-amber-500/60 hover:bg-muted/30'
                                )}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,image/jpeg,image/png,image/webp"
                                    onChange={(e) => {
                                        const picked = e.target.files?.[0];
                                        if (picked) handleUpload(picked);
                                        e.target.value = '';
                                    }}
                                    className="hidden"
                                />
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200/60 bg-amber-50 text-amber-600 transition-transform group-hover:scale-105 dark:border-amber-800/40 dark:bg-amber-950/40">
                                    <Upload className="h-6 w-6" />
                                </div>
                                <p className="mb-1 text-sm font-semibold text-foreground">
                                    Arraste o contrato aqui ou <span className="text-amber-600 underline underline-offset-2">clique para selecionar</span>
                                </p>
                                <p className="text-xs text-muted-foreground">PDF, PNG, JPG ou WebP (máx. 10MB)</p>
                            </div>
                        )}

                        {onManual && <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-border/80 pt-5 sm:flex-row">
                            <span className="text-center text-xs text-muted-foreground sm:text-left">Prefere não enviar um documento agora?</span>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onManual}
                                disabled={isExtracting}
                                className="w-full gap-2 text-xs font-medium hover:border-amber-500/60 hover:text-amber-600 sm:w-auto"
                            >
                                <Edit3 className="h-3.5 w-3.5" />
                                Digitar manualmente
                            </Button>
                        </div>}
                    </div>
                )}

                {step === 'review' && data && (
                    <>
                        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-2 sm:px-7">
                            {/* What was read */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
                                <div><p className="text-muted-foreground">Aluguel</p><p className="font-semibold text-foreground">{formatMoney(data.lease.monthly_rent)}</p></div>
                                <div><p className="text-muted-foreground">Início</p><p className="font-semibold text-foreground">{formatDate(data.lease.start_date)}</p></div>
                                <div><p className="text-muted-foreground">Término</p><p className="font-semibold text-foreground">{formatDate(data.lease.end_date)}</p></div>
                                <div><p className="text-muted-foreground">Vencimento</p><p className="font-semibold text-foreground">{data.lease.rent_due_day ? `Dia ${data.lease.rent_due_day}` : '—'}</p></div>
                            </div>

                            {/* ── Property ── */}
                            <section className="space-y-3 rounded-xl border border-border p-4">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Home className="h-4 w-4" /> Imóvel</h3>

                                {fixedProperty ? (
                                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" /> <span>Contrato de: <strong>{fixedProperty.label}</strong></span>
                                    </div>
                                ) : propertySettled ? (
                                    matchedBanner(
                                        createdProperty?.id === propertyId
                                            ? <>Imóvel criado: <strong>{createdProperty?.name}</strong></>
                                            : <>Encontrado no seu cadastro: <strong>{propertyMatch?.name}</strong></>,
                                        () => setPropertyEditing(true)
                                    )
                                ) : (
                                    <>
                                        {propertyMatch || createdProperty ? null : data.property ? (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                                                <p className="font-medium text-foreground">O imóvel deste contrato não está no seu cadastro.</p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">{[data.property.name, addressLine(data.property)].filter(Boolean).join(' · ')}</p>
                                                <p className="mt-2 text-sm text-foreground">Deseja criar este imóvel com os dados do contrato?</p>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">A IA não identificou o imóvel no contrato.</p>
                                        )}
                                        {modeButtons(propertyMode, setPropertyMode, [
                                            { mode: 'create', label: 'Sim, criar imóvel', show: !!propertyDraft && !createdProperty },
                                            { mode: 'existing', label: 'Usar imóvel já cadastrado', show: propertyOptions.length > 0 },
                                            { mode: 'skip', label: propertyDraft ? 'Não criar agora' : 'Escolher depois' },
                                        ])}
                                    </>
                                )}

                                {!fixedProperty && propertyMode === 'existing' && !propertySettled && (
                                    <select className={selectClass} value={propertyId} onChange={e => setPropertyId(e.target.value)} disabled={applying}>
                                        <option value="">Selecione um imóvel...</option>
                                        {propertyOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                )}

                                {propertyMode === 'create' && propertyDraft && (
                                    <div className="grid gap-3 sm:grid-cols-6">
                                        <div className="sm:col-span-6">
                                            <Label className="text-xs">Nome do imóvel *</Label>
                                            <Input className="h-9" value={propertyDraft.name} onChange={e => setPropertyDraft({ ...propertyDraft, name: e.target.value })} />
                                            {fieldError(propertyErrors, 'name')}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs">CEP</Label>
                                            <Input className="h-9" value={propertyDraft.postal_code} onChange={e => setPropertyDraft({ ...propertyDraft, postal_code: maskCEP(e.target.value) })} placeholder="00000-000" />
                                            {fieldError(propertyErrors, 'postal_code')}
                                        </div>
                                        <div className="sm:col-span-3">
                                            <Label className="text-xs">Logradouro</Label>
                                            <Input className="h-9" value={propertyDraft.street} onChange={e => setPropertyDraft({ ...propertyDraft, street: e.target.value })} />
                                        </div>
                                        <div className="sm:col-span-1">
                                            <Label className="text-xs">Número</Label>
                                            <Input className="h-9" value={propertyDraft.street_number} onChange={e => setPropertyDraft({ ...propertyDraft, street_number: e.target.value })} />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs">Complemento</Label>
                                            <Input className="h-9" value={propertyDraft.address_complement} onChange={e => setPropertyDraft({ ...propertyDraft, address_complement: e.target.value })} />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs">Bairro</Label>
                                            <Input className="h-9" value={propertyDraft.neighborhood} onChange={e => setPropertyDraft({ ...propertyDraft, neighborhood: e.target.value })} />
                                        </div>
                                        <div className="sm:col-span-1">
                                            <Label className="text-xs">Cidade</Label>
                                            <Input className="h-9" value={propertyDraft.city} onChange={e => setPropertyDraft({ ...propertyDraft, city: e.target.value })} />
                                        </div>
                                        <div className="sm:col-span-1">
                                            <Label className="text-xs">UF</Label>
                                            <Input className="h-9" maxLength={2} value={propertyDraft.state} onChange={e => setPropertyDraft({ ...propertyDraft, state: e.target.value.toUpperCase() })} />
                                        </div>
                                        <p className="text-xs text-muted-foreground sm:col-span-6">Os demais dados do imóvel podem ser completados depois em Imóveis.</p>
                                    </div>
                                )}
                                {otherErrors(propertyErrors, propertyMode === 'create' ? ['name', 'postal_code'] : [])}
                            </section>

                            {/* ── Agency ── */}
                            <section className="space-y-3 rounded-xl border border-border p-4">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Building2 className="h-4 w-4" /> Imobiliária</h3>

                                {fixedAgency ? (
                                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" /> <span>Contrato da imobiliária: <strong>{fixedAgency.label}</strong></span>
                                    </div>
                                ) : agencySettled ? (
                                    matchedBanner(
                                        createdAgency?.id === agencyId
                                            ? <>Imobiliária criada: <strong>{createdAgency?.name}</strong></>
                                            : <>Encontrada no seu cadastro: <strong>{agencyMatch?.name}</strong></>,
                                        () => setAgencyEditing(true)
                                    )
                                ) : (
                                    <>
                                        {!data.agency && (
                                            <p className="text-sm text-muted-foreground">
                                                O contrato não cita imobiliária{agencyMode === 'skip' && <>: será preenchido como <strong className="text-foreground">gestão própria</strong></>}.
                                            </p>
                                        )}
                                        {data.agency && !agencyMatch && !createdAgency && (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                                                <p className="font-medium text-foreground">A imobiliária deste contrato não está no seu cadastro.</p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {[data.agency.name, data.agency.cnpj ? `CNPJ ${formatCNPJ(data.agency.cnpj)}` : null].filter(Boolean).join(' · ')}
                                                </p>
                                                <p className="mt-2 text-sm text-foreground">Deseja criar esta imobiliária com os dados do contrato?</p>
                                            </div>
                                        )}
                                        {modeButtons(agencyMode, setAgencyMode, [
                                            { mode: 'create', label: 'Sim, criar imobiliária', show: !!agencyDraft && !createdAgency },
                                            { mode: 'existing', label: 'Usar imobiliária já cadastrada', show: agencyOptions.length > 0 },
                                            { mode: 'skip', label: agencyDraft ? 'Não criar agora' : 'Gestão própria' },
                                        ])}
                                    </>
                                )}

                                {!fixedAgency && agencyMode === 'existing' && !agencySettled && (
                                    <select className={selectClass} value={agencyId} onChange={e => setAgencyId(e.target.value)} disabled={applying}>
                                        <option value="">Selecione uma imobiliária...</option>
                                        {agencyOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                )}

                                {agencyMode === 'create' && agencyDraft && (
                                    <div className="grid gap-3 sm:grid-cols-6">
                                        <div className="sm:col-span-4">
                                            <Label className="text-xs">Razão social *</Label>
                                            <Input className="h-9" value={agencyDraft.name} onChange={e => setAgencyDraft({ ...agencyDraft, name: e.target.value })} />
                                            {fieldError(agencyErrors, 'name')}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs">CNPJ</Label>
                                            <Input className="h-9" value={agencyDraft.cnpj} onChange={e => setAgencyDraft({ ...agencyDraft, cnpj: maskCNPJ(e.target.value) })} />
                                            {fieldError(agencyErrors, 'cnpj')}
                                        </div>
                                        <div className="sm:col-span-3">
                                            <Label className="text-xs">Telefone *</Label>
                                            <Input className="h-9" value={agencyDraft.main_phone} onChange={e => setAgencyDraft({ ...agencyDraft, main_phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" />
                                            {fieldError(agencyErrors, 'main_phone')}
                                        </div>
                                        <div className="sm:col-span-3">
                                            <Label className="text-xs">E-mail</Label>
                                            <Input className="h-9" value={agencyDraft.email} onChange={e => setAgencyDraft({ ...agencyDraft, email: e.target.value })} />
                                            {fieldError(agencyErrors, 'email')}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs">CEP *</Label>
                                            <Input className="h-9" value={agencyDraft.postal_code} onChange={e => setAgencyDraft({ ...agencyDraft, postal_code: maskCEP(e.target.value) })} placeholder="00000-000" />
                                            {fieldError(agencyErrors, 'postal_code')}
                                        </div>
                                        <div className="sm:col-span-3">
                                            <Label className="text-xs">Logradouro *</Label>
                                            <Input className="h-9" value={agencyDraft.street} onChange={e => setAgencyDraft({ ...agencyDraft, street: e.target.value })} />
                                            {fieldError(agencyErrors, 'street')}
                                        </div>
                                        <div className="sm:col-span-1">
                                            <Label className="text-xs">Número *</Label>
                                            <Input className="h-9" value={agencyDraft.street_number} onChange={e => setAgencyDraft({ ...agencyDraft, street_number: e.target.value })} />
                                            {fieldError(agencyErrors, 'street_number')}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs">Complemento</Label>
                                            <Input className="h-9" value={agencyDraft.address_complement} onChange={e => setAgencyDraft({ ...agencyDraft, address_complement: e.target.value })} />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs">Bairro *</Label>
                                            <Input className="h-9" value={agencyDraft.neighborhood} onChange={e => setAgencyDraft({ ...agencyDraft, neighborhood: e.target.value })} />
                                            {fieldError(agencyErrors, 'neighborhood')}
                                        </div>
                                        <div className="sm:col-span-1">
                                            <Label className="text-xs">Cidade *</Label>
                                            <Input className="h-9" value={agencyDraft.city} onChange={e => setAgencyDraft({ ...agencyDraft, city: e.target.value })} />
                                            {fieldError(agencyErrors, 'city')}
                                        </div>
                                        <div className="sm:col-span-1">
                                            <Label className="text-xs">UF *</Label>
                                            <Input className="h-9" maxLength={2} value={agencyDraft.state} onChange={e => setAgencyDraft({ ...agencyDraft, state: e.target.value.toUpperCase() })} />
                                            {fieldError(agencyErrors, 'state')}
                                        </div>
                                        <p className="text-xs text-muted-foreground sm:col-span-6">CRECI, responsável e taxa de administração lidos do contrato também serão salvos. Complete o restante em Imobiliárias.</p>
                                        {agencyLogo && (
                                            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-2 sm:col-span-6">
                                                <Image src={agencyLogo} alt="Logo lido do contrato" width={160} height={48} className="h-12 w-auto max-w-[160px] rounded bg-white object-contain p-1" unoptimized />
                                                <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                                                    <p className="font-medium text-foreground">Logo lido do cabeçalho do contrato</p>
                                                    <p>Vira o logo da imobiliária, a capa do card em Imobiliárias. Troque depois se não for ele.</p>
                                                </div>
                                                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setAgencyLogo(null)} disabled={applying}>Não usar</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {otherErrors(agencyErrors, agencyMode === 'create' ? ['name', 'cnpj', 'main_phone', 'email', 'postal_code', 'street', 'street_number', 'neighborhood', 'city', 'state'] : [])}
                            </section>

                            {/* ── Corretor ── */}
                            <section className="space-y-3 rounded-xl border border-border p-4">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Users className="h-4 w-4" /> Corretor</h3>

                                {agentDrafts.length === 0 && (
                                    <p className="text-sm text-muted-foreground">O contrato não nomeia um corretor (o representante da imobiliária ou um corretor autônomo com CRECI).</p>
                                )}

                                {agentDrafts.map((g, idx) => (
                                    <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-medium text-foreground">
                                                {g.full_name}
                                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                    {g.role === 'CORRETOR' ? 'Corretor autônomo' : 'Representante da imobiliária'}
                                                </span>
                                            </p>
                                            {g.agentId ? (
                                                <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> {g.matchedBy ? (g.matchedBy === 'creci' ? 'Já cadastrado (CRECI)' : g.matchedBy === 'cpf' ? 'Já cadastrado (CPF)' : 'Já cadastrado') : 'Cadastrado'}
                                                </span>
                                            ) : (
                                                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-foreground">
                                                    <input type="checkbox" checked={g.create} disabled={applying} onChange={e => setAgentDrafts(prev => prev.map((x, i) => (i === idx ? { ...x, create: e.target.checked } : x)))} />
                                                    Cadastrar em Corretores
                                                </label>
                                            )}
                                        </div>

                                        {!g.agentId && g.create && (
                                            <div className="grid gap-3 sm:grid-cols-6">
                                                <div className="sm:col-span-3">
                                                    <Label className="text-xs">Nome completo *</Label>
                                                    <Input className="h-9" value={g.full_name} onChange={e => setAgentDrafts(prev => prev.map((x, i) => (i === idx ? { ...x, full_name: e.target.value } : x)))} />
                                                    {fieldError(g.errors, 'full_name')}
                                                </div>
                                                <div className="sm:col-span-3">
                                                    <Label className="text-xs">CPF</Label>
                                                    <Input className="h-9" value={g.cpf} onChange={e => setAgentDrafts(prev => prev.map((x, i) => (i === idx ? { ...x, cpf: maskCPF(e.target.value) } : x)))} placeholder="000.000.000-00" />
                                                    {fieldError(g.errors, 'cpf')}
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <Label className="text-xs">Nº CRECI *</Label>
                                                    <Input className="h-9" value={g.creci_number} onChange={e => setAgentDrafts(prev => prev.map((x, i) => (i === idx ? { ...x, creci_number: e.target.value } : x)))} placeholder="Ex: 12345" />
                                                    {fieldError(g.errors, 'creci_number')}
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <Label className="text-xs">UF *</Label>
                                                    <Input className="h-9" maxLength={2} value={g.creci_state} onChange={e => setAgentDrafts(prev => prev.map((x, i) => (i === idx ? { ...x, creci_state: e.target.value.toUpperCase() } : x)))} />
                                                    {fieldError(g.errors, 'creci_state')}
                                                </div>
                                                <div className="sm:col-span-3">
                                                    <Label className="text-xs">Telefone (WhatsApp)</Label>
                                                    <Input className="h-9" value={g.main_phone} onChange={e => setAgentDrafts(prev => prev.map((x, i) => (i === idx ? { ...x, main_phone: maskPhone(e.target.value) } : x)))} placeholder="(00) 00000-0000" />
                                                    {fieldError(g.errors, 'main_phone')}
                                                </div>
                                                <div className="sm:col-span-6">
                                                    <Label className="text-xs">E-mail</Label>
                                                    <Input className="h-9" value={g.email} onChange={e => setAgentDrafts(prev => prev.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x)))} />
                                                    {fieldError(g.errors, 'email')}
                                                </div>
                                                {!g.creci_number && <p className="text-xs text-muted-foreground sm:col-span-6">O contrato não traz o CRECI desta pessoa (só o da imobiliária, que é outro): informe-o para cadastrar, ou desmarque.</p>}
                                            </div>
                                        )}
                                        {otherErrors(g.errors, ['full_name', 'cpf', 'creci_number', 'creci_state', 'main_phone', 'email'])}
                                    </div>
                                ))}
                            </section>

                            {/* ── Tenants ── */}
                            <section className="space-y-3 rounded-xl border border-border p-4">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Users className="h-4 w-4" /> Inquilinos</h3>

                                {tenantDrafts.length === 0 && (
                                    <p className="text-sm text-muted-foreground">A IA não identificou os locatários no contrato. Selecione o inquilino no formulário.</p>
                                )}
                                {tenantsToCreate.length > 0 && !willHaveProperty && (
                                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>Todo inquilino é vinculado a um imóvel. Crie ou selecione o imóvel acima para cadastrar os inquilinos do contrato.</span>
                                    </div>
                                )}

                                {tenantDrafts.map((t, idx) => (
                                    <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-medium text-foreground">
                                                {t.full_name}
                                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                    {t.role === 'PRIMARY' ? 'Inquilino principal' : t.role === 'OCCUPANT' ? 'Ocupante' : 'Co-inquilino'}
                                                </span>
                                            </p>
                                            {t.tenantId ? (
                                                <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> {t.matchedBy ? (t.matchedBy === 'cpf' ? 'Já cadastrado (CPF)' : 'Já cadastrado') : 'Cadastrado'}
                                                </span>
                                            ) : (
                                                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-foreground">
                                                    <input type="checkbox" checked={t.create} disabled={applying} onChange={e => updateTenant(idx, { create: e.target.checked })} />
                                                    Cadastrar em Inquilinos
                                                </label>
                                            )}
                                        </div>

                                        {!t.tenantId && t.create && (
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div>
                                                    <Label className="text-xs">Nome completo *</Label>
                                                    <Input className="h-9" value={t.full_name} onChange={e => updateTenant(idx, { full_name: e.target.value })} />
                                                    {fieldError(t.errors, 'full_name')}
                                                </div>
                                                <div>
                                                    <Label className="text-xs">CPF *</Label>
                                                    <Input className="h-9" value={t.cpf} onChange={e => updateTenant(idx, { cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
                                                    {fieldError(t.errors, 'cpf')}
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Telefone</Label>
                                                    <Input className="h-9" value={t.main_phone} onChange={e => updateTenant(idx, { main_phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" />
                                                    {fieldError(t.errors, 'main_phone')}
                                                </div>
                                                <div>
                                                    <Label className="text-xs">E-mail</Label>
                                                    <Input className="h-9" value={t.email} onChange={e => updateTenant(idx, { email: e.target.value })} />
                                                    {fieldError(t.errors, 'email')}
                                                </div>
                                            </div>
                                        )}
                                        {otherErrors(t.errors, ['full_name', 'cpf', 'main_phone', 'email'])}
                                    </div>
                                ))}
                            </section>
                        </div>

                        {completeErrors.length > 0 && (
                            <div className="mx-6 mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 sm:mx-7">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <div>
                                    <p className="font-semibold">Os cadastros foram feitos, mas o contrato não pôde ser criado:</p>
                                    {completeErrors.map(msg => <p key={msg}>{msg}</p>)}
                                    <p className="mt-1">Complete-o em Contratos → Novo Contrato.</p>
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span className="break-words">{createLabels.length > 0 || createsLease ? `Será criado: ${[...createLabels, createsLease ? 'contrato' : null].filter(Boolean).join(', ')}.` : 'Nenhum cadastro novo será criado.'}</span>
                            </p>
                            <div className="flex shrink-0 justify-end gap-2">
                                <Button type="button" variant="outline" onClick={onClose} disabled={applying}>Cancelar</Button>
                                <Button type="button" onClick={handleApply} disabled={applying}>
                                    {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    {createsLease ? 'Criar contrato' : createLabels.length > 0 ? 'Criar e preencher contrato' : 'Preencher contrato'}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
