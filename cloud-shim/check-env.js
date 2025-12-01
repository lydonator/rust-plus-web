#!/usr/bin/env node

// Diagnostic script to check if environment variables are loaded correctly

console.log('=== Cloud Shim Environment Check ===\n');

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Current working directory:', process.cwd());
console.log('\n=== Loading config.js ===\n');

const config = require('./src/config.js');

console.log('Config loaded successfully!');
console.log('\nImportant variables:');
console.log('PORT:', config.PORT);
console.log('SUPABASE_URL:', config.SUPABASE_URL);
console.log('SUPABASE_SERVICE_KEY:', config.SUPABASE_SERVICE_KEY ? '[SET]' : '[NOT SET]');
console.log('REDIS_URL:', config.REDIS_URL);
console.log('\nRust+ Constants:');
console.log('RUSTPLUS_SENDER_ID:', config.RUSTPLUS_SENDER_ID);
console.log('RUSTPLUS_API_KEY:', config.RUSTPLUS_API_KEY ? '[SET]' : '[NOT SET]');

if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
    console.log('\n❌ CRITICAL: Supabase credentials not loaded!');
    console.log('Check that cloud-shim/.env exists and contains:');
    console.log('- NEXT_PUBLIC_SUPABASE_URL');
    console.log('- SUPABASE_SERVICE_ROLE_KEY');
} else {
    console.log('\n✅ All critical variables loaded');
}
