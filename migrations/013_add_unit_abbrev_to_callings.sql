-- Migration: Add unit_abbrev column to calling tables
-- Created: 2026-06-30
--
-- Stores the selected unit abbreviation (sourced from units.abrev) for display
-- alongside the person's name on calling/release cards.

ALTER TABLE public.prod_callings ADD COLUMN IF NOT EXISTS unit_abbrev text;
ALTER TABLE public.train_callings ADD COLUMN IF NOT EXISTS unit_abbrev text;
