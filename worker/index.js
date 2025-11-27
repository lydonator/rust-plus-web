/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const RustPlus = require('@liamcottle/rustplus.js');

// Start FCM listener in parallel
require('./fcm-listener');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Rust+ Worker started...');

// Connection Manager
const activeConnections = new Map(); // serverId -> RustPlus instance

async function syncConnections() {
    const { data: servers, error } = await supabase
        .from('servers')
        .select('*');

    if (error) {
        console.error('Error fetching servers:', error);
        return;
    }

    // Connect to new servers
    servers.forEach(server => {
        if (!activeConnections.has(server.id)) {
            console.log(`Connecting to server: ${server.name} (${server.ip}:${server.port})`);
            const rustPlus = new RustPlus(server.ip, server.port, server.player_id, server.player_token);

            rustPlus.on('connected', () => {
                console.log(`Connected to ${server.name}`);

                // Fetch Server Info
                rustPlus.getInfo((message) => {
                    console.log('Info:', message);
                    if (message && message.response && message.response.info) {
                        supabase.from('server_info').upsert({
                            server_id: server.id,
                            name: message.response.info.name,
                            header_image: message.response.info.headerImage,
                            url: message.response.info.url,
                            map: message.response.info.map,
                            map_size: message.response.info.mapSize,
                            wipe_time: new Date(message.response.info.wipeTime * 1000).toISOString(),
                            players: message.response.info.players,
                            max_players: message.response.info.maxPlayers,
                            queued_players: message.response.info.queuedPlayers,
                            seed: message.response.info.seed,
                            salt: message.response.info.salt,
                            updated_at: new Date().toISOString()
                        }).then(({ error }) => {
                            if (error) console.error('Error saving server info:', error);
                        });
                    }
                });
            });

            rustPlus.on('error', (err) => {
                console.error(`Error for ${server.name}:`, err);
            });

            rustPlus.on('message', (message) => {
                // TODO: Handle messages (chat, broadcast) and save to DB/push to frontend
                console.log(`Message from ${server.name}:`, message);
            });

            rustPlus.connect();
            activeConnections.set(server.id, rustPlus);
        }
    });

    // Disconnect removed servers
    const serverIds = new Set(servers.map(s => s.id));
    activeConnections.forEach((client, id) => {
        if (!serverIds.has(id)) {
            console.log(`Disconnecting server ${id}`);
            client.disconnect();
            activeConnections.delete(id);
        }
    });
}

// Poll for changes every 10 seconds
setInterval(syncConnections, 10000);
syncConnections();

console.log('Worker running. Polling for servers...');
