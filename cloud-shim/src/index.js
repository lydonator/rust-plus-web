const http = require('http');
const { PORT } = require('./config');
const fcmManager = require('./fcm-manager');
const rustPlusManager = require('./rustplus-manager');
const supabase = require('./supabase');

// Track SSE clients: userId -> response object
const sseClients = new Map();

// Track disconnect timeouts for graceful cleanup
const disconnectTimeouts = new Map();

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
                }
            );

            // Connect to all active Rust servers for this user
            await rustPlusManager.connectAllUserServers(userId);

            // Subscribe to all existing smart devices
            const { data: userServers } = await supabase
                .from('servers')
                .select('id')
                .eq('user_id', userId);

            if (userServers && userServers.length > 0) {
                for (const server of userServers) {
                    setTimeout(() => {
                        rustPlusManager.subscribeToAllDevices(server.id);
                    }, 1000);
                }
            }

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

                    case 'validateDevices':
                        // Re-subscribe to all devices to check if they still exist
                        console.log(`[Command] Validating devices for server ${serverId}`);
                        await rustPlusManager.subscribeToAllDevices(serverId);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                        break;

                    case 'getMap':
                        rustPlusManager.getMap(serverId, (message) => {
                            if (message.response && message.response.map) {
                                const mapData = message.response.map;
                                console.log('[Shim] Map data keys:', Object.keys(mapData));

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
                                console.log('[Shim] Wrote map debug data to:', debugPath);

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
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Failed to get map' }));
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

server.listen(PORT, () => {
    console.log(`[Shim] Cloud Shim running on port ${PORT}`);
    console.log(`[Shim] SSE endpoint: http://localhost:${PORT}/events/:userId`);
    console.log(`[Shim] Command endpoint: http://localhost:${PORT}/command`);
});
