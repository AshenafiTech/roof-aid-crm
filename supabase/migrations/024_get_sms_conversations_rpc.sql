-- ============================================================
-- ROOF-AID CRM — M4: get_sms_conversations RPC
-- ============================================================
-- Returns one row per prospect that has at least one SMS, ordered by
-- most-recent activity DESC. Each row carries the full `prospects`
-- record (as JSON) plus the latest message + unread inbound count, so
-- the mobile inbox can render and navigate without a second fetch.
--
-- Shape per row (jsonb):
--   {
--     prospect:       { ...full prospects row... },
--     last_body:      text,
--     last_at:        timestamptz,
--     last_direction: 'inbound' | 'outbound',
--     last_status:    text,
--     unread_count:   int
--   }
--
-- Tenant scoping: SECURITY INVOKER + RLS on sms_logs and prospects.
-- The caller can only see rows in their tenant; no explicit tenant_id
-- filter is needed inside the function.
--
-- Replaces the client-side aggregation in
-- conversations_remote_datasource.dart. Entity shape is unchanged.
-- ============================================================

-- ------------------------------------------------------------
-- 0. sent_at column — formalisation.
-- On legacy prod this column was drift-added by an undocumented
-- send_sms RPC and is referenced below (and by migrations 030,
-- 031, 032, 034). On fresh installs it doesn't exist yet, so we
-- add it idempotently here before the RPC references it.
-- ------------------------------------------------------------
ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE OR REPLACE FUNCTION get_sms_conversations()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH latest AS (
    -- DISTINCT ON keeps the latest row per prospect_id. Ordering by
    -- coalesce(sent_at, created_at) DESC handles freshly-queued rows
    -- where sent_at is NULL (mobile send path).
    SELECT DISTINCT ON (l.prospect_id)
      l.prospect_id,
      l.body                              AS last_body,
      coalesce(l.sent_at, l.created_at)   AS last_at,
      l.direction                         AS last_direction,
      l.status                            AS last_status
    FROM sms_logs l
    WHERE l.prospect_id IS NOT NULL
    ORDER BY l.prospect_id, coalesce(l.sent_at, l.created_at) DESC
  ),
  unread AS (
    SELECT prospect_id, count(*)::int AS unread_count
      FROM sms_logs
     WHERE direction = 'inbound'
       AND read_at IS NULL
       AND prospect_id IS NOT NULL
     GROUP BY prospect_id
  )
  SELECT jsonb_build_object(
    'prospect',       to_jsonb(p.*),
    'last_body',      lt.last_body,
    'last_at',        lt.last_at,
    'last_direction', lt.last_direction,
    'last_status',    lt.last_status,
    'unread_count',   coalesce(u.unread_count, 0)
  )
  FROM latest lt
  JOIN prospects p   ON p.id = lt.prospect_id
  LEFT JOIN unread u ON u.prospect_id = lt.prospect_id
  ORDER BY lt.last_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_sms_conversations() TO authenticated;
