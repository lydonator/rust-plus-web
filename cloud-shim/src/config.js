// Load environment variables from .env file in cloud-shim directory (production)
// or from parent .env.local (development)
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '../.env.local' });


module.exports = {
    PORT: process.env.SHIM_PORT || 4000,
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RUSTPLUS_SENDER_ID: '976529667804', // Fixed Rust+ Sender ID
};
