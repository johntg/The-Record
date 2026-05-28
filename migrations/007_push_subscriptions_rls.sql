-- Migration: RLS policies for push_subscriptions table
-- Each authenticated user can manage only their own subscription rows.

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own push subscription"
ON public.push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);0

CREATE POLICY "Users can read their own push subscription"
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscription"
ON public.push_subscriptions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT ALL ON public.push_subscriptions TO authenticated;
