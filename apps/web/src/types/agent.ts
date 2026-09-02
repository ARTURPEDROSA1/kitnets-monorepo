// ── Agent (Corretor) Types ────────────────────────────────────────────

export type AgentType = 'AUTONOMO' | 'IMOBILIARIA';
export type AgentStatus = 'ACTIVE' | 'INACTIVE';

export interface Agent {
    id: string;
    user_id: string;

    // Personal
    full_name: string;
    cpf: string | null;
    photo_url: string | null;

    // Professional
    creci_number: string;
    creci_state: string;

    // Type & Agency
    agent_type: AgentType;
    agency_id: string | null;

    // Contact
    main_phone: string;                   // E.164
    additional_phone: string | null;
    whatsapp_phone: string | null;        // E.164
    email: string | null;
    website: string | null;

    // Extra
    notes: string | null;

    // Status & timestamps
    status: AgentStatus;
    created_at: string;
    updated_at: string;
}

/** Agent returned by GET /api/agents — includes joined agency name */
export interface AgentWithAgency extends Agent {
    agency_name: string | null;
}

/** Form data for creating/editing an agent (excludes server-managed fields) */
export interface AgentFormData {
    full_name: string;
    cpf: string;
    creci_number: string;
    creci_state: string;
    agent_type: AgentType;
    agency_id: string;                    // '' when autonomous
    main_phone: string;
    additional_phone: string;
    whatsapp_phone: string;
    email: string;
    website: string;
    notes: string;
    status: AgentStatus;
}
