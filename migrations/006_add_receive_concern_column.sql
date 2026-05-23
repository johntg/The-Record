-- Migration: Add receive_concern column to members table
-- Description: Adds a boolean flag that controls whether a member receives concern notification emails
-- Created: 2026-05-23

ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS receive_concern boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_members_receive_concern
ON public.members(receive_concern);

COMMENT ON COLUMN public.members.receive_concern IS 'Whether this member should receive concern notification emails';
