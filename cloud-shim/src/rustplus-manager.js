const RustPlus = require('@liamcottle/rustplus.js');
const supabase = require('./supabase');

class RustPlusManager {
    constructor() {
        this.activeConnections = new Map(); // serverId -> RustPlus instance
        this.serverInfoIntervals = new Map(); // serverId -> interval ID for server info fetching (DEPRECATED - migrating to BullMQ)
        this.mapDataIntervals = new Map(); // serverId -> interval IDs for map data fetching (DEPRECATED - migrating to BullMQ)
        this.previousMarkers = new Map(); // serverId -> Set of marker IDs for event tracking
        this.sseCallback = null; // Function to forward events to SSE clients
        this.serverFailureCounts = new Map(); // serverId -> consecutive failure count
        this.reconnectAttempts = new Map(); // serverId -> reconnection attempt count
        this.reconnectTimeouts = new Map(); // serverId -> timeout ID for pending reconnection
        this.intentionalDisconnects = new Set(); // serverIds that were intentionally disconnected
        this.shoppingListAlerts = new Map(); // serverId -> Set of alerted item IDs to prevent spam
        this.queueManager = null; // BullMQ queue manager for job scheduling (Phase 3)

        // Listen for server deletions (Manual Removal from Frontend)
        const channel = supabase
            .channel('servers-changes')
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'servers'
            }, (payload) => {
                console.log('[RustPlus] ═══════════════════════════════════');
                console.log('[RustPlus] 🗑️ DELETE EVENT RECEIVED FROM SUPABASE');
                console.log('[RustPlus] Server ID:', payload.old.id);
                console.log('[RustPlus] ═══════════════════════════════════');
                this.disconnectServer(payload.old.id);
            })
            .subscribe((status, err) => {
                if (err) {
                    console.error('[RustPlus] ❌ Supabase subscription error:', err);
                } else {
                    console.log('[RustPlus] 📡 Supabase realtime subscription status:', status);
                }
            });
    }

    setSSECallback(callback) {
        this.sseCallback = callback;
    }

    setQueueManager(queueManager) {
        this.queueManager = queueManager;
        console.log('[RustPlus] Queue manager set for job scheduling');
    }

    async connectToServer(serverId, serverInfo) {
        if (this.activeConnections.has(serverId)) {
            console.log(`[RustPlus] Already connected to server ${serverId}`);
            return Promise.resolve();
        }

        console.log(`[RustPlus] Connecting to ${serverInfo.name}...`);

        return new Promise((resolve, reject) => {
            const rustPlus = new RustPlus(
                serverInfo.ip,
                serverInfo.port,
                serverInfo.player_id,
                serverInfo.player_token
            );

            // Set a timeout for connection
            const connectionTimeout = setTimeout(() => {
                console.error(`[RustPlus] ⏱️ Connection timeout for ${serverInfo.name}`);
                rustPlus.disconnect();
                this.activeConnections.delete(serverId);
                reject(new Error(`Connection timeout for server ${serverId}`));
            }, 15000); // 15 second timeout

            // Handle connection events
            rustPlus.on('connected', async () => {
                clearTimeout(connectionTimeout);
                console.log(`[RustPlus] ✅ Connected to ${serverInfo.name}`);
                this.emitToSSE(serverId, 'connection_status', { connected: true });

                // Subscribe to all devices AFTER connection is confirmed
                await this.subscribeToAllDevices(serverId);

                // Fetch initial data
                this.fetchAndEmitServerInfo(serverId, rustPlus);
                this.fetchAndEmitMapData(serverId, rustPlus);
                this.fetchAndEmitTeamInfo(serverId, rustPlus);

                // Set up polling intervals
                this.setPollingIntervals(serverId, rustPlus);

                resolve();
            });

            rustPlus.on('disconnected', () => {
                console.log(`[RustPlus] ❌ Disconnected from ${serverInfo.name}`);
                this.emitToSSE(serverId, 'connection_status', { connected: false });

                // Clean up intervals
                this.clearIntervalsForServer(serverId);
                this.activeConnections.delete(serverId);

                // Check if this was an intentional disconnect
                if (this.intentionalDisconnects.has(serverId)) {
                    console.log(`[RustPlus] ✅ Intentional disconnect - skipping reconnection for ${serverInfo.name}`);
                    this.intentionalDisconnects.delete(serverId);
                    return;
                }

                // Attempt reconnection with exponential backoff
                const attempts = this.reconnectAttempts.get(serverId) || 0;
                const maxAttempts = 5;

                if (attempts < maxAttempts) {
                    const delay = Math.min(5000 * Math.pow(2, attempts), 60000); // Max 60s delay
                    console.log(`[RustPlus] 🔄 Reconnecting to ${serverInfo.name} in ${delay}ms (attempt ${attempts + 1}/${maxAttempts})`);

                    this.reconnectAttempts.set(serverId, attempts + 1);

                    const timeoutId = setTimeout(async () => {
                        this.reconnectTimeouts.delete(serverId);
                        try {
                            await this.connectToServer(serverId, serverInfo);
                            // Success - reset attempt counter
                            this.reconnectAttempts.delete(serverId);
                        } catch (err) {
                            console.error(`[RustPlus] ❌ Reconnection attempt ${attempts + 1} failed:`, err.message);
                        }
                    }, delay);

                    this.reconnectTimeouts.set(serverId, timeoutId);
                } else {
                    console.warn(`[RustPlus] ❌ Max reconnection attempts reached for ${serverInfo.name}`);
                    this.reconnectAttempts.delete(serverId);
                }
            });

            rustPlus.on('error', (error) => {
                clearTimeout(connectionTimeout);

                // ENHANCED LOGGING FOR UNPAIR DETECTION
                console.error('[RustPlus] ═══════ ERROR DETAILS ═══════');
                console.error('[RustPlus] Server:', serverInfo.name);
                console.error('[RustPlus] Message:', error.message);
                console.error('[RustPlus] Code:', error.code);
                console.error('[RustPlus] Type:', error.type);
                console.error('[RustPlus] Name:', error.name);
                console.error('[RustPlus] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
                console.error('[RustPlus] ═════════════════════════════');

                this.emitToSSE(serverId, 'error', { message: error.message });
                reject(error);
            });

            // Handle all incoming messages (entities, team chat, etc.)
            rustPlus.on('message', async (message) => {
                // Debug: Log ALL messages to see what we're receiving
                if (message.broadcast) {
                    console.log(`[RustPlus] 📨 Broadcast received:`, Object.keys(message.broadcast));
                }

                // Handle entity broadcasts
                if (message.broadcast && message.broadcast.entityChanged) {
                    const entity = message.broadcast.entityChanged;

                    // Extract value from payload
                    let entityValue = entity.payload?.value;
                    if (entityValue === undefined) {
                        entityValue = false; // Empty payload = OFF
                    }

                    console.log(`[RustPlus] Entity ${entity.entityId} → ${entityValue ? 'ON' : 'OFF'}`);

                    // Update database
                    try {
                        const value = typeof entityValue === 'boolean' ? (entityValue ? 1 : 0) : entityValue;

                        const { error } = await supabase
                            .from('smart_devices')
                            .update({ value: value, updated_at: new Date() })
                            .eq('server_id', serverId)
                            .eq('entity_id', entity.entityId);

                        if (error) {
                            console.error(`[RustPlus] Failed to update ${entity.entityId}:`, error);
                        }
                    } catch (err) {
                        console.error(`[RustPlus] Error processing entity update:`, err);
                    }

                    // Emit to frontend
                    this.emitToSSE(serverId, 'entity', {
                        entityId: entity.entityId,
                        value: entityValue
                    });

                    // Check for alarm-triggered workflows (when alarm goes ON/triggers)
                    if (entityValue === true || entityValue === 1) {
                        this.checkAlarmWorkflows(serverId, entity.entityId);
                    }
                }

                // Handle team messages
                if (message.broadcast && message.broadcast.teamMessage) {
                    const teamMessage = message.broadcast.teamMessage;
                    console.log(`[RustPlus] 💬 Team Message on ${serverInfo.name}: ${teamMessage.message.name}: ${teamMessage.message.message}`);

                    this.emitToSSE(serverId, 'team_message', {
                        message: teamMessage.message
                    });

                    // Check for chat-triggered workflows
                    const messageText = teamMessage.message.message;
                    if (messageText && messageText.trim().startsWith('!')) {
                        this.handleChatTrigger(serverId, messageText.trim(), teamMessage.message.name);
                    }
                }

                // Emit raw message for debugging
                this.emitToSSE(serverId, 'message', message);
            });

            // Connect
            rustPlus.connect();
            this.activeConnections.set(serverId, rustPlus);
        });
    }

    async clearIntervalsForServer(serverId) {
        // Clean up BullMQ jobs if queue manager is available
        if (this.queueManager) {
            await this.queueManager.removeRepeatingJob('rustplus', `server-info-${serverId}`);
            await this.queueManager.removeRepeatingJob('rustplus', `dynamic-markers-${serverId}`);
            await this.queueManager.removeRepeatingJob('rustplus', `static-markers-${serverId}`);
            await this.queueManager.removeRepeatingJob('rustplus', `team-info-${serverId}`);
            console.log(`[RustPlus] Removed BullMQ jobs for server ${serverId}`);
        }

        // Clean up legacy setInterval intervals (if any)
        if (this.serverInfoIntervals.has(serverId)) {
            clearInterval(this.serverInfoIntervals.get(serverId));
            this.serverInfoIntervals.delete(serverId);
        }

        if (this.mapDataIntervals.has(serverId)) {
            const intervals = this.mapDataIntervals.get(serverId);
            clearInterval(intervals.markers);
            clearInterval(intervals.team);
            this.mapDataIntervals.delete(serverId);
        }
    }

    disconnectServer(serverId) {
        console.log(`[RustPlus] 🛑 Disconnecting server ${serverId}...`);

        // Mark as intentional disconnect to prevent reconnection
        this.intentionalDisconnects.add(serverId);

        // Clear all intervals FIRST (even if no active connection)
        this.clearIntervalsForServer(serverId);

        // Cancel pending reconnection attempts
        if (this.reconnectTimeouts.has(serverId)) {
            clearTimeout(this.reconnectTimeouts.get(serverId));
            this.reconnectTimeouts.delete(serverId);
        }
        this.reconnectAttempts.delete(serverId);

        // Clear failure counts
        this.serverFailureCounts.delete(serverId);

        // Clear previous markers
        this.previousMarkers.delete(serverId);

        // Disconnect RustPlus connection
        const rustPlus = this.activeConnections.get(serverId);
        if (rustPlus) {
            rustPlus.disconnect();
            this.activeConnections.delete(serverId);
            console.log(`[RustPlus] ✅ Server ${serverId} fully disconnected and cleaned up`);
        } else {
            console.log(`[RustPlus] ⚠️  Server ${serverId} had no active connection, but intervals were cleared`);
        }
    }

    async connectAllUserServers(userId) {
        try {
            const { data: servers, error } = await supabase
                .from('servers')
                .select('*')
                .eq('user_id', userId);

            if (error) {
                console.error(`[RustPlus] Error fetching servers:`, error);
                return;
            }

            console.log(`[RustPlus] Found ${servers.length} servers for user ${userId}`);

            const failedServers = [];

            // Connect to servers sequentially with error handling
            for (const server of servers) {
                try {
                    await this.connectToServer(server.id, server);
                } catch (error) {
                    console.error(`[RustPlus] ❌ Failed to connect to ${server.name}:`, error.message);

                    // Track failed server for cleanup
                    failedServers.push({
                        id: server.id,
                        name: server.name,
                        error: error.message
                    });
                }
            }

            // Clean up servers that failed to connect (likely unpaired in-game)
            if (failedServers.length > 0) {
                console.log(`[RustPlus] 🗑️  Cleaning up ${failedServers.length} failed server(s)...`);

                for (const failedServer of failedServers) {
                    try {
                        // Delete server from database
                        const { error: deleteError } = await supabase
                            .from('servers')
                            .delete()
                            .eq('id', failedServer.id)
                            .eq('user_id', userId); // Safety check

                        if (deleteError) {
                            console.error(`[RustPlus] Failed to delete server ${failedServer.name}:`, deleteError);
                        } else {
                            console.log(`[RustPlus] ✅ Removed unpaired server: ${failedServer.name}`);

                            // Notify frontend to refresh server list
                            this.emitToSSE(failedServer.id, 'server_removed', {
                                serverId: failedServer.id,
                                serverName: failedServer.name,
                                reason: 'Connection failed - server may have been unpaired in-game'
                            });
                        }
                    } catch (cleanupError) {
                        console.error(`[RustPlus] Error during server cleanup:`, cleanupError);
                    }
                }
            }

            const successfulConnections = servers.length - failedServers.length;
            console.log(`[RustPlus] ✅ Connected to ${successfulConnections}/${servers.length} servers`);

        } catch (error) {
            console.error(`[RustPlus] Failed to connect user servers:`, error);
        }
    }

    disconnectAll() {
        // Clear server info intervals
        for (const [serverId, intervalId] of this.serverInfoIntervals) {
            clearInterval(intervalId);
        }
        this.serverInfoIntervals.clear();

        // Clear map data intervals
        for (const [serverId, intervals] of this.mapDataIntervals) {
            clearInterval(intervals.markers);
            clearInterval(intervals.team);
        }
        this.mapDataIntervals.clear();

        // Disconnect all clients
        for (const [serverId, client] of this.activeConnections) {
            client.disconnect();
        }
        this.activeConnections.clear();
    }

    emitToSSE(serverId, type, data) {
        if (this.sseCallback) {
            // Verbose SSE logging disabled to reduce console noise
            // console.log(`[RustPlus] 🔔 SSE: ${type} for ${serverId}`);
            this.sseCallback({
                serverId,
                type,
                data
            });
        }
    }

    // Subscription methods - CRITICAL for receiving entity broadcasts
    async subscribeToDevice(serverId, entityId) {
        const rustPlus = this.activeConnections.get(serverId);
        if (!rustPlus) {
            console.warn(`[RustPlus] Cannot subscribe to ${entityId} - not connected`);
            return;
        }

        // Calling getEntityInfo activates broadcasts for this entity
        rustPlus.getEntityInfo(entityId, async (message) => {
            if (message.response && message.response.entityInfo) {
                const info = message.response.entityInfo;

                // Extract value from payload (empty payload = OFF for switches)
                let entityValue = info.payload?.value;
                if (entityValue === undefined && info.type === 'Switch') {
                    entityValue = false;
                }

                console.log(`[RustPlus] ✅ Subscribed to ${info.type} ${entityId} (${entityValue ? 'ON' : 'OFF'})`);

                // Save initial state to database
                const value = typeof entityValue === 'boolean' ? (entityValue ? 1 : 0) : entityValue;
                const { error } = await supabase
                    .from('smart_devices')
                    .update({ value: value, updated_at: new Date() })
                    .eq('server_id', serverId)
                    .eq('entity_id', entityId);

                if (error) {
                    console.error(`[RustPlus] Failed to save state for ${entityId}:`, error);
                } else {
                    // Emit to frontend for immediate UI update
                    this.emitToSSE(serverId, 'entity', {
                        entityId: entityId,
                        value: entityValue
                    });
                }
            } else if (message.response && message.response.error) {
                const errorType = message.response.error.error;
                console.error(`[RustPlus] ❌ Failed to subscribe to ${entityId}:`, errorType);

                // If device not found, delete it from database
                if (errorType === 'not_found') {
                    console.log(`[RustPlus] 🗑️  Removing deleted device ${entityId}`);
                    const { error: deleteError } = await supabase
                        .from('smart_devices')
                        .delete()
                        .eq('server_id', serverId)
                        .eq('entity_id', entityId);

                    if (!deleteError) {
                        // Notify frontend to refresh device list
                        this.emitToSSE(serverId, 'device_deleted', { entityId });
                    }
                }
            }
        });
    }

    async subscribeToAllDevices(serverId) {
        try {
            const { data: devices, error } = await supabase
                .from('smart_devices')
                .select('entity_id, name, type')
                .eq('server_id', serverId);

            if (error) {
                console.error(`[RustPlus] Error fetching devices:`, error);
                return;
            }

            if (!devices || devices.length === 0) {
                console.log(`[RustPlus] No devices to subscribe to`);
                return;
            }

            console.log(`[RustPlus] Subscribing to ${devices.length} devices...`);

            // Subscribe to each device with a small delay
            for (const device of devices) {
                await this.subscribeToDevice(serverId, device.entity_id);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log(`[RustPlus] ✅ Subscribed to ${devices.length} devices`);
        } catch (err) {
            console.error(`[RustPlus] Error in subscribeToAllDevices:`, err);
        }
    }

    // Command methods
    async sendRequest(serverId, request, callback, timeoutMs = 5000) {
        const rustPlus = this.activeConnections.get(serverId);
        if (!rustPlus) {
            // Silently return if not connected (server might be in cleanup)
            console.log(`[RustPlus] Skipping request for ${serverId} - not connected`);
            if (callback) callback(null);
            return;
        }

        // Set timeout for request
        let callbackCalled = false;
        const timeoutId = setTimeout(() => {
            if (!callbackCalled) {
                console.warn(`[RustPlus] Request timed out after ${timeoutMs}ms for server ${serverId}`);
                callbackCalled = true;
                if (callback) callback(null);
            }
        }, timeoutMs);

        rustPlus.sendRequest(request, (message) => {
            if (!callbackCalled) {
                clearTimeout(timeoutId);
                callbackCalled = true;
                if (callback) callback(message);
            }
        });
    }

    getEntityInfo(serverId, entityId, callback) {
        this.sendRequest(serverId, {
            entityId: entityId,
            getEntityInfo: {}
        }, callback);
    }

    setEntityValue(serverId, entityId, value, callback) {
        this.sendRequest(serverId, {
            entityId: entityId,
            setEntityValue: {
                value: value
            }
        }, callback);
    }

    sendTeamMessage(serverId, message, callback) {
        this.sendRequest(serverId, {
            sendTeamMessage: {
                message: message
            }
        }, callback);
    }

    // Map-related methods
    getMap(serverId, callback) {
        this.sendRequest(serverId, {
            getMap: {}
        }, callback);
    }

    getMapMarkers(serverId, callback) {
        try {
            // Set a timeout because if protobuf decoding fails (caught by our patch),
            // the callback will never be called since we can't read the sequence number.
            let timeoutId = setTimeout(() => {
                console.warn(`[RustPlus] getMapMarkers timed out (likely due to protobuf decode failure)`);
                if (callback) {
                    callback({
                        response: {
                            mapMarkers: {
                                markers: []
                            }
                        }
                    });
                    callback = null; // Prevent double calling
                }
            }, 5000); // 5 second timeout

            this.sendRequest(serverId, {
                getMapMarkers: {}
            }, (response) => {
                clearTimeout(timeoutId);
                if (callback) {
                    callback(response);
                    callback = null;
                }
            });
        } catch (error) {
            console.error(`[RustPlus] getMapMarkers error (protobuf decode issue):`, error.message);
            // Return empty markers to prevent crash
            if (callback) {
                callback({
                    response: {
                        mapMarkers: {
                            markers: []
                        }
                    }
                });
            }
        }
    }

    getTeamInfo(serverId, callback) {
        this.sendRequest(serverId, {
            getTeamInfo: {}
        }, callback);
    }

    getServerInfo(serverId, callback) {
        this.sendRequest(serverId, {
            getInfo: {}
        }, callback);
    }

    // Fetch server info and emit SSE event
    async fetchAndEmitServerInfo(serverId, rustPlusInstance) {
        const rustPlus = rustPlusInstance || this.activeConnections.get(serverId);
        if (!rustPlus) {
            console.warn(`[RustPlus] Cannot fetch server info - not connected to ${serverId}`);
            return;
        }

        // Check if WebSocket is actually ready
        const ws = rustPlus.ws || rustPlus.websocket;
        if (ws && ws.readyState !== 1) { // 1 = OPEN
            console.warn(`[RustPlus] WebSocket not ready for ${serverId}, will retry on next interval`);
            return;
        }

        try {
            // Set timeout to detect if callback is never called (happens when unpaired)
            let callbackCalled = false;
            const timeoutId = setTimeout(async () => {
                if (!callbackCalled) {
                    console.warn(`[RustPlus] ⏱️  getInfo() timed out for ${serverId} (callback never called - likely unpaired)`);

                    // Track consecutive failures
                    const currentFailures = (this.serverFailureCounts.get(serverId) || 0) + 1;
                    this.serverFailureCounts.set(serverId, currentFailures);

                    console.warn(`[RustPlus] ❌ Timeout failure for ${serverId} (attempt ${currentFailures}/3)`);

                    // If 3 failures, remove the server
                    if (currentFailures >= 3) {
                        console.warn(`[RustPlus] 🗑️  Server ${serverId} timed out 3 times - removing (likely unpaired)`);
                        await this.disconnectAndRemoveServer(serverId, 'Server failed to respond - likely unpaired in-game');
                    }
                }
            }, 10000); // 10 second timeout

            rustPlus.getInfo(async (message) => {
                callbackCalled = true;
                clearTimeout(timeoutId);

                if (message && message.response && message.response.info) {
                    const info = message.response.info;
                    // Verbose logging disabled to reduce console noise
                    // console.log(`[RustPlus] 📡 Server info update for ${serverId}`);

                    // Reset failure count on success
                    this.serverFailureCounts.delete(serverId);

                    // Save server info to database
                    const { error } = await supabase
                        .from('server_info')
                        .upsert({
                            server_id: serverId,
                            name: info.name,
                            header_image: info.headerImage,
                            url: info.url,
                            map: info.map,
                            map_size: info.mapSize,
                            wipe_time: new Date(info.wipeTime * 1000), // Convert Unix timestamp to JS Date
                            players: info.players,
                            max_players: info.maxPlayers,
                            queued_players: info.queuedPlayers,
                            seed: info.seed,
                            salt: info.salt,
                            updated_at: new Date()
                        }, { onConflict: 'server_id' });

                    if (error) {
                        console.error(`[RustPlus] Failed to save server info for ${serverId}:`, error);
                    }

                    // Emit SSE event with server info
                    this.emitToSSE(serverId, 'server_info_update', info);
                } else {
                    // ENHANCED LOGGING FOR UNPAIR DETECTION
                    console.warn('[RustPlus] ═══ GETINFO FAILURE ═══');
                    console.warn('[RustPlus] Server ID:', serverId);
                    console.warn('[RustPlus] Has message:', !!message);
                    console.warn('[RustPlus] Has response:', !!message?.response);
                    console.warn('[RustPlus] Has response.info:', !!message?.response?.info);
                    console.warn('[RustPlus] Has response.error:', !!message?.response?.error);

                    if (message?.response?.error) {
                        console.warn('[RustPlus] Error details:', JSON.stringify(message.response.error, null, 2));
                    }

                    if (message?.response && !message.response.info) {
                        console.warn('[RustPlus] Full response:', JSON.stringify(message.response, null, 2));
                    }

                    console.warn('[RustPlus] ═════════════════════');

                    // Track consecutive failures
                    const currentFailures = (this.serverFailureCounts.get(serverId) || 0) + 1;
                    this.serverFailureCounts.set(serverId, currentFailures);

                    console.warn(`[RustPlus] ❌ Failed to fetch server info for ${serverId} (attempt ${currentFailures}/3)`);

                    // If 3 failures, remove the server
                    if (currentFailures >= 3) {
                        console.warn(`[RustPlus] 🗑️  Server ${serverId} failed 3 times - removing (likely unpaired)`);

                        // Get server details for notification
                        const { data: server } = await supabase
                            .from('servers')
                            .select('name, user_id')
                            .eq('id', serverId)
                            .single();

                        // Store notification BEFORE deleting server
                        if (server && server.user_id) {
                            const { error: notifError } = await supabase
                                .from('notifications')
                                .insert({
                                    user_id: server.user_id,
                                    type: 'server_removed',
                                    data: {
                                        serverId: serverId,
                                        serverName: server.name || 'Unknown Server',
                                        reason: 'Server failed to respond - likely unpaired in-game'
                                    },
                                    timestamp: new Date(),
                                    read: false
                                });

                            if (notifError) {
                                console.error(`[RustPlus] Failed to create notification:`, notifError);
                            }
                        }

                        // Delete from database
                        const { error: deleteError } = await supabase
                            .from('servers')
                            .delete()
                            .eq('id', serverId);

                        if (deleteError) {
                            console.error(`[RustPlus] Failed to delete server ${serverId}:`, deleteError);
                        } else {
                            console.log(`[RustPlus] ✅ Removed unpaired server: ${server?.name || serverId}`);

                            // Notify frontend (best-effort, may not reach if client disconnected)
                            this.emitToSSE(serverId, 'server_removed', {
                                serverId: serverId,
                                serverName: server?.name || 'Unknown Server',
                                reason: 'Server failed to respond - likely unpaired in-game'
                            });

                            // Then disconnect and cleanup
                            const rustPlus = this.activeConnections.get(serverId);
                            if (rustPlus) {
                                rustPlus.disconnect();
                                this.activeConnections.delete(serverId);
                            }

                            // Clear intervals
                            if (this.serverInfoIntervals.has(serverId)) {
                                clearInterval(this.serverInfoIntervals.get(serverId));
                                this.serverInfoIntervals.delete(serverId);
                            }
                            if (this.mapDataIntervals.has(serverId)) {
                                const intervals = this.mapDataIntervals.get(serverId);
                                clearInterval(intervals.markers);
                                clearInterval(intervals.team);
                                this.mapDataIntervals.delete(serverId);
                            }

                            // Clear failure count
                            this.serverFailureCounts.delete(serverId);
                        }
                    }
                }
            });
        } catch (error) {
            console.error(`[RustPlus] Error fetching server info for ${serverId}:`, error.message);
        }
    }


    // Fetch map markers and emit SSE event
    fetchAndEmitMapData(serverId, rustPlusInstance) {
        const rustPlus = rustPlusInstance || this.activeConnections.get(serverId);
        if (!rustPlus) {
            console.warn(`[RustPlus] Cannot fetch map markers - not connected to ${serverId}`);
            return;
        }

        // Check if WebSocket is actually ready
        const ws = rustPlus.ws || rustPlus.websocket;
        if (ws && ws.readyState !== 1) {
            return; // Silently skip if not ready
        }

        try {
            this.getMapMarkers(serverId, (message) => {
                if (message && message.response && message.response.mapMarkers) {
                    const markers = message.response.mapMarkers.markers || [];
                    // console.log(`[RustPlus] 📍 Broadcasting ${markers.length} map markers for ${serverId}`);

                    // Emit SSE event with map markers
                    this.emitToSSE(serverId, 'map_markers_update', { markers });

                    // Track game events based on markers
                    this.trackMapEvents(serverId, markers);

                    // Check shopping list for tracked items
                    this.checkShoppingList(serverId, markers);
                }
            });
        } catch (error) {
            console.error(`[RustPlus] Error fetching map markers for ${serverId}:`, error.message);
        }
    }

    // Fetch DYNAMIC map markers (players, events) - real-time updates
    fetchAndEmitDynamicMarkers(serverId, rustPlusInstance) {
        const rustPlus = rustPlusInstance || this.activeConnections.get(serverId);
        if (!rustPlus) return;

        const ws = rustPlus.ws || rustPlus.websocket;
        if (ws && ws.readyState !== 1) return;

        try {
            this.getMapMarkers(serverId, (message) => {
                if (message && message.response && message.response.mapMarkers) {
                    const allMarkers = message.response.mapMarkers.markers || [];
                    console.log(`[RustPlus] Dynamic fetch: ${allMarkers.length} total markers`);
                    
                    // Debug: Log marker types to understand what we're getting
                    const markerTypes = [...new Set(allMarkers.map(m => m.type))];
                    if (markerTypes.length > 0) {
                        console.log(`[RustPlus] Available marker types:`, markerTypes);
                    }
                    
                    const dynamicMarkers = allMarkers.filter(m =>
                        m.type === 'Player' || m.type === 'CargoShip' ||
                        m.type === 'PatrolHelicopter' || m.type === 'Chinook' || m.type === 'CH47'
                    );
                    console.log(`[RustPlus] Filtered ${dynamicMarkers.length} dynamic markers`);
                    this.emitToSSE(serverId, 'dynamic_markers_update', { markers: dynamicMarkers });
                    this.trackMapEvents(serverId, dynamicMarkers);
                } else {
                    console.warn(`[RustPlus] Dynamic markers: No valid response from server ${serverId}`);
                }
            });
        } catch (error) {
            console.error(`[RustPlus] Error fetching dynamic markers:`, error.message);
        }
    }

    // Fetch STATIC map markers (vending machines, explosions) - infrequent updates
    fetchAndEmitStaticMarkers(serverId, rustPlusInstance) {
        const rustPlus = rustPlusInstance || this.activeConnections.get(serverId);
        if (!rustPlus) return;

        const ws = rustPlus.ws || rustPlus.websocket;
        if (ws && ws.readyState !== 1) return;

        try {
            this.getMapMarkers(serverId, (message) => {
                if (message && message.response && message.response.mapMarkers) {
                    const allMarkers = message.response.mapMarkers.markers || [];
                    console.log(`[RustPlus] Static fetch: ${allMarkers.length} total markers`);
                    
                    const staticMarkers = allMarkers.filter(m =>
                        m.type === 'VendingMachine' || m.type === 3 ||
                        m.type === 'Explosion' || m.type === 'Crate'
                    );
                    console.log(`[RustPlus] Filtered ${staticMarkers.length} static markers`);
                    this.emitToSSE(serverId, 'static_markers_update', { markers: staticMarkers });
                    this.checkShoppingList(serverId, staticMarkers);
                } else {
                    console.warn(`[RustPlus] Static markers: No valid response from server ${serverId}`);
                }
            });
        } catch (error) {
            console.error(`[RustPlus] Error fetching static markers:`, error.message);
        }
    }

    // Track map events (Heli, Cargo, etc.)
    trackMapEvents(serverId, markers) {
        const previousMarkers = this.previousMarkers.get(serverId) || new Set();
        const currentMarkers = new Set();

        // Event types to track
        const eventTypes = {
            'CargoShip': { type: 'CargoShip', label: 'Cargo Ship', icon: '🚢' },
            'PatrolHelicopter': { type: 'PatrolHelicopter', label: 'Patrol Helicopter', icon: '🚁' },
            'Chinook': { type: 'Chinook', label: 'Chinook', icon: '🚁' },
            'Crate': { type: 'Crate', label: 'Locked Crate', icon: '📦' },
            'Explosion': { type: 'Explosion', label: 'Explosion', icon: '💥' }
        };

        markers.forEach(marker => {
            // Create a unique ID for the marker instance
            // Using ID if available, otherwise composite key of type + position
            // Note: Rust+ markers usually have an ID, but let's be safe
            const markerId = marker.id || `${marker.type}-${marker.x}-${marker.y}`;

            // Only track interesting markers
            if (Object.values(eventTypes).some(et => et.type === marker.type)) {
                currentMarkers.add(markerId);

                // If this is a new marker
                if (!previousMarkers.has(markerId)) {
                    const eventType = Object.values(eventTypes).find(et => et.type === marker.type);
                    if (eventType) {
                        console.log(`[RustPlus] 🚨 Event detected on ${serverId}: ${eventType.label}`);

                        this.emitToSSE(serverId, 'game_event', {
                            type: eventType.type,
                            label: eventType.label,
                            icon: eventType.icon,
                            message: `${eventType.label} has appeared!`,
                            x: marker.x,
                            y: marker.y,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        });

        // Update previous markers state
        this.previousMarkers.set(serverId, currentMarkers);
    }

    // Check shopping list for tracked items in vending machines
    async checkShoppingList(serverId, markers) {
        try {
            // Get user_id for this server
            const { data: server, error: serverError } = await supabase
                .from('servers')
                .select('user_id')
                .eq('id', serverId)
                .single();

            if (serverError || !server) {
                return;
            }

            // Get shopping list items for this server
            const { data: shoppingList, error: listError } = await supabase
                .from('shopping_lists')
                .select('*')
                .eq('server_id', serverId);

            if (listError || !shoppingList || shoppingList.length === 0) {
                // If shopping list is empty, clear all alerts for this server
                if (this.shoppingListAlerts.has(serverId)) {
                    console.log(`[Shopping] 🗑️ Shopping list empty, clearing all alerts for server`);
                    this.shoppingListAlerts.delete(serverId);
                }
                return;
            }

            // Clean up alerts for items no longer in the shopping list (do this FIRST)
            if (this.shoppingListAlerts.has(serverId)) {
                const alertedItems = this.shoppingListAlerts.get(serverId);
                const currentItemIds = new Set(shoppingList.map(item => item.item_id));

                console.log(`[Shopping] 🔍 Current alerted items:`, Array.from(alertedItems));
                console.log(`[Shopping] 📋 Current shopping list items:`, Array.from(currentItemIds));

                // Remove alerts for items that were removed from the shopping list
                for (const itemId of alertedItems) {
                    if (!currentItemIds.has(itemId)) {
                        alertedItems.delete(itemId);
                        console.log(`[Shopping] 🗑️ Cleared alert for item ${itemId} (removed from shopping list)`);
                    }
                }
            }

            // Extract vending machine markers (type 3)
            const vendingMachines = markers.filter(m => m.type === 3 || m.type === 'VendingMachine');

            // Check each shopping list item
            for (const listItem of shoppingList) {
                // Find vending machines selling this item
                const vendorsWithItem = [];

                for (const vm of vendingMachines) {
                    if (!vm.sellOrders || vm.sellOrders.length === 0) continue;

                    // Check if this vending machine has the tracked item
                    const hasItem = vm.sellOrders.some(order =>
                        order.itemId === listItem.item_id && order.amountInStock > 0
                    );

                    if (hasItem) {
                        vendorsWithItem.push({
                            name: vm.name || 'Unnamed Shop',
                            x: vm.x,
                            y: vm.y,
                            sellOrders: vm.sellOrders.filter(o => o.itemId === listItem.item_id)
                        });
                    }
                }

                // If we found vendors with this item, send notification
                if (vendorsWithItem.length > 0) {
                    // Check if we've already alerted for this item
                    if (!this.shoppingListAlerts.has(serverId)) {
                        this.shoppingListAlerts.set(serverId, new Set());
                    }

                    const alertedItems = this.shoppingListAlerts.get(serverId);

                    console.log(`[Shopping] ✅ Found vendors for ${listItem.item_name} (ID: ${listItem.item_id})`);
                    console.log(`[Shopping] 🔍 Already alerted? ${alertedItems.has(listItem.item_id)}`);

                    // Only send alert if this is the first time we've found this item
                    if (!alertedItems.has(listItem.item_id)) {
                        console.log(`[Shopping] 🛒 Sending alert: ${vendorsWithItem.length} vendor(s) selling ${listItem.item_name}`);

                        alertedItems.add(listItem.item_id);

                        // Emit SSE event for shopping list match
                        this.emitToSSE(serverId, 'shopping_list_match', {
                            item: listItem,
                            vendors: vendorsWithItem
                        });
                    } else {
                        console.log(`[Shopping] ⏭️ Skipping alert for ${listItem.item_name} - already sent`);
                    }
                }
            }
        } catch (error) {
            console.error(`[Shopping] Error checking shopping list for ${serverId}:`, error.message);
        }
    }

    // Fetch team info and emit SSE event
    fetchAndEmitTeamInfo(serverId, rustPlusInstance) {
        const rustPlus = rustPlusInstance || this.activeConnections.get(serverId);
        if (!rustPlus) {
            // Silently return if not connected (server might be in cleanup)
            return;
        }

        // Check if WebSocket is actually ready
        const ws = rustPlus.ws || rustPlus.websocket;
        if (ws && ws.readyState !== 1) {
            return; // Silently skip if not ready
        }

        try {
            this.getTeamInfo(serverId, (message) => {
                if (message && message.response && message.response.teamInfo) {
                    const members = message.response.teamInfo.members || [];
                    // Verbose logging disabled to reduce console noise
                    // console.log(`[RustPlus] 👥 Team: ${members.length} members for ${serverId}`);

                    // Emit SSE event with team info
                    this.emitToSSE(serverId, 'team_info_update', { members });
                }
            });
        } catch (error) {
            console.error(`[RustPlus] Error fetching team info for ${serverId}:`, error.message);
        }
    }


    // Helper to remove a server
    async disconnectAndRemoveServer(serverId, reason) {
        console.warn(`[RustPlus] 🗑️  Removing server ${serverId}. Reason: ${reason}`);

        // Get server details for notification
        const { data: server } = await supabase
            .from('servers')
            .select('name, user_id')
            .eq('id', serverId)
            .single();

        // Store notification BEFORE deleting server
        if (server && server.user_id) {
            const { error: notifError } = await supabase
                .from('notifications')
                .insert({
                    user_id: server.user_id,
                    type: 'server_removed',
                    data: {
                        serverId: serverId,
                        serverName: server.name || 'Unknown Server',
                        reason: reason
                    },
                    timestamp: new Date(),
                    read: false
                });

            if (notifError) {
                console.error(`[RustPlus] Failed to create notification:`, notifError);
            }
        }

        // Delete from database
        const { error: deleteError } = await supabase
            .from('servers')
            .delete()
            .eq('id', serverId);

        if (deleteError) {
            console.error(`[RustPlus] Failed to delete server ${serverId}:`, deleteError);
        } else {
            console.log(`[RustPlus] ✅ Removed unpaired server: ${server?.name || serverId}`);

            // Notify frontend FIRST, before cleanup (best-effort, may not reach if client disconnected)
            this.emitToSSE(serverId, 'server_removed', {
                serverId: serverId,
                serverName: server?.name || 'Unknown Server',
                reason: reason
            });

            // Then disconnect and cleanup
            const rustPlus = this.activeConnections.get(serverId);
            if (rustPlus) {
                rustPlus.disconnect();
                this.activeConnections.delete(serverId);
            }

            // Clear intervals
            if (this.serverInfoIntervals.has(serverId)) {
                clearInterval(this.serverInfoIntervals.get(serverId));
                this.serverInfoIntervals.delete(serverId);
            }
            if (this.mapDataIntervals.has(serverId)) {
                const intervals = this.mapDataIntervals.get(serverId);
                clearInterval(intervals.markers);
                clearInterval(intervals.team);
                this.mapDataIntervals.delete(serverId);
            }

            // Clear failure count
            this.serverFailureCounts.delete(serverId);
        }
    }
    // Helper to set polling intervals using BullMQ (Phase 3)
    async setPollingIntervals(serverId, rustPlus) {
        if (!this.queueManager) {
            console.warn('[RustPlus] Queue manager not set, falling back to setInterval (legacy mode)');
            return this.setPollingIntervalsLegacy(serverId, rustPlus);
        }

        // Clear existing repeatable jobs for this server
        await this.queueManager.removeRepeatingJob('rustplus', `server-info-${serverId}`);
        await this.queueManager.removeRepeatingJob('rustplus', `map-data-${serverId}`); // Remove legacy job
        await this.queueManager.removeRepeatingJob('rustplus', `dynamic-markers-${serverId}`);
        await this.queueManager.removeRepeatingJob('rustplus', `static-markers-${serverId}`);
        await this.queueManager.removeRepeatingJob('rustplus', `team-info-${serverId}`);

        // Schedule new repeatable jobs
        await this.queueManager.scheduleRepeatingJob(
            'rustplus',
            `server-info-${serverId}`,
            { serverId },
            { pattern: '*/30 * * * * *' } // Every 30 seconds
        );

        // DYNAMIC markers (players, events) - real-time updates every 2 seconds
        await this.queueManager.scheduleRepeatingJob(
            'rustplus',
            `dynamic-markers-${serverId}`,
            { serverId },
            { pattern: '*/2 * * * * *' }
        );

        // STATIC markers (vending machines) - infrequent updates every 30 seconds
        await this.queueManager.scheduleRepeatingJob(
            'rustplus',
            `static-markers-${serverId}`,
            { serverId },
            { pattern: '*/30 * * * * *' }
        );

        await this.queueManager.scheduleRepeatingJob(
            'rustplus',
            `team-info-${serverId}`,
            { serverId },
            { pattern: '*/10 * * * * *' } // Every 10 seconds
        );

        console.log(`[RustPlus] ✅ Scheduled BullMQ jobs for server ${serverId}`);
    }

    /**
     * Cleanup orphaned jobs for servers that no longer exist
     * Runs on startup to remove "zombie" jobs from Redis
     */
    async cleanupOrphanedJobs() {
        if (!this.queueManager) return;

        console.log('[RustPlus] 🧹 Starting cleanup of orphaned jobs...');

        try {
            // Get all servers from DB
            const { data: servers, error } = await supabase
                .from('servers')
                .select('id');

            if (error) {
                console.error('[RustPlus] Failed to fetch servers for cleanup:', error);
                return;
            }

            const validServerIds = new Set(servers.map(s => s.id));
            const queue = this.queueManager.getQueue('rustplus');
            const repeatableJobs = await queue.getRepeatableJobs();

            let removedCount = 0;

            for (const job of repeatableJobs) {
                // Check if job is server-specific
                const match = job.name.match(/^(server-info|map-data|dynamic-markers|static-markers|team-info)-([0-9a-f-]+)$/);
                if (match) {
                    const serverId = match[2];
                    const hasActiveConnection = this.activeConnections.has(serverId);
                    
                    if (!validServerIds.has(serverId)) {
                        console.log(`[RustPlus] 🗑️ Removing orphaned job: ${job.name} (server ${serverId} not found in DB)`);
                        await queue.removeRepeatableByKey(job.key);
                        removedCount++;
                    } else if (!hasActiveConnection) {
                        console.log(`[RustPlus] 🗑️ Removing orphaned job: ${job.name} (server ${serverId} not connected)`);
                        await queue.removeRepeatableByKey(job.key);
                        removedCount++;
                    }
                }
            }

            console.log(`[RustPlus] 🧹 Cleanup complete. Removed ${removedCount} orphaned jobs.`);
        } catch (err) {
            console.error('[RustPlus] Error during orphaned job cleanup:', err);
        }
    }

    // Legacy fallback: Use setInterval if BullMQ is not available
    setPollingIntervalsLegacy(serverId, rustPlus) {
        // Clear existing intervals
        if (this.serverInfoIntervals.has(serverId)) {
            clearInterval(this.serverInfoIntervals.get(serverId));
            this.serverInfoIntervals.delete(serverId);
        }
        if (this.mapDataIntervals.has(serverId)) {
            const intervals = this.mapDataIntervals.get(serverId);
            clearInterval(intervals.markers);
            clearInterval(intervals.team);
            this.mapDataIntervals.delete(serverId);
        }

        // Set polling intervals
        const serverInfoInterval = setInterval(() => {
            this.fetchAndEmitServerInfo(serverId, rustPlus);
        }, 30000); // 30s

        const mapMarkersInterval = setInterval(() => {
            this.fetchAndEmitMapData(serverId, rustPlus);
        }, 30000); // 30s

        const teamInfoInterval = setInterval(() => {
            this.fetchAndEmitTeamInfo(serverId, rustPlus);
        }, 10000); // 10s

        // Store interval IDs
        this.serverInfoIntervals.set(serverId, serverInfoInterval);
        this.mapDataIntervals.set(serverId, {
            markers: mapMarkersInterval,
            team: teamInfoInterval
        });
    }

    // Check for alarm-triggered workflows
    async checkAlarmWorkflows(serverId, alarmEntityId) {
        try {
            console.log(`[Workflows] 🔔 Alarm ${alarmEntityId} triggered, checking for workflows...`);

            // Fetch enabled workflows with alarm triggers for this alarm
            const { data: workflows, error } = await supabase
                .from('device_workflows')
                .select('*, actions:workflow_actions(*)')
                .eq('server_id', serverId)
                .eq('enabled', true)
                .eq('trigger_type', 'alarm');

            if (error) {
                console.error(`[Workflows] Error fetching alarm workflows:`, error);
                return;
            }

            if (!workflows || workflows.length === 0) {
                console.log(`[Workflows] No alarm workflows configured`);
                return;
            }

            // Filter workflows that match this specific alarm
            const matchingWorkflows = workflows.filter(w =>
                w.trigger_config && w.trigger_config.alarm_id === alarmEntityId
            );

            if (matchingWorkflows.length === 0) {
                console.log(`[Workflows] No workflows configured for alarm ${alarmEntityId}`);
                return;
            }

            console.log(`[Workflows] Found ${matchingWorkflows.length} workflow(s) to execute`);

            // Execute each matching workflow
            for (const workflow of matchingWorkflows) {
                console.log(`[Workflows] Executing workflow: ${workflow.name}`);

                const actions = workflow.actions?.sort((a, b) => a.action_order - b.action_order) || [];

                for (const action of actions) {
                    try {
                        await this.executeWorkflowAction(serverId, action);
                    } catch (err) {
                        console.error(`[Workflows] Error executing action:`, err);
                    }
                }
            }
        } catch (err) {
            console.error(`[Workflows] Error checking alarm workflows:`, err);
        }
    }

    // Execute a single workflow action
    async executeWorkflowAction(serverId, action, context = {}) {
        const { action_type, action_config } = action;

        switch (action_type) {
            case 'set_device':
                if (action_config.entity_id && action_config.value !== undefined) {
                    console.log(`[Workflows] Setting device ${action_config.entity_id} to ${action_config.value ? 'ON' : 'OFF'}`);
                    this.setEntityValue(serverId, action_config.entity_id, action_config.value);
                }
                break;

            case 'set_group':
                if (action_config.entity_ids && Array.isArray(action_config.entity_ids)) {
                    console.log(`[Workflows] Setting ${action_config.entity_ids.length} devices to ${action_config.value ? 'ON' : 'OFF'}`);
                    for (const entityId of action_config.entity_ids) {
                        this.setEntityValue(serverId, entityId, action_config.value);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                break;

            case 'wait':
                if (action_config.duration_ms) {
                    console.log(`[Workflows] Waiting ${action_config.duration_ms}ms`);
                    await new Promise(resolve => setTimeout(resolve, action_config.duration_ms));
                }
                break;

            case 'notify':
                // Send team chat message with custom message from workflow config
                const message = action_config.message || 'Workflow notification';

                console.log(`[Workflows] Sending team notification: ${message}`);

                this.sendTeamMessage(serverId, message, (response) => {
                    if (response.response && response.response.success) {
                        console.log(`[Workflows] ✅ Team notification sent`);
                    } else {
                        console.error(`[Workflows] ❌ Failed to send team notification`);
                    }
                });
                break;
        }
    }

    /**
     * Get the number of active RustPlus connections
     * @returns {number}
     */
    getConnectionCount() {
        return this.activeConnections.size;
    }

    /**
     * Handle chat-triggered workflows
     * @param {string} serverId - Server ID
     * @param {string} message - Chat message (e.g., "!lockdown")
     * @param {string} senderName - Name of player who sent the message
     */
    async handleChatTrigger(serverId, message, senderName) {
        const command = message.toLowerCase().trim();

        console.log(`[Workflows] 🎯 Chat trigger detected: "${command}" from ${senderName}`);

        // Special restore command
        if (command === '!restore' || command === '!undo') {
            await this.restoreLastWorkflowState(serverId, senderName);
            return;
        }

        try {
            // Find workflow by trigger command
            const { data: workflows, error } = await supabase
                .from('device_workflows')
                .select(`
                    *,
                    actions:workflow_actions(*)
                `)
                .eq('server_id', serverId)
                .eq('trigger_command', command)
                .eq('enabled', true)
                .limit(1);

            if (error) {
                console.error(`[Workflows] Error fetching workflow:`, error);
                return;
            }

            if (!workflows || workflows.length === 0) {
                console.log(`[Workflows] No workflow found for command: ${command}`);
                return;
            }

            const workflow = workflows[0];
            console.log(`[Workflows] ✅ Found workflow: "${workflow.name}"`);

            // Save current state if workflow has save_state enabled
            if (workflow.save_state) {
                await this.captureWorkflowState(serverId, workflow);
            }

            // Execute workflow actions
            await this.executeWorkflowActions(serverId, workflow);

        } catch (error) {
            console.error(`[Workflows] Error handling chat trigger:`, error);
        }
    }

    /**
     * Capture current device states before executing workflow
     * @param {string} serverId - Server ID
     * @param {object} workflow - Workflow object
     */
    async captureWorkflowState(serverId, workflow) {
        try {
            console.log(`[Workflows] 📸 Capturing state for workflow: ${workflow.name}`);

            // Get all devices involved in workflow actions
            const deviceIds = new Set();
            for (const action of workflow.actions) {
                if (action.action_type === 'set_device' && action.action_config.device_id) {
                    deviceIds.add(action.action_config.device_id);
                }
            }

            if (deviceIds.size === 0) {
                console.log(`[Workflows] No devices to capture state for`);
                return;
            }

            // Fetch current device states
            const { data: devices, error } = await supabase
                .from('smart_devices')
                .select('id, entity_id, value')
                .eq('server_id', serverId)
                .in('id', Array.from(deviceIds));

            if (error) {
                console.error(`[Workflows] Error fetching device states:`, error);
                return;
            }

            // Build state snapshot
            const stateData = {
                devices: {}
            };

            for (const device of devices) {
                stateData.devices[device.id] = {
                    entity_id: device.entity_id,
                    value: device.value
                };
            }

            // Save to database
            const { error: saveError } = await supabase
                .from('workflow_states')
                .insert({
                    workflow_id: workflow.id,
                    server_id: serverId,
                    user_id: workflow.user_id,
                    state_data: stateData
                });

            if (saveError) {
                console.error(`[Workflows] Error saving state:`, saveError);
            } else {
                console.log(`[Workflows] ✅ Saved state for ${devices.length} devices`);
            }

        } catch (error) {
            console.error(`[Workflows] Error capturing state:`, error);
        }
    }

    /**
     * Execute workflow actions
     * @param {string} serverId - Server ID
     * @param {object} workflow - Workflow object with actions
     */
    async executeWorkflowActions(serverId, workflow) {
        console.log(`[Workflows] ⚡ Executing workflow: ${workflow.name}`);

        // Sort actions by action_order
        const sortedActions = workflow.actions.sort((a, b) => a.action_order - b.action_order);

        for (const action of sortedActions) {
            try {
                await this.executeWorkflowAction(serverId, action);
                // Small delay between actions to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`[Workflows] Error executing action:`, error);
            }
        }

        console.log(`[Workflows] ✅ Completed workflow: ${workflow.name}`);
    }

    /**
     * Execute a single workflow action
     * @param {string} serverId - Server ID
     * @param {object} action - Action object
     */
    async executeWorkflowAction(serverId, action) {
        switch (action.action_type) {
            case 'set_device':
                const { device_id, value } = action.action_config;
                console.log(`[Workflows] set_device action - device_id: ${device_id}, value: ${value}`);

                // Get device entity_id
                const { data: device, error: deviceError } = await supabase
                    .from('smart_devices')
                    .select('entity_id, name')
                    .eq('id', device_id)
                    .single();

                if (deviceError) {
                    console.error(`[Workflows] Error fetching device ${device_id}:`, deviceError);
                } else if (device) {
                    console.log(`[Workflows] Setting ${device.name} (entity ${device.entity_id}) to ${value ? 'ON' : 'OFF'}`);
                    this.setEntityValue(serverId, device.entity_id, value);
                } else {
                    console.warn(`[Workflows] Device ${device_id} not found`);
                }
                break;

            case 'set_group':
                const { group_id, value: groupValue } = action.action_config;
                console.log(`[Workflows] set_group action - group_id: ${group_id}, value: ${groupValue}`);

                // Get all devices in the group via the junction table
                const { data: groupMembers, error: groupError } = await supabase
                    .from('device_group_members')
                    .select('device_id, smart_devices(entity_id, name)')
                    .eq('group_id', group_id);

                if (groupError) {
                    console.error(`[Workflows] Error fetching group ${group_id}:`, groupError);
                } else if (groupMembers && groupMembers.length > 0) {
                    console.log(`[Workflows] Setting ${groupMembers.length} devices in group to ${groupValue ? 'ON' : 'OFF'}`);
                    for (const member of groupMembers) {
                        const device = member.smart_devices;
                        if (device) {
                            this.setEntityValue(serverId, device.entity_id, groupValue);
                            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between devices
                        }
                    }
                } else {
                    console.warn(`[Workflows] No devices found in group ${group_id}`);
                }
                break;

            case 'send_message':
            case 'notify': // Alias for send_message
                const { message } = action.action_config;
                console.log(`[Workflows] Sending message: ${message}`);
                this.sendTeamMessage(serverId, message);
                break;


            case 'delay':
            case 'wait': // Alias for delay
                const { duration, duration_ms } = action.action_config;
                const waitTime = duration || duration_ms || 1000;
                console.log(`[Workflows] Waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                break;

            default:
                console.warn(`[Workflows] Unknown action type: ${action.action_type}`);
        }
    }

    /**
     * Restore the last saved workflow state
     * @param {string} serverId - Server ID
     * @param {string} senderName - Name of player who triggered restore
     */
    async restoreLastWorkflowState(serverId, senderName) {
        try {
            console.log(`[Workflows] 🔄 Restoring last state for server ${serverId}`);

            // Get most recent state snapshot
            const { data: states, error } = await supabase
                .from('workflow_states')
                .select('*')
                .eq('server_id', serverId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) {
                console.error(`[Workflows] Error fetching state:`, error);
                return;
            }

            if (!states || states.length === 0) {
                console.log(`[Workflows] No previous state to restore`);
                return;
            }

            const lastState = states[0];
            const devices = lastState.state_data.devices;

            // Restore each device to its previous state
            let restoredCount = 0;
            for (const [deviceId, deviceState] of Object.entries(devices)) {
                try {
                    this.setEntityValue(serverId, deviceState.entity_id, deviceState.value);
                    restoredCount++;
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    console.error(`[Workflows] Error restoring device ${deviceId}:`, error);
                }
            }

            console.log(`[Workflows] ✅ Restored ${restoredCount} devices`);

        } catch (error) {
            console.error(`[Workflows] Error restoring state:`, error);
        }
    }

}

module.exports = new RustPlusManager();
