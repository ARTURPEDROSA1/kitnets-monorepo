"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
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
import { Money, Sensitive } from '@/components/privacy';
import type { ExtractedLease, ExtractedTenantRole, MatchResult } from '@/lib/lease-extract';
import type { AdditionalTenantFormItem, LeaseAgencyOption, LeasePropertyOption } from '@/types/lease';
import { ROUTE_BODY_SAFE_SIZE, stageLeaseFile } from '@/lib/lease-upload-client';
import { guessUnitFromContract, todayBRT } from '@/lib/lease-dashboard';

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
    /** the unit of a multi-unit property the contract is for; null = the whole property, a property without units, or not asked */
    unitId: string | null;
    /** asked with `settleLease`: still in force or over; null when not asked */
    status: 'ACTIVE' | 'EXPIRED' | null;
    /** a closed contract registered by the batch: the day it ended and its closing term (termo de encerramento), if any */
    closing: { date: string; file: File | null; storagePath: string | null } | null;
}

/** A file named like a closing term: "termo de encerramento", "fechamento", "rescisão", "distrato", "entrega das chaves". */
const TERM_NAME = /encerr|fechament|rescis|distrat|entrega|termo/i;

/** A closing term is read once per file, whichever contract's review asks: the batch offers it to each of them. */
const termReads = new WeakMap<File, Promise<{ data: ExtractedLease; storagePath: string | null } | { error: string }>>();
function readTermOnce(file: File) {
    let read = termReads.get(file);
    if (!read) {
        read = readWithAi(file);
        termReads.set(file, read);
        // a failed reading may be tried again
        void read.then(r => { if ('error' in r) termReads.delete(file); });
    }
    return read;
}

const sameName = (a: string | null | undefined, b: string | null | undefined) =>
    !!a && !!b && a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === b.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Reads a file with the lease AI (POST /api/leases/extract): straight to storage, the route body for a small file when that fails. */
async function readWithAi(file: File): Promise<{ data: ExtractedLease; storagePath: string | null } | { error: string }> {
    try {
        const staged = await stageLeaseFile(file);
        let res: Response;
        let storagePath: string | null = null;
        if ('path' in staged) {
            storagePath = staged.path;
            res = await fetch('/api/leases/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storage_path: staged.path }) });
        } else if (file.size <= ROUTE_BODY_SAFE_SIZE) {
            const formData = new FormData();
            formData.append('file', file);
            res = await fetch('/api/leases/extract', { method: 'POST', body: formData });
        } else {
            return { error: staged.error };
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.data) return { error: typeof json.error === 'string' ? json.error : 'Não foi possível ler o arquivo com a IA.' };
        return { data: json.data as ExtractedLease, storagePath };
    } catch {
        return { error: 'Erro de conexão ao ler o arquivo. Tente novamente.' };
    }
}

/** Value of the unit select for a contract of the whole multi-unit property. */
const WHOLE_PROPERTY = '__whole__';

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
    /**
     * Also settle here which unit of a multi-unit property the contract is for and whether it is still in
     * force (a Vigente | Encerrado toggle), so nothing is asked after this screen. `defaultStatus` is where
     * the toggle starts; a term already over starts it at Encerrado either way. Left out when the unit is
     * already known (an import from a unit card). `askStatus: false` asks only the unit (the form that
     * follows has the status). With `createsLease`, an Encerrado contract also needs the day it ended.
     */
    settleLease?: { defaultStatus: 'ACTIVE' | 'EXPIRED'; askStatus?: boolean };
    /** The batch's other files: the closing term (termo de encerramento) of this contract may be one of them */
    otherFiles?: File[];
    /** The batch: "Pular arquivo" moves on to the next file; closing (X, Esc) stops the whole import */
    onSkip?: () => void;
    /** The batch: which file this is ("Arquivo 1 de 2 · contrato.pdf") */
    progress?: string;
}

type FieldErrors = Record<string, string>;
/** create = register it from the contract; existing = use the picked record; skip = leave the form field empty. */
type EntityMode = 'create' | 'existing' | 'skip';

interface PropertyDraft {
    /** a lease of a parking space creates a garage; everything else a single-family property (units are added on Imóveis) */
    property_type: 'single' | 'garage';
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

export default function LeaseImportModal({ properties, agencies, onClose, onManual, onComplete, fixedProperty, initialFile, createsLease, fixedAgency, settleLease, otherFiles = [], onSkip, progress }: Props) {
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
    /** the unit picked per property (a unit id or WHOLE_PROPERTY); without a pick, the one the contract names */
    const [unitPicks, setUnitPicks] = useState<Record<string, string>>({});
    const [unitError, setUnitError] = useState<string | null>(null);
    /** Vigente | Encerrado as toggled; untouched, it follows `settleLease.defaultStatus` and the term */
    const [statusPick, setStatusPick] = useState<'ACTIVE' | 'EXPIRED' | null>(null);
    /** the day a closed contract ended (the return of the property), and where the date came from */
    const [closingDate, setClosingDate] = useState('');
    const [closingSource, setClosingSource] = useState<'term' | 'document' | 'end' | null>(null);
    const [closingError, setClosingError] = useState<string | null>(null);
    /** the closing term picked (one of the batch's files, or one sent here) and its reading */
    const [termFile, setTermFile] = useState<File | null>(null);
    const [termStoragePath, setTermStoragePath] = useState<string | null>(null);
    const [termReading, setTermReading] = useState(false);
    const [termError, setTermError] = useState<string | null>(null);
    /** a closing term sent in the batch is being read to see whether it is this contract's */
    const [termChecking, setTermChecking] = useState(false);
    const termInputRef = useRef<HTMLInputElement>(null);

    const busy = isExtracting || applying;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const propertyOptions = useMemo(() => (createdProperty ? [...properties, createdProperty] : properties), [createdProperty, properties]);
    const agencyOptions = createdAgency ? [...agencies, createdAgency] : agencies;
    const propertySettled = propertyMode === 'existing' && !propertyEditing && !!propertyId &&
        (propertyMatch?.id === propertyId || createdProperty?.id === propertyId);
    const agencySettled = !!fixedAgency || (agencyMode === 'existing' && !agencyEditing && !!agencyId &&
        (agencyMatch?.id === agencyId || createdAgency?.id === agencyId));

    // The unit and the status, when this screen settles them (settleLease)
    const chosenPropertyId = fixedProperty?.id ?? (propertyMode === 'existing' ? propertyId : '');
    const units = useMemo(
        () => (settleLease && chosenPropertyId ? propertyOptions.find(p => p.id === chosenPropertyId)?.units ?? [] : []),
        [settleLease, chosenPropertyId, propertyOptions]
    );
    const unitGuess = useMemo(() => (units.length > 0 ? guessUnitFromContract(units, data?.property) : null), [units, data]);
    const unitChoice = unitPicks[chosenPropertyId] ?? unitGuess?.id ?? '';
    const termOver = !!data?.lease.end_date && data.lease.end_date < todayBRT();
    const leaseStatus = statusPick ?? (termOver ? 'EXPIRED' : settleLease?.defaultStatus ?? 'ACTIVE');
    const askStatus = !!settleLease && settleLease.askStatus !== false;
    /** only where this screen creates the lease can it record the day it ended */
    const askClosing = askStatus && !!createsLease && leaseStatus === 'EXPIRED';
    /** the lease created here is closed (Encerrado, or past its term where nobody asks): its new tenants already moved out */
    const closesLease = !!createsLease && (askStatus ? leaseStatus === 'EXPIRED' : termOver);

    /** The closing term: kept to attach to the lease, and read by the AI for the day the property came back. */
    const pickTerm = async (file: File | null) => {
        setTermFile(file);
        setTermStoragePath(null);
        setTermError(null);
        if (!file) return;
        setTermReading(true);
        const read = await readTermOnce(file);
        setTermReading(false);
        if ('error' in read) { setTermError(read.error); return; }
        setTermStoragePath(read.storagePath);
        if (read.data.lease.termination_date) {
            setClosingDate(read.data.lease.termination_date);
            setClosingSource('term');
            setClosingError(null);
        } else {
            setTermError('A IA não achou a data de devolução neste arquivo: informe a data de encerramento.');
        }
    };

    /**
     * A closing term among the batch's files: read once, and when it is this contract's (same start, or
     * the same tenant) the contract goes in as closed, on the day the term says, with the term attached.
     */
    const matchTerm = async (file: File, contract: ExtractedLease) => {
        setTermChecking(true);
        const read = await readTermOnce(file);
        setTermChecking(false);
        if ('error' in read) return;
        const term = read.data;
        const same = (!!term.lease.start_date && term.lease.start_date === contract.lease.start_date)
            || sameName(term.tenants[0]?.full_name, contract.tenants[0]?.full_name);
        if (!same) return;
        setStatusPick(prev => prev ?? 'EXPIRED');
        setTermFile(file);
        setTermStoragePath(read.storagePath);
        if (term.lease.termination_date) {
            setClosingDate(term.lease.termination_date);
            setClosingSource('term');
            setClosingError(null);
        }
    };

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
                // only when the AI classed the leased property itself as one ("apartamento com vaga" stays single); the select below corrects it
                property_type: /^\s*(garage[mn]|vaga|box)\b/i.test(p.property_type ?? '') ? 'garage' : 'single',
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

            // the day a closed contract ended: what the document says, else the term when it is already over
            const read = extracted.lease.termination_date;
            const endOver = extracted.lease.end_date && extracted.lease.end_date < todayBRT() ? extracted.lease.end_date : null;
            setClosingDate(read ?? endOver ?? '');
            setClosingSource(read ? 'document' : endOver ? 'end' : null);
            // a closing term among the batch's files: when it is this contract's, the contract goes in as closed
            const termGuess = otherFiles.find(f => TERM_NAME.test(f.name));
            const canClose = !!settleLease && settleLease.askStatus !== false && !!createsLease;
            if (termGuess && canClose && !read && extracted.document_kind !== 'TERMINATION') void matchTerm(termGuess, extracted);

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
        // the unit first: nothing is created while it is missing
        if (units.length > 0 && !unitChoice) {
            setUnitError('Escolha a unidade deste contrato (ou o imóvel inteiro).');
            return;
        }
        if (askClosing) {
            if (termReading) { setClosingError('Aguarde a leitura do termo de encerramento.'); return; }
            if (!closingDate) { setClosingError('Informe a data de encerramento (devolução do imóvel).'); return; }
            if (data.lease.start_date && closingDate <= data.lease.start_date) { setClosingError('A data de encerramento deve ser posterior ao início do contrato.'); return; }
            if (closingDate > todayBRT()) { setClosingError('Data futura: deixe o contrato Vigente e registre o aviso de desocupação no painel dele (Encerrar).'); return; }
        }
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
                    // an old contract: a former tenant, out on the day it ended (the return of the property, else its term)
                    status: closesLease ? 'FORMER' : 'ACTIVE',
                    move_out_date: closesLease ? (askClosing && closingDate ? closingDate : data.lease.end_date) : null,
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
                // a property created just now has no units: the unit only counts for the one it was picked on
                unitId: finalPropertyId === chosenPropertyId && units.some(u => u.id === unitChoice) ? unitChoice : null,
                status: askStatus ? leaseStatus : null,
                closing: askClosing && closingDate ? { date: closingDate, file: termFile, storagePath: termStoragePath } : null,
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
                        {progress && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{progress}</p>}
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
                                <div><p className="text-muted-foreground">Aluguel</p><Money as="p" className="font-semibold text-foreground">{formatMoney(data.lease.monthly_rent)}</Money></div>
                                <div><p className="text-muted-foreground">Início</p><p className="font-semibold text-foreground">{formatDate(data.lease.start_date)}</p></div>
                                <div><p className="text-muted-foreground">Término</p><p className="font-semibold text-foreground">{formatDate(data.lease.end_date)}</p></div>
                                <div><p className="text-muted-foreground">Vencimento</p><p className="font-semibold text-foreground">{data.lease.rent_due_day ? `Dia ${data.lease.rent_due_day}` : '—'}</p></div>
                            </div>

                            {/* ── This file is only a closing term ── */}
                            {data.document_kind === 'TERMINATION' && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>
                                        Este arquivo é um <strong>termo de encerramento</strong>, não o contrato
                                        {data.lease.termination_date ? <> (devolução em <strong>{formatDate(data.lease.termination_date)}</strong>)</> : null}.{' '}
                                        {onSkip
                                            ? <>Pule este arquivo: na revisão do contrato, escolha-o em <strong>Termo de encerramento</strong>.</>
                                            : <>Envie o contrato e anexe este termo na revisão dele.</>}
                                    </span>
                                </div>
                            )}

                            {/* ── In force or over ── */}
                            {askStatus && (
                                <section className="space-y-3 rounded-xl border border-border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-sm font-semibold text-foreground">Situação do contrato</h3>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {leaseStatus === 'EXPIRED'
                                                ? 'Encerrado: entra no histórico, sem contar como vigente.'
                                                : termOver ? 'Vigente: o término lido já passou, segue por prazo indeterminado.' : 'Vigente: entra nos contratos em vigor.'}
                                        </p>
                                    </div>
                                    <div role="radiogroup" aria-label="Situação do contrato" className="inline-flex shrink-0 rounded-lg border border-border bg-background p-0.5">
                                        {([['ACTIVE', 'Vigente'], ['EXPIRED', 'Encerrado']] as const).map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                role="radio"
                                                aria-checked={leaseStatus === value}
                                                onClick={() => setStatusPick(value)}
                                                disabled={applying}
                                                className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                                                    leaseStatus === value ? (value === 'ACTIVE' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white') : 'text-muted-foreground hover:text-foreground')}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {termChecking && (
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Lendo o termo de encerramento enviado junto…</p>
                                )}

                                {/* a closed contract: the day it ended, confirmed by the user; the closing term, read by the AI */}
                                {askClosing && (
                                    <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
                                        <div>
                                            <Label className="text-xs">Data de encerramento (devolução do imóvel) *</Label>
                                            <DateInput
                                                value={closingDate}
                                                onChange={iso => { setClosingDate(iso); setClosingSource(null); setClosingError(null); }}
                                                className={cn(closingError && 'border-red-500')}
                                                disabled={applying}
                                            />
                                            {closingSource && !closingError && (
                                                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Sparkles className="h-3 w-3 text-amber-500" />
                                                    {closingSource === 'term' ? 'Lida do termo de encerramento — confira.' : closingSource === 'document' ? 'Lida no documento — confira.' : 'O término do contrato — confira o dia da devolução.'}
                                                </p>
                                            )}
                                            {closingError && <p className="mt-1 text-xs text-red-500">{closingError}</p>}
                                        </div>
                                        <div>
                                            <Label className="text-xs">Termo de encerramento</Label>
                                            <select
                                                className={selectClass}
                                                value={termFile ? (otherFiles.includes(termFile) ? `f${otherFiles.indexOf(termFile)}` : 'sent') : ''}
                                                onChange={e => {
                                                    const v = e.target.value;
                                                    if (v === 'new') { termInputRef.current?.click(); return; }
                                                    if (v === 'sent') return;
                                                    void pickTerm(v.startsWith('f') ? otherFiles[Number(v.slice(1))] ?? null : null);
                                                }}
                                                disabled={applying || termReading}
                                            >
                                                <option value="">Nenhum</option>
                                                {otherFiles.map((f, i) => <option key={`${f.name}-${i}`} value={`f${i}`}>{f.name}</option>)}
                                                {termFile && !otherFiles.includes(termFile) && <option value="sent">{termFile.name}</option>}
                                                <option value="new">Enviar arquivo…</option>
                                            </select>
                                            <input ref={termInputRef} type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; if (f) void pickTerm(f); }} />
                                            {termReading
                                                ? <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Lendo o termo com IA…</p>
                                                : termError ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{termError}</p>
                                                : <p className="mt-1 text-xs text-muted-foreground">{termFile ? 'Fica guardado com o contrato.' : 'Opcional: a IA lê a data de devolução e o PDF fica com o contrato.'}</p>}
                                        </div>
                                    </div>
                                )}
                                </section>
                            )}

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
                                        {/* the question goes away once an existing property is picked instead */}
                                        {propertyMatch || createdProperty || propertyMode === 'existing' ? null : data.property ? (
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

                                {/* a multi-unit property: which unit (or all of it) */}
                                {units.length > 0 && (
                                    <div>
                                        <Label className="text-xs">Unidade deste contrato *</Label>
                                        <select
                                            className={cn(selectClass, unitError && !unitChoice && 'border-red-500')}
                                            value={unitChoice}
                                            onChange={e => { setUnitPicks(prev => ({ ...prev, [chosenPropertyId]: e.target.value })); setUnitError(null); }}
                                            disabled={applying}
                                        >
                                            <option value="">Selecione a unidade...</option>
                                            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                            <option value={WHOLE_PROPERTY}>Imóvel inteiro (todas as unidades)</option>
                                        </select>
                                        {unitGuess && unitChoice === unitGuess.id && (
                                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="h-3 w-3 text-amber-500" /> Sugerida pelo que a IA leu no contrato — confira.</p>
                                        )}
                                        {unitError && !unitChoice && <p className="mt-1 text-xs text-red-500">{unitError}</p>}
                                    </div>
                                )}

                                {propertyMode === 'create' && propertyDraft && (
                                    <div className="grid gap-3 sm:grid-cols-6">
                                        <div className="sm:col-span-4">
                                            <Label className="text-xs">Nome do imóvel *</Label>
                                            <Input className="h-9" value={propertyDraft.name} onChange={e => setPropertyDraft({ ...propertyDraft, name: e.target.value })} />
                                            {fieldError(propertyErrors, 'name')}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs">Tipo</Label>
                                            <select className={selectClass} value={propertyDraft.property_type} onChange={e => setPropertyDraft({ ...propertyDraft, property_type: e.target.value === 'garage' ? 'garage' : 'single' })} disabled={applying}>
                                                <option value="single">Unifamiliar</option>
                                                <option value="garage">Garagem</option>
                                            </select>
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
                                        {data.agency && !agencyMatch && !createdAgency && agencyMode !== 'existing' && (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                                                <p className="font-medium text-foreground">A imobiliária deste contrato não está no seu cadastro.</p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {data.agency.name}{data.agency.cnpj ? <> · CNPJ <Sensitive>{formatCNPJ(data.agency.cnpj)}</Sensitive></> : null}
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
                                                    <Label className="text-xs">Nº CRECI</Label>
                                                    <Input className="h-9" value={g.creci_number} onChange={e => setAgentDrafts(prev => prev.map((x, i) => (i === idx ? { ...x, creci_number: e.target.value } : x)))} placeholder="Ex: 12345" />
                                                    {fieldError(g.errors, 'creci_number')}
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <Label className="text-xs">UF</Label>
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
                                                    {closesLease ? 'Cadastrar em Inquilinos como antigo' : 'Cadastrar em Inquilinos'}
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
                                {onSkip
                                    ? <Button type="button" variant="outline" onClick={onSkip} disabled={applying}>Pular arquivo</Button>
                                    : <Button type="button" variant="outline" onClick={onClose} disabled={applying}>Cancelar</Button>}
                                <Button type="button" onClick={handleApply} disabled={applying || termChecking || termReading}>
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
