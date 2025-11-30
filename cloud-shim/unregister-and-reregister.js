// Script to unregister ALL push tokens and re-register only cloud-shim
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { v5: uuidv5, v4: uuidv4 } = require('uuid');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

async function unregisterAndReregister(steamId) {
    console.log(`\n=== Unregister and Re-register for Steam ID: ${steamId} ===\n`);

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
    console.log(`   Current Expo Token: ${user.expo_push_token}\n`);

    if (!user.rustplus_auth_token) {
        console.error('❌ No Rust+ auth token found');
        return;
    }

    // STEP 1: Try to unregister current Expo token
    if (user.expo_push_token) {
        console.log('🗑️  Step 1: Unregistering current Expo token from Facepunch...');

        try {
            const unregisterResponse = await axios.delete(
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

            console.log(`   ✅ Unregister response: ${unregisterResponse.status}`);
            console.log(`   ${unregisterResponse.data || 'Success'}\n`);
        } catch (err) {
            console.log(`   ⚠️  Unregister failed: ${err.response?.status || err.message}`);
            console.log(`   (This is OK if token was already invalid)\n`);
        }
    }

    // STEP 2: Generate new Expo token
    console.log('🔄 Step 2: Generating fresh Expo token...');

    if (!user.fcm_credentials?.fcm?.token) {
        console.error('❌ No FCM token found in user credentials');
        return;
    }

    const fcmToken = user.fcm_credentials.fcm.token;

    // Use RANDOM deviceId (not stable) to force fresh token
    const expoDeviceId = uuidv4();
    console.log(`   Using random deviceId: ${expoDeviceId}`);

    try {
        const expoResponse = await axios.post('https://exp.host/--/api/v2/push/getExpoPushToken', {
            type: 'fcm',
            deviceId: expoDeviceId,
            development: false,
            appId: 'com.facepunch.rust.companion',
            deviceToken: fcmToken,
            projectId: "49451aca-a822-41e6-ad59-955718d0ff9c",
        });

        const newExpoPushToken = expoResponse.data.data.expoPushToken;
        console.log(`   ✅ Got new Expo token: ${newExpoPushToken}\n`);

        // STEP 3: Register with Facepunch
        console.log('📝 Step 3: Registering new Expo token with Facepunch...');

        const facepunchDeviceId = uuidv5(`facepunch-${user.steam_id}`, UUID_NAMESPACE);
        console.log(`   Using DeviceId: ${facepunchDeviceId}`);

        const registerResponse = await axios.post(
            'https://companion-rust.facepunch.com/api/push/register',
            {
                AuthToken: user.rustplus_auth_token,
                DeviceId: facepunchDeviceId,
                PushKind: 0,  // Expo
                PushToken: newExpoPushToken
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        console.log(`   ✅ Facepunch registration: ${registerResponse.status}`);
        console.log(`   ${registerResponse.data || 'Success'}\n`);

        // STEP 4: Save to database
        console.log('💾 Step 4: Saving new Expo token to database...');

        const { error: updateError } = await supabase
            .from('users')
            .update({ expo_push_token: newExpoPushToken })
            .eq('id', user.id);

        if (updateError) {
            console.error(`   ❌ Database update failed:`, updateError);
        } else {
            console.log(`   ✅ Database updated successfully\n`);
        }

        // STEP 5: Instructions
        console.log('=' .repeat(70));
        console.log('✅ COMPLETE! Next steps:');
        console.log('');
        console.log('1. Restart cloud-shim (or wait for user to reconnect)');
        console.log('2. Have user connect to web app');
        console.log('3. Have user pair a server in-game');
        console.log('4. Check cloud-shim logs for pairing notification');
        console.log('');
        console.log('If it STILL doesn\'t work, the user likely has the official Rust+');
        console.log('mobile app installed. Ask them to:');
        console.log('  - Uninstall the Rust+ app from their phone, OR');
        console.log('  - Check their phone - are pairing notifications arriving there?');
        console.log('=' .repeat(70));

    } catch (err) {
        console.error('❌ Error:', err.response?.data || err.message);
    }
}

// Usage
const steamId = process.argv[2];

if (!steamId) {
    console.log('Usage: node unregister-and-reregister.js <STEAM_ID>');
    console.log('Example: node unregister-and-reregister.js 76561198323129129');
    process.exit(1);
}

unregisterAndReregister(steamId).catch(console.error);
