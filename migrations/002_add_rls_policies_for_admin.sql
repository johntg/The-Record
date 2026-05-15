-- Row Level Security (RLS) Policies for Members Table
-- Description: Restricts member management operations to super admins only
-- Created: 2026-05-16

-- Enable RLS on members table
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow all authenticated users to SELECT members (read-only)
CREATE POLICY "Allow all users to view members"
  ON members
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy 2: Allow super admins to INSERT new members
CREATE POLICY "Allow super admins to create members"
  ON members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.email = auth.jwt() ->> 'email'
      AND members.super = true
    )
  );

-- Policy 3: Allow super admins to UPDATE members
CREATE POLICY "Allow super admins to update members"
  ON members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.email = auth.jwt() ->> 'email'
      AND members.super = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.email = auth.jwt() ->> 'email'
      AND members.super = true
    )
  );

-- Policy 4: Allow super admins to DELETE members
CREATE POLICY "Allow super admins to delete members"
  ON members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.email = auth.jwt() ->> 'email'
      AND members.super = true
    )
  );

-- Enable RLS on archive table
ALTER TABLE archive ENABLE ROW LEVEL SECURITY;

-- Policy 5: Allow all users to SELECT from archive (read-only)
CREATE POLICY "Allow all users to view archive"
  ON archive
  FOR SELECT
  USING (auth.role() = 'authenticated');
