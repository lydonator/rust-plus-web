const logger = require('./logger');
const rustPlusManager = require('./rustplus-manager');
const stateManager = require('./state-manager');
const supabase = require('./supabase');
const marketProcessor = require('./market-processor');
const historicalAggregator = require('./historical-aggregator');
const priceAlertMonitor = require('./price-alert-monitor');

/**
 * Job Processors for BullMQ
 * Handles all background job processing for RustPlus operations
 */

/**
 * Process server info fetch job
 * Fetches server information (players, map size, etc.) every 30 seconds
 */
async function processServerInfoJob(job) {
    const { serverId } = job.data;

    try {
        logger.debug('JobProcessor', `Fetching server info for ${serverId}`);

        // Get RustPlus instance
        const rustPlus = rustPlusManager.activeConnections.get(serverId);
        if (!rustPlus) {
            logger.warn('JobProcessor', `No active connection for server ${serverId}`);
            return { success: false, reason: 'no_connection' };
        }

        // Delegate to RustPlusManager
        await rustPlusManager.fetchAndEmitServerInfo(serverId, rustPlus);

        return { success: true, serverId };
    } catch (error) {
        logger.error('JobProcessor', `Failed to fetch server info for ${serverId}`, {
            error: error.message
        });
        throw error; // Let BullMQ handle retries
    }
}

/**
 * Process map data fetch job
 * Fetches map markers (vending machines, events) every 30 seconds
 */
async function processMapDataJob(job) {
    const { serverId } = job.data;

    try {
        logger.debug('JobProcessor', `Fetching map data for ${serverId}`);

        // Get RustPlus instance
        const rustPlus = rustPlusManager.activeConnections.get(serverId);
        if (!rustPlus) {
            logger.warn('JobProcessor', `No active connection for server ${serverId}`);
            return { success: false, reason: 'no_connection' };
        }

        // Delegate to RustPlusManager
        await rustPlusManager.fetchAndEmitMapData(serverId, rustPlus);

        return { success: true, serverId };
    } catch (error) {
        logger.error('JobProcessor', `Failed to fetch map data for ${serverId}`, {
            error: error.message
        });
        throw error;
    }
}

/**
 * Process dynamic markers fetch job
 * Fetches moving markers (players, events) every 2 seconds
 */
async function processDynamicMarkersJob(job) {
    const { serverId } = job.data;

    try {
        logger.debug('JobProcessor', `Fetching dynamic markers for ${serverId}`);

        const rustPlus = rustPlusManager.activeConnections.get(serverId);
        if (!rustPlus) {
            logger.warn('JobProcessor', `No active connection for server ${serverId}`);
            return { success: false, reason: 'no_connection' };
        }

        await rustPlusManager.fetchAndEmitDynamicMarkers(serverId, rustPlus);
        return { success: true, serverId };
    } catch (error) {
        logger.error('JobProcessor', `Failed to fetch dynamic markers for ${serverId}`, {
            error: error.message
        });
        throw error;
    }
}

/**
 * Process player markers fetch job
 * Fetches player positions every 10 seconds (slower than events)
 */
async function processPlayerMarkersJob(job) {
    const { serverId } = job.data;

    try {
        logger.debug('JobProcessor', `Fetching player markers for ${serverId}`);

        const rustPlus = rustPlusManager.activeConnections.get(serverId);
        if (!rustPlus) {
            logger.warn('JobProcessor', `No active connection for server ${serverId}`);
            return { success: false, reason: 'no_connection' };
        }

        await rustPlusManager.fetchAndEmitPlayerMarkers(serverId, rustPlus);
        return { success: true, serverId };
    } catch (error) {
        logger.error('JobProcessor', `Failed to fetch player markers for ${serverId}`, {
            error: error.message
        });
        throw error;
    }
}

/**
 * Process event markers fetch job  
 * Fetches fast-moving events (cargo ship, helicopters) every 2 seconds
 */
async function processEventMarkersJob(job) {
    const { serverId } = job.data;

    try {
        logger.debug('JobProcessor', `Fetching event markers for ${serverId}`);

        const rustPlus = rustPlusManager.activeConnections.get(serverId);
        if (!rustPlus) {
            logger.warn('JobProcessor', `No active connection for server ${serverId}`);
            return { success: false, reason: 'no_connection' };
        }

        await rustPlusManager.fetchAndEmitEventMarkers(serverId, rustPlus);
        return { success: true, serverId };
    } catch (error) {
        logger.error('JobProcessor', `Failed to fetch event markers for ${serverId}`, {
            error: error.message
        });
        throw error;
    }
}

/**
 * Process static markers fetch job
 * Fetches stationary markers (vending machines, explosions) every 30 seconds
 */
async function processStaticMarkersJob(job) {
    const { serverId } = job.data;

    try {
        logger.debug('JobProcessor', `Fetching static markers for ${serverId}`);

        const rustPlus = rustPlusManager.activeConnections.get(serverId);
        if (!rustPlus) {
            logger.warn('JobProcessor', `No active connection for server ${serverId}`);
            return { success: false, reason: 'no_connection' };
        }

        await rustPlusManager.fetchAndEmitStaticMarkers(serverId, rustPlus);
        return { success: true, serverId };
    } catch (error) {
        logger.error('JobProcessor', `Failed to fetch static markers for ${serverId}`, {
            error: error.message
        });
        throw error;
    }
}

/**
 * Process team info fetch job
 * Fetches team member information every 10 seconds
 */
async function processTeamInfoJob(job) {
    const { serverId } = job.data;

    try {
        logger.debug('JobProcessor', `Fetching team info for ${serverId}`);

        // Get RustPlus instance
        const rustPlus = rustPlusManager.activeConnections.get(serverId);
        if (!rustPlus) {
            logger.warn('JobProcessor', `No active connection for server ${serverId}`);
            return { success: false, reason: 'no_connection' };
        }

        // Delegate to RustPlusManager
        await rustPlusManager.fetchAndEmitTeamInfo(serverId, rustPlus);

        return { success: true, serverId };
    } catch (error) {
        logger.error('JobProcessor', `Failed to fetch team info for ${serverId}`, {
            error: error.message
        });
        throw error;
    }
}

/**
 * Process market aggregation job
 * Aggregates buffered market observations into historical database tables
 * Runs every 6 hours
 */
async function processMarketAggregationJob(job) {
    try {
        logger.info('JobProcessor', 'Running market aggregation');

        // Run aggregation with market processor instance
        await historicalAggregator.runAggregation(marketProcessor);

        const stats = historicalAggregator.getStats();
        logger.info('JobProcessor', 'Market aggregation complete', {
            lastRunTime: stats.lastRunTime,
            lastRunAgo: stats.lastRunAgo ? `${(stats.lastRunAgo / 1000 / 60).toFixed(1)}m ago` : 'never'
        });

        return {
            success: true,
            stats
        };
    } catch (error) {
        logger.error('JobProcessor', 'Market aggregation failed', { error: error.message });
        throw error;
    }
}

/**
 * Process price alert check job
 * Checks active price alerts and sends notifications when prices hit targets
 * Runs every 5 minutes
 */
async function processPriceAlertJob(job) {
    try {
        logger.info('JobProcessor', 'Running price alert check');

        // Run price alert check with market processor instance
        await priceAlertMonitor.checkPriceAlerts(marketProcessor);

        // Cleanup old cooldowns to prevent memory leaks
        priceAlertMonitor.cleanupCooldowns();

        const stats = priceAlertMonitor.getStats();
        logger.info('JobProcessor', 'Price alert check complete', {
            lastRunTime: stats.lastRunTime,
            activeCooldowns: stats.activeCooldowns
        });

        return {
            success: true,
            stats
        };
    } catch (error) {
        logger.error('JobProcessor', 'Price alert check failed', { error: error.message });
        throw error;
    }
}

/**
 * Process inactivity check job
 * Checks all users for inactivity and disconnects inactive servers
 * Runs every 5 minutes
 */
async function processInactivityCheckJob(job) {
    try {
        logger.info('JobProcessor', 'Running inactivity check');

        const INACTIVITY_THRESHOLD = 30 * 60 * 1000; // 30 minutes
        const now = Date.now();
        let inactiveUsers = [];

        // Get all servers from database
        const { data: servers, error } = await supabase
            .from('servers')
            .select('id, user_id');

        if (error) {
            logger.error('JobProcessor', 'Failed to fetch servers for inactivity check', {
                error: error.message
            });
            return { success: false, error: error.message };
        }

        // Check each user's last activity
        const userActivityMap = new Map();
        for (const server of servers) {
            if (!userActivityMap.has(server.user_id)) {
                const lastActivity = await stateManager.getUserActivity(server.user_id);
                userActivityMap.set(server.user_id, lastActivity);
            }
        }

        // Find inactive users
        for (const [userId, lastActivity] of userActivityMap.entries()) {
            if (lastActivity && (now - lastActivity) > INACTIVITY_THRESHOLD) {
                inactiveUsers.push(userId);
            }
        }

        // Disconnect servers for inactive users
        for (const userId of inactiveUsers) {
            logger.info('JobProcessor', `User ${userId} inactive, disconnecting servers`);

            // Get all servers for this user
            const userServers = servers.filter(s => s.user_id === userId);

            for (const server of userServers) {
                rustPlusManager.disconnectServer(server.id);
            }

            // Clear activity tracking
            await stateManager.deleteUserActivity(userId);
            await stateManager.deleteActiveServer(userId);
        }

        logger.info('JobProcessor', `Inactivity check complete`, {
            totalUsers: userActivityMap.size,
            inactiveUsers: inactiveUsers.length
        });

        return {
            success: true,
            totalUsers: userActivityMap.size,
            inactiveUsers: inactiveUsers.length
        };
    } catch (error) {
        logger.error('JobProcessor', 'Inactivity check failed', { error: error.message });
        throw error;
    }
}

/**
 * Main job processor router
 * Routes jobs to appropriate processors based on job name
 */
async function processJob(job) {
    logger.debug('JobProcessor', `Processing job: ${job.name}`, {
        jobId: job.id,
        attempt: job.attemptsMade + 1
    });

    // Handle job names with patterns (e.g., server-info-<serverId>)
    if (job.name.startsWith('server-info-')) {
        return await processServerInfoJob(job);
    }

    if (job.name.startsWith('dynamic-markers-')) {
        return await processDynamicMarkersJob(job);
    }

    if (job.name.startsWith('player-markers-')) {
        return await processPlayerMarkersJob(job);
    }

    if (job.name.startsWith('event-markers-')) {
        return await processEventMarkersJob(job);
    }

    if (job.name.startsWith('static-markers-')) {
        return await processStaticMarkersJob(job);
    }

    if (job.name.startsWith('team-info-')) {
        return await processTeamInfoJob(job);
    }

    switch (job.name) {
        case 'server-info':
            return await processServerInfoJob(job);

        case 'dynamic-markers':
            return await processDynamicMarkersJob(job);

        case 'static-markers':
            return await processStaticMarkersJob(job);

        case 'team-info':
            return await processTeamInfoJob(job);

        case 'inactivity-check':
            return await processInactivityCheckJob(job);

        case 'market-aggregation':
            return await processMarketAggregationJob(job);

        case 'price-alert-check':
            return await processPriceAlertJob(job);

        default:
            logger.warn('JobProcessor', `Unknown job type: ${job.name}`);
            return { success: false, error: 'Unknown job type' };
    }
}

module.exports = {
    processJob,
    processServerInfoJob,
    processMapDataJob,
    processTeamInfoJob,
    processInactivityCheckJob,
    processMarketAggregationJob,
    processPriceAlertJob
};
