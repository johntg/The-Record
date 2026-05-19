-- Fix delete_calling_permanently_v2 to properly check if row was deleted
-- Bug: EXECUTE doesn't set FOUND variable, need to use GET DIAGNOSTICS instead

CREATE OR REPLACE FUNCTION public.delete_calling_permanently_v2(row_id uuid, table_prefix text DEFAULT 'prod') 
RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  table_name text;
  deleted_count integer;
BEGIN
  -- Validate prefix
  IF table_prefix NOT IN ('prod', 'train') THEN
    RAISE EXCEPTION 'Invalid table prefix: %. Must be prod or train', table_prefix;
  END IF;
  
  table_name := table_prefix || '_callings';
  
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', table_name) USING row_id;
  
  -- Use GET DIAGNOSTICS to check row count (FOUND doesn't work with EXECUTE)
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'No calling found for id % in table %', row_id, table_name;
  END IF;
END;
$$;

-- Ensure function has correct owner
ALTER FUNCTION public.delete_calling_permanently_v2(uuid, text) OWNER TO postgres;

-- Grant permissions to roles
GRANT EXECUTE ON FUNCTION public.delete_calling_permanently_v2(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_calling_permanently_v2(uuid, text) TO service_role;
