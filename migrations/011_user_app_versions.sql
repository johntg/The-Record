-- 011_user_app_versions.sql
-- Records which app version each user last loaded.
-- Written on every startup so the admin panel can show
-- who is on a stale build and when they were last active.

CREATE TABLE IF NOT EXISTS user_app_versions (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  version    TEXT,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT
);

-- RLS: each user can write their own row; all authenticated users can read
-- (so the admin panel can display everyone's version).
ALTER TABLE user_app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_version_write"
  ON user_app_versions
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "authenticated_read_versions"
  ON user_app_versions
  FOR SELECT
  USING (auth.role() = 'authenticated');
