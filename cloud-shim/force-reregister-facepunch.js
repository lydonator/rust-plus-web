/**
 * Force unregister and re-register a user's Expo token with Facepunch
 * This ensures our cloud-shim becomes the "active" device
 *
 * Usage: node force-reregister-facepunch.js <userId>
 */

require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { v5: uuidv5 } = require('uuid');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FACEPUNCH_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

async function forceReregister(userId) {
    try {
        console.log(`\n🔄 Force re-registering Facepunch token for user: ${userId}\n`);

        // Get user data
        const { data: user, error } = await supabase
            .from('users')
            .select('steam_id, rustplus_auth_token, expo_push_token, fcm_credentials')
            .eq('id', userId)
            .single();

        if (error || !user) {
            console.error('❌ User not found:', error);
            return;
        }

        console.log('📋 User Info:');
        console.log(`   Steam ID: ${user.steam_id}`);
        console.log(`   Expo Token: ${user.expo_push_token || 'NOT SET'}`);
        console.log();

        if (!user.rustplus_auth_token) {
            console.error('❌ No RustPlus auth token');
            return;
        }

        if (!user.expo_push_token) {
            console.error('❌ No Expo push token');
            return;
        }

        // Generate Facepunch DeviceId (same way as fcm-manager.js)
        const androidId = user.fcm_credentials?.gcm?.androidId;
        const facepunchDeviceId = uuidv5(androidId || userId, FACEPUNCH_NAMESPACE);

        console.log(`📱 Facepunch Device ID: ${facepunchDeviceId}\n`);

        // Step 1: Unregister existing token
        console.log('1️⃣  Unregistering existing token from Facepunch...');
        try {
            const unregisterPayload = {
                AuthToken: user.rustplus_auth_token,
                PushToken: user.expo_push_token
            };

            const unregResponse = await axios.delete(
                'https://companion-rust.facepunch.com/api/push/unregister',
                {
                    headers: {
                        'Authorization': `Bearer ${user.rustplus_auth_token}`,
                        'Content-Type': 'application/json'
                    },
                    data: unregisterPayload
                }
            );

            console.log(`   ✅ Unregister response: ${unregResponse.status} ${unregResponse.statusText}`);
        } catch (err) {
            console.log(`   ⚠️  Unregister failed: ${err.response?.status || err.message} (this is OK if token wasn't registered)`);
        }

        // Step 2: Wait a moment
        console.log('   ⏳ Waiting 2 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 3: Register token
        console.log('2️⃣  Registering Expo token with Facepunch...');
        try {
            const registerPayload = {
                AuthToken: user.rustplus_auth_token,
                DeviceId: facepunchDeviceId,
                PushKind: 0, // FCM/Android
                PushToken: user.expo_push_token
            };

            console.log('   📤 Request payload:');
            console.log(JSON.stringify(registerPayload, null, 2));
            console.log();

            const regResponse = await axios.post(
                'https://companion-rust.facepunch.com/api/push/register',
                registerPayload,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`   ✅ Register response: ${regResponse.status} ${regResponse.statusText}`);
            console.log('   📥 Response data:');
            console.log(JSON.stringify(regResponse.data, null, 2));
            console.log();

            console.log('✅ Re-registration complete!\n');
            console.log('💡 Next steps:');
            console.log('   1. Have the user try pairing in-game again');
            console.log('   2. Watch the cloud-shim logs for incoming FCM notifications');
            console.log('   3. Check the debug/listeners page for received notifications\n');

        } catch (err) {
            console.error('   ❌ Register failed:');
            console.error(`      Status: ${err.response?.status}`);
            console.error(`      Message: ${err.message}`);
            console.error(`      Response data:`, err.response?.data);
            console.log();
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

const userId = process.argv[2];
if (!userId) {
    console.error('Usage: node force-reregister-facepunch.js <userId>');
    process.exit(1);
}

forceReregister(userId);
