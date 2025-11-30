// test-fcm-register.js
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testFcmRegister(steamId) {
    console.log(`\n=== TESTING FCM REGISTRATION FOR STEAM ID: ${steamId} ===\n`);

    // Fetch user
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('steam_id', steamId)
        .single();

    if (error || !user) {
        console.error('❌ User not found:', error);
        return;
    }

    console.log('User ID:', user.id);
    console.log('Stored DeviceId:', user.device_id);
    console.log('SteamID:', user.steam_id);
    console.log('AuthToken:', user.rustplus_auth_token ? '✔ present' : '❌ missing');

    if (!user.rustplus_auth_token) {
        console.error('❌ Missing Rust+ auth token. Have they logged in recently?');
        return;
    }

    if (!user.fcm_credentials?.fcm?.token) {
        console.error('❌ Missing FCM token in user.fcm_credentials');
        return;
    }
    const deviceId =  uuidv4();
    const fcmToken = user.fcm_credentials.fcm.token;
    // const deviceId = user.device_id;

    console.log('\n📡 Sending PushKind 1 registration to Facepunch...');
    console.log({
        DeviceId: deviceId,
        PushKind: 1,
        PushToken: fcmToken
    });

    try {
        const res = await axios.post(
            'https://companion-rust.facepunch.com/api/push/register',
            {
                AuthToken: user.rustplus_auth_token,
                DeviceId: deviceId,
                PushKind: 1,
                PushToken: fcmToken
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('\n✅ Facepunch Response:', res.status);
        console.log(JSON.stringify(res.data, null, 2) || 'OK');

        console.log('\n🎉 SUCCESS — User should now receive pairing notifications.');
        console.log('Have them pair a Rust server again.');

    } catch (err) {
        console.error('\n❌ Facepunch registration failed');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Body:', err.response.data);
        } else {
            console.error(err.message);
        }
    }
}

const steamId = process.argv[2];
if (!steamId) {
    console.log('Usage: node test-fcm-register.js <STEAM_ID>');
    process.exit(1);
}

testFcmRegister(steamId);
