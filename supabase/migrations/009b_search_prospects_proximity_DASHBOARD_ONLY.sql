-- Server-side proximity search across the entire prospects table.
-- Used by the web app to filter prospects within a radius of a clicked map point
-- without having to first paginate them into the browser.
--
-- Returns the matching prospect ids only; the caller re-fetches the full rows
-- (with the assigned_user join) using a follow-up `in('id', ids)` query so
-- existing RLS on `prospects` continues to apply.
--
-- `coordinates` is a PostgreSQL `point` storing (lng, lat). We cast to
-- geography for great-circle distance and meter-accurate radius matching.

CREATE OR REPLACE FUNCTION public.search_prospects_proximity_ids(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
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
      p_radius_km * 1000
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
