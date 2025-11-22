const RustPlus = require('@liamcottle/rustplus.js');
const supabase = require('./supabase');

class RustPlusManager {
    constructor() {
        this.activeConnections = new Map(); // serverId -> RustPlus instance
        this.serverInfoIntervals = new Map(); // serverId -> interval ID for server info fetching
        this.mapDataIntervals = new Map(); // serverId -> interval IDs for map data fetching
        this.previousMarkers = new Map(); // serverId -> Set of marker IDs for event tracking
        this.sseCallback = null; // Function to forward events to SSE clients
        this.serverFailureCounts = new Map(); // serverId -> consecutive failure count
    }

    setSSECallback(callback) {
        this.sseCallback = callback;
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
            rustPlus.on('connected', () => {
                clearTimeout(connectionTimeout);
                console.log(`[RustPlus] ✅ Connected to ${serverInfo.name}`);
                this.emitToSSE(serverId, 'connection_status', { connected: true });

                // Fetch initial data
                this.fetchAndEmitServerInfo(serverId, rustPlus);
                this.fetchAndEmitMapData(serverId, rustPlus);
                this.fetchAndEmitTeamInfo(serverId, rustPlus);

                // Set up periodic server info fetching (every 30 seconds)
                const serverInfoInterval = setInterval(() => {
                    this.fetchAndEmitServerInfo(serverId, rustPlus);
                }, 30000);

                // Set up periodic map markers fetching (every 30 seconds)
                const mapMarkersInterval = setInterval(() => {
                    this.fetchAndEmitMapData(serverId, rustPlus);
                }, 30000);

                // Set up periodic team info fetching (every 10 seconds)
                const teamInfoInterval = setInterval(() => {
                    this.fetchAndEmitTeamInfo(serverId, rustPlus);
                }, 10000);

                // Store interval IDs for cleanup
                this.serverInfoIntervals.set(serverId, serverInfoInterval);
                this.mapDataIntervals.set(serverId, {
                    markers: mapMarkersInterval,
                    team: teamInfoInterval
                });

                resolve();
            });

            rustPlus.on('disconnected', () => {
                console.log(`[RustPlus] ❌ Disconnected from ${serverInfo.name}`);
                this.emitToSSE(serverId, 'connection_status', { connected: false });

                // Clean up server info interval
                if (this.serverInfoIntervals.has(serverId)) {
                    clearInterval(this.serverInfoIntervals.get(serverId));
                    this.serverInfoIntervals.delete(serverId);
                }

                // Clean up map data intervals
                if (this.mapDataIntervals.has(serverId)) {
                    const intervals = this.mapDataIntervals.get(serverId);
                    clearInterval(intervals.markers);
                    clearInterval(intervals.team);
                    this.mapDataIntervals.delete(serverId);
                }

                this.activeConnections.delete(serverId);
            });

            rustPlus.on('error', (error) => {
                clearTimeout(connectionTimeout);
                console.error(`[RustPlus] Error:`, error.message);
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
                }

                // Handle team messages
                if (message.broadcast && message.broadcast.teamMessage) {
                    const teamMessage = message.broadcast.teamMessage;
                    console.log(`[RustPlus] 💬 Team Message on ${serverInfo.name}: ${teamMessage.message.name}: ${teamMessage.message.message}`);

                    this.emitToSSE(serverId, 'team_message', {
                        message: teamMessage.message
                    });
                }

                // Emit raw message for debugging
                this.emitToSSE(serverId, 'message', message);
            });

            // Connect
            rustPlus.connect();
            this.activeConnections.set(serverId, rustPlus);
        });
    }

    disconnectServer(serverId) {
        const rustPlus = this.activeConnections.get(serverId);
        if (rustPlus) {
            console.log(`[RustPlus] Disconnecting from server ${serverId}...`);

            // Clean up server info interval
            if (this.serverInfoIntervals.has(serverId)) {
                clearInterval(this.serverInfoIntervals.get(serverId));
                this.serverInfoIntervals.delete(serverId);
            }

            // Clean up map data intervals
            if (this.mapDataIntervals.has(serverId)) {
                const intervals = this.mapDataIntervals.get(serverId);
                clearInterval(intervals.markers);
                clearInterval(intervals.team);
                this.mapDataIntervals.delete(serverId);
            }

            rustPlus.disconnect();
            this.activeConnections.delete(serverId);
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
            console.log(`[RustPlus] 🔔 Emitting SSE event: ${type} for server ${serverId}`);
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
    async sendRequest(serverId, request, callback) {
        const rustPlus = this.activeConnections.get(serverId);
        if (!rustPlus) {
            // Silently return if not connected (server might be in cleanup)
            console.log(`[RustPlus] Skipping request for ${serverId} - not connected`);
            if (callback) callback(null);
            return;
        }

        rustPlus.sendRequest(request, (message) => {
            if (callback) callback(message);
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
            rustPlus.getInfo(async (message) => {
                if (message && message.response && message.response.info) {
                    const info = message.response.info;
                    console.log(`[RustPlus] 📡 Broadcasting server info update for ${serverId}`);

                    // Reset failure count on success
                    this.serverFailureCounts.delete(serverId);

                    // Emit SSE event with server info
                    this.emitToSSE(serverId, 'server_info_update', info);
                } else {
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
                            .select('name')
                            .eq('id', serverId)
                            .single();

                        // Delete from database
                        const { error: deleteError } = await supabase
                            .from('servers')
                            .delete()
                            .eq('id', serverId);

                        if (deleteError) {
                            console.error(`[RustPlus] Failed to delete server ${serverId}:`, deleteError);
                        } else {
                            console.log(`[RustPlus] ✅ Removed unpaired server: ${server?.name || serverId}`);

                            // Notify frontend FIRST, before cleanup
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
                }
            });
        } catch (error) {
            console.error(`[RustPlus] Error fetching map markers for ${serverId}:`, error.message);
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
                    console.log(`[RustPlus] 👥 Broadcasting ${members.length} team members for ${serverId}`);

                    // Emit SSE event with team info
                    this.emitToSSE(serverId, 'team_info_update', { members });
                }
            });
        } catch (error) {
            console.error(`[RustPlus] Error fetching team info for ${serverId}:`, error.message);
        }
    }
}

module.exports = new RustPlusManager();
