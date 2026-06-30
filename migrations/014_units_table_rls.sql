-- Migration: Create units table (if not exists) and enable read access
-- Created: 2026-06-30
--
-- The units table is a reference table with unit names and abbreviations.
-- This migration ensures it exists, has RLS enabled, and allows all
-- authenticated users to read from it.

CREATE TABLE IF NOT EXISTS public.units (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text,
  abrev text
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read units
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'units' AND policyname = 'Allow authenticated users to read units'
  ) THEN
    CREATE POLICY "Allow authenticated users to read units"
    ON public.units
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

GRANT SELECT ON public.units TO authenticated;
