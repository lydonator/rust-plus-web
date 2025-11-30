/**
 * Check what tokens are registered with Facepunch for a user
 *
 * Usage: node check-facepunch-tokens.js <userId>
 */

require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFacepunchTokens(userId) {
    try {
        console.log(`\n🔍 Checking Facepunch registration for user: ${userId}\n`);

        // Get user data
        const { data: user, error } = await supabase
            .from('users')
            .select('steam_id, rustplus_auth_token, expo_push_token')
            .eq('id', userId)
            .single();

        if (error || !user) {
            console.error('❌ User not found:', error);
            return;
        }

        console.log('📋 User Info:');
        console.log(`   Steam ID: ${user.steam_id}`);
        console.log(`   Has Auth Token: ${!!user.rustplus_auth_token}`);
        console.log(`   Expo Token: ${user.expo_push_token || 'NOT SET'}\n`);

        if (!user.rustplus_auth_token) {
            console.error('❌ No RustPlus auth token - cannot query Facepunch');
            return;
        }

        // Note: Facepunch API doesn't have a "list registered tokens" endpoint
        // We can only try to register/unregister
        console.log('⚠️  Note: Facepunch API does not provide a way to list registered tokens.');
        console.log('⚠️  The only way to know if a token is registered is to try registering it.\n');

        console.log('💡 Suggested next steps:');
        console.log('   1. Check the registration log (step 9) for Facepunch API response');
        console.log('   2. Try unregistering and re-registering to ensure we\'re the active device');
        console.log('   3. Check if user has the official Rust+ mobile app installed');
        console.log('   4. If they do, have them uninstall it or logout from it\n');

    } catch (err) {
        console.error('Error:', err);
    }
}

const userId = process.argv[2];
if (!userId) {
    console.error('Usage: node check-facepunch-tokens.js <userId>');
    process.exit(1);
}

checkFacepunchTokens(userId);
