-- Switch the proximity search RPC from kilometers to miles.
-- The original function was added in 009_search_prospects_proximity.sql.
-- US-based users want the radius parameter in miles; we drop the old
-- function and recreate it with `p_radius_miles`, converting to meters
-- using 1609.344 m/mi for ST_DWithin.

DROP FUNCTION IF EXISTS public.search_prospects_proximity_ids(
  double precision, double precision, double precision, int
);

CREATE OR REPLACE FUNCTION public.search_prospects_proximity_ids(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision,
  p_limit int DEFAULT 2000
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.id
  FROM prospects p
  WHERE p.coordinates IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(p.coordinates[0], p.coordinates[1]), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_miles * 1609.344
    )
  ORDER BY
    ST_Distance(
      ST_SetSRID(ST_MakePoint(p.coordinates[0], p.coordinates[1]), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) ASC
  LIMIT GREATEST(1, LEAST(p_limit, 5000));
$$;

GRANT EXECUTE ON FUNCTION public.search_prospects_proximity_ids(
  double precision, double precision, double precision, int
) TO authenticated;
