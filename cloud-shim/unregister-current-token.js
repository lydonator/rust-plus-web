// Simple script to unregister current Expo token for a Steam ID
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function unregisterCurrentToken(steamId) {
    console.log(`\n=== Unregistering Expo Token for Steam ID: ${steamId} ===\n`);

    // Get user data
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('steam_id', steamId)
        .single();

    if (error || !user) {
        console.error('❌ User not found:', error);
        return;
    }

    console.log(`✅ Found user: ${user.id}`);
    console.log(`   Steam ID: ${user.steam_id}`);
    console.log(`   Expo Token: ${user.expo_push_token || 'NONE'}\n`);

    if (!user.rustplus_auth_token) {
        console.error('❌ No Rust+ auth token found');
        return;
    }

    if (!user.expo_push_token) {
        console.log('⚠️  No Expo token to unregister');
        return;
    }

    // Unregister from Facepunch
    console.log('🗑️  Unregistering from Facepunch...');

    try {
        const response = await axios.delete(
            'https://companion-rust.facepunch.com/api/push/unregister',
            {
                headers: {
                    'Authorization': `Bearer ${user.rustplus_auth_token}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    AuthToken: user.rustplus_auth_token,
                    PushToken: user.expo_push_token
                }
            }
        );

        console.log(`   ✅ Facepunch response: ${response.status} ${response.statusText}`);
        console.log(`   ${response.data || 'Success'}\n`);

        console.log('=' .repeat(70));
        console.log('✅ UNREGISTERED!');
        console.log('');
        console.log('What to do next:');
        console.log('1. Try pairing a server in-game');
        console.log('2. Check if notification arrives on your PHONE (Rust+ app)');
        console.log('3. If phone gets it → proves "first registration wins" theory');
        console.log('');
        console.log('To re-activate cloud-shim:');
        console.log('1. Disconnect from web app');
        console.log('2. Restart cloud-shim');
        console.log('3. Reconnect to web app (triggers re-registration)');
        console.log('4. Try pairing again → should work on cloud-shim now');
        console.log('=' .repeat(70));

    } catch (err) {
        console.error('❌ Unregister failed:', err.response?.status, err.response?.data || err.message);
    }
}

// Usage
const steamId = process.argv[2];

if (!steamId) {
    console.log('Usage: node unregister-current-token.js <STEAM_ID>');
    console.log('Example: node unregister-current-token.js 76561197995028213');
    process.exit(1);
}

unregisterCurrentToken(steamId).catch(console.error);
