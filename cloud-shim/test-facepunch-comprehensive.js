// Comprehensive Facepunch API test
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testFacepunchAPI(steamId) {
    console.log(`\n=== Comprehensive Facepunch API Test for Steam ID: ${steamId} ===\n`);

    // Get user
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('steam_id', steamId)
        .single();

    if (error || !user) {
        console.error('❌ User not found:', error);
        return;
    }

    console.log('User Info:');
    console.log(`  Steam ID: ${user.steam_id}`);
    console.log(`  Auth Token: ${user.rustplus_auth_token?.substring(0, 50)}...`);
    console.log(`  Expo Token: ${user.expo_push_token}`);
    console.log('');

    if (!user.rustplus_auth_token) {
        console.error('❌ No auth token - user needs to sign in');
        return;
    }

    // Test 1: Try to list registrations
    console.log('Test 1: Listing existing registrations');
    console.log('└─ GET https://companion-rust.facepunch.com/api/push/list\n');

    try {
        const listResponse = await axios.get(
            'https://companion-rust.facepunch.com/api/push/list',
            {
                headers: {
                    'Authorization': `Bearer ${user.rustplus_auth_token}`
                }
            }
        );

        console.log(`✅ List succeeded (${listResponse.status})`);
        console.log('Response:', JSON.stringify(listResponse.data, null, 2));
    } catch (err) {
        console.log(`❌ List failed: ${err.response?.status || err.message}`);
        if (err.response?.data) {
            console.log('Error response:', err.response.data);
        }
    }
    console.log('');

    // Test 2: Try to register
    console.log('Test 2: Registering Expo token');
    console.log('└─ POST https://companion-rust.facepunch.com/api/push/register\n');

    const registrationPayload = {
        AuthToken: user.rustplus_auth_token,
        DeviceId: 'webapp',
        PushKind: 0,
        PushToken: user.expo_push_token
    };

    console.log('Payload:', JSON.stringify(registrationPayload, null, 2));
    console.log('');

    try {
        const registerResponse = await axios.post(
            'https://companion-rust.facepunch.com/api/push/register',
            registrationPayload,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`✅ Registration succeeded (${registerResponse.status})`);
        console.log('Response:', registerResponse.data);
    } catch (err) {
        console.log(`❌ Registration failed: ${err.response?.status || err.message}`);
        if (err.response?.data) {
            console.log('Error response:', err.response.data);
        }
    }
    console.log('');

    // Test 3: List again to verify
    console.log('Test 3: Listing again to verify registration persisted');
    console.log('└─ GET https://companion-rust.facepunch.com/api/push/list\n');

    try {
        const listResponse2 = await axios.get(
            'https://companion-rust.facepunch.com/api/push/list',
            {
                headers: {
                    'Authorization': `Bearer ${user.rustplus_auth_token}`
                }
            }
        );

        console.log(`✅ List succeeded (${listResponse2.status})`);
        const registrations = listResponse2.data;

        if (Array.isArray(registrations) && registrations.length > 0) {
            console.log(`Found ${registrations.length} registration(s):\n`);
            registrations.forEach((reg, i) => {
                console.log(`#${i + 1}:`);
                console.log(`  Device ID: ${reg.DeviceId}`);
                console.log(`  Push Token: ${reg.PushToken}`);
                console.log(`  Matches ours: ${reg.PushToken === user.expo_push_token ? '✅ YES' : '❌ NO'}`);
                console.log('');
            });
        } else {
            console.log('⚠️  No registrations found');
        }
    } catch (err) {
        console.log(`❌ List failed: ${err.response?.status || err.message}`);
        if (err.response?.data) {
            console.log('Error response:', err.response.data);
        }
    }

    console.log('\n=== Test Complete ===\n');
}

const steamId = process.argv[2];

if (!steamId) {
    console.log('Usage: node test-facepunch-comprehensive.js <STEAM_ID>');
    console.log('Example: node test-facepunch-comprehensive.js 76561197969993471');
    process.exit(1);
}

testFacepunchAPI(steamId).catch(console.error);
