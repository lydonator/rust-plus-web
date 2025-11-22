// Try DELETE method on unregister endpoint
require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testUnregisterMethods() {
    const userId = '75aa8dd2-5d9a-45df-9a38-bdc3f0b14082';

    const { data: user } = await supabase
        .from('users')
        .select('rustplus_auth_token')
        .eq('id', userId)
        .single();

    console.log('Testing /api/push/unregister with different HTTP methods...\n');

    // Try DELETE
    const r1 = await fetch('https://companion-rust.facepunch.com/api/push/unregister', {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${user.rustplus_auth_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            DeviceId: 'rustplus-web-76561197995028213'
        })
    });
    console.log(`DELETE with DeviceId: ${r1.status}`);
    console.log(await r1.text());
    console.log('');

    // Try GET
    const r2 = await fetch('https://companion-rust.facepunch.com/api/push/unregister', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${user.rustplus_auth_token}`
        }
    });
    console.log(`GET: ${r2.status}`);
    console.log(await r2.text());
    console.log('');

    // Try PUT
    const r3 = await fetch('https://companion-rust.facepunch.com/api/push/unregister', {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${user.rustplus_auth_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            DeviceId: 'rustplus-web-76561197995028213'
        })
    });
    console.log(`PUT with DeviceId: ${r3.status}`);
    console.log(await r3.text());
}

testUnregisterMethods().catch(console.error);
