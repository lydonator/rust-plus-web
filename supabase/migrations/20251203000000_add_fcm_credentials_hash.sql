-- Add fcm_credentials_hash column to users table
-- This stores a SHA-256 hash of the FCM token to detect when credentials change
-- and the Expo token becomes stale (notifications stop working)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS fcm_credentials_hash TEXT;

-- Add index for faster lookups (optional, but helps with debugging)
CREATE INDEX IF NOT EXISTS idx_users_fcm_hash ON users(fcm_credentials_hash);

-- Add comment explaining the column
COMMENT ON COLUMN users.fcm_credentials_hash IS 'SHA-256 hash of FCM token. Used to detect when FCM credentials change and Expo token needs regeneration.';
