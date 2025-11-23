-- Add last_viewed_at column to servers table for optimization mode detection
ALTER TABLE public.servers
ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Initialize existing rows to their created_at timestamp
UPDATE public.servers
SET last_viewed_at = created_at
WHERE last_viewed_at IS NULL;

-- Add comment explaining the column's purpose
COMMENT ON COLUMN public.servers.last_viewed_at IS 'Timestamp of when user last viewed this server. Used for lazy mode (>30min) and auto-deletion (>14 days) optimization.';
