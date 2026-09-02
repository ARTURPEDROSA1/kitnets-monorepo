"use client";

import React from 'react';
import {
    User,
    Phone,
    Mail,
    MapPin,
    Building2,
    Home,
    Calendar,
    Shield,
    FileText,
    AlertTriangle,
    Pencil,
    Trash2,
    ExternalLink,
} from 'lucide-react';
import { Button } from '@kitnets/ui';
import { Badge } from '@/components/ui/badge';
import type { TenantWithDetails } from '@/types/tenant';
import { formatCPF, formatPhone, formatCEP } from '@/lib/validators';

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
        return new Intl.DateTimeFormat('pt-BR').format(new Date(dateStr));
    } catch {
        return dateStr;
    }
}

function getStatusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    switch (status) {
        case 'ACTIVE':
            return { label: 'Ativo', variant: 'default' };
        case 'FUTURE':
            return { label: 'Futuro Inquilino', variant: 'outline' };
        case 'FORMER':
            return { label: 'Ex-Inquilino', variant: 'secondary' };
        default:
            return { label: status, variant: 'outline' };
    }
}

function getManagementLabel(type: string): string {
    switch (type) {
        case 'SELF_MANAGED':
            return 'Gestão própria (proprietário)';
        case 'AGENCY':
            return 'Imobiliária';
        default:
            return type;
    }
}

function maskCPFDisplay(cpf: string): string {
    const formatted = formatCPF(cpf);
    if (formatted.length === 14) {
        // 123.456.789-01 → ***.456.789-**
        return `***.${formatted.slice(4, 11)}-**`;
    }
    return formatted;
}

// ── Component ────────────────────────────────────────────────────────

interface TenantProfileCardProps {
    tenant: TenantWithDetails;
    lang: string;
    onEdit: () => void;
    onDelete: () => void;
}

export default function TenantProfileCard({ tenant, lang, onEdit, onDelete }: TenantProfileCardProps) {
    const status = getStatusLabel(tenant.status);

    const hasAddress = tenant.street || tenant.city || tenant.state;
    const addressParts = [
        [tenant.street, tenant.street_number].filter(Boolean).join(', '),
        tenant.address_complement,
        tenant.neighborhood,
        [tenant.city, tenant.state].filter(Boolean).join('/'),
        tenant.postal_code ? formatCEP(tenant.postal_code) : null,
    ].filter(Boolean);

    return (
        <div className="space-y-6">
            {/* ── Actions ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <Badge variant={status.variant} className="text-sm">
                    {status.label}
                </Badge>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <Pencil className="w-4 h-4 mr-1.5" />
                        Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={onDelete}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30">
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Excluir
                    </Button>
                </div>
            </div>

            {/* ── Personal Information ────────────────────────────────── */}
            <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Informações Pessoais
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow label="Nome completo" value={tenant.full_name} />
                    <InfoRow label="CPF" value={formatCPF(tenant.cpf)} />
                    <InfoRow label="E-mail" value={tenant.email} href={`mailto:${tenant.email}`} />
                    <InfoRow label="Telefone principal" value={formatPhone(tenant.main_phone)} />
                    {tenant.additional_phone && (
                        <InfoRow label="Telefone adicional" value={formatPhone(tenant.additional_phone)} />
                    )}
                    {tenant.date_of_birth && (
                        <InfoRow label="Data de nascimento" value={formatDate(tenant.date_of_birth)} />
                    )}
                    {tenant.rg && (
                        <InfoRow label="RG" value={tenant.rg} />
                    )}
                </div>
            </div>

            {/* ── Address ─────────────────────────────────────────────── */}
            {(hasAddress || tenant.use_property_address) && (
                <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Endereço Atual
                    </h3>
                    {tenant.use_property_address ? (
                        <p className="text-sm text-muted-foreground italic">
                            Mesmo endereço do imóvel alugado
                        </p>
                    ) : (
                        <p className="text-sm text-foreground">
                            {addressParts.join(' — ') || '—'}
                        </p>
                    )}
                </div>
            )}

            {/* ── Property Association ────────────────────────────────── */}
            <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Home className="w-4 h-4" />
                    Imóvel Associado
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground font-medium">
                        {tenant.property_name || 'Imóvel não encontrado'}
                    </span>
                    {/* Future: link to property page */}
                </div>
            </div>

            {/* ── Management ──────────────────────────────────────────── */}
            <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Gestão
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow label="Tipo de gestão" value={getManagementLabel(tenant.management_type)} />
                    {tenant.management_type === 'AGENCY' && (
                        <>
                            <InfoRow label="Imobiliária" value={tenant.agency_name || '—'} />
                            {tenant.agent_name && (
                                <InfoRow label="Corretor" value={tenant.agent_name} />
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Rental Information ──────────────────────────────────── */}
            <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Informações de Ocupação
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow label="Data de entrada" value={formatDate(tenant.move_in_date)} />
                    <InfoRow label="Data de saída" value={formatDate(tenant.move_out_date)} />
                </div>

                {/* Linked Lease placeholder */}
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span>Nenhum contrato vinculado</span>
                    {/* Future: when lease module exists, show "Contrato → Ver Contrato" link */}
                </div>
            </div>

            {/* ── Emergency Contact ───────────────────────────────────── */}
            {(tenant.emergency_contact_name || tenant.emergency_contact_phone) && (
                <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Contato de Emergência
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {tenant.emergency_contact_name && (
                            <InfoRow label="Nome" value={tenant.emergency_contact_name} />
                        )}
                        {tenant.emergency_contact_phone && (
                            <InfoRow label="Telefone" value={formatPhone(tenant.emergency_contact_phone)} />
                        )}
                    </div>
                </div>
            )}

            {/* ── Notes ───────────────────────────────────────────────── */}
            {tenant.notes && (
                <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Observações
                    </h3>
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded-lg p-3">
                        {tenant.notes}
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Info Row Component ───────────────────────────────────────────────

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
    return (
        <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            {href ? (
                <a
                    href={href}
                    className="text-sm text-primary hover:underline"
                    target={href.startsWith('mailto:') ? undefined : '_blank'}
                    rel="noopener noreferrer"
                >
                    {value}
                </a>
            ) : (
                <p className="text-sm text-foreground font-medium">{value}</p>
            )}
        </div>
    );
}
