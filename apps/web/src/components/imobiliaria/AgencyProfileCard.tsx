"use client";

import React from 'react';
import {
    Building2,
    Phone,
    Mail,
    Globe,
    MapPin,
    Shield,
    Edit3,
    ExternalLink,
    MessageCircle,
    Trash2,
} from 'lucide-react';
import { Button } from '@kitnets/ui';
import { Badge } from '@/components/ui/badge';
import type { AgencyWithRole } from '@/types/agency';
import {
    formatCNPJ,
    formatPhone,
    formatCEP,
    BRAZILIAN_STATES,
} from '@/lib/validators';

interface AgencyProfileCardProps {
    agency: AgencyWithRole;
    onEdit: () => void;
    onDelete?: () => void;
}

function getStatusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    switch (status) {
        case 'ACTIVE':
            return { label: 'Cadastro Ativo', variant: 'default' };
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

function getStateName(code: string): string {
    return BRAZILIAN_STATES.find(s => s.code === code)?.name || code;
}

export default function AgencyProfileCard({ agency, onEdit, onDelete }: AgencyProfileCardProps) {
    const status = getStatusLabel(agency.status);
    const canEdit = agency.role === 'OWNER' || agency.role === 'ADMIN';
    const canDelete = agency.role === 'OWNER';

    const fullAddress = [
        agency.street,
        agency.street_number,
        agency.address_complement,
    ].filter(Boolean).join(', ');

    const cityState = [
        agency.neighborhood,
        agency.city,
        `${agency.state}`,
    ].filter(Boolean).join(' — ');

    return (
        <div>
            {/* Header Card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                {/* Top gradient bar */}
                <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />

                <div className="p-6 sm:p-8">
                    {/* Agency Name + Status */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                        <div className="flex items-start gap-4">
                            {/* Logo placeholder */}
                            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                {agency.logo_url ? (
                                    <img
                                        src={agency.logo_url}
                                        alt={`Logo ${agency.name}`}
                                        className="w-16 h-16 rounded-xl object-cover"
                                    />
                                ) : (
                                    <Building2 className="w-8 h-8 text-primary" />
                                )}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-foreground">{agency.name}</h2>
                                {agency.trade_name && (
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {agency.trade_name}
                                    </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <Badge variant={status.variant}>{status.label}</Badge>
                                    <Badge variant="outline">{getRoleLabel(agency.role)}</Badge>
                                </div>
                            </div>
                        </div>

                        {(canEdit || canDelete) && (
                            <div className="flex items-center gap-2 shrink-0">
                                {canEdit && (
                                    <Button variant="outline" size="sm" onClick={onEdit}>
                                        <Edit3 className="w-4 h-4 mr-2" />
                                        Editar dados
                                    </Button>
                                )}
                                {canDelete && onDelete && (
                                    <Button variant="outline" size="sm" onClick={onDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Excluir
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Business Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Dados da empresa
                            </h3>

                            {agency.cnpj && (
                                <div className="flex items-start gap-3">
                                    <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">CNPJ</p>
                                        <p className="text-sm font-medium text-foreground font-mono">
                                            {formatCNPJ(agency.cnpj)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {agency.creci_number && (
                                <div className="flex items-start gap-3">
                                    <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">CRECI</p>
                                        <p className="text-sm font-medium text-foreground">
                                            {agency.creci_number}
                                            {agency.creci_state && ` — ${agency.creci_state}`}
                                            {agency.creci_type && ` (${agency.creci_type})`}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {agency.owner_name && (
                                <div className="flex items-start gap-3">
                                    <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Responsável legal</p>
                                        <p className="text-sm font-medium text-foreground">{agency.owner_name}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Contato
                            </h3>

                            <div className="flex items-start gap-3">
                                <Phone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">
                                        Telefone principal
                                        {agency.main_phone_whatsapp && (
                                            <span className="inline-flex items-center gap-1 ml-1.5 text-green-600 dark:text-green-400">
                                                <MessageCircle className="w-3 h-3" />
                                                WhatsApp
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-sm font-medium text-foreground">
                                        {formatPhone(agency.main_phone)}
                                    </p>
                                </div>
                            </div>

                            {agency.additional_phone && (
                                <div className="flex items-start gap-3">
                                    <Phone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">
                                            Telefone adicional
                                            {agency.additional_phone_whatsapp && (
                                                <span className="inline-flex items-center gap-1 ml-1.5 text-green-600 dark:text-green-400">
                                                    <MessageCircle className="w-3 h-3" />
                                                    WhatsApp
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-sm font-medium text-foreground">
                                            {formatPhone(agency.additional_phone)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {agency.email && (
                                <div className="flex items-start gap-3">
                                    <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">E-mail</p>
                                        <a href={`mailto:${agency.email}`} className="text-sm font-medium text-primary hover:underline">
                                            {agency.email}
                                        </a>
                                    </div>
                                </div>
                            )}

                            {agency.website && (
                                <div className="flex items-start gap-3">
                                    <Globe className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Website</p>
                                        <a
                                            href={agency.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                                        >
                                            {agency.website.replace(/^https?:\/\//, '')}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Address */}
                    <div className="mt-6 pt-6 border-t border-border">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Endereço
                        </h3>
                        <div className="flex items-start gap-3">
                            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm text-foreground">{fullAddress}</p>
                                <p className="text-sm text-foreground">{cityState}</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    CEP: {formatCEP(agency.postal_code)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    {agency.description && (
                        <div className="mt-6 pt-6 border-t border-border">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Sobre
                            </h3>
                            <p className="text-sm text-foreground whitespace-pre-line">
                                {agency.description}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
