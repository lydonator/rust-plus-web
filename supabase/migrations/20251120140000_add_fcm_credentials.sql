-- Add fcm_credentials to users table to store persistent Android emulation state
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS fcm_credentials JSONB;

-- Comment on column
COMMENT ON COLUMN users.fcm_credentials IS 'Stores the persistent FCM/GCM credentials (keys, persistentId) for the emulated Android device';
