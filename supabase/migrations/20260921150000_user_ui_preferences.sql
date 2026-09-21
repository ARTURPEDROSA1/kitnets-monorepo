-- Interface preferences kept in the user's account, so they follow the user to any device.
--
-- First use: the columns a user hides in a table (right-click on a header → "Ocultar"), remembered per
-- table and per kind of property, e.g. `hidden-columns:income-ledger:multi` (a property rented unit by
-- unit) and `hidden-columns:income-ledger:single` (a property rented as a whole). `value` is a JSON array
-- of column keys. Until now the choice lived only in the browser's localStorage.
--
-- One row per user and key. Read and written by the API with the service role, always filtered by the
-- signed-in user's profile: RLS is on with no policies, like the other server-only tables.

CREATE TABLE IF NOT EXISTS public.user_ui_preferences (
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, key)
);

ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_ui_preferences IS 'Per-user interface preferences (e.g. hidden table columns), synced across devices. Service role only.';
