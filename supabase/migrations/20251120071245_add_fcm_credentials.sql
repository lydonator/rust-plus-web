-- Add FCM credential columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS rustplus_auth_token TEXT,
ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
ADD COLUMN IF NOT EXISTS fcm_token TEXT;
