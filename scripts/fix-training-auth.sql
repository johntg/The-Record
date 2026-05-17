-- Fix Training Database Auth Schema
-- Run this in the Supabase SQL Editor for the training database
-- https://supabase.com/dashboard/project/uyyptbytjuxavqddpecj/sql/new

-- Step 1: Check if auth schema exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    RAISE NOTICE 'ERROR: auth schema does not exist!';
    RAISE EXCEPTION 'Auth schema is missing. Contact Supabase support or create a new project.';
  ELSE
    RAISE NOTICE 'OK: auth schema exists';
  END IF;
END $$;

-- Step 2: Check if auth.users table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    RAISE NOTICE 'ERROR: auth.users table does not exist!';
    RAISE EXCEPTION 'Auth users table is missing. Contact Supabase support.';
  ELSE
    RAISE NOTICE 'OK: auth.users table exists';
  END IF;
END $$;

-- Step 3: Check if auth.identities table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'auth' AND table_name = 'identities'
  ) THEN
    RAISE NOTICE 'WARNING: auth.identities table does not exist!';
  ELSE
    RAISE NOTICE 'OK: auth.identities table exists';
  END IF;
END $$;

-- Step 4: Count existing auth users
DO $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  RAISE NOTICE 'INFO: Found % users in auth.users', user_count;
END $$;

-- Step 5: Check for the specific user (jwharford@gmail.com)
DO $$
DECLARE
  user_exists BOOLEAN;
  user_confirmed BOOLEAN;
  identity_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'jwharford@gmail.com'
  ) INTO user_exists;
  
  IF user_exists THEN
    RAISE NOTICE 'INFO: User jwharford@gmail.com exists in auth.users';
    
    SELECT (confirmed_at IS NOT NULL OR email_confirmed_at IS NOT NULL)
    INTO user_confirmed
    FROM auth.users 
    WHERE email = 'jwharford@gmail.com';
    
    IF user_confirmed THEN
      RAISE NOTICE 'OK: User email is confirmed';
    ELSE
      RAISE NOTICE 'WARNING: User email is NOT confirmed';
    END IF;
    
    SELECT COUNT(*) INTO identity_count
    FROM auth.identities
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'jwharford@gmail.com');
    
    RAISE NOTICE 'INFO: User has % identities', identity_count;
    
    IF identity_count = 0 THEN
      RAISE NOTICE 'ERROR: User has NO email identity! This will cause OTP to fail.';
    END IF;
  ELSE
    RAISE NOTICE 'INFO: User jwharford@gmail.com does NOT exist in auth.users';
  END IF;
END $$;

-- Step 6: DELETE the problematic user if they exist (uncomment to execute)
-- This allows the provisioning script to create them properly
-- DELETE FROM auth.users WHERE email = 'jwharford@gmail.com';
-- RAISE NOTICE 'Deleted user jwharford@gmail.com - now run the provision script';

-- Step 7: Show all auth users (for debugging)
SELECT 
  id,
  email,
  created_at,
  confirmed_at,
  email_confirmed_at,
  last_sign_in_at,
  (SELECT COUNT(*) FROM auth.identities WHERE user_id = auth.users.id) as identity_count
FROM auth.users
ORDER BY created_at DESC
LIMIT 20;
