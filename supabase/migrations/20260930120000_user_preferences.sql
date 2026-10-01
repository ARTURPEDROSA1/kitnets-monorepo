-- Sidebar preferences follow the user across devices: the menu groups they collapsed (Operação,
-- Contábil & Fiscal, Ferramentas, Configurações) are saved here and applied again on the next
-- sign-in on any device. localStorage keeps a copy for the first paint (components/Sidebar.tsx,
-- lib/sidebar-preferences.ts); the route app/api/user-preferences syncs the two. One row per
-- profile; the service role reads and writes it after Clerk authentication, like every other table.
CREATE TABLE IF NOT EXISTS public.user_preferences (
    owner_id                 UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    sidebar_collapsed_groups TEXT[] NOT NULL DEFAULT '{}',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_preferences IS 'Per-user interface preferences that follow the user across devices (one row per profile).';
COMMENT ON COLUMN public.user_preferences.sidebar_collapsed_groups IS 'Keys of the sidebar menu groups the user collapsed (operacao, contabil, ferramentas, configuracoes); empty = all expanded.';

DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trg_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW EXECUTE FUNCTION public.set_property_income_months_updated_at();

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_preferences FROM anon, authenticated;
