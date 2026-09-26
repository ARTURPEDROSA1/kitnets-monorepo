-- Geocoder results for the dashboard map (rental properties, projects, agencies), keyed by the
-- normalized address (apps/web/src/lib/geocode.ts, normalizeAddressKey) rather than by entity:
-- a property that lives only in the owner's profile JSON has no row of its own, and
-- properties.address is a one-time copy the Imóveis page never updates. An edited address is
-- simply a new key; the old row stays harmless. No owner column: an address alone is not
-- personal data, and the same agency registered by two accounts is geocoded once.
-- Written only by the service role (lib/geocode-server.ts). RLS on, no policies.
CREATE TABLE IF NOT EXISTS public.geocodes (
    address_key   text PRIMARY KEY,
    query         text NOT NULL,                      -- the string sent to the geocoder
    lat           double precision,                   -- NULL pair = nothing found (retried after 30 days)
    lng           double precision,
    location_type text,                               -- Google: ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE; BrasilAPI: CEP
    formatted     text,                               -- the geocoder's formatted address
    provider      text NOT NULL DEFAULT 'google',
    fetched_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT geocodes_latlng_pair CHECK ((lat IS NULL) = (lng IS NULL)),
    CONSTRAINT geocodes_lat_range CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
    CONSTRAINT geocodes_lng_range CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
    CONSTRAINT geocodes_provider_check CHECK (provider IN ('google', 'brasilapi'))
);

COMMENT ON TABLE public.geocodes IS 'Geocoder results keyed by normalized address (lib/geocode.ts). Service-role only.';

ALTER TABLE public.geocodes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.geocodes FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS geocodes_fetched_at_idx ON public.geocodes (fetched_at);
