// Script to unregister all devices from Facepunch for a Steam ID
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function unregisterAllDevices() {
    const userId = '75aa8dd2-5d9a-45df-9a38-bdc3f0b14082';

    // Get user data
    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    console.log('User Steam ID:', user.steam_id);
    console.log('Auth Token:', user.rustplus_auth_token.substring(0, 50) + '...');

    // Try different possible unregister endpoints
    const endpoints = [
        '/api/push/unregister',
        '/api/push/clear',
        '/api/push/delete',
        '/api/push/remove'
    ];

    for (const endpoint of endpoints) {
        console.log(`\n=== Trying ${endpoint} ===`);

        // Try with DeviceId
        const response1 = await fetch(`https://companion-rust.facepunch.com${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.rustplus_auth_token}`
            },
            body: JSON.stringify({
                AuthToken: user.rustplus_auth_token,
                DeviceId: 'rustplus-web-76561197995028213'  // Old device ID
            })
        });

        console.log(`With DeviceId - Status: ${response1.status}`);
        const text1 = await response1.text();
        console.log(`Response: ${text1.substring(0, 200)}`);

        // Try without DeviceId (unregister all)
        const response2 = await fetch(`https://companion-rust.facepunch.com${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.rustplus_auth_token}`
            },
            body: JSON.stringify({
                AuthToken: user.rustplus_auth_token
            })
        });

        console.log(`Without DeviceId - Status: ${response2.status}`);
        const text2 = await response2.text();
        console.log(`Response: ${text2.substring(0, 200)}`);
    }
}

unregisterAllDevices().catch(console.error);
