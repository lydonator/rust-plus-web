// Diagnostic script to check if each user has a unique Android ID
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndroidIds() {
    console.log('=== Checking Android IDs for all users ===\n');

    const { data: users, error } = await supabase
        .from('users')
        .select('id, steam_id, fcm_credentials, expo_push_token')
        .not('fcm_credentials', 'is', null);

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log(`Found ${users.length} users with FCM credentials\n`);

    const androidIds = new Map();
    const fcmTokens = new Map();
    const expoTokens = new Map();

    for (const user of users) {
        const androidId = user.fcm_credentials?.gcm?.androidId;
        const fcmToken = user.fcm_credentials?.fcm?.token;
        const expoToken = user.expo_push_token;

        console.log(`User: ${user.steam_id || user.id.substring(0, 8)}`);
        console.log(`  Android ID: ${androidId || 'MISSING'}`);
        console.log(`  FCM Token: ${fcmToken?.substring(0, 50) || 'MISSING'}...`);
        console.log(`  Expo Token: ${expoToken || 'MISSING'}`);
        console.log('');

        // Track duplicates
        if (androidId) {
            if (!androidIds.has(androidId)) {
                androidIds.set(androidId, []);
            }
            androidIds.get(androidId).push(user.steam_id || user.id);
        }

        if (fcmToken) {
            if (!fcmTokens.has(fcmToken)) {
                fcmTokens.set(fcmToken, []);
            }
            fcmTokens.get(fcmToken).push(user.steam_id || user.id);
        }

        if (expoToken) {
            if (!expoTokens.has(expoToken)) {
                expoTokens.set(expoToken, []);
            }
            expoTokens.get(expoToken).push(user.steam_id || user.id);
        }
    }

    // Check for duplicates
    console.log('\n=== Duplicate Analysis ===\n');

    const duplicateAndroidIds = Array.from(androidIds.entries()).filter(([id, users]) => users.length > 1);
    const duplicateFcmTokens = Array.from(fcmTokens.entries()).filter(([token, users]) => users.length > 1);
    const duplicateExpoTokens = Array.from(expoTokens.entries()).filter(([token, users]) => users.length > 1);

    if (duplicateAndroidIds.length > 0) {
        console.log('🚨 CRITICAL: Found duplicate Android IDs:');
        for (const [androidId, users] of duplicateAndroidIds) {
            console.log(`  Android ID ${androidId} is shared by:`);
            users.forEach(user => console.log(`    - ${user}`));
        }
        console.log('\n⚠️  This is the ROOT CAUSE of the pairing notification issue!');
        console.log('⚠️  Multiple users cannot share the same Android ID.');
        console.log('⚠️  Only ONE FCM listener connection can be active per Android ID.\n');
    } else {
        console.log('✅ All Android IDs are unique');
    }

    if (duplicateFcmTokens.length > 0) {
        console.log('\n🚨 WARNING: Found duplicate FCM tokens:');
        for (const [token, users] of duplicateFcmTokens) {
            console.log(`  FCM Token ${token.substring(0, 50)}... is shared by:`);
            users.forEach(user => console.log(`    - ${user}`));
        }
    } else {
        console.log('✅ All FCM tokens are unique');
    }

    if (duplicateExpoTokens.length > 0) {
        console.log('\n🚨 WARNING: Found duplicate Expo tokens:');
        for (const [token, users] of duplicateExpoTokens) {
            console.log(`  Expo Token ${token} is shared by:`);
            users.forEach(user => console.log(`    - ${user}`));
        }
    } else {
        console.log('✅ All Expo tokens are unique');
    }

    console.log('\n=== Summary ===');
    console.log(`Total users: ${users.length}`);
    console.log(`Unique Android IDs: ${androidIds.size}`);
    console.log(`Unique FCM Tokens: ${fcmTokens.size}`);
    console.log(`Unique Expo Tokens: ${expoTokens.size}`);
}

checkAndroidIds().catch(console.error);
