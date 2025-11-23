const http = require('http');
const { PORT } = require('./config');
const fcmManager = require('./fcm-manager');
const rustPlusManager = require('./rustplus-manager');
const supabase = require('./supabase');

// Track SSE clients: userId -> response object
const sseClients = new Map();

// Track disconnect timeouts for graceful cleanup
const disconnectTimeouts = new Map();

// Activity tracking for inactivity detection
const userActivity = new Map(); // userId -> last activity timestamp
const activeServerByUser = new Map(); // userId -> serverId
const countdownTimers = new Map(); // userId -> countdown interval ID

const server = http.createServer(async (req, res) => {
    // Enable CORS - always allow localhost for development
    const allowedOrigins = [
        'https://app.rustplus.online',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // SSE Endpoint: GET /events/:userId
    if (req.method === 'GET' && req.url.startsWith('/events/')) {
        const userId = req.url.split('/events/')[1];

        if (!userId) {
            res.writeHead(400);
            res.end('Missing userId');
            return;
        }

        console.log(`[SSE] Client connected for user: ${userId}`);

        // Clear any pending disconnect timeout
        if (disconnectTimeouts.has(userId)) {
            clearTimeout(disconnectTimeouts.get(userId));
            disconnectTimeouts.delete(userId);
            console.log(`[SSE] Reconnected within grace period for user ${userId}`);
        }

        // Set up SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // Store client
        sseClients.set(userId, res);

        // Send initial connection event
        sendSSE(res, 'connected', { userId, timestamp: Date.now() });

        try {
            // Start FCM Listener for this user
            const credentials = await fcmManager.startListening(
                userId,
                (notification) => {
                    // Forward notification to this client
                    sendSSE(res, 'notification', notification);
                },
                (devicePairingResult) => {
                    // Auto-subscribe to newly paired device
                    console.log(`[Shim] Auto-subscribing to newly paired device: ${devicePairingResult.entityId}`);
                    rustPlusManager.subscribeToDevice(
                        devicePairingResult.serverId,
                        devicePairingResult.entityId
                    );

                    // Notify client to refresh device list
                    sendSSE(res, 'device_paired', {
                        serverId: devicePairingResult.serverId,
                        entityId: devicePairingResult.entityId
                    });
                },
                (serverPairingResult) => {
                    // Server was auto-connected via FCM pairing
                    console.log(`[Shim] Server paired and connected: ${serverPairingResult.serverId}`);

                    // Update active server tracking
                    activeServerByUser.set(serverPairingResult.userId, serverPairingResult.serverId);

                    // Update activity timestamp
                    userActivity.set(serverPairingResult.userId, Date.now());

                    // Notify client that server is connected
                    const client = sseClients.get(serverPairingResult.userId);
                    if (client) {
                        sendSSE(client, 'server_connected', {
                            serverId: serverPairingResult.serverId,
                            serverInfo: serverPairingResult.serverInfo
                        });
                    } else {
                        console.error(`[Shim] ❌ Failed to send server_connected event - no SSE client for user ${serverPairingResult.userId}`);
                    }
                }
            );

            // NOTE: Server connections now happen via manual /connect-server endpoint
            // This prevents resource waste from connecting to all servers automatically

            // Send FCM status
            if (credentials) {
                sendSSE(res, 'fcm_status', {
                    connected: true,
                    fcmToken: credentials.fcm.token
                });
            } else {
                sendSSE(res, 'fcm_status', { connected: true });
            }

        } catch (error) {
            console.error(`[SSE] Error initializing for ${userId}:`, error);
            sendSSE(res, 'error', { message: 'Failed to initialize' });
        }

        // Handle client disconnect
        req.on('close', () => {
            console.log(`[SSE] Client disconnected: ${userId}`);
            sseClients.delete(userId);

            // Implement grace period - don't immediately tear down FCM listener
            const timeoutId = setTimeout(() => {
                console.log(`[SSE] Grace period expired for user ${userId}, stopping FCM listener`);
                fcmManager.stopListening(userId);
                disconnectTimeouts.delete(userId);
            }, 30000); // 30 second grace period

            disconnectTimeouts.set(userId, timeoutId);
            console.log(`[SSE] Started 30s grace period for user ${userId}`);
        });

        return;
    }

    // Get Active Server Endpoint: GET /active-server/:userId
    if (req.method === 'GET' && req.url.startsWith('/active-server/')) {
        const userId = req.url.split('/active-server/')[1];

        if (!userId) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Missing userId' }));
            return;
        }

        const activeServerId = activeServerByUser.get(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            activeServerId: activeServerId || null
        }));
        return;
    }

    // Command Endpoint: POST /command
    if (req.method === 'POST' && req.url === '/command') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { userId, serverId, command, payload } = JSON.parse(body);

                if (!userId || !serverId || !command) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing required fields' }));
                    return;
                }

                console.log(`[Command] Received ${command} for server ${serverId} from user ${userId}`);

                // Verify user owns this server
                const { data: server, error } = await supabase
                    .from('servers')
                    .select('id')
                    .eq('id', serverId)
                    .eq('user_id', userId)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (error || !server) {
                    res.writeHead(403);
                    res.end(JSON.stringify({ error: 'Unauthorized' }));
                    return;
                }

                // Execute command
                switch (command) {
                    case 'setEntityValue':
                        rustPlusManager.setEntityValue(serverId, payload.entityId, payload.value);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                        break;

                    case 'setGroupEntityValues':
                        // Bulk action for device groups
                        // payload: { entityIds: [1, 2, 3], value: true/false }
                        console.log(`[Command] Bulk setting ${payload.entityIds.length} entities to ${payload.value}`);

                        let successCount = 0;
                        for (const entityId of payload.entityIds) {
                            try {
                                rustPlusManager.setEntityValue(serverId, entityId, payload.value);
                                successCount++;

                                // Small delay between commands to avoid overwhelming server
                                if (successCount < payload.entityIds.length) {
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                }
                            } catch (error) {
                                console.error(`[Command] Failed to set entity ${entityId}:`, error);
                            }
                        }

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            processed: successCount,
                            total: payload.entityIds.length
                        }));
                        break;

                    case 'validateDevices':
                        // Re-subscribe to all devices to check if they still exist
                        console.log(`[Command] Validating devices for server ${serverId}`);
                        await rustPlusManager.subscribeToAllDevices(serverId);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                        break;

                    case 'getMap':
                        rustPlusManager.getMap(serverId, (message) => {
                            if (message && message.response && message.response.map) {
                                const mapData = message.response.map;
                                // Verbose map data logging disabled to reduce console noise
                                // console.log('[Shim] Map data keys:', Object.keys(mapData));

                                // DEBUG: Write map metadata to file
                                const fs = require('fs');
                                const path = require('path');
                                const debugPath = path.join(__dirname, '..', 'map-debug.json');
                                const debugData = {
                                    width: mapData.width,
                                    height: mapData.height,
                                    oceanMargin: mapData.oceanMargin,
                                    monuments: mapData.monuments,
                                    background: mapData.background
                                };
                                fs.writeFileSync(debugPath, JSON.stringify(debugData, null, 2));
                                // Verbose debug file logging disabled to reduce console noise
                                // console.log('[Shim] Wrote map debug data to:', debugPath);

                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    success: true,
                                    data: {
                                        // Convert image buffer to base64
                                        jpgImage: mapData.jpgImage ? Buffer.from(mapData.jpgImage).toString('base64') : null,
                                        width: mapData.width,
                                        height: mapData.height,
                                        oceanMargin: mapData.oceanMargin,
                                        monuments: mapData.monuments,
                                        background: mapData.background
                                    }
                                }));
                            } else {
                                console.error('[Command] getMap failed - null or invalid response:', message);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Server not connected or failed to get map' }));
                            }
                        });
                        return; // Don't end response here, callback will handle it

                    case 'getMapMarkers':
                        rustPlusManager.getMapMarkers(serverId, (message) => {
                            try {
                                if (message.response && message.response.mapMarkers) {
                                    const markers = message.response.mapMarkers;
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({
                                        success: true,
                                        data: markers
                                    }));
                                } else {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Failed to get markers' }));
                                }
                            } catch (error) {
                                console.error('[MapMarkers] Protobuf decode error (known issue with vending machines):', error.message);
                                // Return empty markers array instead of crashing
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    success: true,
                                    data: { markers: [] },
                                    warning: 'Some markers could not be decoded due to protobuf schema mismatch'
                                }));
                            }
                        });
                        return;

                    case 'getTeamInfo':
                        rustPlusManager.getTeamInfo(serverId, (message) => {
                            if (message.response && message.response.teamInfo) {
                                const teamInfo = message.response.teamInfo;
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    success: true,
                                    data: teamInfo
                                }));
                            } else {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Failed to get team info' }));
                            }
                        });
                        return;

                    case 'getServerInfo':
                        rustPlusManager.getServerInfo(serverId, async (message) => {
                            if (message.response && message.response.info) {
                                const info = message.response.info;

                                // Save to database for caching
                                try {
                                    const { error: upsertError } = await supabase
                                        .from('server_info')
                                        .upsert({
                                            server_id: serverId,
                                            name: info.name,
                                            header_image: info.headerImage,
                                            url: info.url,
                                            map: info.map,
                                            map_size: info.mapSize,
                                            wipe_time: info.wipeTime ? new Date(info.wipeTime * 1000).toISOString() : null,
                                            players: info.players,
                                            max_players: info.maxPlayers,
                                            queued_players: info.queuedPlayers,
                                            seed: info.seed,
                                            salt: info.salt,
                                            updated_at: new Date().toISOString()
                                        }, { onConflict: 'server_id' });

                                    if (upsertError) {
                                        console.error('[Shim] Failed to cache server info:', upsertError);
                                    } else {
                                        console.log('[Shim] ✅ Cached server info for', serverId);
                                    }
                                } catch (cacheError) {
                                    console.error('[Shim] Error caching server info:', cacheError);
                                }

                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    success: true,
                                    data: info
                                }));
                            } else {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Failed to get server info' }));
                            }
                        });
                        return;

                    case 'sendTeamMessage':
                        rustPlusManager.sendTeamMessage(serverId, payload.message, (message) => {
                            if (message.response && message.response.error) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Failed to send message' }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true }));
                            }
                        });
                        return;

                    default:
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Unknown command' }));
                }

            } catch (error) {
                console.error('[Command] Error:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });

        return;
    }

    // Disconnect Server: POST /disconnect-server
    if (req.method === 'POST' && req.url === '/disconnect-server') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { serverId } = JSON.parse(body);

                if (!serverId) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing serverId' }));
                    return;
                }

                console.log(`[Shim] 🗑️ Received disconnect request for server ${serverId}`);
                rustPlusManager.disconnectServer(serverId);

                // Clear active server tracking for this server
                for (const [userId, activeServerId] of activeServerByUser.entries()) {
                    if (activeServerId === serverId) {
                        activeServerByUser.delete(userId);
                        console.log(`[Shim] Cleared active server tracking for user ${userId}`);
                        break;
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('[Shim] Error disconnecting server:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        return;
    }

    // Connect Server: POST /connect-server
    if (req.method === 'POST' && req.url === '/connect-server') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { userId, serverId } = JSON.parse(body);

                if (!userId || !serverId) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing userId or serverId' }));
                    return;
                }

                console.log(`[Shim] 🔌 Connect request: user ${userId} -> server ${serverId}`);

                // Disconnect any currently active server for this user
                const currentActiveServer = activeServerByUser.get(userId);
                if (currentActiveServer && currentActiveServer !== serverId) {
                    console.log(`[Shim] 🔄 Disconnecting previous server ${currentActiveServer} for user ${userId}`);
                    rustPlusManager.disconnectServer(currentActiveServer);
                }

                // Update active server tracking
                activeServerByUser.set(userId, serverId);

                // Update activity timestamp
                userActivity.set(userId, Date.now());

                // Fetch server info and connect
                const { data: server, error } = await supabase
                    .from('servers')
                    .select('*')
                    .eq('id', serverId)
                    .eq('user_id', userId)
                    .single();

                if (error || !server) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Server not found or unauthorized' }));
                    return;
                }

                // Connect to the server
                await rustPlusManager.connectToServer(serverId, server);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('[Connect] Error:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        return;
    }

    // Heartbeat: POST /heartbeat
    if (req.method === 'POST' && req.url === '/heartbeat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { userId } = JSON.parse(body);

                if (!userId) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing userId' }));
                    return;
                }

                // Only track activity if user has an active server
                if (!activeServerByUser.has(userId)) {
                    // No active server, ignore heartbeat
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, ignored: true }));
                    return;
                }

                // Update activity timestamp
                userActivity.set(userId, Date.now());

                // Cancel any active countdown
                if (countdownTimers.has(userId)) {
                    clearInterval(countdownTimers.get(userId));
                    countdownTimers.delete(userId);
                    console.log(`[Activity] ✅ Countdown cancelled for user ${userId} - activity detected`);

                    // Notify frontend to stop countdown
                    const client = sseClients.get(userId);
                    if (client) {
                        sendSSE(client, 'countdown_cancelled', {});
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('[Heartbeat] Error:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        return;
    }

    // Execute Workflow: POST /execute-workflow
    if (req.method === 'POST' && req.url === '/execute-workflow') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { serverId, workflowId, actions } = JSON.parse(body);

                if (!serverId || !workflowId || !actions || !Array.isArray(actions)) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing required fields' }));
                    return;
                }

                console.log(`[Workflow] Executing workflow ${workflowId} with ${actions.length} actions`);

                const results = [];
                let failedActions = 0;

                for (const action of actions) {
                    try {
                        const result = await executeWorkflowAction(serverId, action);
                        results.push(result);

                        if (!result.success) {
                            failedActions++;
                            console.error(`[Workflow] Action ${action.action_type} failed:`, result.error);
                        }
                    } catch (error) {
                        console.error(`[Workflow] Error executing action:`, error);
                        results.push({ success: false, error: error.message });
                        failedActions++;
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: failedActions === 0,
                    executed: actions.length,
                    failed: failedActions,
                    results
                }));
            } catch (error) {
                console.error('[Workflow] Error:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
        return;
    }

    // 404
    res.writeHead(404);
    res.end('Not Found');
});

// Setup RustPlusManager to forward events to SSE clients
rustPlusManager.setSSECallback(({ serverId, type, data }) => {
    // Broadcast to all connected clients
    // In production, you'd filter by which users have access to this server
    for (const [userId, client] of sseClients.entries()) {
        sendSSE(client, type, { serverId, ...data });
    }
});

// Helper function to send SSE events
function sendSSE(res, event, data) {
    try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
        console.error('[SSE] Error sending event:', error);
    }
}

// Helper function to execute a single workflow action
async function executeWorkflowAction(serverId, action) {
    const { action_type, action_config } = action;

    console.log(`[Workflow] Executing ${action_type} action for server ${serverId}`);

    switch (action_type) {
        case 'set_device':
            // action_config: { device_id, entity_id, value }
            if (!action_config.entity_id || action_config.value === undefined) {
                return { success: false, error: 'Missing entity_id or value' };
            }
            try {
                rustPlusManager.setEntityValue(serverId, action_config.entity_id, action_config.value);
                return { success: true, action: 'set_device', entity_id: action_config.entity_id };
            } catch (error) {
                return { success: false, error: error.message };
            }

        case 'set_group':
            // action_config: { group_id, entity_ids: [1, 2, 3], value }
            if (!action_config.entity_ids || !Array.isArray(action_config.entity_ids) || action_config.value === undefined) {
                return { success: false, error: 'Missing entity_ids array or value' };
            }
            try {
                let successCount = 0;
                for (const entityId of action_config.entity_ids) {
                    try {
                        rustPlusManager.setEntityValue(serverId, entityId, action_config.value);
                        successCount++;
                        // Small delay between commands
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        console.error(`[Workflow] Failed to set entity ${entityId}:`, error);
                    }
                }
                return {
                    success: true,
                    action: 'set_group',
                    processed: successCount,
                    total: action_config.entity_ids.length
                };
            } catch (error) {
                return { success: false, error: error.message };
            }

        case 'wait':
            // action_config: { duration_ms }
            if (!action_config.duration_ms || action_config.duration_ms <= 0) {
                return { success: false, error: 'Invalid wait duration' };
            }
            try {
                await new Promise(resolve => setTimeout(resolve, action_config.duration_ms));
                return { success: true, action: 'wait', duration: action_config.duration_ms };
            } catch (error) {
                return { success: false, error: error.message };
            }

        case 'notify':
            // action_config: { message }
            // Placeholder for future notification system
            console.log(`[Workflow] Notification: ${action_config.message}`);
            return { success: true, action: 'notify', message: action_config.message };

        default:
            return { success: false, error: `Unknown action type: ${action_type}` };
    }
}

// Inactivity Checker - Runs every 10 seconds
setInterval(() => {
    const now = Date.now();
    const INACTIVITY_THRESHOLD = 10 * 60 * 1000; // 10 minutes
    const COUNTDOWN_DURATION = 10; // 10 seconds

    for (const [userId, lastActivity] of userActivity.entries()) {
        const timeSinceActivity = now - lastActivity;

        // Check if user has been inactive for 10 minutes
        if (timeSinceActivity >= INACTIVITY_THRESHOLD) {
            // Skip if countdown already running
            if (countdownTimers.has(userId)) {
                continue;
            }

            console.log(`[Activity] ⏰ Starting inactivity countdown for user ${userId}`);

            let countdown = COUNTDOWN_DURATION;

            // Send initial countdown event
            const client = sseClients.get(userId);
            if (client) {
                sendSSE(client, 'inactivity_countdown', { secondsRemaining: countdown });
            }

            // Start countdown interval
            const countdownInterval = setInterval(() => {
                countdown--;

                if (countdown > 0) {
                    // Send countdown update
                    const client = sseClients.get(userId);
                    if (client) {
                        sendSSE(client, 'inactivity_countdown', { secondsRemaining: countdown });
                    }
                } else {
                    // Countdown finished - disconnect active server
                    clearInterval(countdownInterval);
                    countdownTimers.delete(userId);

                    const serverId = activeServerByUser.get(userId);
                    if (serverId) {
                        console.log(`[Activity] 💤 Disconnecting server ${serverId} due to inactivity for user ${userId}`);
                        rustPlusManager.disconnectServer(serverId);
                        activeServerByUser.delete(userId);

                        // Notify frontend
                        const client = sseClients.get(userId);
                        if (client) {
                            sendSSE(client, 'disconnected_by_inactivity', {
                                serverId,
                                reason: 'No activity detected for 1 minute'
                            });
                        }
                    }

                    // Clean up activity tracking
                    userActivity.delete(userId);
                }
            }, 1000); // Update every second

            countdownTimers.set(userId, countdownInterval);
        }
    }
}, 10000); // Check every 10 seconds

server.listen(PORT, () => {
    console.log(`[Shim] Cloud Shim running on port ${PORT}`);
    console.log(`[Shim] SSE endpoint: http://localhost:${PORT}/events/:userId`);
    console.log(`[Shim] Command endpoint: http://localhost:${PORT}/command`);
    console.log(`[Shim] Heartbeat endpoint: http://localhost:${PORT}/heartbeat`);
    console.log(`[Shim] Connect endpoint: http://localhost:${PORT}/connect-server`);
});
