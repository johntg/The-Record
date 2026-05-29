-- Migration: Allow admins to read all push subscriptions
-- The existing SELECT policy in 007 restricts each user to their own row,
-- which prevents the notifications page from showing all subscribers.
-- This adds an additional policy so admins and super admins can read all rows.

CREATE POLICY "Admins can read all push subscriptions"
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM members
    WHERE members.email = auth.jwt() ->> 'email'
    AND (members.super = true OR lower(trim(members.role)) = 'admin')
  )
);
