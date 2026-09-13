-- Shared rate-limit store.
--
-- apps/web/src/lib/rate-limit.ts used to count requests in process memory,
-- which on Vercel means one counter per warm instance, reset on every cold
-- start: effectively no limit. Before sign-ups open, the counters move here so
-- every instance sees the same numbers.
--
-- Fixed window per key. One call = one atomic UPSERT that either starts a new
-- window or increments the current one, and reports whether the caller is
-- still under the limit. Only the service role may call it; the table itself
-- is unreachable through the API.

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key        text        PRIMARY KEY,
    hits       integer     NOT NULL DEFAULT 0,
    reset_at   timestamptz NOT NULL
);

COMMENT ON TABLE public.rate_limits IS
    'Fixed-window request counters keyed by scope:subject. Written only by rate_limit_hit().';

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: nothing but the definer functions below touches it.
REVOKE ALL ON TABLE public.rate_limits FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx ON public.rate_limits (reset_at);

-- Counts one hit for p_key inside a window of p_window_ms milliseconds.
-- Returns allowed (hits <= p_limit), how many hits remain, and when the window
-- resets. Concurrency-safe: the UPSERT takes the row lock.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_ms integer)
RETURNS TABLE (allowed boolean, remaining integer, resets_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH hit AS (
        INSERT INTO public.rate_limits AS r (key, hits, reset_at)
        VALUES (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
        ON CONFLICT (key) DO UPDATE
            SET hits     = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.hits + 1 END,
                reset_at = CASE WHEN r.reset_at <= now()
                                THEN now() + make_interval(secs => p_window_ms / 1000.0)
                                ELSE r.reset_at END
        RETURNING r.hits, r.reset_at
    )
    SELECT hits <= p_limit, GREATEST(0, p_limit - hits), reset_at FROM hit;
$$;

-- Drops windows that expired more than a day ago. The app calls this
-- occasionally (about one call in 500); the table never grows past the number
-- of distinct keys seen in the last day.
CREATE OR REPLACE FUNCTION public.rate_limits_prune()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH gone AS (
        DELETE FROM public.rate_limits
        WHERE reset_at < now() - interval '1 day'
        RETURNING 1
    )
    SELECT count(*)::integer FROM gone;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limits_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limits_prune() TO service_role;
