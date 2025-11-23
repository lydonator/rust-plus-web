-- Table to track processed FCM notifications to prevent replay on restart
CREATE TABLE IF NOT EXISTS public.processed_fcm_notifications (
    persistent_id TEXT PRIMARY KEY,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notification_type TEXT
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_processed_fcm_notifications_processed_at
ON public.processed_fcm_notifications(processed_at DESC);

-- Add comment
COMMENT ON TABLE public.processed_fcm_notifications IS 'Tracks FCM notification IDs that have been processed to prevent duplicate processing on cloud-shim restart';

-- This table doesn't need RLS as it's only accessed by service role
