-- Migration: Add created_at column to push_subscriptions
-- Stores creation timestamp for subscription date tracking

ALTER TABLE public.push_subscriptions
ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add comment explaining the column
COMMENT ON COLUMN public.push_subscriptions.created_at IS 'Timestamp when the subscription was created';
