-- ============================================================
-- USER GOOGLE TOKENS — encrypted Gmail OAuth tokens per user
-- Used by telefonista users to send email from their own Gmail
-- account via the Gmail API.
-- ============================================================

CREATE TABLE user_google_tokens (
  user_id                   uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  google_email              text NOT NULL,
  refresh_token_ciphertext  text NOT NULL,
  refresh_token_iv          text NOT NULL,
  refresh_token_tag         text NOT NULL,
  access_token              text,
  access_token_expires_at   timestamptz,
  scopes                    text[] NOT NULL DEFAULT '{}',
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX user_google_tokens_tenant_idx ON user_google_tokens(tenant_id);

ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read only their own row
CREATE POLICY "user_google_tokens_select_own" ON user_google_tokens
  FOR SELECT USING (user_id = auth.uid());

-- Users can delete their own row (disconnect Gmail)
CREATE POLICY "user_google_tokens_delete_own" ON user_google_tokens
  FOR DELETE USING (user_id = auth.uid());

-- Inserts and updates go through service-role (OAuth callback + refresh).
-- No insert/update policy → blocked for authenticated users.
