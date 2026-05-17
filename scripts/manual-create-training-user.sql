-- Manually Create Auth User in Training Database
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/uyyptbytjuxavqddpecj/sql/new
-- This bypasses the Auth API and directly inserts into auth tables

-- IMPORTANT: Replace the values below with your actual details

-- Step 1: Delete existing user if present (including cascade)
DELETE FROM auth.users WHERE email = 'jwharford@gmail.com';

-- Step 2: Insert into auth.users with confirmed email
-- Note: confirmed_at is a generated column, so we don't insert it directly
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_super_admin,
  email_change_token_new,
  email_change
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'jwharford@gmail.com',
  crypt('temporary-password-change-via-otp', gen_salt('bf')), -- This will be unused since we're using OTP
  NOW(), -- email_confirmed_at (this will auto-generate confirmed_at)
  '{"provider":"email","providers":["email"]}',
  '{"name":"John Harford"}',
  NOW(),
  NOW(),
  false,
  '',
  ''
)
RETURNING id, email, email_confirmed_at, confirmed_at;

-- Step 3: Get the user ID (you'll need this for the next step)
-- Copy the 'id' value from the result above

-- Step 4: Insert into auth.identities
-- provider_id is required and should be the user's ID for email provider
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  u.id::text, -- provider_id for email provider is the user_id
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true
  ),
  'email',
  NOW(),
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email = 'jwharford@gmail.com';

-- Step 5: Verify the user was created properly
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.confirmed_at,
  COUNT(i.id) as identity_count,
  COALESCE(jsonb_agg(i.provider), '[]'::jsonb) as providers
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id
WHERE u.email = 'jwharford@gmail.com'
GROUP BY u.id, u.email, u.email_confirmed_at, u.confirmed_at;

-- Step 6: Ensure member exists in public.members
INSERT INTO public.members (email, name, role)
VALUES ('jwharford@gmail.com', 'John Harford', 'stake')
ON CONFLICT (email) 
DO UPDATE SET 
  name = EXCLUDED.name,
  role = EXCLUDED.role;

-- Step 7: Final verification
SELECT 
  'auth.users' as table_name,
  COUNT(*) as count
FROM auth.users 
WHERE email = 'jwharford@gmail.com'
UNION ALL
SELECT 
  'auth.identities' as table_name,
  COUNT(*) as count
FROM auth.identities 
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'jwharford@gmail.com')
UNION ALL
SELECT 
  'public.members' as table_name,
  COUNT(*) as count
FROM public.members 
WHERE email = 'jwharford@gmail.com';
