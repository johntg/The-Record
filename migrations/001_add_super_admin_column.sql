-- Migration: Add super admin column to members table
-- Description: Adds a 'super' boolean column to track super admin users who can manage members
-- Created: 2026-05-16

-- Add 'super' column to members table
ALTER TABLE members ADD COLUMN super boolean DEFAULT false;

-- Add 'super' column to archive table  
ALTER TABLE archive ADD COLUMN super boolean DEFAULT false;

-- Create index on super column for faster queries
CREATE INDEX idx_members_super ON members(super);
CREATE INDEX idx_archive_super ON archive(super);

-- Add comment for documentation
COMMENT ON COLUMN members.super IS 'Super admin flag - users with this set to true can access the admin panel and manage members';
COMMENT ON COLUMN archive.super IS 'Super admin flag (archived record)';
