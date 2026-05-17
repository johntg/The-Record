-- Check if member exists in public.members table
SELECT 
  'public.members' as table_name,
  email, 
  name, 
  role,
  super_admin
FROM public.members 
WHERE email = 'jwharford@gmail.com';

-- Check if auth user exists (requires service role access)
-- Run this separately if needed:
-- SELECT 
--   'auth.users' as table_name,
--   email,
--   confirmed_at,
--   email_confirmed_at,
--   last_sign_in_at,
--   created_at
-- FROM auth.users
-- WHERE email = 'jwharford@gmail.com';
