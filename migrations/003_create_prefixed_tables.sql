-- Migration: Create prefixed tables for production and training modes
-- This allows a single database to support both production and training data
-- Members table remains shared across both modes

-- ============================================================================
-- PRODUCTION TABLES (prod_ prefix)
-- ============================================================================

-- prod_callings
CREATE TABLE IF NOT EXISTS public.prod_callings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    type text,
    name text,
    "position" text,
    unit text,
    sp_approved boolean,
    hc_sustained boolean,
    interview_by text,
    prev_release boolean DEFAULT false,
    sus_assigned text,
    set_apart_by text,
    status text DEFAULT 'In Progress'::text,
    interviewed timestamp with time zone,
    sustained timestamp with time zone,
    set_apart text,
    lcr_recorded boolean,
    units_sustained text[] DEFAULT '{}'::text[],
    sp_approved_date timestamp with time zone,
    hc_sustained_date timestamp with time zone,
    hc_sustained_bypass boolean DEFAULT false NOT NULL,
    hc_sustained_bypass_by text,
    hc_sustained_bypass_at timestamp with time zone,
    units_release_announced text[] DEFAULT '{}'::text[] NOT NULL,
    PRIMARY KEY (id)
);

ALTER TABLE public.prod_callings OWNER TO postgres;

-- prod_archive
CREATE TABLE IF NOT EXISTS public.prod_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    type text,
    name text,
    "position" text,
    unit text,
    sp_approved boolean,
    hc_sustained boolean,
    interview_by text,
    prev_release boolean DEFAULT false,
    sus_assigned text,
    set_apart_by text,
    status text DEFAULT 'In Progress'::text,
    interviewed timestamp with time zone,
    sustained timestamp with time zone,
    set_apart text,
    lcr_recorded boolean,
    units_sustained text[] DEFAULT '{}'::text[],
    sp_approved_date timestamp with time zone,
    hc_sustained_date timestamp with time zone,
    hc_sustained_bypass boolean DEFAULT false NOT NULL,
    hc_sustained_bypass_by text,
    hc_sustained_bypass_at timestamp with time zone,
    auth_user_id uuid,
    units_release_announced text[] DEFAULT '{}'::text[] NOT NULL,
    super boolean DEFAULT false,
    PRIMARY KEY (id)
);

ALTER TABLE public.prod_archive OWNER TO postgres;
COMMENT ON TABLE public.prod_archive IS 'Production archive table (duplicate of prod_callings)';

-- prod_calling_hc_votes
CREATE TABLE IF NOT EXISTS public.prod_calling_hc_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calling_id uuid NOT NULL,
    voter_name text NOT NULL,
    vote text NOT NULL,
    voted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (calling_id, voter_name),
    CONSTRAINT prod_calling_hc_votes_vote_check CHECK ((vote = ANY (ARRAY['sustain'::text, 'concern'::text])))
);

ALTER TABLE public.prod_calling_hc_votes OWNER TO postgres;

-- prod_calling_hidden_for_members
CREATE TABLE IF NOT EXISTS public.prod_calling_hidden_for_members (
    calling_id uuid NOT NULL,
    member_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (calling_id, member_name)
);

ALTER TABLE public.prod_calling_hidden_for_members OWNER TO postgres;

-- prod_status_options
CREATE TABLE IF NOT EXISTS public.prod_status_options (
    name text NOT NULL,
    PRIMARY KEY (name)
);

ALTER TABLE public.prod_status_options OWNER TO postgres;

-- ============================================================================
-- TRAINING TABLES (train_ prefix)
-- ============================================================================

-- train_callings
CREATE TABLE IF NOT EXISTS public.train_callings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    type text,
    name text,
    "position" text,
    unit text,
    sp_approved boolean,
    hc_sustained boolean,
    interview_by text,
    prev_release boolean DEFAULT false,
    sus_assigned text,
    set_apart_by text,
    status text DEFAULT 'In Progress'::text,
    interviewed timestamp with time zone,
    sustained timestamp with time zone,
    set_apart text,
    lcr_recorded boolean,
    units_sustained text[] DEFAULT '{}'::text[],
    sp_approved_date timestamp with time zone,
    hc_sustained_date timestamp with time zone,
    hc_sustained_bypass boolean DEFAULT false NOT NULL,
    hc_sustained_bypass_by text,
    hc_sustained_bypass_at timestamp with time zone,
    units_release_announced text[] DEFAULT '{}'::text[] NOT NULL,
    PRIMARY KEY (id)
);

ALTER TABLE public.train_callings OWNER TO postgres;

-- train_archive
CREATE TABLE IF NOT EXISTS public.train_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    type text,
    name text,
    "position" text,
    unit text,
    sp_approved boolean,
    hc_sustained boolean,
    interview_by text,
    prev_release boolean DEFAULT false,
    sus_assigned text,
    set_apart_by text,
    status text DEFAULT 'In Progress'::text,
    interviewed timestamp with time zone,
    sustained timestamp with time zone,
    set_apart text,
    lcr_recorded boolean,
    units_sustained text[] DEFAULT '{}'::text[],
    sp_approved_date timestamp with time zone,
    hc_sustained_date timestamp with time zone,
    hc_sustained_bypass boolean DEFAULT false NOT NULL,
    hc_sustained_bypass_by text,
    hc_sustained_bypass_at timestamp with time zone,
    auth_user_id uuid,
    units_release_announced text[] DEFAULT '{}'::text[] NOT NULL,
    super boolean DEFAULT false,
    PRIMARY KEY (id)
);

ALTER TABLE public.train_archive OWNER TO postgres;
COMMENT ON TABLE public.train_archive IS 'Training archive table (duplicate of train_callings)';

-- train_calling_hc_votes
CREATE TABLE IF NOT EXISTS public.train_calling_hc_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calling_id uuid NOT NULL,
    voter_name text NOT NULL,
    vote text NOT NULL,
    voted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (calling_id, voter_name),
    CONSTRAINT train_calling_hc_votes_vote_check CHECK ((vote = ANY (ARRAY['sustain'::text, 'concern'::text])))
);

ALTER TABLE public.train_calling_hc_votes OWNER TO postgres;

-- train_calling_hidden_for_members
CREATE TABLE IF NOT EXISTS public.train_calling_hidden_for_members (
    calling_id uuid NOT NULL,
    member_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (calling_id, member_name)
);

ALTER TABLE public.train_calling_hidden_for_members OWNER TO postgres;

-- train_status_options
CREATE TABLE IF NOT EXISTS public.train_status_options (
    name text NOT NULL,
    PRIMARY KEY (name)
);

ALTER TABLE public.train_status_options OWNER TO postgres;

-- ============================================================================
-- MIGRATE EXISTING DATA
-- ============================================================================

-- Copy existing data from callings to prod_callings (if data exists)
INSERT INTO public.prod_callings 
SELECT * FROM public.callings
ON CONFLICT (id) DO NOTHING;

-- Copy existing data from archive to prod_archive (if data exists)
INSERT INTO public.prod_archive 
SELECT * FROM public.archive
ON CONFLICT (id) DO NOTHING;

-- Copy existing data from calling_hc_votes to prod_calling_hc_votes (if data exists)
INSERT INTO public.prod_calling_hc_votes 
SELECT * FROM public.calling_hc_votes
ON CONFLICT (id) DO NOTHING;

-- Copy existing data from calling_hidden_for_members to prod_calling_hidden_for_members (if data exists)
INSERT INTO public.prod_calling_hidden_for_members 
SELECT * FROM public.calling_hidden_for_members
ON CONFLICT (calling_id, member_name) DO NOTHING;

-- Copy existing data from status_options to prod_status_options (if data exists)
INSERT INTO public.prod_status_options 
SELECT * FROM public.status_options
ON CONFLICT (name) DO NOTHING;

-- Initialize train_status_options with same values as production
INSERT INTO public.train_status_options 
SELECT * FROM public.prod_status_options
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- RPC FUNCTIONS (mode-aware versions)
-- ============================================================================

-- Delete calling permanently (mode-aware)
CREATE OR REPLACE FUNCTION public.delete_calling_permanently_v2(row_id uuid, table_prefix text DEFAULT 'prod') 
RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  table_name text;
BEGIN
  -- Validate prefix
  IF table_prefix NOT IN ('prod', 'train') THEN
    RAISE EXCEPTION 'Invalid table prefix: %. Must be prod or train', table_prefix;
  END IF;
  
  table_name := table_prefix || '_callings';
  
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', table_name) USING row_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No calling found for id % in table %', row_id, table_name;
  END IF;
END;
$$;

ALTER FUNCTION public.delete_calling_permanently_v2(uuid, text) OWNER TO postgres;

-- Move calling to archive (mode-aware)
CREATE OR REPLACE FUNCTION public.move_calling_to_archive_v2(row_id uuid, table_prefix text DEFAULT 'prod') 
RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  callings_table text;
  archive_table text;
  shared_cols text;
  inserted_count integer;
BEGIN
  -- Validate prefix
  IF table_prefix NOT IN ('prod', 'train') THEN
    RAISE EXCEPTION 'Invalid table prefix: %. Must be prod or train', table_prefix;
  END IF;
  
  callings_table := table_prefix || '_callings';
  archive_table := table_prefix || '_archive';
  
  -- Build shared columns list
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO shared_cols
  FROM information_schema.columns c
  JOIN information_schema.columns a
    ON a.table_schema = 'public'
   AND a.table_name = archive_table
   AND a.column_name = c.column_name
  WHERE c.table_schema = 'public'
    AND c.table_name = callings_table;
  
  IF shared_cols IS NULL THEN
    RAISE EXCEPTION 'No shared columns found between % and %', callings_table, archive_table;
  END IF;
  
  -- Insert into archive
  EXECUTE format(
    'INSERT INTO public.%I (%s) SELECT %s FROM public.%I WHERE id = $1',
    archive_table, shared_cols, shared_cols, callings_table
  ) USING row_id;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  
  IF inserted_count = 0 THEN
    RAISE EXCEPTION 'No calling found for id % in table %', row_id, callings_table;
  END IF;
  
  -- Delete from callings
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', callings_table) USING row_id;
END;
$$;

ALTER FUNCTION public.move_calling_to_archive_v2(uuid, text) OWNER TO postgres;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Production indexes
CREATE INDEX IF NOT EXISTS idx_prod_callings_created_at ON public.prod_callings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_callings_status ON public.prod_callings(status);
CREATE INDEX IF NOT EXISTS idx_prod_callings_name ON public.prod_callings(name);
CREATE INDEX IF NOT EXISTS idx_prod_archive_created_at ON public.prod_archive(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_calling_hc_votes_calling_id ON public.prod_calling_hc_votes(calling_id);

-- Training indexes
CREATE INDEX IF NOT EXISTS idx_train_callings_created_at ON public.train_callings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_train_callings_status ON public.train_callings(status);
CREATE INDEX IF NOT EXISTS idx_train_callings_name ON public.train_callings(name);
CREATE INDEX IF NOT EXISTS idx_train_archive_created_at ON public.train_archive(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_train_calling_hc_votes_calling_id ON public.train_calling_hc_votes(calling_id);

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: Prefixed tables created';
  RAISE NOTICE 'Production tables: prod_callings, prod_archive, prod_calling_hc_votes, prod_calling_hidden_for_members, prod_status_options';
  RAISE NOTICE 'Training tables: train_callings, train_archive, train_calling_hc_votes, train_calling_hidden_for_members, train_status_options';
  RAISE NOTICE 'Shared table: members (no prefix)';
  RAISE NOTICE 'New RPC functions: delete_calling_permanently_v2, move_calling_to_archive_v2';
  RAISE NOTICE 'Next step: Run 004_create_prefixed_rls_policies.sql to set up RLS policies';
END $$;
