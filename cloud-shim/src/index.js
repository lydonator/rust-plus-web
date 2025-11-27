const http = require('http');
const { PORT } = require('./config');
const fcmManager = require('./fcm-manager');
const rustPlusManager = require('./rustplus-manager');
const supabase = require('./supabase');
const stateManager = require('./state-manager');
const rateLimiter = require('./rate-limiter');
const logger = require('./logger');
const queueManager = require('./queue-manager');
const { processJob } = require('./job-processors');
const { authenticate } = require('./middleware/auth');
const { v4: uuidv4 } = require('uuid');

// ========================================
// Security: Input Validation
// ========================================

/**
 * Validates UUID format (8-4-4-4-12 hex pattern)
 * @param {string} id - The UUID to validate
 * @returns {boolean} True if valid UUID format
 */
function isValidUUID(id) {
    if (!id || typeof id !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}

/**
 * Sanitizes and validates userId parameter
 * @param {string} userId - The userId to validate
 * @returns {string|null} Trimmed userId if valid, null otherwise
 */
function validateUserId(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const trimmed = userId.trim();
    if (!isValidUUID(trimmed)) {
        console.warn(`[Security] Invalid userId format: ${userId}`);
        return null;
    }
    return trimmed;
}

/**
 * Sanitizes and validates serverId parameter
 * @param {string} serverId - The serverId to validate
 * @returns {string|null} Trimmed serverId if valid, null otherwise
 */
function validateServerId(serverId) {
    if (!serverId || typeof serverId !== 'string') return null;
    const trimmed = serverId.trim();
    if (!isValidUUID(trimmed)) {
        console.warn(`[Security] Invalid serverId format: ${serverId}`);
        return null;
    }
    return trimmed;
}

// Track SSE clients: userId -> { res, lastWrite, subscriptions }
const sseClients = new Map();
const MAX_TOTAL_CONNECTIONS = 5000;
let totalEventsSent = 0;

// Track disconnect timeouts for graceful cleanup
const disconnectTimeouts = new Map();

// SSE Watchdog: Monitor for hung/dead sockets
const SSE_TIMEOUT_MS = 900000; // 15 minutes (increased from 5m to prevent premature disconnects)
setInterval(() => {
    const now = Date.now();
    for (const [userId, clientData] of sseClients.entries()) {
        // Check for "zombie" connections (response stream ended but still in map)
        if (clientData.res.writableEnded || clientData.res.finished) {
            console.warn(`[SSE Watchdog] Detected zombie socket for user ${userId}. Cleaning up...`);
            sseClients.delete(userId);
            fcmManager.stopListening(userId);
            continue;
        }

        // Check for timeout (hung socket)
        const timeSinceLastWrite = now - clientData.lastWrite;
        if (timeSinceLastWrite > SSE_TIMEOUT_MS) {
            console.warn(`[SSE Watchdog] Detected hung socket for user ${userId} (${timeSinceLastWrite}ms since last write). Force closing...`);
            try {
                clientData.res.end();
            } catch (e) {
                console.error(`[SSE Watchdog] Error closing hung socket:`, e.message);
            }
            sseClients.delete(userId);

            // Stop FCM listener for this user
            fcmManager.stopListening(userId);
        }
    }
}, 15000); // Check every 15 seconds

// Activity tracking for inactivity detection
// MIGRATED TO REDIS via stateManager (Phase 2.2)
// Legacy in-memory maps kept as reference:
// const userActivity = new Map(); // NOW: stateManager.setUserActivity()
// const activeServerByUser = new Map(); // NOW: stateManager.setActiveServer()
const countdownTimers = new Map(); // userId -> countdown interval ID (stays in-memory)

const server = http.createServer(async (req, res) => {
    // ========================================
    // Security Headers
    // ========================================

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking attacks
    res.setHeader('X-Frame-Options', 'DENY');

    // Enable XSS protection in older browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // ========================================
    // Authentication Middleware
    // ========================================
    
    // Skip auth for health check and preflight requests
    if (req.method !== 'OPTIONS' && req.url !== '/health') {
        const authUser = authenticate(req);
        if (!authUser) {
            console.warn(`[Auth] Unauthorized access attempt: ${req.method} ${req.url}`);
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': req.headers.origin || 'https://app.rustplus.online',
                'Access-Control-Allow-Credentials': 'true'
            });
            res.end(JSON.stringify({ error: 'Unauthorized - Invalid or missing token' }));
            return;
        }
        req.user = authUser; // Store authenticated user
        // console.log(`[Auth] Authenticated user: ${authUser.userId}`);
    }

    // Prevent browsers from sending referrer information
    res.setHeader('Referrer-Policy', 'no-referrer');

    // Content Security Policy (strict for API server)
    res.setHeader('Content-Security-Policy', "default-src 'none'");

    // Strict Transport Security (HSTS) - enforce HTTPS (only set if HTTPS)
    if (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // ========================================
    // CORS Configuration
    // ========================================

    // Helper function to get CORS headers
    const getCorsHeaders = (origin) => {
        const allowedOrigins = [
            'https://app.rustplus.online',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];
        
        const headers = {};
        if (allowedOrigins.includes(origin)) {
            headers['Access-Control-Allow-Origin'] = origin;
            headers['Access-Control-Allow-Credentials'] = 'true';
        } else if (origin) {
            // Log unauthorized origin attempts
            console.warn(`[Security] Blocked request from unauthorized origin: ${origin}`);
        }
        
        return headers;
    };

    // Whitelist only specific origins (no wildcards)
    const allowedOrigins = [
        'https://app.rustplus.online',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (origin) {
        // Log unauthorized origin attempts
        console.warn(`[Security] Blocked request from unauthorized origin: ${origin}`);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204); // No Content
        res.end();
        return;
    }

    // Heartbeat Endpoint: GET /heartbeat
    if (req.method === 'GET' && req.url === '/heartbeat') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
        return;
    }

    // SSE Endpoint: GET /events/:userId
    if (req.method === 'GET' && req.url.startsWith('/events/')) {
        // Extract userId, ignoring query parameters (e.g. ?token=...)
        const rawUserId = req.url.split('/events/')[1].split('?')[0];
        const userId = validateUserId(rawUserId);

        if (!userId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or missing userId' }));
            return;
        }

        // Security Check: Ensure authenticated user matches requested userId
        if (userId !== req.user.userId) {
            console.warn(`[Security] User ${req.user.userId} attempted to access events for ${userId}`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
        }

        // Rate limiting: 30 connections/minute per user (allow for development/refresh cycles)
        const rateLimit = await rateLimiter.checkLimit('sse_connect', userId, 30, 60000);
        if (!rateLimit.allowed) {
            console.warn(`[RateLimiter] SSE connection limit exceeded for user ${userId}`);
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many connection attempts' }));
            return;
        }

        // Global connection limit
        if (sseClients.size >= MAX_TOTAL_CONNECTIONS && !sseClients.has(userId)) {
            console.warn(`[SSE] Global connection limit reached (${MAX_TOTAL_CONNECTIONS})`);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server busy' }));
            return;
        }

        logger.info('SSE', 'Client connected', { userId });

        // Clear any pending disconnect timeout
        if (disconnectTimeouts.has(userId)) {
            clearTimeout(disconnectTimeouts.get(userId));
            disconnectTimeouts.delete(userId);
            logger.info('SSE', 'Reconnected within grace period', { userId });
        }

        // Set up SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': origin || 'https://app.rustplus.online',
            'Access-Control-Allow-Credentials': 'true'
        });

        const connectionId = uuidv4();

        // Check if there's already a connection for this user
        if (sseClients.has(userId)) {
            logger.warn('SSE', 'Duplicate connection detected, closing old connection', { userId, newConnectionId: connectionId });
            const oldClientData = sseClients.get(userId);

            // Close old SSE connection
            try {
                oldClientData.res.end();
            } catch (e) {
                logger.error('SSE', 'Error closing old connection', { userId, error: e.message });
            }

            // We do not stop the FCM listener here. We reuse it and update its callbacks below.
        }

        // Store new client with metadata
        sseClients.set(userId, {
            res,
            connectionId,
            lastWrite: Date.now(),
            subscriptions: new Set(), // Track which servers this user is subscribed to
            connectedAt: Date.now()
        });

        // Send initial connection event
        sendSSE(res, 'connected', { userId, timestamp: Date.now(), connectionId }, userId);

        try {
            // Start FCM Listener for this user (updates callbacks if already listening)
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
                    sendSSE(res, 'device_list_changed', {
                        serverId: devicePairingResult.serverId,
                        entityId: devicePairingResult.entityId
                    });
                },
                async (serverPairingResult) => {
                    // Server was auto-connected via FCM pairing
                    console.log(`[Shim] Server paired and connected: ${serverPairingResult.serverId}`);

                    // Update active server tracking
                    await stateManager.setActiveServer(serverPairingResult.userId, serverPairingResult.serverId);

                    // Update activity timestamp
                    await stateManager.setUserActivity(serverPairingResult.userId, Date.now());

                    // Add server to user's subscription list
                    const clientData = sseClients.get(serverPairingResult.userId);
                    if (clientData) {
                        clientData.subscriptions.add(serverPairingResult.serverId);
                        console.log(`[Shim] ✅ User ${serverPairingResult.userId} auto-subscribed to server ${serverPairingResult.serverId}`);

                        // Notify client that server is connected
                        sendSSE(clientData.res, 'server_connected', {
                            serverId: serverPairingResult.serverId,
                            serverInfo: serverPairingResult.serverInfo
                        }, serverPairingResult.userId);
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
                }, userId);
            } else {
                sendSSE(res, 'fcm_status', { connected: true }, userId);
            }

        } catch (error) {
            console.error(`[SSE] ❌❌❌ Error initializing for ${userId}:`, error);
            console.error(`[SSE] Error stack:`, error.stack);
            console.error(`[SSE] Error name:`, error.name);
            console.error(`[SSE] Error message:`, error.message);
            try {
                sendSSE(res, 'error', { message: 'Failed to initialize', error: error.message }, userId);
            } catch (sendError) {
                console.error(`[SSE] Failed to send error event:`, sendError);
            }
        }

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
            try {
                // Send heartbeat EVENT (visible to client) instead of comment
                // This allows the client to detect silent disconnections
                sendSSE(res, 'heartbeat', { timestamp: Date.now() }, userId);
            } catch (error) {
                console.error(`[SSE] Heartbeat failed for ${userId}:`, error);
                clearInterval(heartbeatInterval);
            }
        }, 30000); // 30 seconds

        // Handle client disconnect
        req.on('close', () => {
            clearInterval(heartbeatInterval); // Stop heartbeat

            // Only clean up if this is the CURRENT active connection
            const currentClient = sseClients.get(userId);
            if (currentClient && currentClient.connectionId === connectionId) {
                console.log(`[SSE] Client disconnected: ${userId} (connId: ${connectionId})`);
                sseClients.delete(userId);

                // Implement grace period - don't immediately tear down FCM listener
                const timeoutId = setTimeout(() => {
                    console.log(`[SSE] Grace period expired for user ${userId}, stopping FCM listener`);
                    fcmManager.stopListening(userId);
                    disconnectTimeouts.delete(userId);
                }, 30000); // 30 second grace period

                disconnectTimeouts.set(userId, timeoutId);
                console.log(`[SSE] Started 30s grace period for user ${userId}`);
            } else {
                console.log(`[SSE] Old connection closed for user ${userId} (connId: ${connectionId}) - preserving new connection`);
            }
        });

        return;
    }

    // Get Active Server Endpoint: GET /active-server/:userId
    if (req.method === 'GET' && req.url.startsWith('/active-server/')) {
        // Extract userId, ignoring query parameters
        const rawUserId = req.url.split('/active-server/')[1].split('?')[0];
        const userId = validateUserId(rawUserId);

        if (!userId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or missing userId' }));
            return;
        }

        const activeServerId = await stateManager.getActiveServer(userId);
        
                // Security Check
                if (userId !== req.user.userId) {
                    const corsHeaders = {};
                    if (allowedOrigins.includes(origin)) {
                        corsHeaders['Access-Control-Allow-Origin'] = origin;
                        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
                    }
                    res.writeHead(403, { 
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    });
                    res.end(JSON.stringify({ error: 'Forbidden' }));
                    return;
                }

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
                const { userId: rawUserId, serverId: rawServerId, command, payload } = JSON.parse(body);

                // Validate inputs
                const userId = validateUserId(rawUserId);
                const serverId = validateServerId(rawServerId);

                if (!userId || !serverId || !command) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid or missing required fields' }));
                    return;
                }

                // Security Check
                if (userId !== req.user.userId) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Forbidden' }));
                    return;
                }

                // Rate limiting: 60 requests/minute per user
                const rateLimit = await rateLimiter.checkLimit('command', userId, 60, 60000);
                res.setHeader('X-RateLimit-Limit', '60');
                res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
                res.setHeader('X-RateLimit-Reset', rateLimit.resetAt);

                if (!rateLimit.allowed) {
                    console.warn(`[RateLimiter] Rate limit exceeded for command:${userId}`);
                    res.writeHead(429, {
                        'Content-Type': 'application/json',
                        'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
                    });
                    res.end(JSON.stringify({
                        error: 'Too Many Requests',
                        message: `Rate limit exceeded. Try again after ${new Date(rateLimit.resetAt).toISOString()}`,
                        retryAfter: rateLimit.resetAt
                    }));
                    return;
                }

                logger.info('Command', `Received ${command}`, { userId, serverId, command });

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
                                if (!message) {
                                    res.writeHead(503, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Server not connected' }));
                                    return;
                                }
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
                            if (!message) {
                                res.writeHead(503, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Server not connected' }));
                                return;
                            }
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
                            if (!message) {
                                res.writeHead(503, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Server not connected' }));
                                return;
                            }
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
                            if (!message) {
                                res.writeHead(503, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Server not connected' }));
                                return;
                            }
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
        req.on('end', async () => {
            try {
                const { serverId: rawServerId } = JSON.parse(body);

                // Validate input
                const serverId = validateServerId(rawServerId);

                if (!serverId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid or missing serverId' }));
                    return;
                }

                console.log(`[Shim] 🗑️ Received disconnect request for server ${serverId}`);
                rustPlusManager.disconnectServer(serverId);

                // Cleanup in-memory subscriptions for this server
                for (const clientData of sseClients.values()) {
                    if (clientData.subscriptions.has(serverId)) {
                        clientData.subscriptions.delete(serverId);
                    }
                }

                // Clear active server tracking for this server
                const usersWithServer = await stateManager.getUsersWithActiveServer(serverId);
                for (const userId of usersWithServer) {
                    await stateManager.deleteActiveServer(userId);
                    console.log(`[Shim] Cleared active server tracking for user ${userId}`);
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
                const { userId: rawUserId, serverId: rawServerId } = JSON.parse(body);

                // Validate inputs
                const userId = validateUserId(rawUserId);
                const serverId = validateServerId(rawServerId);

                if (!userId || !serverId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid or missing userId or serverId' }));
                    return;
                }

                // Security Check
                if (userId !== req.user.userId) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Forbidden' }));
                    return;
                }

                // Rate limiting: 10 requests/minute per user
                const rateLimit = await rateLimiter.checkLimit('connect-server', userId, 10, 60000);
                res.setHeader('X-RateLimit-Limit', '10');
                res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
                res.setHeader('X-RateLimit-Reset', rateLimit.resetAt);

                if (!rateLimit.allowed) {
                    console.warn(`[RateLimiter] Rate limit exceeded for connect-server:${userId}`);
                    res.writeHead(429, {
                        'Content-Type': 'application/json',
                        'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
                    });
                    res.end(JSON.stringify({
                        error: 'Too Many Requests',
                        message: `Rate limit exceeded. Try again after ${new Date(rateLimit.resetAt).toISOString()}`,
                        retryAfter: rateLimit.resetAt
                    }));
                    return;
                }

                console.log(`[Shim] 🔌 Connect request: user ${userId} -> server ${serverId}`);

                // Disconnect any currently active server for this user
                const currentActiveServer = await stateManager.getActiveServer(userId);
                if (currentActiveServer && currentActiveServer !== serverId) {
                    console.log(`[Shim] 🔄 Disconnecting previous server ${currentActiveServer} for user ${userId}`);
                    rustPlusManager.disconnectServer(currentActiveServer);
                }

                // Update active server tracking
                await stateManager.setActiveServer(userId, serverId);

                // Update activity timestamp
                await stateManager.setUserActivity(userId, Date.now());

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

                // Add server to user's subscription list
                const clientData = sseClients.get(userId);
                if (clientData) {
                    clientData.subscriptions.add(serverId);
                    console.log(`[Shim] ✅ User ${userId} subscribed to server ${serverId}`);
                }

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

    // Start Map Polling: POST /start-map-polling
    if (req.method === 'POST' && req.url === '/start-map-polling') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { userId: rawUserId, serverId: rawServerId } = JSON.parse(body);

                // Validate inputs
                const userId = validateUserId(rawUserId);
                const serverId = validateServerId(rawServerId);

                if (!userId || !serverId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid or missing userId or serverId' }));
                    return;
                }

                // Security Check
                if (userId !== req.user.userId) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Forbidden' }));
                    return;
                }

                console.log(`[Shim] 🗺️ Start map polling request: user ${userId} -> server ${serverId}`);

                // Start map polling
                await rustPlusManager.startMapPolling(serverId);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('[Shim] Error starting map polling:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        return;
    }

    // Stop Map Polling: POST /stop-map-polling  
    if (req.method === 'POST' && req.url === '/stop-map-polling') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { userId: rawUserId, serverId: rawServerId } = JSON.parse(body);

                // Validate inputs
                const userId = validateUserId(rawUserId);
                const serverId = validateServerId(rawServerId);

                if (!userId || !serverId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid or missing userId or serverId' }));
                    return;
                }

                // Security Check
                if (userId !== req.user.userId) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Forbidden' }));
                    return;
                }

                console.log(`[Shim] 🛑 Stop map polling request: user ${userId} -> server ${serverId}`);

                // Stop map polling
                await rustPlusManager.stopMapPolling(serverId);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('[Shim] Error stopping map polling:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        return;
    }

    // Heartbeat: POST /heartbeat
    if (req.method === 'POST' && req.url === '/heartbeat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { userId: rawUserId } = JSON.parse(body);

                // Validate input
                const userId = validateUserId(rawUserId);

                if (!userId) {
                    const corsHeaders = {};
                    if (allowedOrigins.includes(origin)) {
                        corsHeaders['Access-Control-Allow-Origin'] = origin;
                        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
                    }
                    res.writeHead(400, { 
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    });
                    res.end(JSON.stringify({ error: 'Invalid or missing userId' }));
                    return;
                }

                // Security Check
                if (userId !== req.user.userId) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Forbidden' }));
                    return;
                }

                // Rate limiting: 120 requests/minute per user (heartbeat is frequent)
                const rateLimit = await rateLimiter.checkLimit('heartbeat', userId, 120, 60000);
                res.setHeader('X-RateLimit-Limit', '120');
                res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
                res.setHeader('X-RateLimit-Reset', rateLimit.resetAt);

                if (!rateLimit.allowed) {
                    console.warn(`[RateLimiter] Rate limit exceeded for heartbeat:${userId}`);
                    const corsHeaders = {};
                    if (allowedOrigins.includes(origin)) {
                        corsHeaders['Access-Control-Allow-Origin'] = origin;
                        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
                    }
                    res.writeHead(429, {
                        'Content-Type': 'application/json',
                        'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
                        ...corsHeaders
                    });
                    res.end(JSON.stringify({
                        error: 'Too Many Requests',
                        message: `Rate limit exceeded. Try again after ${new Date(rateLimit.resetAt).toISOString()}`,
                        retryAfter: rateLimit.resetAt
                    }));
                    return;
                }

                // Only track activity if user has an active server
                const hasActiveServer = await stateManager.getActiveServer(userId);
                if (!hasActiveServer) {
                    // No active server, ignore heartbeat
                    const corsHeaders = {};
                    if (allowedOrigins.includes(origin)) {
                        corsHeaders['Access-Control-Allow-Origin'] = origin;
                        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
                    }
                    res.writeHead(200, { 
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    });
                    res.end(JSON.stringify({ success: true, ignored: true }));
                    return;
                }

                // Update activity timestamp
                await stateManager.setUserActivity(userId, Date.now());

                // Cancel any active countdown
                if (countdownTimers.has(userId)) {
                    clearInterval(countdownTimers.get(userId));
                    countdownTimers.delete(userId);
                    console.log(`[Activity] ✅ Countdown cancelled for user ${userId} - activity detected`);

                    // Notify frontend to stop countdown
                    const clientData = sseClients.get(userId);
                    if (clientData) {
                        sendSSE(clientData.res, 'countdown_cancelled', {}, userId);
                    }
                }

                const corsHeaders = {};
                if (allowedOrigins.includes(origin)) {
                    corsHeaders['Access-Control-Allow-Origin'] = origin;
                    corsHeaders['Access-Control-Allow-Credentials'] = 'true';
                }
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('[Heartbeat] Error:', error);
                const corsHeaders = {};
                if (allowedOrigins.includes(origin)) {
                    corsHeaders['Access-Control-Allow-Origin'] = origin;
                    corsHeaders['Access-Control-Allow-Credentials'] = 'true';
                }
                res.writeHead(500, {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                });
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

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
        try {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                components: {
                    redis: stateManager.getHealthStatus(),
                    rateLimiter: rateLimiter.getHealthStatus(),
                    sse: {
                        connectedClients: sseClients.size,
                        activeCountdowns: countdownTimers.size,
                        totalEventsSent
                    },
                    rustplus: {
                        activeConnections: rustPlusManager.getConnectionCount()
                    },
                    queue: {
                        healthy: queueManager.isHealthy(),
                        stats: await queueManager.getAllStats()
                    }
                },
                memory: {
                    rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
                    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                }
            };

            // Check if any critical component is unhealthy
            if (!health.components.redis.healthy && health.components.redis.redis) {
                health.status = 'degraded';
                health.issues = ['Redis connection unhealthy'];
            }

            const statusCode = health.status === 'healthy' ? 200 : 503;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(health, null, 2));
        } catch (error) {
            logger.error('Health', 'Error generating health check', { error: error.message });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'error',
                error: 'Failed to generate health check'
            }));
        }
        return;
    }

    // 404
    res.writeHead(404);
    res.end('Not Found');
});

// Setup RustPlusManager to forward events to SSE clients
rustPlusManager.setSSECallback(({ serverId, type, data }) => {
    // Send event only to clients subscribed to this server
    for (const [userId, clientData] of sseClients.entries()) {
        // Check if this user is subscribed to this server
        if (clientData.subscriptions.has(serverId)) {
            sendSSE(clientData.res, type, { serverId, ...data }, userId);
        }
    }
});

// Helper function to send SSE events with backpressure handling
function sendSSE(res, event, data, userId = null) {
    try {
        // Safety check: verify connection is still active
        if (userId) {
            const clientData = sseClients.get(userId);
            // If client gone or this res is stale (superseded by new connection), abort.
            if (!clientData || clientData.res !== res) {
                return;
            }
            clientData.lastWrite = Date.now();
        } else {
            // Fallback for calls without userId (legacy support)
            // Check if this res exists in any active client
            let isActive = false;
            for (const clientData of sseClients.values()) {
                if (clientData.res === res) {
                    clientData.lastWrite = Date.now();
                    isActive = true;
                    break;
                }
            }
            if (!isActive) return;
        }

        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        const canWrite = res.write(message);
        totalEventsSent++;

        if (!canWrite) {
            console.warn(`[SSE] Backpressure detected on event: ${event}`);
        }
    } catch (error) {
        console.error('[SSE] Error sending event:', error);
        // Mark this connection as potentially dead - watchdog will clean it up
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

// Inactivity Checker - MIGRATED TO PHASE 3
// NOTE: Inactivity detection is migrated to Redis-backed state in Phase 2
// This feature will be fully re-implemented in Phase 3 using BullMQ job queue
// for proper async handling of Redis operations and countdown intervals
// Activity tracking continues to work via the /heartbeat endpoint

server.listen(PORT, async () => {
    logger.info('Shim', `Cloud Shim running on port ${PORT}`);

    // Initialize Redis state manager
    try {
        await stateManager.initialize();
        const health = stateManager.getHealthStatus();
        logger.info('Shim', `State storage: ${health.mode} (${health.healthy ? 'healthy' : 'unhealthy'})`);
    } catch (error) {
        logger.error('Shim', 'Failed to initialize state manager', { error: error.message });
        logger.warn('Shim', 'Falling back to in-memory state storage');
    }

    // Initialize rate limiter
    rateLimiter.initialize();
    const rateLimitHealth = rateLimiter.getHealthStatus();
    logger.info('Shim', `Rate limiting: ${rateLimitHealth.mode}`);

    // Initialize queue manager and workers
    try {
        await queueManager.initialize();
        logger.info('Shim', 'Queue manager initialized');

        // Create worker for rustplus jobs
        queueManager.createWorker('rustplus', processJob, {
            concurrency: 10 // Process up to 10 jobs concurrently
        });

        // Create scheduler for delayed/repeated jobs
        queueManager.createScheduler('rustplus');

        // Schedule inactivity check job (every 5 minutes)
        await queueManager.scheduleRepeatingJob('rustplus', 'inactivity-check', {}, {
            pattern: '*/5 * * * *' // Cron: every 5 minutes
        });

        logger.info('Shim', 'Job workers and schedulers initialized');
    } catch (error) {
        logger.error('Shim', 'Failed to initialize queue manager', { error: error.message });
    }

    // Set queue manager reference in rustPlusManager for job scheduling
    rustPlusManager.setQueueManager(queueManager);

    // Cleanup orphaned jobs from previous runs
    await rustPlusManager.cleanupOrphanedJobs();

    // Clean up orphaned jobs on startup (jobs for servers that are no longer connected)
    try {
        console.log('[Startup] Cleaning up orphaned jobs...');
        await rustPlusManager.cleanupOrphanedJobs();
        console.log('[Startup] ✅ Orphaned jobs cleanup complete');
    } catch (error) {
        console.error('[Startup] Failed to cleanup orphaned jobs:', error);
    }

    // Log available endpoints
    logger.info('Shim', `SSE endpoint: http://localhost:${PORT}/events/:userId`);
    logger.info('Shim', `Command endpoint: http://localhost:${PORT}/command (rate limit: 60/min)`);
    logger.info('Shim', `Heartbeat endpoint: http://localhost:${PORT}/heartbeat (rate limit: 120/min)`);
    logger.info('Shim', `Connect endpoint: http://localhost:${PORT}/connect-server (rate limit: 10/min)`);
});
