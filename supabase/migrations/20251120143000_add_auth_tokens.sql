ALTER TABLE users ADD COLUMN IF NOT EXISTS rustplus_auth_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
