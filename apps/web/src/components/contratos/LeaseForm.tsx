"use client";

/**
 * The lease form — "Novo Contrato de Locação" and "Editar Contrato" — in its collapsible sections:
 * property & tenant, terms, management, adjustment, charges, notes. Files are not here: they live
 * on the contract's dashboard (LeaseDocuments), which is where a saved contract lands.
 *
 * Dates are typed as DD/MM/AAAA and sent as ISO; money as "1.234,56". An AI import
 * (LeaseImportModal) prefills the form and hands over the agreement file, attached as the
 * CONTRACT document once the lease exists.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    AlertTriangle,
    ArrowLeft,
    Building2,
    Calendar,
    ChevronDown,
    ChevronUp,
    FileText,
    Home,
    Loader2,
    PenLine,
    Plus,
    Save,
    Sparkles,
    TrendingUp,
    Users,
    X,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { attachLeaseContract } from "@/lib/lease-upload-client";
import { formatDateBR as formatDateOnlyBR, nextOccurrence, toISODate } from "@/lib/dates";
import type {
    AdditionalTenantFormItem,
    ChargeFormItem,
    ChargeResponsibility,
    ChargeType,
    LeaseAgencyOption,
    LeaseAgentOption,
    LeaseFormData,
    LeaseManagementType,
    LeasePropertyOption,
    LeaseStatus,
    LeaseTenantOption,
    LeaseTenantRole,
    LeaseWithDetails,
} from "@/types/lease";

// ── Types ────────────────────────────────────────────────────────────

type FieldErrors = Record<string, string>;

export interface LeaseFormDropdowns {
    properties: LeasePropertyOption[];
    tenants: LeaseTenantOption[];
    agencies: LeaseAgencyOption[];
    agents: LeaseAgentOption[];
}

/** What the form starts from: empty, the AI's reading, or a lease being edited. */
export interface LeaseFormInitial {
    form: LeaseFormData;
    additionalTenants: AdditionalTenantFormItem[];
    charges: ChargeFormItem[];
    /** the unit's name stored with the lease, shown if the unit no longer exists in the property */
    savedUnitName?: string;
    /** which sections start open (the AI import opens what it filled) */
    openSections?: Partial<Record<SectionKey, boolean>>;
}

type SectionKey = "property_tenant" | "terms" | "management" | "adjustment" | "charges" | "notes";

interface Props {
    /** null = creating */
    editingId: string | null;
    initial: LeaseFormInitial;
    dropdowns: LeaseFormDropdowns;
    /** the form was prefilled by the AI import */
    aiImported?: boolean;
    /** the imported agreement, attached as the CONTRACT document once the lease exists */
    importedFile?: File | null;
    /** the imported agreement when it already sits in storage (direct upload) */
    importedStoragePath?: string | null;
    onSaved: (leaseId: string, warning: string | null) => void;
    onCancel: () => void;
    /** shown above the title (the "Voltar ao imóvel" link) */
    topSlot?: React.ReactNode;
}

// ── Date helpers (DD/MM/YYYY ↔ ISO) ─────────────────────────────────

export function maskDate(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseDateBR(dateStr: string): string {
    if (!dateStr) return "";
    const parts = dateStr.split("/");
    if (parts.length !== 3 || parts[2].length !== 4) return "";
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function formatDateBR(isoDate: string | null): string {
    if (!isoDate) return "";
    const parts = isoDate.split("T")[0].split("-");
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ── Currency helpers ─────────────────────────────────────────────────

export function maskCurrency(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    const num = parseInt(digits, 10) / 100;
    return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A stored amount as the form types it: 1234.5 → "1.234,50" */
export const moneyToMask = (n: number | null | undefined) => (n ? maskCurrency((n * 100).toFixed(0)) : "");

/** Separates property and unit in the value of the form's "Imóvel" select */
const UNIT_SEP = "::";

// ── Empty form and options ───────────────────────────────────────────

export const EMPTY_LEASE_FORM: LeaseFormData = {
    reference_name: "",
    property_id: "",
    unit_id: "",
    primary_tenant_id: "",
    management_type: "SELF_MANAGED",
    agency_id: "",
    agent_id: "",
    start_date: "",
    end_date: "",
    monthly_rent: "",
    rent_due_day: "",
    security_deposit: "",
    deposit_months: "",
    adjustment_index: "",
    adjustment_frequency: "12",
    next_adjustment_date: "",
    status: "ACTIVE",
    notes: "",
};

export const emptyLeaseInitial = (): LeaseFormInitial => ({ form: { ...EMPTY_LEASE_FORM }, additionalTenants: [], charges: [] });

/** The form of a lease being edited, from the detail the API returns. */
export function leaseToInitial(full: LeaseWithDetails): LeaseFormInitial {
    return {
        savedUnitName: full.unit_name || "",
        form: {
            reference_name: full.reference_name || "",
            property_id: full.property_id,
            unit_id: full.unit_id || "",
            primary_tenant_id: full.primary_tenant_id,
            management_type: full.management_type,
            agency_id: full.agency_id || "",
            agent_id: full.agent_id || "",
            start_date: formatDateBR(full.start_date),
            end_date: formatDateBR(full.end_date),
            monthly_rent: moneyToMask(full.monthly_rent),
            rent_due_day: full.rent_due_day?.toString() || "",
            security_deposit: moneyToMask(full.security_deposit),
            deposit_months: full.deposit_months?.toString() || "",
            adjustment_index: full.adjustment_index || "",
            adjustment_frequency: full.adjustment_frequency?.toString() || "12",
            next_adjustment_date: formatDateBR(full.next_adjustment_date),
            status: full.status,
            notes: full.notes || "",
        },
        additionalTenants: (full.additional_tenants || []).map(t => ({ tenant_id: t.tenant_id, role: t.role })),
        charges: (full.charges || []).map(c => ({
            charge_type: c.charge_type,
            label: c.label || "",
            responsibility: c.responsibility,
            amount: moneyToMask(c.amount),
            adjustment_index: c.adjustment_index || "",
            adjustment_notes: c.adjustment_notes || "",
        })),
        openSections: { adjustment: !!full.adjustment_index, charges: (full.charges || []).length > 0, notes: !!full.notes },
    };
}

const CHARGE_TYPES: { value: ChargeType; label: string }[] = [
    { value: "CONDOMINIUM", label: "Condomínio" },
    { value: "IPTU", label: "IPTU" },
    { value: "WATER", label: "Água" },
    { value: "ELECTRICITY", label: "Energia Elétrica" },
    { value: "GAS", label: "Gás" },
    { value: "INTERNET", label: "Internet" },
    { value: "OTHER", label: "Outro" },
];

const RESPONSIBILITY_OPTIONS: { value: ChargeResponsibility; label: string }[] = [
    { value: "TENANT", label: "Inquilino" },
    { value: "LANDLORD", label: "Proprietário" },
    { value: "INCLUDED", label: "Incluso no aluguel" },
];

const ADJUSTMENT_OPTIONS = [
    { value: "", label: "Selecionar..." },
    { value: "IPCA", label: "IPCA" },
    { value: "IGP_M", label: "IGP-M" },
    { value: "INPC", label: "INPC" },
    { value: "IVAR", label: "IVAR" },
    { value: "CUSTOM", label: "Personalizado" },
    { value: "NONE", label: "Sem reajuste automático" },
];

const CHARGE_ADJUSTMENT_OPTIONS = [
    { value: "", label: "Não informado" },
    { value: "IPCA", label: "IPCA" },
    { value: "IGP_M", label: "IGP-M" },
    { value: "INPC", label: "INPC" },
    { value: "IVAR", label: "IVAR" },
    { value: "CUSTOM", label: "Outra regra" },
    { value: "NONE", label: "Valor fixo (sem reajuste)" },
];

const DEFAULT_OPEN: Record<SectionKey, boolean> = {
    property_tenant: true,
    terms: true,
    management: true,
    adjustment: false,
    charges: false,
    notes: false,
};

// ── Component ────────────────────────────────────────────────────────

export default function LeaseForm({ editingId, initial, dropdowns, aiImported = false, importedFile = null, importedStoragePath = null, onSaved, onCancel, topSlot }: Props) {
    const { properties, tenants, agencies, agents } = dropdowns;
    const [form, setForm] = useState<LeaseFormData>(() => ({ ...initial.form }));
    const [additionalTenants, setAdditionalTenants] = useState<AdditionalTenantFormItem[]>(() => initial.additionalTenants.map(t => ({ ...t })));
    const [charges, setCharges] = useState<ChargeFormItem[]>(() => initial.charges.map(c => ({ ...c })));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [warning, setWarning] = useState<string | null>(null);
    const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(() => ({ ...DEFAULT_OPEN, ...initial.openSections }));
    const savedUnitName = initial.savedUnitName ?? "";

    // ── Auto-calculate next adjustment date ───────────────────────

    useEffect(() => {
        if (form.start_date && form.adjustment_frequency && form.adjustment_index && form.adjustment_index !== "NONE") {
            const iso = parseDateBR(form.start_date);
            if (iso) {
                const freq = parseInt(form.adjustment_frequency, 10);
                if (!isNaN(freq) && freq > 0) {
                    // Anchored on the start day and clamped to short months, so a
                    // contract starting on the 31st does not drift to the 28th forever.
                    const next = nextOccurrence(iso, freq, new Date());
                    const computed = next ? formatDateOnlyBR(toISODate(next)) : "";
                    if (computed && form.next_adjustment_date !== computed) {
                        setForm(prev => ({ ...prev, next_adjustment_date: computed }));
                    }
                }
            }
        } else if (form.adjustment_index === "NONE" || !form.adjustment_index) {
            if (form.next_adjustment_date) {
                setForm(prev => ({ ...prev, next_adjustment_date: "" }));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.start_date, form.adjustment_frequency, form.adjustment_index]);

    // ── Form helpers ──────────────────────────────────────────────

    const toggleSection = (key: SectionKey) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

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

    const scrollToFirst = (e: FieldErrors) => {
        const firstField = Object.keys(e)[0];
        const el = firstField ? document.getElementById(`field-${firstField}`) : null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    // ── Validation ────────────────────────────────────────────────

    const validate = (): boolean => {
        const e: FieldErrors = {};

        if (!form.property_id) e.property_id = "Selecione um imóvel.";
        if (!form.primary_tenant_id) e.primary_tenant_id = "Selecione um inquilino.";
        if (!form.management_type) e.management_type = "Tipo de gestão é obrigatório.";
        if (form.management_type === "AGENCY" && !form.agency_id) e.agency_id = "Selecione a imobiliária.";
        if (form.management_type === "AGENT" && !form.agent_id) e.agent_id = "Selecione o corretor.";
        if (!form.start_date) e.start_date = "Data de início é obrigatória.";
        else if (parseDateBR(form.start_date) === "") e.start_date = "Data inválida. Use DD/MM/AAAA.";

        if (form.end_date) {
            const endIso = parseDateBR(form.end_date);
            const startIso = parseDateBR(form.start_date);
            if (endIso === "") e.end_date = "Data inválida. Use DD/MM/AAAA.";
            else if (startIso && endIso <= startIso) e.end_date = "Data de término deve ser posterior à data de início.";
        }

        if (!form.monthly_rent) e.monthly_rent = "Valor do aluguel é obrigatório.";
        else {
            const val = parseFloat(form.monthly_rent.replace(/\D/g, ""));
            if (val <= 0) e.monthly_rent = "Valor do aluguel deve ser maior que zero.";
        }

        if (!form.rent_due_day) e.rent_due_day = "Dia de vencimento é obrigatório.";
        else {
            const day = parseInt(form.rent_due_day, 10);
            if (isNaN(day) || day < 1 || day > 31) e.rent_due_day = "Dia de vencimento deve ser entre 1 e 31.";
        }

        if (form.next_adjustment_date && parseDateBR(form.next_adjustment_date) === "") {
            e.next_adjustment_date = "Data inválida. Use DD/MM/AAAA.";
        }

        setErrors(e);
        if (Object.keys(e).length > 0) {
            scrollToFirst(e);
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
            unit_id: form.unit_id || null,
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
            adjustment_frequency: form.adjustment_frequency || "12",
            next_adjustment_date: form.next_adjustment_date ? parseDateBR(form.next_adjustment_date) : null,
            status: forceDraft ? "DRAFT" : form.status,
            notes: form.notes || null,
            additional_tenants: additionalTenants.filter(t => t.tenant_id),
            charges: charges.filter(c => c.charge_type),
        };

        try {
            const url = editingId ? `/api/leases/${editingId}` : "/api/leases";
            const res = await fetch(url, {
                method: editingId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                if (data.errors) {
                    setErrors(data.errors);
                    scrollToFirst(data.errors);
                } else {
                    setWarning(typeof data.error === "string" ? data.error : "Não foi possível salvar o contrato.");
                }
                return;
            }

            const id = (data.lease?.id as string | undefined) ?? editingId;
            if (!editingId && importedFile && data.lease?.id) {
                const attached = await attachLeaseContract(data.lease.id, importedFile, importedStoragePath);
                if (!attached) console.error("Error attaching imported contract");
            }
            if (id) onSaved(id, (data.warning as string | null) ?? null);
        } catch {
            setWarning("Erro de conexão. Tente novamente.");
        } finally {
            setSaving(false);
        }
    };

    // ── Derived ───────────────────────────────────────────────────

    const autoReferenceName = useMemo(() => {
        const prop = properties.find(p => p.id === form.property_id);
        const tenant = tenants.find(t => t.id === form.primary_tenant_id);
        if (!prop || !tenant) return "";
        const unit = prop.units?.find(u => u.id === form.unit_id);
        const year = parseDateBR(form.start_date).slice(0, 4) || String(new Date().getFullYear());
        return `${unit ? `${prop.name} · ${unit.name}` : prop.name} - ${tenant.full_name} - ${year}`;
    }, [form.property_id, form.unit_id, form.primary_tenant_id, form.start_date, properties, tenants]);

    const filteredAgents = useMemo(() => {
        if (form.management_type === "AGENCY" && form.agency_id) return agents.filter(a => a.agency_id === form.agency_id);
        return agents;
    }, [agents, form.management_type, form.agency_id]);

    const selectClass = "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm";

    // ── Render ────────────────────────────────────────────────────

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
            {topSlot}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={onCancel} disabled={saving} aria-label="Voltar">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{editingId ? "Editar Contrato" : "Novo Contrato de Locação"}</h1>
                    <p className="text-sm text-muted-foreground">
                        {editingId ? "Atualize os dados do contrato." : "Preencha os dados para criar um novo contrato."}
                    </p>
                </div>
            </div>

            {warning && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">{warning}</p>
                </div>
            )}

            {aiImported && (
                <div className="flex items-start gap-3.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                    <div className="shrink-0 rounded-xl bg-amber-100 p-2 text-amber-600 dark:bg-amber-900/50">
                        <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Dados preenchidos automaticamente via IA!</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            As informações foram extraídas do contrato enviado. Revise todos os campos antes de salvar.
                            {importedFile && " O arquivo enviado será anexado aos documentos do contrato."}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Section 1: Property & Tenant ─────────────────────── */}
            <FormSection
                title="Imóvel & Inquilino"
                description="Selecione o imóvel e o inquilino principal."
                icon={<Home className="h-5 w-5" />}
                open={openSections.property_tenant}
                onToggle={() => toggleSection("property_tenant")}
            >
                <div id="field-reference_name">
                    <Label>Nome / Referência do Contrato</Label>
                    <Input
                        value={form.reference_name}
                        onChange={e => updateForm("reference_name", e.target.value)}
                        placeholder={autoReferenceName || "Ex: Kitnet 03 - João Silva - 2026"}
                    />
                    {autoReferenceName && !form.reference_name && (
                        <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => updateForm("reference_name", autoReferenceName)}>
                            Usar sugestão: &ldquo;{autoReferenceName}&rdquo;
                        </button>
                    )}
                </div>

                <div id="field-property_id">
                    <Label>Imóvel *</Label>
                    <select
                        className={cn(selectClass, errors.property_id && "border-red-500")}
                        value={form.unit_id ? `${form.property_id}${UNIT_SEP}${form.unit_id}` : form.property_id}
                        onChange={e => {
                            // A multi-unit property lists "the whole property" plus each of its units
                            const [propertyId, unitId = ""] = e.target.value.split(UNIT_SEP);
                            setForm(prev => ({ ...prev, unit_id: unitId }));
                            updateForm("property_id", propertyId);
                        }}
                    >
                        <option value="">Selecione um imóvel...</option>
                        {properties.map(p => {
                            const units = p.units ?? [];
                            if (units.length === 0) return <option key={p.id} value={p.id}>{p.name}</option>;
                            const unitGone = form.property_id === p.id && !!form.unit_id && !units.some(u => u.id === form.unit_id);
                            return (
                                <optgroup key={p.id} label={p.name}>
                                    {units.map(u => (
                                        <option key={u.id} value={`${p.id}${UNIT_SEP}${u.id}`}>{p.name} · {u.name}</option>
                                    ))}
                                    {unitGone && (
                                        <option value={`${p.id}${UNIT_SEP}${form.unit_id}`}>{p.name} · {savedUnitName || "Unidade"} (removida do imóvel)</option>
                                    )}
                                    <option value={p.id}>{p.name} · Imóvel inteiro (todas as unidades)</option>
                                </optgroup>
                            );
                        })}
                    </select>
                    {errors.property_id && <p className="mt-1 text-xs text-red-500">{errors.property_id}</p>}
                </div>

                <div id="field-primary_tenant_id">
                    <Label>Inquilino Principal *</Label>
                    <select
                        className={cn(selectClass, errors.primary_tenant_id && "border-red-500")}
                        value={form.primary_tenant_id}
                        onChange={e => updateForm("primary_tenant_id", e.target.value)}
                    >
                        <option value="">Selecione um inquilino...</option>
                        {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                    {errors.primary_tenant_id && <p className="mt-1 text-xs text-red-500">{errors.primary_tenant_id}</p>}
                </div>

                <div>
                    <Label>Inquilinos Adicionais</Label>
                    {additionalTenants.map((at, idx) => (
                        <div key={idx} className="mt-2 flex items-center gap-2">
                            <select
                                className="flex h-10 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                                value={at.tenant_id}
                                onChange={e => setAdditionalTenants(prev => prev.map((t, i) => (i === idx ? { ...t, tenant_id: e.target.value } : t)))}
                            >
                                <option value="">Selecionar inquilino...</option>
                                {tenants.filter(t => t.id !== form.primary_tenant_id).map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                            </select>
                            <select
                                className="flex h-10 w-40 rounded-md border bg-background px-3 py-2 text-sm"
                                value={at.role}
                                onChange={e => setAdditionalTenants(prev => prev.map((t, i) => (i === idx ? { ...t, role: e.target.value as LeaseTenantRole } : t)))}
                            >
                                <option value="CO_TENANT">Co-inquilino</option>
                                <option value="OCCUPANT">Ocupante</option>
                            </select>
                            <Button variant="ghost" size="icon" onClick={() => setAdditionalTenants(prev => prev.filter((_, i) => i !== idx))} aria-label="Remover inquilino">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setAdditionalTenants(prev => [...prev, { tenant_id: "", role: "CO_TENANT" }])}>
                        <Plus className="mr-1 h-4 w-4" /> Adicionar Inquilino
                    </Button>
                </div>
            </FormSection>

            {/* ── Section 2: Lease Terms ───────────────────────────── */}
            <FormSection
                title="Termos do Contrato"
                description="Datas, valor do aluguel e caução."
                icon={<Calendar className="h-5 w-5" />}
                open={openSections.terms}
                onToggle={() => toggleSection("terms")}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <div id="field-start_date">
                        <Label>Data de Início *</Label>
                        <Input value={form.start_date} onChange={e => updateForm("start_date", maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} className={errors.start_date ? "border-red-500" : ""} />
                        {errors.start_date && <p className="mt-1 text-xs text-red-500">{errors.start_date}</p>}
                    </div>
                    <div id="field-end_date">
                        <Label>Data de Término</Label>
                        <Input value={form.end_date} onChange={e => updateForm("end_date", maskDate(e.target.value))} placeholder="DD/MM/AAAA (opcional)" maxLength={10} className={errors.end_date ? "border-red-500" : ""} />
                        {errors.end_date && <p className="mt-1 text-xs text-red-500">{errors.end_date}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">Deixe vazio para contrato sem prazo definido.</p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div id="field-monthly_rent">
                        <Label>Aluguel Mensal (R$) *</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                            <Input value={form.monthly_rent} onChange={e => updateForm("monthly_rent", maskCurrency(e.target.value))} placeholder="0,00" className={cn("pl-10", errors.monthly_rent && "border-red-500")} />
                        </div>
                        {errors.monthly_rent && <p className="mt-1 text-xs text-red-500">{errors.monthly_rent}</p>}
                    </div>
                    <div id="field-rent_due_day">
                        <Label>Dia de Vencimento *</Label>
                        <Input type="number" min={1} max={31} value={form.rent_due_day} onChange={e => updateForm("rent_due_day", e.target.value)} placeholder="Ex: 10" className={errors.rent_due_day ? "border-red-500" : ""} />
                        {errors.rent_due_day && <p className="mt-1 text-xs text-red-500">{errors.rent_due_day}</p>}
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div id="field-security_deposit">
                        <Label>Caução (R$)</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                            <Input value={form.security_deposit} onChange={e => updateForm("security_deposit", maskCurrency(e.target.value))} placeholder="0,00" className="pl-10" />
                        </div>
                    </div>
                    <div id="field-deposit_months">
                        <Label>Meses de Caução</Label>
                        <Input type="number" min={0} value={form.deposit_months} onChange={e => updateForm("deposit_months", e.target.value)} placeholder="Ex: 3" />
                    </div>
                </div>

                <div id="field-status">
                    <Label>Status do Contrato *</Label>
                    <select className={selectClass} value={form.status} onChange={e => updateForm("status", e.target.value as LeaseStatus)}>
                        <option value="ACTIVE">Ativo</option>
                        <option value="DRAFT">Rascunho</option>
                        <option value="EXPIRED">Encerrado (prazo vencido)</option>
                        <option value="CANCELLED">Cancelado</option>
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">Um contrato antigo, já encerrado, fica como &ldquo;Encerrado&rdquo;: entra no histórico sem contar como vigente.</p>
                </div>
            </FormSection>

            {/* ── Section 3: Management ────────────────────────────── */}
            <FormSection
                title="Administração"
                description="Quem gerencia este contrato?"
                icon={<Building2 className="h-5 w-5" />}
                open={openSections.management}
                onToggle={() => toggleSection("management")}
            >
                <div id="field-management_type">
                    <Label>Tipo de Gestão *</Label>
                    <div className="mt-2 flex flex-wrap gap-3">
                        {([
                            { value: "SELF_MANAGED", label: "Gestão Própria", icon: <Home className="h-4 w-4" /> },
                            { value: "AGENCY", label: "Imobiliária", icon: <Building2 className="h-4 w-4" /> },
                            { value: "AGENT", label: "Corretor", icon: <Users className="h-4 w-4" /> },
                        ] as { value: LeaseManagementType; label: string; icon: React.ReactNode }[]).map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                className={cn(
                                    "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition",
                                    form.management_type === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:bg-accent"
                                )}
                                onClick={() => {
                                    updateForm("management_type", opt.value);
                                    if (opt.value === "SELF_MANAGED") {
                                        updateForm("agency_id", "");
                                        updateForm("agent_id", "");
                                    }
                                }}
                            >
                                {opt.icon} {opt.label}
                            </button>
                        ))}
                    </div>
                    {errors.management_type && <p className="mt-1 text-xs text-red-500">{errors.management_type}</p>}
                </div>

                {form.management_type === "AGENCY" && (
                    <div id="field-agency_id">
                        <Label>Imobiliária *</Label>
                        <select className={cn(selectClass, errors.agency_id && "border-red-500")} value={form.agency_id} onChange={e => updateForm("agency_id", e.target.value)}>
                            <option value="">Selecione uma imobiliária...</option>
                            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        {errors.agency_id && <p className="mt-1 text-xs text-red-500">{errors.agency_id}</p>}
                    </div>
                )}

                {(form.management_type === "AGENCY" || form.management_type === "AGENT") && (
                    <div id="field-agent_id">
                        <Label>{form.management_type === "AGENT" ? "Corretor *" : "Corretor (opcional)"}</Label>
                        <select
                            className={cn(selectClass, errors.agent_id && "border-red-500")}
                            value={form.agent_id}
                            onChange={e => {
                                updateForm("agent_id", e.target.value);
                                // an autonomous agent tied to an agency brings the agency along
                                if (form.management_type === "AGENT" && e.target.value) {
                                    const selectedAgent = agents.find(a => a.id === e.target.value);
                                    if (selectedAgent?.agency_id) updateForm("agency_id", selectedAgent.agency_id);
                                }
                            }}
                        >
                            <option value="">Selecione um corretor...</option>
                            {filteredAgents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                        </select>
                        {errors.agent_id && <p className="mt-1 text-xs text-red-500">{errors.agent_id}</p>}
                        {form.management_type === "AGENT" && form.agent_id && (() => {
                            const sel = agents.find(a => a.id === form.agent_id);
                            const ag = sel?.agency_id ? agencies.find(a => a.id === sel.agency_id) : null;
                            return ag ? <p className="mt-1 text-xs text-muted-foreground">Vinculado à imobiliária: {ag.name}</p> : null;
                        })()}
                    </div>
                )}
            </FormSection>

            {/* ── Section 4: Rent Adjustment ───────────────────────── */}
            <FormSection
                title="Reajuste do Aluguel"
                description="Índice e frequência de reajuste."
                icon={<TrendingUp className="h-5 w-5" />}
                open={openSections.adjustment}
                onToggle={() => toggleSection("adjustment")}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <div id="field-adjustment_index">
                        <Label>Índice de Reajuste</Label>
                        <select className={selectClass} value={form.adjustment_index} onChange={e => updateForm("adjustment_index", e.target.value)}>
                            {ADJUSTMENT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div id="field-adjustment_frequency">
                        <Label>Frequência (meses)</Label>
                        <Input type="number" min={1} value={form.adjustment_frequency} onChange={e => updateForm("adjustment_frequency", e.target.value)} placeholder="12" />
                    </div>
                </div>
                <div id="field-next_adjustment_date">
                    <Label>Próximo Reajuste</Label>
                    <Input
                        value={form.next_adjustment_date}
                        readOnly
                        placeholder={form.adjustment_index && form.adjustment_index !== "NONE" ? "Calculado automaticamente" : "Selecione um índice de reajuste"}
                        className="bg-muted/50 cursor-default"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        {form.next_adjustment_date ? "Calculado automaticamente a partir da data de início + frequência." : "Preencha a data de início e selecione um índice para calcular."}
                    </p>
                </div>
            </FormSection>

            {/* ── Section 5: Additional Charges ────────────────────── */}
            <FormSection
                title="Encargos Adicionais"
                description="Condomínio, IPTU, contas e responsabilidades."
                icon={<Zap className="h-5 w-5" />}
                open={openSections.charges}
                onToggle={() => toggleSection("charges")}
            >
                {charges.map((charge, idx) => {
                    const patch = (p: Partial<ChargeFormItem>) => setCharges(prev => prev.map((c, i) => (i === idx ? { ...c, ...p } : c)));
                    return (
                        <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                                <div className="flex-1">
                                    <Label className="text-xs">Tipo</Label>
                                    <select className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm" value={charge.charge_type} onChange={e => patch({ charge_type: e.target.value as ChargeType })}>
                                        {CHARGE_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                                    </select>
                                </div>
                                {charge.charge_type === "OTHER" && (
                                    <div className="flex-1">
                                        <Label className="text-xs">Descrição</Label>
                                        <Input value={charge.label} onChange={e => patch({ label: e.target.value })} placeholder="Descreva..." className="h-9" />
                                    </div>
                                )}
                                <div className="w-full sm:w-44">
                                    <Label className="text-xs">Responsabilidade</Label>
                                    <select className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm" value={charge.responsibility} onChange={e => patch({ responsibility: e.target.value as ChargeResponsibility })}>
                                        {RESPONSIBILITY_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </div>
                                <div className="w-full sm:w-32">
                                    <Label className="text-xs">Valor (R$)</Label>
                                    <Input value={charge.amount} onChange={e => patch({ amount: maskCurrency(e.target.value) })} placeholder="0,00" className="h-9" />
                                </div>
                                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCharges(prev => prev.filter((_, i) => i !== idx))} aria-label="Remover encargo">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            {/* How this charge's amount is readjusted (often not the rent's index) */}
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                                <div className="w-full sm:w-52">
                                    <Label className="text-xs">Reajuste do encargo</Label>
                                    <select className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm" value={charge.adjustment_index} onChange={e => patch({ adjustment_index: e.target.value })}>
                                        {CHARGE_ADJUSTMENT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <Label className="text-xs">Regra de reajuste (opcional)</Label>
                                    <Input value={charge.adjustment_notes} onChange={e => patch({ adjustment_notes: e.target.value })} placeholder="Ex: Fixo por 12 meses; revisto conforme o consumo" maxLength={300} className="h-9" />
                                </div>
                            </div>
                        </div>
                    );
                })}
                <Button variant="outline" size="sm" onClick={() => setCharges(prev => [...prev, { charge_type: "CONDOMINIUM", label: "", responsibility: "TENANT", amount: "", adjustment_index: "", adjustment_notes: "" }])}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar Encargo
                </Button>
            </FormSection>

            {/* ── Section 6: Notes ─────────────────────────────────── */}
            <FormSection
                title="Observações"
                description="Notas internas e privadas."
                icon={<PenLine className="h-5 w-5" />}
                open={openSections.notes}
                onToggle={() => toggleSection("notes")}
            >
                <div id="field-notes">
                    <Label>Observações Internas</Label>
                    <textarea
                        className="flex min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.notes}
                        onChange={e => updateForm("notes", e.target.value)}
                        placeholder="Informações adicionais sobre o contrato..."
                    />
                </div>
            </FormSection>

            {editingId && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> Os arquivos do contrato (PDF assinado, aditivos, vistoria) ficam no painel do contrato.
                </p>
            )}

            {/* ── Actions ──────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
                {!editingId && (
                    <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                        Salvar como Rascunho
                    </Button>
                )}
                <Button onClick={() => handleSave(false)} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {editingId ? "Salvar Alterações" : "Salvar Contrato"}
                </Button>
            </div>
        </div>
    );
}

// ── Collapsible section ──────────────────────────────────────────────

function FormSection({ title, description, icon, open, onToggle, children }: {
    title: string;
    description: string;
    icon: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" className="flex w-full items-center justify-between p-4 text-left transition hover:bg-accent/50" onClick={onToggle}>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
                    <div>
                        <h3 className="font-semibold text-foreground">{title}</h3>
                        <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                </div>
                {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
            </button>
            {open && <div className="space-y-4 border-t border-border p-4">{children}</div>}
        </div>
    );
}
