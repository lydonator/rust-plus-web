// Script to verify Facepunch registration for a specific user
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { v5: uuidv5 } = require('uuid');
const axios = require('axios');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testFacepunchRegistration(steamId) {
    console.log(`\n=== Testing Facepunch Registration for Steam ID: ${steamId} ===\n`);

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

    console.log('✅ Found user in database');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Steam ID: ${user.steam_id}`);
    console.log(`   Auth Token: ${user.rustplus_auth_token?.substring(0, 50)}...`);
    console.log(`   FCM Token: ${user.fcm_credentials?.fcm?.token?.substring(0, 50)}...`);
    console.log(`   Expo Token: ${user.expo_push_token}`);
    console.log('');

    if (!user.rustplus_auth_token) {
        console.error('❌ No Rust+ auth token found. User needs to sign in via Steam.');
        return;
    }

    if (!user.expo_push_token) {
        console.error('❌ No Expo push token found. FCM registration incomplete.');
        return;
    }

    // Try to register with Facepunch
    console.log('🔄 Registering Expo token with Facepunch...');

    try {
        const response = await axios.post(
            'https://companion-rust.facepunch.com/api/push/register',
            {
                AuthToken: user.rustplus_auth_token,
                DeviceId: 'webapp',
                PushKind: 0,  // Expo
                PushToken: user.expo_push_token
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`✅ Facepunch registration successful!`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, response.data);
    } catch (err) {
        if (err.response) {
            console.error(`❌ Facepunch registration failed:`);
            console.error(`   Status: ${err.response.status}`);
            console.error(`   Error:`, err.response.data);
        } else {
            console.error(`❌ Request error:`, err.message);
        }
    }
}

// Get Steam ID from command line or use default
const steamId = process.argv[2];

if (!steamId) {
    console.log('Usage: node test-facepunch-registration.js <STEAM_ID>');
    console.log('Example: node test-facepunch-registration.js 76561198039535846');
    process.exit(1);
}

testFacepunchRegistration(steamId).catch(console.error);
