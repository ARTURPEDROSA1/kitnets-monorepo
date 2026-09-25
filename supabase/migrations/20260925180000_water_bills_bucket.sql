-- Water bills: the current bill's PDF and the utility's logo, per property.
--
-- One PDF per property is kept in the private bucket `water-bills` as
-- {propertyId}/current_bill.pdf (same approach as energy-bills/current_bill.pdf);
-- the water utility's logo, pulled from the header of that PDF (or uploaded by
-- hand), sits beside it as {propertyId}/utility_logo.<ext> and is the cover of
-- the property's card on /dashboard/water. The app serves signed URLs; the
-- routes use the service role, the browser never touches the bucket directly.

INSERT INTO storage.buckets (id, name, public)
VALUES ('water-bills', 'water-bills', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
