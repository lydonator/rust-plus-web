require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listUsers() {
    console.log('Fetching users...');
    const { data: users, error } = await supabase
        .from('users')
        .select('id, steam_id');

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
        console.log(`- ID: ${u.id}, SteamID: ${u.steam_id}`);
    });
}

listUsers();
