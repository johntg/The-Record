-- 010_user_sessions.sql
-- DB-backed session persistence for iOS PWA reliability.
--
-- Problem: iOS can silently clear a PWA's localStorage, wiping the Supabase
-- auth session and forcing users to log in again.
--
-- Solution: After every OTP login the client saves the refresh_token here.
-- On startup, if localStorage is empty the client calls restore_session()
-- (a SECURITY DEFINER function, so no auth is required) to retrieve the
-- refresh_token and exchange it for a live session via refreshSession().
-- The client only stores a tiny UUID lookup token in a cookie (~36 chars).
-- The UUID is the credential — 122-bit entropy makes it unguessable.

CREATE TABLE IF NOT EXISTS user_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx    ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at);

-- RLS: authenticated users can read/update/delete only their own rows.
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sessions"
  ON user_sessions
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Bootstrap lookup — called BEFORE the user has a valid JWT.
-- Rolls the expiry on every successful call (rolling 30-day window).
-- Returns nothing if the token is expired or doesn't exist.
CREATE OR REPLACE FUNCTION restore_session(lookup_token UUID)
RETURNS TABLE (refresh_token TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE user_sessions
  SET
    last_seen  = NOW(),
    expires_at = NOW() + INTERVAL '30 days'
  WHERE id         = lookup_token
    AND expires_at > NOW()
  RETURNING user_sessions.refresh_token;
$$;

-- The anon (unauthenticated) role must be able to call this function
-- so the app can bootstrap a session before it has a valid JWT.
GRANT EXECUTE ON FUNCTION restore_session(UUID) TO anon;
