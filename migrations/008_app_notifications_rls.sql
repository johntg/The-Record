-- Migration: RLS policies for app_notifications table
-- Recipients can read and dismiss (remove themselves from) their own messages.
-- Admins (role = 'admin') and super admins can insert new notifications.

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see messages they are a recipient of
CREATE POLICY "Users can read their own notifications"
ON public.app_notifications
FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'email' = ANY(recipients));

-- Admins (role = 'admin') and super admins can insert notifications
CREATE POLICY "Admins can send notifications"
ON public.app_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM members
    WHERE members.email = auth.jwt() ->> 'email'
    AND (members.super = true OR lower(trim(members.role)) = 'admin')
  )
);

-- Recipients can update a notification to remove themselves from the recipients array
CREATE POLICY "Users can dismiss their own notifications"
ON public.app_notifications
FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'email' = ANY(recipients))
WITH CHECK (auth.jwt() ->> 'email' = ANY(recipients) OR recipients = '{}');

GRANT SELECT, INSERT, UPDATE ON public.app_notifications TO authenticated;
