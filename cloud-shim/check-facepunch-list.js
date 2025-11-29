// Script to check Facepunch registrations for a Steam ID
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFacepunchRegistrations(steamId) {
    console.log(`\n=== Checking Facepunch Registrations for Steam ID: ${steamId} ===\n`);

    // Get user data
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('steam_id', steamId)
        .single();

    if (error || !user) {
        console.error('❌ User not found in database:', error);
        return;
    }

    console.log('✅ Found user in database:');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Steam ID: ${user.steam_id}`);
    console.log(`   Expo Token: ${user.expo_push_token}`);
    console.log('');

    if (!user.rustplus_auth_token) {
        console.error('❌ No Rust+ auth token found. User needs to sign in.');
        return;
    }

    // Check what Facepunch has registered
    console.log('🔍 Querying Facepunch for current registrations...\n');

    try {
        const response = await fetch('https://companion-rust.facepunch.com/api/push/list', {
            headers: {
                'Authorization': `Bearer ${user.rustplus_auth_token}`
            }
        });

        if (response.ok) {
            const registrations = await response.json();

            if (registrations && registrations.length > 0) {
                console.log(`✅ Facepunch has ${registrations.length} registration(s):\n`);

                registrations.forEach((reg, index) => {
                    console.log(`Registration #${index + 1}:`);
                    console.log(`   Device ID: ${reg.DeviceId}`);
                    console.log(`   Push Kind: ${reg.PushKind} (0=Expo, 1=FCM)`);
                    console.log(`   Push Token: ${reg.PushToken}`);
                    console.log(`   Registered: ${reg.RegisteredAt}`);
                    console.log('');
                });

                // Check if our Expo token is registered
                const ourToken = registrations.find(r => r.PushToken === user.expo_push_token);
                if (ourToken) {
                    console.log('✅ Our Expo token IS registered with Facepunch!');
                    console.log('   This means the issue is NOT with registration.');
                    console.log('   Possible causes:');
                    console.log('   - User is signed into Rust+ with DIFFERENT Steam account');
                    console.log('   - FCM notification routing issue');
                    console.log('   - Rust+ app not sending pairing notification');
                } else {
                    console.log('❌ Our Expo token is NOT in Facepunch registrations!');
                    console.log('   Expected: ' + user.expo_push_token);
                    console.log('   This is the problem - re-registration needed.');
                }
            } else {
                console.log('⚠️  Facepunch has NO registrations for this Steam ID!');
                console.log('   This means pairing notifications will not work.');
                console.log('   Need to register Expo token with Facepunch.');
            }
        } else {
            const errorText = await response.text();
            console.error('❌ Failed to query Facepunch:', response.status, errorText);
        }
    } catch (err) {
        console.error('❌ Error querying Facepunch:', err.message);
    }
}

// Usage
const steamId = process.argv[2];

if (!steamId) {
    console.log('Usage: node check-facepunch-list.js <STEAM_ID>');
    console.log('Example: node check-facepunch-list.js 76561197969993471');
    process.exit(1);
}

checkFacepunchRegistrations(steamId).catch(console.error);
