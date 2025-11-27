// Unregister OLD FCM registrations from Facepunch
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function unregisterOldTokens() {
    const userId = '75aa8dd2-5d9a-45df-9a38-bdc3f0b14082';

    const { data: user } = await supabase
        .from('users')
        .select('rustplus_auth_token, fcm_credentials')
        .eq('id', userId)
        .single();

    console.log('Unregistering old FCM tokens from Facepunch...\n');

    // Get current FCM token
    const currentFcmToken = user.fcm_credentials.fcm.token;
    console.log(`Current FCM Token: ${currentFcmToken.substring(0, 50)}...`);

    // Generate the Expo token from current FCM token (to unregister it)
    const { v5: uuidv5 } = require('uuid');
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const deviceId = uuidv5(currentFcmToken, NAMESPACE);

    console.log(`DeviceId (UUID v5): ${deviceId}`);

    // Get the Expo token
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/getExpoPushToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'fcm',
            deviceId: deviceId,
            development: false,
            appId: 'com.facepunch.rust.companion',
            deviceToken: currentFcmToken,
            projectId: "49451aca-a822-41e6-ad59-955718d0ff9c"
        })
    });

    const expoData = await expoResponse.json();
    const expoPushToken = expoData.data.expoPushToken;
    console.log(`Expo Push Token: ${expoPushToken}\n`);

    // Now unregister it from Facepunch
    const response = await fetch('https://companion-rust.facepunch.com/api/push/unregister', {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${user.rustplus_auth_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            AuthToken: user.rustplus_auth_token,
            PushToken: expoPushToken  // Unregister the Expo token
        })
    });

    console.log(`Unregister Response Status: ${response.status}`);
    const text = await response.text();
    console.log(`Response: ${text}`);

    if (response.ok) {
        console.log('\n✅ Successfully unregistered! Now try re-registering by restarting the Shim.');
    } else {
        console.log('\n❌ Unregister failed. This might mean there was no registration to remove.');
    }
}

unregisterOldTokens().catch(console.error);
