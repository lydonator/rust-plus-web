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
        this.activeListeners = new Map(); // userId -> { client, onNotification, onDevicePaired }
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
            return;
        }

        try {
            const credentials = await this.getOrRegisterCredentials(userId);
            console.log(`[FCM] Listening started for user ${userId}`);

            const androidId = credentials.gcm.androidId;
            const securityToken = credentials.gcm.securityToken;
            const client = new PushReceiverClient(androidId, securityToken, []);

            client.on('ON_DATA_RECEIVED', async (data) => {
                await this.handleNotification(userId, data);
            });

            client.on('ON_NOTIFICATION_RECEIVED', (notification) => {
                console.log(`[FCM] 🔔 NOTIFICATION RECEIVED for user ${userId}:`, notification);
                if (this.activeListeners.has(userId)) {
                    const { onNotification } = this.activeListeners.get(userId);
                    if (onNotification) onNotification(notification);
                }
            });

            await client.connect();
            console.log(`[FCM] ✅ FCM Client CONNECTED for user ${userId}`);

            this.activeListeners.set(userId, { client, onNotification, onDevicePaired, onServerPaired });

            // Register with Facepunch
            await this.registerWithFacepunch(userId, credentials);

            return credentials;

        } catch (err) {
            console.error(`[FCM] Error starting listener for user ${userId}:`, err);
            throw err;
        }
    }

    async registerWithFacepunch(userId, credentials) {
        try {
            // Get user's Steam ID and existing expo token
            const { data: user, error } = await this.supabase
                .from('users')
                .select('steam_id, expo_push_token')
                .eq('id', userId)
                .maybeSingle();

            if (error || !user?.steam_id) {
                console.error(`[FCM] Could not find Steam ID for user ${userId}`);
                return;
            }

            // Check if we already have a valid expo token
            if (user.expo_push_token) {
                console.log(`[FCM] ✅ Found existing Expo token for user ${user.steam_id}, skipping registration`);
                return;
            }

            console.log(`[FCM] Registering user ${user.steam_id} with Facepunch...`);

            // Generate stable Device ID
            const UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';
            const deviceId = uuidv5(user.steam_id, UUID_NAMESPACE);
            console.log(`[FCM] Generated stable deviceId: ${deviceId}`);

            // Get Expo Push Token
            const expoPushToken = await this.getExpoPushToken(credentials.fcm.token, deviceId);
            console.log(`[FCM] Got Expo Push Token: ${expoPushToken}`);

            // Save to Supabase
            const { error: updateError } = await this.supabase
                .from('users')
                .update({ expo_push_token: expoPushToken })
                .eq('id', userId);

            if (updateError) {
                console.error(`[FCM] Error saving Expo token:`, updateError);
            } else {
                console.log(`[FCM] ✅ Saved Expo token for user ${user.steam_id}`);
            }

        } catch (err) {
            console.error(`[FCM] Error registering with Facepunch:`, err);
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

            // Debug: Raw FCM data (disabled to reduce console noise)
            // console.log(`[FCM] 📦 RAW DATA:`, JSON.stringify(parsedData, null, 2));

            // Parse the body JSON
            let body = {};
            if (parsedData.body) {
                try {
                    body = JSON.parse(parsedData.body);
                    // Verbose body logging disabled to reduce console noise
                    // console.log(`[FCM] 📦 PARSED BODY:`, JSON.stringify(body, null, 2));
                } catch (e) {
                    console.error('[FCM] Error parsing body JSON:', e);
                }
            }

            // Verbose type logging disabled to reduce console noise
            // console.log(`[FCM] Notification type: ${body.type || 'device'}, entity: ${body.entityId || 'N/A'}`);

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
                const deviceData = {
                    entity_id: parseInt(body.entityId),
                    type: parseInt(body.entityType) === 1 ? 'switch' :
                        parseInt(body.entityType) === 2 ? 'alarm' : 'storage_monitor',
                    name: body.entityName,
                };

                if (body.ip && body.port) {
                    const { data: server } = await this.supabase
                        .from('servers')
                        .select('id')
                        .eq('ip', body.ip)
                        .eq('port', body.port.toString())
                        .single();

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
                console.error(`[FCM] Error stopping listener for ${userId}:`, error);
                this.activeListeners.delete(userId);
            }
        }
    }
}

module.exports = new FcmManager();
