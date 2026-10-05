"use client";

/**
 * The lease form — "Novo contrato de locação" and "Editar contrato" — in numbered, colour-coded sections
 * (property & tenant, term & amounts, management, adjustment, charges, notes) beside a sticky summary
 * of what is being registered, with the save buttons. Files are not here: they live on the contract's
 * dashboard (LeaseDocuments), which is where a saved contract lands.
 *
 * Dates are typed as DD/MM/AAAA and sent as ISO; money as "1.234,56". This is where a contract is
 * typed in; the AI import ("Importar contrato") creates contracts from its own review.
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
    CalendarClock,
    CheckCircle2,
    Circle,
    FileSignature,
    FileText,
    Home,
    Loader2,
    PenLine,
    Plus,
    Save,
    Sparkles,
    Trash2,
    TrendingUp,
    Users,
    X,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Money, Sensitive } from "@/components/privacy";
import { chargeAdjustment } from "@/lib/lease-charges";
import { STATUS_META, brl, termMonths, todayBRT } from "@/lib/lease-dashboard";
import { leaseIndexSeriesCode, type IndexPoint } from "@/lib/lease-summary";
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
}

interface Props {
    /** null = creating */
    editingId: string | null;
    initial: LeaseFormInitial;
    dropdowns: LeaseFormDropdowns;
    onSaved: (leaseId: string, warning: string | null) => void;
    onCancel: () => void;
    /** shown above the title (the "Voltar ao imóvel" link) */
    topSlot?: React.ReactNode;
    /** index series the page already has, by calculator code (`ipca`, `igpm`…); the form fetches the ones it lacks */
    indexSeries?: Record<string, IndexPoint[] | null>;
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
            adjusts_with_rent: c.adjusts_with_rent === true,
            collected_by: c.collected_by || "",
        })),
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
    { value: "INCLUDED_IN_CONDO", label: "Incluso no condomínio" },
];
/** A charge can be part of the condominium fee — except the condominium itself. */
const responsibilityOptionsFor = (type: ChargeType) => RESPONSIBILITY_OPTIONS.filter(r => r.value !== "INCLUDED_IN_CONDO" || type !== "CONDOMINIUM");

/**
 * "Emissor da fatura": who bills the tenant for a charge the tenant pays. "Proprietário" puts it in the
 * owner's invoice (módulo Fatura); "Terceiros" is someone else's bill — the building's own condominium
 * for a studio in a building, the utility. Blank: the condominium follows how the contract is managed.
 */
const COLLECTOR_OPTIONS: { value: string; label: string }[] = [
    { value: "AGENCY", label: "Imobiliária" },
    { value: "OWNER", label: "Proprietário" },
    { value: "THIRD_PARTY", label: "Terceiros" },
];
const COLLECTOR_HINT: Record<string, string> = {
    "": "Sem resposta, o condomínio segue a gestão do contrato e os demais encargos ficam fora da fatura.",
    AGENCY: "A imobiliária cobra junto com o aluguel e repassa.",
    OWNER: "Entra na fatura que você emite ao inquilino (módulo Fatura).",
    THIRD_PARTY: "Outro emissor cobra o inquilino: o condomínio do prédio, a concessionária.",
};

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

// ── Component ────────────────────────────────────────────────────────

const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const amountFromMask = (masked: string) => (parseInt(masked.replace(/\D/g, ""), 10) || 0) / 100;

export default function LeaseForm({ editingId, initial, dropdowns, onSaved, onCancel, topSlot, indexSeries }: Props) {
    const { properties, tenants, agencies, agents } = dropdowns;
    const [form, setForm] = useState<LeaseFormData>(() => ({ ...initial.form }));
    const [additionalTenants, setAdditionalTenants] = useState<AdditionalTenantFormItem[]>(() => initial.additionalTenants.map(t => ({ ...t })));
    const [charges, setCharges] = useState<ChargeFormItem[]>(() => initial.charges.map(c => ({ ...c })));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [warning, setWarning] = useState<string | null>(null);
    const savedUnitName = initial.savedUnitName ?? "";

    // ── Index series: the preview of a charge readjusted on the lease's dates ──

    const [series, setSeries] = useState<Record<string, IndexPoint[] | null>>(() => ({ ...(indexSeries ?? {}) }));
    const neededCodes = useMemo(() => {
        const codes = charges.map(c => leaseIndexSeriesCode(c.charge_type === "CONDOMINIUM" && c.adjusts_with_rent ? form.adjustment_index : c.adjustment_index));
        return [...new Set(codes.filter((c): c is string => Boolean(c)))].sort().join(",");
    }, [charges, form.adjustment_index]);
    useEffect(() => {
        const missing = neededCodes.split(",").filter(code => code && !(code in series));
        if (missing.length === 0) return;
        let alive = true;
        void Promise.all(missing.map(async (code): Promise<[string, IndexPoint[] | null]> => {
            try {
                const res = await fetch(`/api/indices/${code}/calculator-data`);
                const json = await res.json();
                return [code, Array.isArray(json) ? json : null];
            } catch {
                return [code, null];
            }
        })).then(entries => { if (alive) setSeries(prev => ({ ...prev, ...Object.fromEntries(entries) })); });
        return () => { alive = false; };
    }, [neededCodes, series]);

    /** When a charge is next readjusted and what it is worth by the index today, from the form's own values. */
    const adjustmentOf = (charge: ChargeFormItem) => {
        const start = parseDateBR(form.start_date);
        if (!start) return null;
        return chargeAdjustment(
            { amount: amountFromMask(charge.amount), adjustment_index: charge.adjustment_index || null, adjusts_with_rent: charge.charge_type === "CONDOMINIUM" && charge.adjusts_with_rent === true },
            {
                start_date: start, end_date: null, rent_due_day: 1, monthly_rent: 0,
                adjustment_index: form.adjustment_index || null,
                adjustment_frequency: parseInt(form.adjustment_frequency, 10) || 12,
                next_adjustment_date: (form.next_adjustment_date && parseDateBR(form.next_adjustment_date)) || null,
            },
            series,
            todayBRT()
        );
    };

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
            // a charge inside the condominium has no adjustment rule of its own
            charges: charges.filter(c => c.charge_type).map(c => (c.responsibility === "INCLUDED_IN_CONDO" ? { ...c, adjustment_notes: "" } : c)),
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

    /** what the summary beside the form says, from the form as it is */
    const summary = useMemo(() => {
        const prop = properties.find(p => p.id === form.property_id);
        const unit = prop?.units?.find(u => u.id === form.unit_id);
        const place = prop ? (unit ? `${prop.name} · ${unit.name}` : form.unit_id ? `${prop.name} · ${savedUnitName || "Unidade"}` : prop.name) : null;
        const tenant = tenants.find(t => t.id === form.primary_tenant_id)?.full_name ?? null;
        const start = parseDateBR(form.start_date);
        const end = form.end_date ? parseDateBR(form.end_date) : "";
        const months = start && end && end > start ? termMonths(start, end) : null;
        const rent = amountFromMask(form.monthly_rent);
        const fixed = charges.filter(c => c.responsibility === "TENANT").reduce((sum, c) => sum + amountFromMask(c.amount), 0);
        const dueDay = parseInt(form.rent_due_day, 10);
        const manager = form.management_type === "AGENCY"
            ? agencies.find(a => a.id === form.agency_id)?.name ?? null
            : form.management_type === "AGENT" ? agents.find(a => a.id === form.agent_id)?.full_name ?? null : "Gestão própria";
        const index = ADJUSTMENT_OPTIONS.find(o => o.value === form.adjustment_index && o.value)?.label ?? null;
        return {
            place, tenant, start, end, months, rent, fixed, dueDay: dueDay >= 1 && dueDay <= 31 ? dueDay : null, manager, index,
            steps: [
                { label: "Imóvel", done: !!form.property_id },
                { label: "Inquilino principal", done: !!form.primary_tenant_id },
                { label: "Data de início", done: !!start },
                { label: "Aluguel", done: rent > 0 },
                { label: "Dia de vencimento", done: dueDay >= 1 && dueDay <= 31 },
                { label: "Gestão", done: form.management_type === "SELF_MANAGED" || (form.management_type === "AGENCY" ? !!form.agency_id : !!form.agent_id) },
            ],
        };
    }, [form, charges, properties, tenants, agencies, agents, savedUnitName]);
    const stepsDone = summary.steps.filter(s => s.done).length;

    // ── Render ────────────────────────────────────────────────────

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
            {topSlot}
            <div className="flex items-start gap-3">
                <Button variant="ghost" size="icon" onClick={onCancel} disabled={saving} aria-label="Voltar" className="mt-0.5 shrink-0">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <FileSignature className="h-6 w-6 text-emerald-600" />
                        {editingId ? "Editar contrato" : "Novo contrato de locação"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {editingId ? "Atualize os dados do contrato." : "Imóvel, inquilino, prazo, valores e quem administra. O resumo do contrato acompanha o que você preenche."}
                    </p>
                </div>
            </div>

            {warning && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <p className="text-sm text-amber-900 dark:text-amber-200">{warning}</p>
                </div>
            )}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-5">
                    {/* ── 1. Property & tenant ─────────────────────── */}
                    <Section n={1} tone="violet" icon={<Home className="h-4 w-4" />} title="Imóvel e inquilino" description="Onde fica e quem aluga.">
                        <Field id="property_id" label="Imóvel" required error={errors.property_id}>
                            <select
                                className={cn(control, errors.property_id && "border-red-500")}
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
                        </Field>

                        <Field id="primary_tenant_id" label="Inquilino principal" required error={errors.primary_tenant_id}>
                            <select className={cn(control, errors.primary_tenant_id && "border-red-500")} value={form.primary_tenant_id} onChange={e => updateForm("primary_tenant_id", e.target.value)}>
                                <option value="">Selecione um inquilino...</option>
                                {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                            </select>
                        </Field>

                        <div className="space-y-2">
                            {additionalTenants.length > 0 && <Label className="text-xs font-medium text-muted-foreground">Outros inquilinos e moradores</Label>}
                            {additionalTenants.map((at, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <select
                                        className={cn(control, "flex-1")}
                                        value={at.tenant_id}
                                        onChange={e => setAdditionalTenants(prev => prev.map((t, i) => (i === idx ? { ...t, tenant_id: e.target.value } : t)))}
                                    >
                                        <option value="">Selecionar inquilino...</option>
                                        {tenants.filter(t => t.id !== form.primary_tenant_id).map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                    </select>
                                    <select
                                        className={cn(control, "w-36 shrink-0")}
                                        value={at.role}
                                        onChange={e => setAdditionalTenants(prev => prev.map((t, i) => (i === idx ? { ...t, role: e.target.value as LeaseTenantRole } : t)))}
                                    >
                                        <option value="CO_TENANT">Co-inquilino</option>
                                        <option value="OCCUPANT">Morador</option>
                                    </select>
                                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setAdditionalTenants(prev => prev.filter((_, i) => i !== idx))} aria-label="Remover inquilino">
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            <button type="button" className={addButton} onClick={() => setAdditionalTenants(prev => [...prev, { tenant_id: "", role: "CO_TENANT" }])}>
                                <Plus className="h-4 w-4" /> Adicionar outro inquilino ou morador
                            </button>
                        </div>

                        <Field id="reference_name" label="Nome do contrato" hint="Como ele aparece nas listas.">
                            <Input
                                className={inputCls}
                                value={form.reference_name}
                                onChange={e => updateForm("reference_name", e.target.value)}
                                placeholder={autoReferenceName || "Ex: Kitnet 03 - João Silva - 2026"}
                            />
                            {autoReferenceName && !form.reference_name && (
                                <button type="button" className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-500/20 dark:text-violet-300" onClick={() => updateForm("reference_name", autoReferenceName)}>
                                    <Sparkles className="h-3 w-3" /> Usar &ldquo;{autoReferenceName}&rdquo;
                                </button>
                            )}
                        </Field>
                    </Section>

                    {/* ── 2. Term and amounts ──────────────────────── */}
                    <Section n={2} tone="emerald" icon={<Calendar className="h-4 w-4" />} title="Prazo e valores" description="Datas, aluguel, vencimento e caução.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="start_date" label="Início" required error={errors.start_date}>
                                <Input value={form.start_date} onChange={e => updateForm("start_date", maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} className={cn(inputCls, errors.start_date && "border-red-500")} />
                            </Field>
                            <Field id="end_date" label="Término" error={errors.end_date} hint={summary.months !== null ? `Prazo de ${summary.months} ${summary.months === 1 ? "mês" : "meses"}.` : "Vazio = prazo indeterminado."}>
                                <Input value={form.end_date} onChange={e => updateForm("end_date", maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} className={cn(inputCls, errors.end_date && "border-red-500")} />
                            </Field>
                            <Field id="monthly_rent" label="Aluguel mensal" required error={errors.monthly_rent}>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                    <Input value={form.monthly_rent} onChange={e => updateForm("monthly_rent", maskCurrency(e.target.value))} placeholder="0,00" className={cn(inputCls, "pl-10", errors.monthly_rent && "border-red-500")} />
                                </div>
                            </Field>
                            <Field id="rent_due_day" label="Dia do vencimento" required error={errors.rent_due_day}>
                                <Input type="number" min={1} max={31} value={form.rent_due_day} onChange={e => updateForm("rent_due_day", e.target.value)} placeholder="Ex: 10" className={cn(inputCls, errors.rent_due_day && "border-red-500")} />
                            </Field>
                            <Field id="security_deposit" label="Caução">
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                    <Input value={form.security_deposit} onChange={e => updateForm("security_deposit", maskCurrency(e.target.value))} placeholder="0,00" className={cn(inputCls, "pl-10")} />
                                </div>
                            </Field>
                            <Field id="deposit_months" label="Caução em aluguéis">
                                <Input type="number" min={0} value={form.deposit_months} onChange={e => updateForm("deposit_months", e.target.value)} placeholder="Ex: 3" className={inputCls} />
                            </Field>
                        </div>

                        <Field id="status" label="Situação">
                            <Segmented
                                tone="emerald"
                                value={form.status}
                                onChange={v => updateForm("status", v as LeaseStatus)}
                                options={[
                                    ...STATUS_OPTIONS,
                                    // a status set elsewhere (rescindido, vencendo) stays visible while editing
                                    ...(STATUS_OPTIONS.some(o => o.value === form.status) ? [] : [{ value: form.status, label: STATUS_META[form.status]?.label ?? form.status }]),
                                ]}
                            />
                            <p className="mt-1.5 text-xs text-muted-foreground">{STATUS_HINT[form.status] ?? ""}</p>
                        </Field>
                    </Section>

                    {/* ── 3. Management ────────────────────────────── */}
                    <Section n={3} tone="indigo" icon={<Building2 className="h-4 w-4" />} title="Administração" description="Quem cuida do contrato.">
                        <Field id="management_type" label="Gestão" required error={errors.management_type}>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {([
                                    { value: "SELF_MANAGED", label: "Gestão própria", hint: "Você administra", icon: <Home className="h-4 w-4" /> },
                                    { value: "AGENCY", label: "Imobiliária", hint: "Uma imobiliária administra", icon: <Building2 className="h-4 w-4" /> },
                                    { value: "AGENT", label: "Corretor", hint: "Um corretor intermediou", icon: <Users className="h-4 w-4" /> },
                                ] as { value: LeaseManagementType; label: string; hint: string; icon: React.ReactNode }[]).map(opt => {
                                    const on = form.management_type === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            aria-pressed={on}
                                            className={cn(
                                                "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                                                on ? "border-indigo-500 bg-indigo-500/10" : "border-border bg-background hover:border-indigo-300 hover:bg-indigo-500/5"
                                            )}
                                            onClick={() => {
                                                updateForm("management_type", opt.value);
                                                if (opt.value === "SELF_MANAGED") {
                                                    updateForm("agency_id", "");
                                                    updateForm("agent_id", "");
                                                }
                                            }}
                                        >
                                            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", on ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground")}>{opt.icon}</span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-foreground">{opt.label}</span>
                                                <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>

                        {(form.management_type === "AGENCY" || form.management_type === "AGENT") && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                {form.management_type === "AGENCY" && (
                                    <Field id="agency_id" label="Imobiliária" required error={errors.agency_id}>
                                        <select className={cn(control, errors.agency_id && "border-red-500")} value={form.agency_id} onChange={e => updateForm("agency_id", e.target.value)}>
                                            <option value="">Selecione uma imobiliária...</option>
                                            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                        </select>
                                    </Field>
                                )}
                                <Field
                                    id="agent_id"
                                    label={form.management_type === "AGENT" ? "Corretor" : "Corretor (opcional)"}
                                    required={form.management_type === "AGENT"}
                                    error={errors.agent_id}
                                    hint={form.management_type === "AGENT" && form.agent_id ? (() => {
                                        const sel = agents.find(a => a.id === form.agent_id);
                                        const ag = sel?.agency_id ? agencies.find(a => a.id === sel.agency_id) : null;
                                        return ag ? `Vinculado à imobiliária: ${ag.name}` : undefined;
                                    })() : undefined}
                                >
                                    <select
                                        className={cn(control, errors.agent_id && "border-red-500")}
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
                                </Field>
                            </div>
                        )}
                    </Section>

                    {/* ── 4. Rent adjustment ───────────────────────── */}
                    <Section n={4} tone="amber" icon={<TrendingUp className="h-4 w-4" />} title="Reajuste do aluguel" description="Por qual índice e a cada quantos meses.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="adjustment_index" label="Índice">
                                <select className={control} value={form.adjustment_index} onChange={e => updateForm("adjustment_index", e.target.value)}>
                                    {ADJUSTMENT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </Field>
                            <Field id="adjustment_frequency" label="A cada (meses)">
                                <Input type="number" min={1} value={form.adjustment_frequency} onChange={e => updateForm("adjustment_frequency", e.target.value)} placeholder="12" className={inputCls} />
                            </Field>
                        </div>
                        <div id="field-next_adjustment_date" className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/[0.07] px-3 py-2.5 text-sm">
                            <CalendarClock className="h-4 w-4 shrink-0 text-amber-600" />
                            {form.next_adjustment_date
                                ? <>Próximo reajuste em <strong className="font-semibold text-foreground">{form.next_adjustment_date}</strong><span className="text-xs text-muted-foreground">(início + frequência)</span></>
                                : <span className="text-muted-foreground">{form.adjustment_index === "NONE" ? "Contrato sem reajuste automático." : "Preencha o início e escolha um índice para calcular o próximo reajuste."}</span>}
                            {errors.next_adjustment_date && <span className="text-xs text-red-500">{errors.next_adjustment_date}</span>}
                        </div>
                    </Section>

                    {/* ── 5. Charges ───────────────────────────────── */}
                    <Section n={5} tone="sky" icon={<Zap className="h-4 w-4" />} title="Encargos" description="Condomínio, energia, IPTU, água: quem paga, quanto e quem cobra.">
                        {charges.length === 0 && <p className="text-sm text-muted-foreground">Nenhum encargo. Adicione o condomínio, a energia ou outra conta que o contrato cite.</p>}
                        {charges.map((charge, idx) => {
                            const patch = (p: Partial<ChargeFormItem>) => setCharges(prev => prev.map((c, i) => (i === idx ? { ...c, ...p } : c)));
                            const followsRent = charge.charge_type === "CONDOMINIUM" && charge.adjusts_with_rent === true;
                            // a charge inside the rent or the condominium has no amount of its own to readjust
                            const adjustment = charge.responsibility === "TENANT" || charge.responsibility === "LANDLORD" ? adjustmentOf(charge) : null;
                            return (
                                <div key={idx} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto] sm:items-end">
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Encargo</Label>
                                            <select
                                                className={control}
                                                value={charge.charge_type}
                                                onChange={e => {
                                                    const type = e.target.value as ChargeType;
                                                    // the condominium cannot be included in itself
                                                    patch({ charge_type: type, ...(type === "CONDOMINIUM" && charge.responsibility === "INCLUDED_IN_CONDO" ? { responsibility: "TENANT" as ChargeResponsibility } : {}) });
                                                }}
                                            >
                                                {CHARGE_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Quem paga</Label>
                                            <select className={control} value={charge.responsibility} onChange={e => patch({ responsibility: e.target.value as ChargeResponsibility })}>
                                                {responsibilityOptionsFor(charge.charge_type).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Valor mensal</Label>
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                                                <Input value={charge.amount} onChange={e => patch({ amount: maskCurrency(e.target.value) })} placeholder="0,00" className={cn(inputCls, "pl-9")} />
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 justify-self-end text-muted-foreground hover:text-rose-600" onClick={() => setCharges(prev => prev.filter((_, i) => i !== idx))} aria-label="Remover encargo">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {charge.charge_type === "OTHER" && (
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Descrição</Label>
                                            <Input value={charge.label} onChange={e => patch({ label: e.target.value })} placeholder="Ex: taxa de lixo" className={inputCls} />
                                        </div>
                                    )}

                                    {/* How this charge's amount is readjusted: the condominium may follow the rent; otherwise its own index or rule */}
                                    <div className="space-y-2 border-t border-border/60 pt-3">
                                        {charge.charge_type === "CONDOMINIUM" && (
                                            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                                <input type="checkbox" className="h-4 w-4 rounded border-input accent-emerald-600" checked={followsRent} onChange={e => patch({ adjusts_with_rent: e.target.checked })} />
                                                Reajusta com o aluguel
                                            </label>
                                        )}
                                        {!followsRent && (
                                            <div className="grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Reajuste do encargo</Label>
                                                    <select className={control} value={charge.adjustment_index} onChange={e => patch({ adjustment_index: e.target.value })}>
                                                        {CHARGE_ADJUSTMENT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                    </select>
                                                </div>
                                                {/* inside the condominium the charge follows the condominium: no rule of its own */}
                                                {charge.responsibility !== "INCLUDED_IN_CONDO" && (
                                                    <div>
                                                        <Label className="text-xs text-muted-foreground">Regra de reajuste (opcional)</Label>
                                                        <Input value={charge.adjustment_notes} onChange={e => patch({ adjustment_notes: e.target.value })} placeholder="Ex: Fixo por 12 meses; revisto conforme o consumo" maxLength={300} className={inputCls} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {/* The next adjustment date and the amount corrected by the index to date */}
                                        {followsRent && !form.adjustment_index ? (
                                            <p className="text-xs text-amber-700 dark:text-amber-400">Escolha o índice de reajuste do aluguel (seção 4) para calcular a data e o valor reajustado.</p>
                                        ) : followsRent && form.adjustment_index === "NONE" ? (
                                            <p className="text-xs text-amber-700 dark:text-amber-400">O aluguel deste contrato está sem reajuste: o condomínio também fica sem.</p>
                                        ) : adjustment && (
                                            <p className="text-xs text-muted-foreground">
                                                Próximo reajuste em <strong className="font-semibold text-foreground">{formatDateOnlyBR(adjustment.nextDate)}</strong>
                                                {adjustment.withRent ? `, com o aluguel (${adjustment.indexLabel}).` : `, pelo ${adjustment.indexLabel}.`}
                                                {adjustment.adjustedAmount !== null && adjustment.accumulatedPct !== null
                                                    ? <> Valor reajustado até hoje: <strong className="font-semibold text-foreground"><Money>{brl(adjustment.adjustedAmount)}</Money></strong> ({pctText(adjustment.accumulatedPct)} de {formatDateOnlyBR(adjustment.cycleStart)} a {formatDateOnlyBR(adjustment.indexThroughDate)}).</>
                                                    : leaseIndexSeriesCode(adjustment.index) && amountFromMask(charge.amount) > 0
                                                        ? adjustment.firstClosingDate && todayBRT() < adjustment.firstClosingDate
                                                            ? ` O valor reajustado começa a contar em ${formatDateOnlyBR(adjustment.firstClosingDate)}, quando fecha o 1º mês do ciclo.`
                                                            : " O valor reajustado aparece quando o índice do 1º mês do ciclo for divulgado."
                                                        : ""}
                                            </p>
                                        )}
                                    </div>

                                    {/* Who bills the tenant for it: only a charge the tenant pays has an issuer */}
                                    {charge.responsibility === "TENANT" && (
                                        <div className="border-t border-border/60 pt-3">
                                            <Label className="text-xs text-muted-foreground">Quem cobra o inquilino</Label>
                                            <div className="mt-1.5">
                                                <Segmented
                                                    tone="sky"
                                                    size="sm"
                                                    value={charge.collected_by ?? ""}
                                                    // one issuer at a time; choosing it again leaves the charge without an answer
                                                    onChange={v => patch({ collected_by: (charge.collected_by ?? "") === v ? "" : v })}
                                                    options={COLLECTOR_OPTIONS}
                                                />
                                            </div>
                                            <p className="mt-1.5 text-xs text-muted-foreground">{COLLECTOR_HINT[charge.collected_by ?? ""] ?? COLLECTOR_HINT[""]}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <button type="button" className={addButton} onClick={() => setCharges(prev => [...prev, { charge_type: "CONDOMINIUM", label: "", responsibility: "TENANT", amount: "", adjustment_index: "", adjustment_notes: "", adjusts_with_rent: false, collected_by: "" }])}>
                            <Plus className="h-4 w-4" /> Adicionar encargo
                        </button>
                    </Section>

                    {/* ── 6. Notes ─────────────────────────────────── */}
                    <Section n={6} tone="slate" icon={<PenLine className="h-4 w-4" />} title="Observações" description="Notas internas: só você vê.">
                        <div id="field-notes">
                            <textarea
                                className={cn(control, "h-auto min-h-[96px] py-2")}
                                value={form.notes}
                                onChange={e => updateForm("notes", e.target.value)}
                                placeholder="Combinados, multas, detalhes da vistoria…"
                            />
                        </div>
                    </Section>

                    {editingId && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" /> Os arquivos do contrato (PDF assinado, aditivos, vistoria) ficam no painel do contrato.
                        </p>
                    )}
                </div>

                {/* ── Summary and actions: beside the form on a wide screen (sticky), after it on a phone ── */}
                <aside className="space-y-4 lg:sticky lg:top-4">
                    <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resumo do contrato</h2>
                        <dl className="mt-3 space-y-2.5 text-sm">
                            <SummaryRow label="Imóvel" value={summary.place} />
                            <SummaryRow label="Inquilino" value={summary.tenant ? <Sensitive>{summary.tenant}</Sensitive> : null} />
                            <SummaryRow
                                label="Prazo"
                                value={summary.start ? <>{formatDateOnlyBR(summary.start)} → {summary.end ? formatDateOnlyBR(summary.end) : "indeterminado"}{summary.months !== null && <span className="text-muted-foreground"> · {summary.months} meses</span>}</> : null}
                            />
                            <SummaryRow label="Gestão" value={summary.manager} />
                            <SummaryRow label="Reajuste" value={summary.index ? <>{summary.index}{form.next_adjustment_date && <span className="text-muted-foreground"> · {form.next_adjustment_date}</span>}</> : null} />
                        </dl>
                        <div className="mt-4 rounded-xl bg-emerald-500/[0.07] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">O inquilino paga por mês</p>
                            <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground"><Money>{brl(summary.rent + summary.fixed)}</Money></p>
                            <p className="text-xs text-muted-foreground">
                                aluguel <Money>{brl(summary.rent)}</Money>{summary.fixed > 0 && <> + encargos <Money>{brl(summary.fixed)}</Money></>}
                                {summary.dueDay && <> · vence dia {summary.dueDay}</>}
                            </p>
                        </div>
                        <div className="mt-4">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-foreground">Obrigatórios</span>
                                <span className="tabular-nums text-muted-foreground">{stepsDone} de {summary.steps.length}</span>
                            </div>
                            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                                <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(stepsDone / summary.steps.length) * 100}%` }} />
                            </span>
                            <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                {summary.steps.map(s => (
                                    <li key={s.label} className={cn("flex items-center gap-1.5", s.done ? "text-foreground" : "text-muted-foreground")}>
                                        {s.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 shrink-0" />}
                                        {s.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Button onClick={() => handleSave(false)} disabled={saving} className="h-11">
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {editingId ? "Salvar alterações" : "Salvar contrato"}
                        </Button>
                        {!editingId && (
                            <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
                                <FileText className="mr-2 h-4 w-4" /> Salvar como rascunho
                            </Button>
                        )}
                        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
                    </div>
                </aside>
            </div>
        </div>
    );
}

// ── Building blocks ──────────────────────────────────────────────────

/** Every select and textarea of the form: the input's border colour (a bare `border` would be black), its height and focus. */
const control = "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-colors focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50";
/** The shared Input, brought to the selects' size. */
const inputCls = "h-10 rounded-lg text-sm";
const addButton = "inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-emerald-400 hover:bg-emerald-500/5 hover:text-foreground";

const STATUS_OPTIONS: { value: LeaseStatus; label: string }[] = [
    { value: "ACTIVE", label: "Ativo" },
    { value: "DRAFT", label: "Rascunho" },
    { value: "EXPIRED", label: "Encerrado" },
    { value: "CANCELLED", label: "Cancelado" },
];
const STATUS_HINT: Partial<Record<LeaseStatus, string>> = {
    ACTIVE: "Em vigor. Se o prazo passar, segue vigente (prazo indeterminado) até ser encerrado ou rescindido.",
    DRAFT: "Ainda não vale: fica em Rascunhos.",
    EXPIRED: "Já terminou: entra no histórico (Encerrados), sem contar como vigente.",
    CANCELLED: "Não chegou a valer.",
    TERMINATED: "Rescindido antes do prazo.",
};

/** One colour per section, the hub's palette: full class names (Tailwind reads them here). */
const SECTION_TONE = {
    violet: "bg-violet-500/15 text-violet-600",
    emerald: "bg-emerald-500/15 text-emerald-600",
    indigo: "bg-indigo-500/15 text-indigo-600",
    amber: "bg-amber-500/15 text-amber-600",
    sky: "bg-sky-500/15 text-sky-600",
    slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
} as const;

/** A numbered part of the form, always open. */
function Section({ n, tone, icon, title, description, children }: { n: number; tone: keyof typeof SECTION_TONE; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-border bg-card shadow-xs">
            <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
                <span className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-xl", SECTION_TONE[tone])}>
                    {icon}
                    <span className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-foreground text-[10px] font-bold text-background">{n}</span>
                </span>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </header>
            <div className="space-y-4 p-4 sm:p-5">{children}</div>
        </section>
    );
}

/** A label, the control, then its error or its hint. `id` keeps the `field-<name>` anchor the validation scrolls to. */
function Field({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
    return (
        <div id={`field-${id}`}>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {label}{required && <span className="text-rose-500"> *</span>}
            </Label>
            {children}
            {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

/** Buttons side by side, one chosen: the status, the charge's issuer. */
function Segmented({ options, value, onChange, tone, size = "md" }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; tone: "emerald" | "sky"; size?: "sm" | "md" }) {
    const on = tone === "emerald" ? "bg-emerald-600 text-white" : "bg-sky-600 text-white";
    return (
        <div role="radiogroup" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-background p-1">
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn("rounded-lg font-medium transition-colors", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm", value === o.value ? on : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/** One line of the summary: the label, then the value or a dash. */
function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn("min-w-0 break-words text-sm", value ? "font-medium text-foreground" : "text-muted-foreground")}>{value ?? "—"}</dd>
        </div>
    );
}
