// Test script to verify the /api/add endpoint hypothesis
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { v5: uuidv5 } = require('uuid');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testApiAdd() {
    const userId = '75aa8dd2-5d9a-45df-9a38-bdc3f0b14082';

    console.log(`Fetching user ${userId}...`);
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !user) {
        console.error('User not found:', error);
        return;
    }

    const fcmToken = user.fcm_credentials?.fcm?.token;
    if (!fcmToken) {
        console.error('No FCM token found in credentials');
        return;
    }

    console.log('User Steam ID:', user.steam_id);
    console.log('FCM Token:', fcmToken.substring(0, 50) + '...');

    // Generate a UUID for DeviceId (as per ChatGPT suggestion)
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const deviceId = uuidv5(user.steam_id, NAMESPACE);
    console.log('Generated DeviceId:', deviceId);

    const payload = {
        DeviceId: deviceId,
        DeviceName: "RustPlus Web",
        PushToken: fcmToken,
        Platform: 2, // FCM
        Title: "Rust+ Web",
        DeviceType: "web",
        SteamId: user.steam_id
    };

    console.log('\n=== Testing POST /api/add ===');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch('https://companion-rust.facepunch.com/api/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.rustplus_auth_token}`
            },
            body: JSON.stringify(payload)
        });

        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(`Response: ${text}`);

        if (response.ok) {
            console.log('✅ /api/add SUCCESS!');
        } else {
            console.log('❌ /api/add FAILED');
        }
    } catch (err) {
        console.error('Request failed:', err);
    }
}

testApiAdd().catch(console.error);
