-- The sidebar's collapsed groups move into user_ui_preferences, the table the interface already uses
-- for the per-user choices that follow the user across devices (hidden columns, sorts, filters),
-- under the key `sidebar:collapsed-groups` (a JSON array of group keys, lib/sidebar-groups.ts).
-- Migration 20260930120000 had given them a table of their own: its rows are carried over and the
-- table goes. Route: app/api/profiles/preferences (the `sidebar` section).
DO $$
BEGIN
    IF to_regclass('public.user_preferences') IS NOT NULL THEN
        INSERT INTO public.user_ui_preferences (profile_id, key, value, updated_at)
        SELECT owner_id, 'sidebar:collapsed-groups', to_jsonb(sidebar_collapsed_groups), updated_at
        FROM public.user_preferences
        ON CONFLICT (profile_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

        DROP TABLE public.user_preferences;
    END IF;
END $$;
