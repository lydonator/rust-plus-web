// Script to send a test notification to a user's Expo token
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendTestNotification(steamId) {
    console.log(`\n=== Sending Test Notification for Steam ID: ${steamId} ===\n`);

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

    console.log(`User: ${user.id}`);
    console.log(`Expo Token: ${user.expo_push_token}`);

    if (!user.expo_push_token) {
        console.error('❌ No Expo token found');
        return;
    }

    console.log('\n🚀 Sending test notification via Expo API...');

    try {
        const response = await axios.post('https://exp.host/--/api/v2/push/send', {
            to: user.expo_push_token,
            title: 'Test Notification',
            body: 'This is a test from the cloud-shim debugger',
            data: {
                type: 'test',
                message: 'If you see this, the chain works!'
            }
        });

        console.log(`✅ Expo API Response: ${response.status}`);
        console.log('Data:', JSON.stringify(response.data, null, 2));

        if (response.data.data && response.data.data.status === 'ok') {
            console.log('\n✅ Notification sent successfully to Expo!');
            console.log('👉 Check cloud-shim logs NOW to see if it arrived.');
        } else {
            console.error('❌ Expo reported an error:', response.data);
        }

    } catch (err) {
        console.error('❌ Failed to send notification:', err.message);
        if (err.response) {
            console.error('Response:', err.response.data);
        }
    }
}

const steamId = process.argv[2];
if (!steamId) {
    console.log('Usage: node test-expo-send.js <STEAM_ID>');
    process.exit(1);
}

sendTestNotification(steamId).catch(console.error);
