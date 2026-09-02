"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
    Home,
    Users,
    Calendar,
    DollarSign,
    Building2,
    TrendingUp,
    Zap,
    FileText,
    PenLine,
    Clock,
    Ban,
    User,
} from 'lucide-react';
import type {
    LeaseWithDetails,
    LeaseAgencyOption,
    LeaseAgentOption,
} from '@/types/lease';

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
        return new Intl.DateTimeFormat('pt-BR').format(new Date(dateStr));
    } catch {
        return dateStr;
    }
}

function formatCurrency(value: number | null): string {
    if (value === null || value === undefined) return '—';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getStatusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    switch (status) {
        case 'ACTIVE': return { label: 'Ativo', variant: 'default' };
        case 'DRAFT': return { label: 'Rascunho', variant: 'outline' };
        case 'EXPIRING_SOON': return { label: 'Vencendo em breve', variant: 'secondary' };
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

function getChargeLabel(type: string): string {
    const map: Record<string, string> = {
        CONDOMINIUM: 'Condomínio',
        IPTU: 'IPTU',
        WATER: 'Água',
        ELECTRICITY: 'Energia Elétrica',
        GAS: 'Gás',
        INTERNET: 'Internet',
        OTHER: 'Outro',
    };
    return map[type] || type;
}

function getResponsibilityLabel(resp: string): string {
    switch (resp) {
        case 'TENANT': return 'Inquilino';
        case 'LANDLORD': return 'Proprietário';
        case 'INCLUDED': return 'Incluso no aluguel';
        default: return resp;
    }
}

function getDocTypeLabel(type: string): string {
    const map: Record<string, string> = {
        CONTRACT: 'Contrato',
        ADDENDUM: 'Aditivo',
        INSPECTION: 'Laudo de Vistoria',
        TENANT_DOC: 'Documento do Inquilino',
        DEPOSIT_RECEIPT: 'Recibo de Caução',
        OTHER: 'Outro',
    };
    return map[type] || type;
}

function getAdjustmentLabel(index: string | null): string {
    if (!index) return '—';
    const map: Record<string, string> = {
        IPCA: 'IPCA',
        IGP_M: 'IGP-M',
        INPC: 'INPC',
        IVAR: 'IVAR',
        CUSTOM: 'Personalizado',
        NONE: 'Sem reajuste',
    };
    return map[index] || index;
}

function getRoleLabel(role: string): string {
    switch (role) {
        case 'CO_TENANT': return 'Co-inquilino';
        case 'OCCUPANT': return 'Ocupante';
        default: return role;
    }
}

// ── Component ────────────────────────────────────────────────────────

export default function LeaseProfileCard({
    lease,
    agencies,
    agents,
}: {
    lease: LeaseWithDetails;
    agencies: LeaseAgencyOption[];
    agents: LeaseAgentOption[];
}) {
    const statusInfo = getStatusLabel(lease.status);

    return (
        <div className="space-y-6 p-4 sm:p-6">
            {/* ── Summary Header ──────────────────────────────────── */}
            <div className="rounded-lg bg-primary/5 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                        <Home className="h-4 w-4" /> {lease.property_name || '—'}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                        <User className="h-4 w-4" /> {lease.primary_tenant_name || '—'}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="flex items-center gap-1 font-semibold text-primary">
                        <DollarSign className="h-4 w-4" /> {formatCurrency(lease.monthly_rent)}
                    </span>
                    <span className="text-muted-foreground">• Venc. dia {lease.rent_due_day}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                        {formatDate(lease.start_date)}
                        {lease.end_date ? ` — ${formatDate(lease.end_date)}` : ' — Indeterminado'}
                    </span>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
                {lease.reference_name && (
                    <p className="mt-1 text-xs text-muted-foreground">Ref: {lease.reference_name}</p>
                )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* ── Property & Tenants ───────────────────────────── */}
                <Section title="Imóvel & Inquilinos" icon={<Home className="h-4 w-4" />}>
                    <InfoRow label="Imóvel" value={lease.property_name} />
                    <InfoRow label="Inquilino Principal" value={lease.primary_tenant_name} />
                    {lease.additional_tenants && lease.additional_tenants.length > 0 && (
                        <div className="mt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Inquilinos Adicionais:</p>
                            {lease.additional_tenants.map(t => (
                                <div key={t.id} className="flex items-center gap-2 text-sm py-0.5">
                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{t.tenant_name || '—'}</span>
                                    <Badge variant="outline" className="text-xs">{getRoleLabel(t.role)}</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                {/* ── Lease Terms ──────────────────────────────────── */}
                <Section title="Termos do Contrato" icon={<Calendar className="h-4 w-4" />}>
                    <InfoRow label="Início" value={formatDate(lease.start_date)} />
                    <InfoRow label="Término" value={lease.end_date ? formatDate(lease.end_date) : 'Indeterminado'} />
                    <InfoRow label="Aluguel Mensal" value={formatCurrency(lease.monthly_rent)} highlight />
                    <InfoRow label="Dia de Vencimento" value={`Dia ${lease.rent_due_day}`} />
                    {lease.security_deposit && (
                        <InfoRow label="Caução" value={formatCurrency(lease.security_deposit)} />
                    )}
                    {lease.deposit_months && (
                        <InfoRow label="Meses de Caução" value={`${lease.deposit_months} meses`} />
                    )}
                    <InfoRow label="Status" value={<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>} />
                </Section>

                {/* ── Management ───────────────────────────────────── */}
                <Section title="Administração" icon={<Building2 className="h-4 w-4" />}>
                    <InfoRow label="Tipo de Gestão" value={getManagementLabel(lease.management_type)} />
                    {lease.agency_name && <InfoRow label="Imobiliária" value={lease.agency_name} />}
                    {lease.agent_name && <InfoRow label="Corretor" value={lease.agent_name} />}
                </Section>

                {/* ── Rent Adjustment ──────────────────────────────── */}
                <Section title="Reajuste" icon={<TrendingUp className="h-4 w-4" />}>
                    <InfoRow label="Índice" value={getAdjustmentLabel(lease.adjustment_index)} />
                    {lease.adjustment_frequency && (
                        <InfoRow label="Frequência" value={`A cada ${lease.adjustment_frequency} meses`} />
                    )}
                    {lease.next_adjustment_date && (
                        <InfoRow label="Próximo Reajuste" value={formatDate(lease.next_adjustment_date)} />
                    )}
                    {!lease.adjustment_index && (
                        <p className="text-xs text-muted-foreground italic">Nenhum reajuste configurado.</p>
                    )}
                </Section>
            </div>

            {/* ── Additional Charges ───────────────────────────────── */}
            {lease.charges && lease.charges.length > 0 && (
                <Section title="Encargos Adicionais" icon={<Zap className="h-4 w-4" />}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                    <th className="pb-2 pr-4">Tipo</th>
                                    <th className="pb-2 pr-4">Responsabilidade</th>
                                    <th className="pb-2">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lease.charges.map(c => (
                                    <tr key={c.id} className="border-b border-border/50">
                                        <td className="py-2 pr-4 font-medium">
                                            {c.charge_type === 'OTHER' && c.label ? c.label : getChargeLabel(c.charge_type)}
                                        </td>
                                        <td className="py-2 pr-4">{getResponsibilityLabel(c.responsibility)}</td>
                                        <td className="py-2">{c.amount ? formatCurrency(c.amount) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            )}

            {/* ── Documents ───────────────────────────────────────── */}
            {lease.documents && lease.documents.length > 0 && (
                <Section title="Documentos" icon={<FileText className="h-4 w-4" />}>
                    <div className="space-y-2">
                        {lease.documents.map(doc => (
                            <a
                                key={doc.id}
                                href={doc.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-accent transition"
                            >
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="flex-1 truncate font-medium">{doc.file_name}</span>
                                <Badge variant="outline" className="text-xs shrink-0">
                                    {getDocTypeLabel(doc.document_type)}
                                </Badge>
                            </a>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Termination Info ─────────────────────────────────── */}
            {lease.status === 'TERMINATED' && (
                <Section title="Rescisão" icon={<Ban className="h-4 w-4 text-red-500" />}>
                    <InfoRow label="Data de Rescisão" value={formatDate(lease.termination_date)} />
                    {lease.termination_reason && (
                        <InfoRow label="Motivo" value={lease.termination_reason} />
                    )}
                </Section>
            )}

            {/* ── Notes ───────────────────────────────────────────── */}
            {lease.notes && (
                <Section title="Observações" icon={<PenLine className="h-4 w-4" />}>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{lease.notes}</p>
                </Section>
            )}

            {/* ── Timestamps ──────────────────────────────────────── */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Criado em: {formatDate(lease.created_at)}
                </span>
                <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Atualizado em: {formatDate(lease.updated_at)}
                </span>
            </div>
        </div>
    );
}

// ── Sub-components ───────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                {icon} {title}
            </h4>
            <div className="space-y-1.5">
                {children}
            </div>
        </div>
    );
}

function InfoRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-2 text-sm">
            <span className="text-muted-foreground shrink-0">{label}</span>
            <span className={`text-right ${highlight ? 'font-semibold text-primary' : 'text-foreground'}`}>
                {value || '—'}
            </span>
        </div>
    );
}
