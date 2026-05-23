-- ============================================================
-- NOTIFICATION PREFERENCES — per-user opt-in toggles for
-- in-browser push notifications (Notification API) and future
-- channels. One row per user; row is upserted lazily when the
-- user opens the Notifications settings page.
-- ============================================================

CREATE TABLE notification_preferences (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_new_message  boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences_select_own"
  ON notification_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notification_preferences_insert_own"
  ON notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences_update_own"
  ON notification_preferences
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
