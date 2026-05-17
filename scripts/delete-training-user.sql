-- Delete user from training database to allow clean re-provisioning
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/uyyptbytjuxavqddpecj/sql/new

-- Step 1: Show the current user state
SELECT 
  id,
  email,
  created_at,
  confirmed_at,
  email_confirmed_at,
  (SELECT COUNT(*) FROM auth.identities WHERE user_id = auth.users.id AND provider = 'email') as email_identity_count
FROM auth.users
WHERE email = 'jwharford@gmail.com';

-- Step 2: Delete the user (this will cascade to identities)
DELETE FROM auth.users WHERE email = 'jwharford@gmail.com';

-- Step 3: Verify deletion
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM auth.users WHERE email = 'jwharford@gmail.com') 
    THEN 'User still exists - deletion failed'
    ELSE 'User successfully deleted - ready for re-provisioning'
  END as result;

-- Now run: npm run provision:member:training -- --email jwharford@gmail.com --name "John Harford" --role stake
