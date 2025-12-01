const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const AndroidFCM = require('@liamcottle/push-receiver/src/android/fcm');
const PushReceiverClient = require('@liamcottle/push-receiver/src/client');
const axios = require('axios');
const config = require('./config');

// Constants from config (Rust+ companion app public constants)
const API_KEY = config.RUSTPLUS_API_KEY;
const PROJECT_ID = config.RUSTPLUS_PROJECT_ID;
const GCM_SENDER_ID = config.RUSTPLUS_SENDER_ID;
const GMS_APP_ID = config.RUSTPLUS_GMS_APP_ID;
const ANDROID_PACKAGE_NAME = config.RUSTPLUS_ANDROID_PACKAGE;
const ANDROID_PACKAGE_CERT = config.RUSTPLUS_ANDROID_CERT;

class FcmManager {
    constructor() {
        this.supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        this.activeListeners = new Map(); // userId -> { client, onNotification, onDevicePaired, lastNotificationReceived, notificationHistory, registrationLog }
        this.processedNotifications = new Map(); // persistentId -> timestamp (for deduplication)
        this.cleanupInterval = setInterval(() => this.cleanupOldNotifications(), 60000); // Clean every minute
    }

    cleanupOldNotifications() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const [id, timestamp] of this.processedNotifications.entries()) {
            if (now - timestamp > maxAge) {
                this.processedNotifications.delete(id);
            }
        }
    }

    async getOrRegisterCredentials(userId) {
        // Fetch user from Supabase to check for existing credentials
        const { data: user, error } = await this.supabase
            .from('users')
            .select('fcm_credentials')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.error(`[FCM] Error fetching user ${userId}:`, error);
            throw error;
        }

        if (!user) {
            console.error(`[FCM] User ${userId} not found in database.`);
            throw new Error(`User ${userId} not found`);
        }

        // Check if we have valid existing credentials
        if (user?.fcm_credentials && user.fcm_credentials.gcm && user.fcm_credentials.fcm) {
            console.log(`[FCM] Found existing credentials for user ${userId}`);
            return user.fcm_credentials;
        }

        console.log(`[FCM] Registering new credentials for user ${userId}...`);

        try {
            const fcmCredentials = await AndroidFCM.register(
                API_KEY,
                PROJECT_ID,
                GCM_SENDER_ID,
                GMS_APP_ID,
                ANDROID_PACKAGE_NAME,
                ANDROID_PACKAGE_CERT
            );

            console.log(`[FCM] Registration complete.`);
            console.log(`[FCM] FCM Token: ${fcmCredentials.fcm.token}`);
            console.log(`[FCM] Android ID: ${fcmCredentials.gcm.androidId}`);

            // Save to Supabase
            const { error: updateError } = await this.supabase
                .from('users')
                .update({ fcm_credentials: fcmCredentials })
                .eq('id', userId);

            if (updateError) {
                console.error(`[FCM] Error saving credentials:`, updateError);
                throw updateError;
            }

            console.log(`[FCM] Saved new credentials for user ${userId}`);
            return fcmCredentials;

        } catch (err) {
            console.error(`[FCM] Registration failed:`, err);
            throw err;
        }
    }

    async startListening(userId, onNotification, onDevicePaired, onServerPaired) {
        if (this.activeListeners.has(userId)) {
            console.log(`[FCM] Already listening for user ${userId}`);
            // Update callbacks if needed
            const listener = this.activeListeners.get(userId);
            listener.onNotification = onNotification;
            listener.onDevicePaired = onDevicePaired;
            listener.onServerPaired = onServerPaired;

            // Return existing credentials so SSE can send fcm_status event on reconnect
            const credentials = await this.getOrRegisterCredentials(userId);

            // CRITICAL FIX: Re-register with Facepunch on reconnect to ensure token is still active
            console.log(`[FCM] Re-validating Facepunch registration on reconnect...`);
            await this.registerWithFacepunch(userId, credentials);

            return credentials;
        }

        try {
            const credentials = await this.getOrRegisterCredentials(userId);
            console.log(`[FCM] Listening started for user ${userId}`);

            const androidId = credentials.gcm.androidId;
            const securityToken = credentials.gcm.securityToken;
            const client = new PushReceiverClient(androidId, securityToken, []);

            client.on('ON_DATA_RECEIVED', async (data) => {
                // Update last notification received timestamp and add to history
                if (this.activeListeners.has(userId)) {
                    const listener = this.activeListeners.get(userId);
                    listener.lastNotificationReceived = Date.now();

                    const notificationRecord = {
                        type: 'ON_DATA_RECEIVED',
                        timestamp: Date.now(),
                        data: data
                    };

                    // Add to history, keep last 10
                    listener.notificationHistory.unshift(notificationRecord);
                    if (listener.notificationHistory.length > 10) {
                        listener.notificationHistory.pop();
                    }
                }
                await this.handleNotification(userId, data);
            });

            client.on('ON_NOTIFICATION_RECEIVED', (notification) => {
                console.log(`[FCM] 🔔 NOTIFICATION RECEIVED for user ${userId}:`, notification);
                // Update last notification received timestamp and add to history
                if (this.activeListeners.has(userId)) {
                    const listener = this.activeListeners.get(userId);
                    listener.lastNotificationReceived = Date.now();

                    const notificationRecord = {
                        type: 'ON_NOTIFICATION_RECEIVED',
                        timestamp: Date.now(),
                        notification: notification
                    };

                    // Add to history, keep last 10
                    listener.notificationHistory.unshift(notificationRecord);
                    if (listener.notificationHistory.length > 10) {
                        listener.notificationHistory.pop();
                    }

                    if (listener.onNotification) listener.onNotification(notification);
                }
            });

            await client.connect();
            console.log(`[FCM] ✅ FCM Client CONNECTED for user ${userId}`);

            this.activeListeners.set(userId, {
                client,
                onNotification,
                onDevicePaired,
                onServerPaired,
                lastNotificationReceived: null,
                notificationHistory: [],
                registrationLog: []
            });

            // Register with Facepunch
            await this.registerWithFacepunch(userId, credentials);

            return credentials;

        } catch (err) {
            console.error(`[FCM] Error starting listener for user ${userId}:`, err);
            throw err;
        }
    }

    logRegistration(userId, step, data) {
        const logEntry = {
            timestamp: Date.now(),
            step,
            data
        };

        console.log(`[FCM Registration] ${step}:`, data);

        if (this.activeListeners.has(userId)) {
            const listener = this.activeListeners.get(userId);

            // If this is step 1 (start of new registration flow), clear previous log
            if (step.startsWith('1.')) {
                listener.registrationLog = [];
            }

            listener.registrationLog.push(logEntry);

            // Keep only last complete flow (steps 1-10 or ERROR steps)
            // Max ~10 steps per flow, so cap at 15 to be safe
            if (listener.registrationLog.length > 15) {
                listener.registrationLog.shift();
            }
        }
    }

    async registerWithFacepunch(userId, credentials) {
        try {
            this.logRegistration(userId, '1. Starting Facepunch Registration', {
                hasCredentials: !!credentials,
                androidId: credentials?.gcm?.androidId,
                fcmToken: credentials?.fcm?.token?.substring(0, 30) + '...'
            });

            // Get user's Steam ID, auth token, and existing expo token
            const { data: user, error } = await this.supabase
                .from('users')
                .select('steam_id, expo_push_token, rustplus_auth_token')
                .eq('id', userId)
                .maybeSingle();

            if (error || !user?.steam_id) {
                console.error(`[FCM] Could not find Steam ID for user ${userId}`);
                this.logRegistration(userId, 'ERROR: User Not Found', { error });
                return;
            }

            if (!user.rustplus_auth_token) {
                console.error(`[FCM] User ${user.steam_id} has no Rust+ auth token. Cannot register with Facepunch.`);
                this.logRegistration(userId, 'ERROR: No RustPlus Auth Token', { steamId: user.steam_id });
                return;
            }

            this.logRegistration(userId, '2. User Data Retrieved', {
                steamId: user.steam_id,
                hasExpoToken: !!user.expo_push_token,
                expoTokenPreview: user.expo_push_token?.substring(0, 30) + '...',
                hasAuthToken: !!user.rustplus_auth_token,
                authTokenPreview: user.rustplus_auth_token?.substring(0, 20) + '...'
            });

            // Generate stable Device ID for Facepunch (Unique per SteamID to avoid conflicts)
            const UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';
            const facepunchDeviceId = uuidv5(`facepunch-${user.steam_id}`, UUID_NAMESPACE);
            console.log(`[FCM] Generated unique Facepunch DeviceId: ${facepunchDeviceId}`);

            this.logRegistration(userId, '3. Generated Facepunch DeviceId', {
                deviceId: facepunchDeviceId
            });

            // Check if we already have a valid expo token
            if (user.expo_push_token) {
                console.log(`[FCM] ✅ Found existing Expo token for user ${user.steam_id}`);
                console.log(`[FCM] 🗑️  Unregistering existing token first to ensure we become the active device...`);

                // ALWAYS unregister first to ensure this device becomes the "active" one
                // This prevents issues where other devices (like official mobile app) are registered
                // NOTE: Not logged to avoid cluttering registration log with reconnection noise
                try {
                    const unregisterPayload = {
                        AuthToken: user.rustplus_auth_token,
                        PushToken: user.expo_push_token
                    };

                    await axios.delete(
                        'https://companion-rust.facepunch.com/api/push/unregister',
                        {
                            headers: {
                                'Authorization': `Bearer ${user.rustplus_auth_token}`,
                                'Content-Type': 'application/json'
                            },
                            data: unregisterPayload
                        }
                    );

                    console.log(`[FCM] ✅ Unregistered existing token (${user.expo_push_token.substring(0, 30)}...)`);
                } catch (unregError) {
                    // It's OK if unregister fails (token might not exist)
                    console.log(`[FCM] ⚠️  Unregister returned: ${unregError.response?.status || unregError.message} (this is OK)`);
                }

                console.log(`[FCM] 🔄 Re-registering Expo token with Facepunch to ensure it's active...`);

                try {
                    const registerPayload = {
                        AuthToken: user.rustplus_auth_token,
                        DeviceId: 'rustplus-web',
                        PushKind: 3, // Expo Push (0=FCM, 1=iOS FCM, 2=APNS, 3=Expo)
                        PushToken: user.expo_push_token
                    };

                    await axios.post(
                        'https://companion-rust.facepunch.com/api/push/register',
                        registerPayload,
                        { headers: { 'Content-Type': 'application/json' } }
                    );

                    console.log(`[FCM] ✅ Successfully registered Expo token with Facepunch for ${user.steam_id}`);
                    return;
                } catch (regError) {
                    console.error(`[FCM] ❌ Failed to re-register with Facepunch:`, regError.response?.data || regError.message);
                    console.log(`[FCM] Will attempt to generate new Expo token...`);
                    // Fall through to generate new token
                }
            }

            console.log(`[FCM] Generating new Expo token for user ${user.steam_id}...`);

            // Generate stable Device ID for Expo
            const expoDeviceId = uuidv5(user.steam_id, UUID_NAMESPACE);
            console.log(`[FCM] Generated stable Expo deviceId: ${expoDeviceId}`);

            this.logRegistration(userId, '7. Generating New Expo Token', {
                expoDeviceId,
                fcmTokenPreview: credentials.fcm.token.substring(0, 30) + '...'
            });

            // Get Expo Push Token from Expo's API
            const expoPushToken = await this.getExpoPushToken(credentials.fcm.token, expoDeviceId);
            console.log(`[FCM] Got Expo Push Token: ${expoPushToken}`);

            this.logRegistration(userId, '8. Expo Token Generated', {
                expoPushToken
            });

            // Register with Facepunch
            console.log(`[FCM] 🔄 Registering new Expo token with Facepunch...`);

            try {
                const registerPayload = {
                    AuthToken: user.rustplus_auth_token,
                    DeviceId: 'rustplus-web',
                    PushKind: 3, // Expo Push (0=FCM, 1=iOS FCM, 2=APNS, 3=Expo)
                    PushToken: expoPushToken
                };

                const regResponse = await axios.post(
                    'https://companion-rust.facepunch.com/api/push/register',
                    registerPayload,
                    { headers: { 'Content-Type': 'application/json' } }
                );

                console.log(`[FCM] ✅ Successfully registered new Expo token with Facepunch for ${user.steam_id}`);

                this.logRegistration(userId, '9. Facepunch Registration SUCCESS', {
                    status: regResponse.status,
                    statusText: regResponse.statusText,
                    responseData: regResponse.data,
                    requestPayload: registerPayload
                });

                // Save to Supabase only after successful Facepunch registration
                const { error: updateError } = await this.supabase
                    .from('users')
                    .update({ expo_push_token: expoPushToken })
                    .eq('id', userId);

                if (updateError) {
                    console.error(`[FCM] Error saving Expo token to DB:`, updateError);
                    this.logRegistration(userId, '10. Database Save FAILED', {
                        error: updateError
                    });
                } else {
                    console.log(`[FCM] ✅ Saved Expo token to database for user ${user.steam_id}`);
                    this.logRegistration(userId, '10. Database Save SUCCESS', {
                        expoPushToken
                    });
                }

            } catch (regError) {
                console.error(`[FCM] ❌ Failed to register new Expo token with Facepunch:`, regError.response?.data || regError.message);

                this.logRegistration(userId, '9. Facepunch Registration FAILED', {
                    status: regError.response?.status,
                    statusText: regError.response?.statusText,
                    error: regError.message,
                    responseData: regError.response?.data
                });

                throw regError;
            }

        } catch (err) {
            console.error(`[FCM] Error in registerWithFacepunch:`, err);
        }
    }

    async getExpoPushToken(fcmToken, deviceId) {
        const response = await axios.post('https://exp.host/--/api/v2/push/getExpoPushToken', {
            type: 'fcm',
            deviceId: deviceId,
            development: false,
            appId: 'com.facepunch.rust.companion',
            deviceToken: fcmToken,
            projectId: "49451aca-a822-41e6-ad59-955718d0ff9c",
        });
        return response.data.data.expoPushToken;
    }

    async handleNotification(userId, data) {
        console.log(`[FCM] Handling notification for user ${userId}`);

        // Deduplicate notifications using persistentId (check database for persistence across restarts)
        if (data.persistentId) {
            // Check in-memory cache first (fast path)
            if (this.processedNotifications.has(data.persistentId)) {
                console.log(`[FCM] ⏭️  Skipping duplicate notification (memory): ${data.persistentId}`);
                return;
            }

            // Check database for notifications processed in previous sessions
            const { data: existing } = await this.supabase
                .from('processed_fcm_notifications')
                .select('persistent_id')
                .eq('persistent_id', data.persistentId)
                .maybeSingle();

            if (existing) {
                console.log(`[FCM] ⏭️  Skipping duplicate notification (database): ${data.persistentId}`);
                this.processedNotifications.set(data.persistentId, Date.now());
                return;
            }

            // Mark as processed in both memory and database
            this.processedNotifications.set(data.persistentId, Date.now());

            // Store in database (async, don't wait)
            this.supabase
                .from('processed_fcm_notifications')
                .insert({
                    persistent_id: data.persistentId,
                    notification_type: data.type || 'unknown'
                })
                .then(({ error }) => {
                    if (error) {
                        console.error('[FCM] Failed to store processed notification:', error);
                    }
                });
        }

        try {
            // Parse appData array into an object
            const parsedData = {};
            if (data.appData && Array.isArray(data.appData)) {
                data.appData.forEach(item => {
                    parsedData[item.key] = item.value;
                });
            } else {
                // Fallback if data is already flat
                Object.assign(parsedData, data);
            }

            // Parse the body JSON
            let body = {};
            if (parsedData.body) {
                try {
                    body = JSON.parse(parsedData.body);
                } catch (e) {
                    console.error('[FCM] Error parsing body JSON:', e);
                }
            }

            const notification = { ...parsedData, data: body };

            // Check for Server Pairing
            if (body.type === 'server') {
                console.log('[FCM] Server pairing notification detected!');
                const serverInfo = {
                    ip: body.ip,
                    port: parseInt(body.port),
                    player_id: body.playerId,
                    player_token: body.playerToken,
                    name: body.name || `${body.ip}:${body.port}`,
                    user_id: userId,
                    last_viewed_at: new Date().toISOString(), // Set to now when pairing/re-pairing
                };

                const { data: savedServer, error } = await this.supabase
                    .from('servers')
                    .upsert(serverInfo, { onConflict: 'ip,port,player_id' })
                    .select()
                    .single();

                if (error) {
                    console.error('[FCM] Error saving server:', error);
                } else {
                    console.log(`[FCM] ✅ Saved server: ${serverInfo.name}`);

                    // CRITICAL FIX: Auto-connect to the newly paired server
                    const rustPlusManager = require('./rustplus-manager');
                    try {
                        console.log(`[FCM] 🔌 Auto-connecting to newly paired server: ${serverInfo.name}`);
                        await rustPlusManager.connectToServer(savedServer.id, savedServer);
                        console.log(`[FCM] ✅ Successfully connected to ${serverInfo.name}`);

                        // Connection is now established, fetch initial data
                        console.log(`[FCM] 📡 Fetching initial server info for ${serverInfo.name}`);
                        rustPlusManager.fetchAndEmitServerInfo(savedServer.id);
                        rustPlusManager.fetchAndEmitMapData(savedServer.id);
                        rustPlusManager.fetchAndEmitTeamInfo(savedServer.id);

                        // Notify frontend that a new server was paired and connected
                        if (this.activeListeners.has(userId)) {
                            const { onServerPaired } = this.activeListeners.get(userId);
                            if (onServerPaired) {
                                onServerPaired({
                                    type: 'server_paired',
                                    serverId: savedServer.id,
                                    serverInfo: savedServer,
                                    userId
                                });
                            }
                        }
                    } catch (connectError) {
                        console.error(`[FCM] Failed to auto-connect to ${serverInfo.name}:`, connectError.message);
                        // Server is still saved, connection can be retried later
                    }
                }
            }
            // Check for Device Pairing (Smart Switch, Alarm, etc.)
            else if (body.entityId && body.entityType) {
                console.log('[FCM] 🔌 Smart Device Pairing Detected');
                console.log('[FCM] Full notification body:', JSON.stringify(body, null, 2));

                const deviceData = {
                    entity_id: parseInt(body.entityId),
                    type: parseInt(body.entityType) === 1 ? 'switch' :
                        parseInt(body.entityType) === 2 ? 'alarm' : 'storage_monitor',
                    name: body.entityName,
                };

                if (body.ip && body.port) {
                    console.log('[FCM] Attempting server lookup with:');
                    console.log('[FCM]   - userId:', userId);
                    console.log('[FCM]   - body.playerId:', body.playerId || 'NOT PROVIDED');
                    console.log('[FCM]   - body.ip:', body.ip);
                    console.log('[FCM]   - body.port:', body.port);

                    // Try to find server by IP:port:playerId first (most accurate)
                    let serverQuery = this.supabase
                        .from('servers')
                        .select('id, ip, port, player_id, name')
                        .eq('user_id', userId);

                    // If playerId is available, use it for precise matching
                    if (body.playerId) {
                        console.log('[FCM] Using playerId matching strategy');
                        serverQuery = serverQuery.eq('player_id', body.playerId);
                    } else {
                        console.log('[FCM] Using IP:port matching strategy (playerId not available)');
                        // Fallback: try IP:port match (may fail due to app port vs connection port mismatch)
                        serverQuery = serverQuery
                            .eq('ip', body.ip)
                            .eq('port', body.port.toString());
                    }

                    const { data: server, error: serverError } = await serverQuery.maybeSingle();

                    if (serverError) {
                        console.error('[FCM] Database query error:', serverError);
                    }

                    if (!server) {
                        // Debug: show what servers ARE available for this user
                        const { data: allUserServers } = await this.supabase
                            .from('servers')
                            .select('id, ip, port, player_id, name')
                            .eq('user_id', userId);

                        console.log('[FCM] User has', allUserServers?.length || 0, 'server(s) in database:');
                        if (allUserServers && allUserServers.length > 0) {
                            allUserServers.forEach(s => {
                                console.log(`[FCM]   - ${s.name}: ${s.ip}:${s.port} (player_id: ${s.player_id})`);
                            });
                        }
                    } else {
                        console.log('[FCM] ✅ Found server:', server.name, `(${server.ip}:${server.port})`);
                    }

                    if (server) {
                        const { error: deviceError } = await this.supabase
                            .from('smart_devices')
                            .upsert({
                                server_id: server.id,
                                entity_id: deviceData.entity_id,
                                type: deviceData.type,
                                name: deviceData.name,
                                value: 0
                            }, { onConflict: 'server_id,entity_id' });

                        if (deviceError) {
                            console.error('[FCM] ❌ Failed to save device:', deviceError);
                        } else {
                            console.log('[FCM] ✅ Device saved:', deviceData);

                            // Trigger onDevicePaired callback
                            if (this.activeListeners.has(userId)) {
                                const { onDevicePaired } = this.activeListeners.get(userId);
                                if (onDevicePaired) {
                                    onDevicePaired({
                                        type: 'device_paired',
                                        serverId: server.id,
                                        entityId: deviceData.entity_id,
                                        deviceData
                                    });
                                }
                            }
                        }
                    } else {
                        console.error(`[FCM] Could not find server for device pairing: ${body.ip}:${body.port}`);
                        console.error(`[FCM] Note: This may be due to app port (${body.port}) != connection port`);
                        console.error(`[FCM] Pair the server in Rust+ app first, then pair devices`);
                    }
                }
            }

            // Always trigger onNotification
            if (this.activeListeners.has(userId)) {
                const { onNotification } = this.activeListeners.get(userId);
                if (onNotification) onNotification(notification);
            }

        } catch (err) {
            console.error('[FCM] Error handling notification:', err);
        }
    }

    stopListening(userId) {
        if (this.activeListeners.has(userId)) {
            try {
                const listenerData = this.activeListeners.get(userId);
                if (listenerData && listenerData.client && typeof listenerData.client.destroy === 'function') {
                    listenerData.client.destroy();
                }
                this.activeListeners.delete(userId);
                console.log(`[FCM] Stopped listening for user ${userId}`);
            } catch (error) {
                console.error(`[FCM] Error stopping listener for ${userId}: `, error);
                this.activeListeners.delete(userId);
            }
        }
    }
}

module.exports = new FcmManager();
