-- Migration: Set up RLS policies for prefixed tables
-- Enables Row Level Security on all prefixed tables and creates policies for authenticated users

-- ============================================================================
-- ENABLE RLS ON ALL PREFIXED TABLES
-- ============================================================================

ALTER TABLE public.prod_callings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_calling_hc_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_calling_hidden_for_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_status_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.train_callings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.train_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.train_calling_hc_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.train_calling_hidden_for_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.train_status_options ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PRODUCTION TABLE POLICIES
-- ============================================================================

-- prod_callings policies
CREATE POLICY "Allow authenticated users full access to prod_callings"
ON public.prod_callings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- prod_archive policies
CREATE POLICY "Allow authenticated users to read prod_archive"
ON public.prod_archive
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert into prod_archive"
ON public.prod_archive
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update prod_archive"
ON public.prod_archive
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete from prod_archive"
ON public.prod_archive
FOR DELETE
TO authenticated
USING (true);

-- prod_calling_hc_votes policies
CREATE POLICY "Allow authenticated users full access to prod_calling_hc_votes"
ON public.prod_calling_hc_votes
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- prod_calling_hidden_for_members policies
CREATE POLICY "Allow authenticated users full access to prod_calling_hidden_for_members"
ON public.prod_calling_hidden_for_members
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- prod_status_options policies
CREATE POLICY "Allow authenticated users to read prod_status_options"
ON public.prod_status_options
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- TRAINING TABLE POLICIES
-- ============================================================================

-- train_callings policies
CREATE POLICY "Allow authenticated users full access to train_callings"
ON public.train_callings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- train_archive policies
CREATE POLICY "Allow authenticated users to read train_archive"
ON public.train_archive
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert into train_archive"
ON public.train_archive
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update train_archive"
ON public.train_archive
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete from train_archive"
ON public.train_archive
FOR DELETE
TO authenticated
USING (true);

-- train_calling_hc_votes policies
CREATE POLICY "Allow authenticated users full access to train_calling_hc_votes"
ON public.train_calling_hc_votes
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- train_calling_hidden_for_members policies
CREATE POLICY "Allow authenticated users full access to train_calling_hidden_for_members"
ON public.train_calling_hidden_for_members
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- train_status_options policies
CREATE POLICY "Allow authenticated users to read train_status_options"
ON public.train_status_options
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;

-- Production table grants
GRANT ALL ON public.prod_callings TO authenticated;
GRANT ALL ON public.prod_archive TO authenticated;
GRANT ALL ON public.prod_calling_hc_votes TO authenticated;
GRANT ALL ON public.prod_calling_hidden_for_members TO authenticated;
GRANT SELECT ON public.prod_status_options TO authenticated;

-- Training table grants
GRANT ALL ON public.train_callings TO authenticated;
GRANT ALL ON public.train_archive TO authenticated;
GRANT ALL ON public.train_calling_hc_votes TO authenticated;
GRANT ALL ON public.train_calling_hidden_for_members TO authenticated;
GRANT SELECT ON public.train_status_options TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'RLS policies created successfully';
  RAISE NOTICE 'All prefixed tables now have RLS enabled with authenticated user access';
  RAISE NOTICE 'Next step: Run the SQL in Supabase dashboard, then deploy your updated frontend code';
END $$;
