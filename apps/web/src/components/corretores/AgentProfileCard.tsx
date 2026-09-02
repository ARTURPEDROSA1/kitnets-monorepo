"use client";

import React from 'react';
import {
    User,
    Phone,
    Mail,
    Globe,
    Shield,
    Edit3,
    ExternalLink,
    MessageCircle,
    Trash2,
    Building2,
    FileText,
} from 'lucide-react';
import { Button } from '@kitnets/ui';
import { Badge } from '@/components/ui/badge';
import type { AgentWithAgency } from '@/types/agent';
import {
    formatPhone,
    formatCPF,
    formatCRECI,
} from '@/lib/validators';

interface AgentProfileCardProps {
    agent: AgentWithAgency;
    onEdit: () => void;
    onDelete?: () => void;
    onToggleStatus?: () => void;
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

export default function AgentProfileCard({ agent, onEdit, onDelete, onToggleStatus }: AgentProfileCardProps) {
    const status = getStatusLabel(agent.status);

    return (
        <div>
            {/* Header Card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                {/* Top gradient bar */}
                <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />

                <div className="p-6 sm:p-8">
                    {/* Agent Name + Status */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                        <div className="flex items-start gap-4">
                            {/* Photo */}
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                                {agent.photo_url ? (
                                    <img
                                        src={agent.photo_url}
                                        alt={`Foto ${agent.full_name}`}
                                        className="w-16 h-16 rounded-full object-cover"
                                    />
                                ) : (
                                    <User className="w-8 h-8 text-primary" />
                                )}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-foreground">{agent.full_name}</h2>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    {formatCRECI(agent.creci_number, agent.creci_state)}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <Badge variant={status.variant}>{status.label}</Badge>
                                    <Badge variant="outline">
                                        {agent.agent_type === 'AUTONOMO'
                                            ? 'Corretor(a) Autônomo(a)'
                                            : agent.agency_name || 'Imobiliária'}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <Button variant="outline" size="sm" onClick={onEdit}>
                                <Edit3 className="w-4 h-4 mr-2" />
                                Editar dados
                            </Button>
                            {onToggleStatus && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onToggleStatus}
                                    className={agent.status === 'ACTIVE'
                                        ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                                        : 'text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30 border-green-200 dark:border-green-800'
                                    }
                                >
                                    {agent.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                                </Button>
                            )}
                            {onDelete && (
                                <Button variant="outline" size="sm" onClick={onDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Professional Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Dados profissionais
                            </h3>

                            <div className="flex items-start gap-3">
                                <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">CRECI</p>
                                    <p className="text-sm font-medium text-foreground">
                                        {formatCRECI(agent.creci_number, agent.creci_state)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Tipo de atuação</p>
                                    <p className="text-sm font-medium text-foreground">
                                        {agent.agent_type === 'AUTONOMO'
                                            ? 'Corretor(a) Autônomo(a)'
                                            : agent.agency_name
                                                ? `Trabalha na ${agent.agency_name}`
                                                : 'Vinculado(a) a imobiliária (removida)'}
                                    </p>
                                </div>
                            </div>

                            {agent.cpf && (
                                <div className="flex items-start gap-3">
                                    <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">CPF</p>
                                        <p className="text-sm font-medium text-foreground font-mono">
                                            {formatCPF(agent.cpf)}
                                        </p>
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
                                    <p className="text-xs text-muted-foreground">Telefone principal</p>
                                    <p className="text-sm font-medium text-foreground">
                                        {formatPhone(agent.main_phone)}
                                    </p>
                                </div>
                            </div>

                            {agent.additional_phone && (
                                <div className="flex items-start gap-3">
                                    <Phone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Telefone adicional</p>
                                        <p className="text-sm font-medium text-foreground">
                                            {formatPhone(agent.additional_phone)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {agent.whatsapp_phone && (
                                <div className="flex items-start gap-3">
                                    <MessageCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">WhatsApp</p>
                                        <a
                                            href={`https://wa.me/${agent.whatsapp_phone.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium text-green-600 dark:text-green-400 hover:underline"
                                        >
                                            {formatPhone(agent.whatsapp_phone)}
                                        </a>
                                    </div>
                                </div>
                            )}

                            {agent.email && (
                                <div className="flex items-start gap-3">
                                    <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">E-mail</p>
                                        <a href={`mailto:${agent.email}`} className="text-sm font-medium text-primary hover:underline">
                                            {agent.email}
                                        </a>
                                    </div>
                                </div>
                            )}

                            {agent.website && (
                                <div className="flex items-start gap-3">
                                    <Globe className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Website / Perfil profissional</p>
                                        <a
                                            href={agent.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                                        >
                                            {agent.website.replace(/^https?:\/\//, '')}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Notes */}
                    {agent.notes && (
                        <div className="mt-6 pt-6 border-t border-border">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Observações
                            </h3>
                            <p className="text-sm text-foreground whitespace-pre-line">
                                {agent.notes}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
