// Diagnostic script to check and fix Facepunch registration
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkFacepunchRegistration() {
    const userId = '5c3a420e-ce14-41b9-9767-825b2fd1331f';

    // Get user data
    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    console.log('User Steam ID:', user.steam_id);
    console.log('Auth Token:', user.rustplus_auth_token.substring(0, 50) + '...');
    console.log('FCM Token:', user.fcm_credentials.fcm.token.substring(0, 50) + '...');

    // Try to get current registrations from Facepunch
    console.log('\n=== Checking Facepunch Registrations ===');
    const response = await fetch('https://companion-rust.facepunch.com/api/push/list', {
        headers: {
            'Authorization': `Bearer ${user.rustplus_auth_token}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        console.log('Current Facepunch Registrations:', JSON.stringify(data, null, 2));

        // If there are old registrations, offer to delete them
        if (data && data.length > 0) {
            console.log('\n⚠️  Found existing registrations. These might be stale.');
            console.log('To clear them, you can call the unpair API for each DeviceId.');
        }
    } else {
        console.log('Failed to list registrations:', await response.text());
    }

    // Try re-registering with current FCM token
    console.log('\n=== Attempting Fresh Registration ===');
    const { v5: uuidv5 } = require('uuid');
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const fcmToken = user.fcm_credentials.fcm.token;
    const deviceId = uuidv5(fcmToken, NAMESPACE);

    console.log('DeviceId:', deviceId);
    console.log('FCM Token:', fcmToken.substring(0, 50) + '...');

    const registerResponse = await fetch('https://companion-rust.facepunch.com/api/push/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.rustplus_auth_token}`
        },
        body: JSON.stringify({
            AuthToken: user.rustplus_auth_token,
            DeviceId: deviceId,
            PushKind: 0,  // FCM raw token
            PushToken: fcmToken
        })
    });

    const registerText = await registerResponse.text();
    if (registerResponse.ok) {
        console.log('✅ Registration successful:', registerText);
    } else {
        console.log('❌ Registration failed:', registerText);
    }
}

checkFacepunchRegistration().catch(console.error);
