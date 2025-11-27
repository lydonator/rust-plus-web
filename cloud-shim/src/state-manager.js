const redisManager = require('./redis-client');

/**
 * State Manager - Abstracts state storage (Redis with in-memory fallback)
 *
 * Key Patterns:
 * - `activity:{userId}` - Last activity timestamp
 * - `active_server:{userId}` - Currently active serverId
 * - `countdown:{userId}` - Countdown timer state (boolean)
 */
class StateManager {
    constructor() {
        this.redis = null;
        this.useRedis = false;

        // In-memory fallback Maps (for development/offline mode)
        this.fallbackActivity = new Map();
        this.fallbackActiveServer = new Map();
        this.fallbackCountdown = new Map();
    }

    /**
     * Initialize with Redis connection
     */
    async initialize() {
        try {
            this.redis = await redisManager.connect();
            this.useRedis = true;
            console.log('[StateManager] ✅ Using Redis for state storage');
        } catch (error) {
            console.error('[StateManager] ⚠️ Redis connection failed, using in-memory fallback:', error.message);
            this.useRedis = false;
        }
    }

    // ========================================
    // User Activity Tracking
    // ========================================

    /**
     * Set user activity timestamp
     * @param {string} userId
     * @param {number} timestamp - Unix timestamp in milliseconds
     */
    async setUserActivity(userId, timestamp = Date.now()) {
        if (this.useRedis) {
            // Store with 7-day expiry (auto-cleanup inactive users)
            await this.redis.setex(`activity:${userId}`, 7 * 24 * 60 * 60, timestamp.toString());
        } else {
            this.fallbackActivity.set(userId, timestamp);
        }
    }

    /**
     * Get user activity timestamp
     * @param {string} userId
     * @returns {Promise<number|null>}
     */
    async getUserActivity(userId) {
        if (this.useRedis) {
            const value = await this.redis.get(`activity:${userId}`);
            return value ? parseInt(value, 10) : null;
        } else {
            return this.fallbackActivity.get(userId) || null;
        }
    }

    /**
     * Delete user activity
     */
    async deleteUserActivity(userId) {
        if (this.useRedis) {
            await this.redis.del(`activity:${userId}`);
        } else {
            this.fallbackActivity.delete(userId);
        }
    }

    // ========================================
    // Active Server Tracking
    // ========================================

    /**
     * Set active server for user
     * @param {string} userId
     * @param {string} serverId
     */
    async setActiveServer(userId, serverId) {
        if (this.useRedis) {
            // Store with no expiry (cleared on disconnect)
            await this.redis.set(`active_server:${userId}`, serverId);
        } else {
            this.fallbackActiveServer.set(userId, serverId);
        }
    }

    /**
     * Get active server for user
     * @param {string} userId
     * @returns {Promise<string|null>}
     */
    async getActiveServer(userId) {
        if (this.useRedis) {
            return await this.redis.get(`active_server:${userId}`);
        } else {
            return this.fallbackActiveServer.get(userId) || null;
        }
    }

    /**
     * Delete active server for user
     */
    async deleteActiveServer(userId) {
        if (this.useRedis) {
            await this.redis.del(`active_server:${userId}`);
        } else {
            this.fallbackActiveServer.delete(userId);
        }
    }

    /**
     * Find users with specific active server
     * @param {string} serverId
     * @returns {Promise<string[]>} Array of userIds
     */
    async getUsersWithActiveServer(serverId) {
        if (this.useRedis) {
            // Scan all active_server keys and filter by value
            const keys = await this.redis.keys('active_server:*');
            const userIds = [];

            for (const key of keys) {
                const value = await this.redis.get(key);
                if (value === serverId) {
                    // Extract userId from key (active_server:{userId})
                    userIds.push(key.split(':')[1]);
                }
            }

            return userIds;
        } else {
            const userIds = [];
            for (const [userId, activeServerId] of this.fallbackActiveServer.entries()) {
                if (activeServerId === serverId) {
                    userIds.push(userId);
                }
            }
            return userIds;
        }
    }

    // ========================================
    // Countdown Timer State
    // ========================================

    /**
     * Set countdown state (boolean flag)
     * @param {string} userId
     * @param {boolean} active
     */
    async setCountdownState(userId, active) {
        if (this.useRedis) {
            if (active) {
                await this.redis.setex(`countdown:${userId}`, 3600, 'true'); // 1 hour expiry
            } else {
                await this.redis.del(`countdown:${userId}`);
            }
        } else {
            if (active) {
                this.fallbackCountdown.set(userId, true);
            } else {
                this.fallbackCountdown.delete(userId);
            }
        }
    }

    /**
     * Check if countdown is active for user
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async hasActiveCountdown(userId) {
        if (this.useRedis) {
            const value = await this.redis.get(`countdown:${userId}`);
            return value === 'true';
        } else {
            return this.fallbackCountdown.has(userId);
        }
    }

    // ========================================
    // Utility Methods
    // ========================================

    /**
     * Check if Redis is being used
     */
    isUsingRedis() {
        return this.useRedis;
    }

    /**
     * Get health status
     */
    getHealthStatus() {
        return {
            redis: this.useRedis,
            healthy: this.useRedis ? redisManager.isHealthy() : true,
            mode: this.useRedis ? 'redis' : 'in-memory'
        };
    }

    /**
     * Clear all state for a user
     */
    async clearUserState(userId) {
        await this.deleteUserActivity(userId);
        await this.deleteActiveServer(userId);
        await this.setCountdownState(userId, false);
    }
}

// Singleton instance
const stateManager = new StateManager();

module.exports = stateManager;
