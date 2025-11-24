const Redis = require('ioredis');
const { REDIS_URL } = require('./config');

/**
 * Redis Client Manager
 * Provides connection pooling and automatic reconnection
 */
class RedisClientManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    /**
     * Initialize Redis connection
     */
    async connect() {
        if (this.client) {
            console.log('[Redis] Already connected');
            return this.client;
        }

        console.log('[Redis] Connecting to:', REDIS_URL);

        this.client = new Redis(REDIS_URL, {
            maxRetriesPerRequest: null, // null for BullMQ compatibility
            enableReadyCheck: false, // Disable - causes issues with Docker
            lazyConnect: false,
            retryStrategy(times) {
                if (times > 10) {
                    console.error('[Redis] Max retries reached, giving up');
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 100, 3000);
                console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
                return delay;
            }
        });

        // Event listeners
        this.client.on('connect', () => {
            console.log('[Redis] ✅ Connected successfully');
            this.isConnected = true;
        });

        this.client.on('ready', () => {
            console.log('[Redis] Ready to accept commands');
        });

        this.client.on('error', (err) => {
            console.error('[Redis] ❌ Error:', err.message);
            this.isConnected = false;
        });

        this.client.on('close', () => {
            console.log('[Redis] Connection closed');
            this.isConnected = false;
        });

        this.client.on('reconnecting', () => {
            console.log('[Redis] 🔄 Reconnecting...');
        });

        // ioredis connects automatically, don't wait for ready event
        // This avoids race conditions with Docker Redis
        return this.client;
    }

    /**
     * Get the Redis client instance
     */
    getClient() {
        if (!this.client) {
            throw new Error('[Redis] Client not initialized. Call connect() first.');
        }
        return this.client;
    }

    /**
     * Check if Redis is connected
     */
    isHealthy() {
        return this.isConnected && this.client && this.client.status === 'ready';
    }

    /**
     * Gracefully disconnect
     */
    async disconnect() {
        if (this.client) {
            console.log('[Redis] Disconnecting...');
            await this.client.quit();
            this.client = null;
            this.isConnected = false;
        }
    }

    /**
     * Helper: Set with expiration
     */
    async setex(key, seconds, value) {
        return this.client.setex(key, seconds, typeof value === 'object' ? JSON.stringify(value) : value);
    }

    /**
     * Helper: Get and parse JSON
     */
    async getJSON(key) {
        const value = await this.client.get(key);
        if (!value) return null;
        try {
            return JSON.parse(value);
        } catch (e) {
            return value;
        }
    }

    /**
     * Helper: Set JSON
     */
    async setJSON(key, value, expirySeconds = null) {
        const serialized = JSON.stringify(value);
        if (expirySeconds) {
            return this.client.setex(key, expirySeconds, serialized);
        }
        return this.client.set(key, serialized);
    }

    /**
     * Helper: Delete keys by pattern
     */
    async deletePattern(pattern) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
            return this.client.del(...keys);
        }
        return 0;
    }
}

// Singleton instance
const redisManager = new RedisClientManager();

module.exports = redisManager;
