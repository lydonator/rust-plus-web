const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { v5: uuidv5 } = require('uuid');
require('dotenv').config({ path: '../.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

async function compareUsers(steamId1, steamId2) {
    console.log('=== USER COMPARISON REPORT ===\n');

    for (const steamId of [steamId1, steamId2]) {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('steam_id', steamId)
            .single();

        if (!user) {
            console.log(`User ${steamId}: NOT FOUND\n`);
            continue;
        }

        const facepunchDeviceId = uuidv5(`facepunch-${steamId}`, UUID_NAMESPACE);
        const expoDeviceId = uuidv5(steamId, UUID_NAMESPACE);

        console.log(`User: ${steamId} (${user.id})`);
        console.log(`  Created: ${user.created_at}`);
        console.log('');

        console.log('  FCM Credentials:');
        console.log(`    Android ID: ${user.fcm_credentials?.gcm?.androidId || 'MISSING'}`);
        console.log(`    Security Token: ${user.fcm_credentials?.gcm?.securityToken?.substring(0, 20) || 'MISSING'}...`);
        console.log(`    FCM Token: ${user.fcm_credentials?.fcm?.token?.substring(0, 50) || 'MISSING'}...`);
        console.log('');

        console.log('  Expo/Facepunch:');
        console.log(`    Expo Push Token: ${user.expo_push_token || 'MISSING'}`);
        console.log(`    Facepunch DeviceId: ${facepunchDeviceId}`);
        console.log(`    Expo DeviceId: ${expoDeviceId}`);
        console.log(`    RustPlus Auth Token: ${user.rustplus_auth_token?.substring(0, 30) || 'MISSING'}...`);
        console.log('');

        // Try to query Facepunch list (might 404)
        console.log('  Facepunch Registration Status:');
        try {
            const listResponse = await axios.get(
                'https://companion-rust.facepunch.com/api/push/list',
                { headers: { 'Authorization': `Bearer ${user.rustplus_auth_token}` }}
            );

            console.log(`    ✅ Registrations: ${listResponse.data.length}`);
            listResponse.data.forEach((reg, idx) => {
                console.log(`    [${idx}] DeviceId: ${reg.DeviceId}`);
                console.log(`        PushKind: ${reg.PushKind} (0=Expo, 1=FCM, 2=APNS)`);
                console.log(`        PushToken: ${reg.PushToken.substring(0, 50)}...`);
                console.log(`        Matches our token: ${reg.PushToken === user.expo_push_token ? 'YES ✅' : 'NO ❌'}`);
            });
        } catch (err) {
            console.log(`    ⚠️  Cannot query Facepunch list: ${err.response?.status || err.message}`);
            console.log(`    (This endpoint might not exist, but registration still works)`);
        }

        console.log('\n' + '='.repeat(70) + '\n');
    }

    console.log('=== SUMMARY ===\n');
    console.log('Key Findings:');
    console.log('- Both users have unique credentials (verified by check-android-ids.js)');
    console.log('- FCM notification chain works (verified by test-expo-send.js)');
    console.log('- Problem: Facepunch not sending pairing notifications to non-working user');
    console.log('');
    console.log('Possible Causes:');
    console.log('1. User signed into Rust+ with DIFFERENT Steam account');
    console.log('2. User paired while FCM listener was not active (before web app connection)');
    console.log('3. Facepunch server-side filtering/validation');
    console.log('');
    console.log('Next Steps:');
    console.log('1. Verify user is signed into Rust+ with correct Steam account in-game');
    console.log('2. Ensure user connects to web app BEFORE pairing in-game');
    console.log('3. Check cloud-shim logs when user attempts pairing');
}

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.log('Usage: node compare-users.js <STEAM_ID_1> <STEAM_ID_2>');
    console.log('Example: node compare-users.js 76561197995028213 76561198323129129');
    process.exit(1);
}

compareUsers(args[0], args[1]).then(() => process.exit(0)).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
