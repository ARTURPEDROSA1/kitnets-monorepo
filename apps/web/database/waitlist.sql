
-- Tabela para leads da lista de espera (Waitlist Wizard)

create table if not exists public.waitlist_leads (
    id uuid not null default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    
    -- Perfil
    profile_type text not null, -- 'pf', 'pj', 'imobiliaria'
    
    -- Identidade
    cpf text,
    cnpj text,
    business_name text, -- Razão Social (future use)
    trade_name text,     -- Nome Fantasia (future use)
    
    -- Portfolio
    portfolio_size text,
    
    -- Localização
    city text,
    state text,
    
    -- Contato
    name text not null,
    email text not null,
    whatsapp text,
    
    -- Meta
    status text default 'pending', -- pending, approved, invited
    source text default 'waitlist_wizard',
    
    constraint waitlist_leads_pkey primary key (id)
);

-- RLS Policies (Security)
alter table public.waitlist_leads enable row level security;

-- Allow anonymous inserts (anyone can join the waitlist)
create policy "Allow anonymous inserts"
    on public.waitlist_leads
    for insert
    to anon, authenticated
    with check (true);

-- Only admins/service_role can view data (protected)
-- No select policy for anon means they can't read it back, which is good for privacy.
