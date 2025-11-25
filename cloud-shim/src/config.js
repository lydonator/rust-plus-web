// Load environment variables from .env file in cloud-shim directory (production)
// or from parent .env.local (development)
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '../.env.local' });


module.exports = {
    PORT: process.env.SHIM_PORT || 4001,
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

    // Redis Configuration
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

    // Rust+ Companion App Constants
    // Note: These are public constants from the official Rust companion app
    // They are required for FCM communication and are not sensitive secrets
    RUSTPLUS_SENDER_ID: '976529667804',
    RUSTPLUS_API_KEY: process.env.RUSTPLUS_API_KEY || 'AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY',
    RUSTPLUS_PROJECT_ID: 'rust-companion-app',
    RUSTPLUS_GMS_APP_ID: '1:976529667804:android:d6f1ddeb4403b338fea619',
    RUSTPLUS_ANDROID_PACKAGE: 'com.facepunch.rust.companion',
    RUSTPLUS_ANDROID_CERT: 'E28D05345FB78A7A1A63D70F4A302DBF426CA5AD',
};
