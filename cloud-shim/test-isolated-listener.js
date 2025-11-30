/**
 * Test if a single isolated listener can receive Facepunch notifications
 *
 * This tests whether the issue is:
 * - Multiple listeners interfering with each other
 * - OR something specific to the non-owner account
 *
 * Usage:
 * 1. Stop the cloud-shim: pm2 stop cloud-shim
 * 2. Run this for the other user: node test-isolated-listener.js <userId>
 * 3. Have them pair in-game
 * 4. Check if notification is received
 */

require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const PushReceiverClient = require('@liamcottle/push-receiver/src/client');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testIsolatedListener(userId) {
    try {
        console.log(`\n🧪 Testing isolated FCM listener for user: ${userId}\n`);

        // Get user data
        const { data: user, error } = await supabase
            .from('users')
            .select('steam_id, fcm_credentials, expo_push_token')
            .eq('id', userId)
            .single();

        if (error || !user) {
            console.error('❌ User not found:', error);
            return;
        }

        console.log('📋 User Info:');
        console.log(`   Steam ID: ${user.steam_id}`);
        console.log(`   Expo Token: ${user.expo_push_token}`);
        console.log(`   Has FCM Credentials: ${!!user.fcm_credentials}`);
        console.log();

        if (!user.fcm_credentials) {
            console.error('❌ No FCM credentials');
            return;
        }

        const androidId = user.fcm_credentials.gcm.androidId;
        const securityToken = user.fcm_credentials.gcm.securityToken;

        console.log(`📱 Creating FCM client...`);
        console.log(`   Android ID: ${androidId}`);
        console.log();

        const client = new PushReceiverClient(androidId, securityToken, []);

        // Set up event handlers
        client.on('ON_DATA_RECEIVED', (data) => {
            console.log(`\n🔔 =========================================`);
            console.log(`   📨 FCM DATA RECEIVED!`);
            console.log(`   🕐 Time: ${new Date().toLocaleString()}`);
            console.log(`   📦 Data:`, JSON.stringify(data, null, 2));
            console.log(`=========================================\n`);
        });

        client.on('ON_NOTIFICATION_RECEIVED', (notification) => {
            console.log(`\n🔔 =========================================`);
            console.log(`   📨 FCM NOTIFICATION RECEIVED!`);
            console.log(`   🕐 Time: ${new Date().toLocaleString()}`);
            console.log(`   📦 Notification:`, JSON.stringify(notification, null, 2));
            console.log(`=========================================\n`);
        });

        // Connect
        console.log('🔌 Connecting to FCM (mtalk.google.com:5228)...');
        await client.connect();
        console.log('✅ Connected to FCM!\n');

        console.log('👂 Listening for notifications...');
        console.log('   💡 Have the user try pairing in-game NOW');
        console.log('   ⏳ Will listen for 5 minutes...');
        console.log('   🛑 Press Ctrl+C to stop\n');

        // Keep alive for 5 minutes
        setTimeout(() => {
            console.log('\n⏰ 5 minutes elapsed. Stopping...\n');
            client.destroy();
            process.exit(0);
        }, 5 * 60 * 1000);

        // Also handle Ctrl+C
        process.on('SIGINT', () => {
            console.log('\n\n🛑 Stopping listener...\n');
            client.destroy();
            process.exit(0);
        });

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

const userId = process.argv[2];
if (!userId) {
    console.error('Usage: node test-isolated-listener.js <userId>');
    console.error('\nExample:');
    console.error('  1. pm2 stop cloud-shim');
    console.error('  2. node test-isolated-listener.js abc123-def456-...');
    console.error('  3. Have user pair in-game');
    console.error('  4. Check if notification arrives');
    console.error('  5. pm2 start cloud-shim');
    process.exit(1);
}

testIsolatedListener(userId);
