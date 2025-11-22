const { register, listen } = require('./lib/push-receiver');
const { supabaseAdmin: supabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'fcm-credentials.json');
const SENDER_ID = '976529667804'; // Rust+ Sender ID

let fcmCredentials = null;

async function initializeFCMListener(specificSteamId = null) {
    console.log('[FCM Listener] Initializing FCM listener...');

    try {
        // Load or register credentials
        if (fs.existsSync(CREDENTIALS_PATH)) {
            fcmCredentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            console.log('[FCM Listener] Loaded existing FCM credentials');
        } else {
            console.log('[FCM Listener] Registering with FCM...');
            fcmCredentials = await register(SENDER_ID);
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(fcmCredentials, null, 2));
            console.log('[FCM Listener] ✅ FCM credentials registered and saved');
        }

        // Start listening
        console.log('[FCM Listener] 👂 Listening for FCM notifications...');
        await listen(fcmCredentials, ({ notification, persistentId }) => {
            handleFCMNotification(notification, persistentId);
        });

        // Register existing users with Facepunch (so they send push to us)
        await registerExistingUsers(specificSteamId);

    } catch (error) {
        console.error('[FCM Listener] Error initializing:', error);
    }
}

async function registerExistingUsers(specificSteamId = null) {
    try {
        let query = supabase
            .from('users')
            .select('*')
            .not('rustplus_auth_token', 'is', null);

        if (specificSteamId) {
            query = query.eq('steam_id', specificSteamId);
        }

        const { data: users, error } = await query;

        if (error) {
            console.error('[FCM Listener] Error fetching users:', error);
            return;
        }

        if (users && users.length > 0) {
            console.log(`[FCM Listener] Found ${users.length} users to register`);

            for (const user of users) {
                await registerUserWithFacepunch(user);
            }
        }
    } catch (err) {
        console.error('[FCM Listener] Error in registerExistingUsers:', err);
    }
}

async function registerUserWithFacepunch(user) {
    if (!fcmCredentials) {
        console.error('[FCM Listener] FCM not initialized yet');
        return;
    }

    try {
        console.log(`[FCM Listener] Registering user ${user.steam_id} with Facepunch...`);

        // Generate a unique device ID for this user
        const deviceId = `rustplus-web-${user.steam_id}`;

        // Get Expo Push Token
        const expoPushToken = await getExpoPushToken(fcmCredentials.fcm.token);
        console.log(`[FCM Listener] Got Expo token for ${user.steam_id}:`, expoPushToken);

        // Register with Facepunch
        const response = await fetch('https://companion-rust.facepunch.com/api/push/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.rustplus_auth_token}`
            },
            body: JSON.stringify({
                AuthToken: user.rustplus_auth_token,
                DeviceId: deviceId,
                PushKind: 0,
                PushToken: expoPushToken
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[FCM Listener] Failed to register user ${user.steam_id}:`, errorText);
            return;
        }

        // Save Expo token to database
        await supabase
            .from('users')
            .update({
                expo_push_token: expoPushToken,
                fcm_token: fcmCredentials.fcm.token
            })
            .eq('id', user.id);

        console.log(`[FCM Listener] ✅ Registered user ${user.steam_id} with Facepunch`);

    } catch (error) {
        console.error(`[FCM Listener] Error registering user ${user.steam_id}:`, error);
    }
}

async function getExpoPushToken(fcmToken) {
    const response = await fetch('https://exp.host/--/api/v2/push/getExpoPushToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            deviceId: fcmToken,
            experienceId: '@facepunch/RustCompanion',
            appId: 'com.facepunch.rust.companion',
            deviceToken: fcmToken,
            type: 'fcm',
            development: false
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get Expo token: ${error}`);
    }

    const data = await response.json();
    return data.data.expoPushToken;
}

async function handleFCMNotification(notification, persistentId) {
    console.log('[FCM Listener] Processing notification...');

    try {
        // Parse notification data
        const data = notification.data || {};

        console.log('[FCM Listener] Notification data:', data);

        // The notification should contain pairing information
        // Extract Steam ID to identify the user
        const steamId = data.steamId || data.playerId;

        if (!steamId) {
            console.log('[FCM Listener] No Steam ID in notification, cannot identify user');
            return;
        }

        // Find user by Steam ID
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, steam_id')
            .eq('steam_id', steamId)
            .single();

        if (userError || !user) {
            console.log(`[FCM Listener] User not found for Steam ID: ${steamId}`);
            return;
        }

        console.log(`[FCM Listener] Notification for user: ${user.steam_id}`);

        // Check if this is a server pairing notification
        if (data.type === 'server' || data.ip) {
            console.log('[FCM Listener] Server pairing notification detected!');

            // Extract pairing information
            const serverInfo = {
                ip: data.ip,
                port: data.port,
                player_id: data.playerId,
                player_token: data.playerToken,
                name: data.name || `${data.ip}:${data.port}`,
                user_id: user.id,
            };

            // Only save if we have the required fields
            if (serverInfo.ip && serverInfo.port && serverInfo.player_id && serverInfo.player_token) {
                console.log('[FCM Listener] Saving server pairing data to database...');

                // Check if server already exists for this user
                const { data: existingServer } = await supabase
                    .from('servers')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('ip', serverInfo.ip)
                    .eq('port', serverInfo.port)
                    .single();

                if (existingServer) {
                    // Update existing server
                    const { error } = await supabase
                        .from('servers')
                        .update({
                            player_id: serverInfo.player_id,
                            player_token: serverInfo.player_token,
                            name: serverInfo.name,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', existingServer.id);

                    if (error) {
                        console.error('[FCM Listener] Error updating server:', error);
                    } else {
                        console.log(`[FCM Listener] ✅ Updated server: ${serverInfo.name}`);
                    }
                } else {
                    // Insert new server
                    const { error } = await supabase
                        .from('servers')
                        .insert([serverInfo]);

                    if (error) {
                        console.error('[FCM Listener] Error inserting server:', error);
                    } else {
                        console.log(`[FCM Listener] ✅ Added new server: ${serverInfo.name}`);
                    }
                }
            } else {
                console.log('[FCM Listener] Incomplete pairing data:', serverInfo);
            }
        } else {
            console.log('[FCM Listener] Non-pairing notification');

            // Store generic notification
            await supabase.from('notifications').insert({
                user_id: user.id,
                type: data.type || 'unknown',
                title: data.title || 'Rust+ Notification',
                body: data.message || data.body || JSON.stringify(data),
                data: data,
                is_read: false
            });
        }
    } catch (error) {
        console.error('[FCM Listener] Error handling notification:', error);
    }
}

// Export function to register a new user
async function registerNewUser(user) {
    if (!fcmCredentials) {
        console.log('[FCM Listener] FCM not initialized, initializing now...');
        await initializeFCMListener();
    }

    await registerUserWithFacepunch(user);
}

// Initialize on startup
initializeFCMListener().catch(err => {
    console.error('[FCM Listener] Fatal error initializing FCM:', err);
});

// Export for use by API routes
module.exports = {
    initializeFCMListener,
    registerNewUser,
    getFCMCredentials: () => fcmCredentials
};

console.log('[FCM Listener] ✅ FCM Listener module loaded');
