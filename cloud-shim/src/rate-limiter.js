const redisManager = require('./redis-client');

/**
 * Rate Limiter - Distributed rate limiting using Redis (sliding window)
 *
 * Key Pattern: `ratelimit:{endpoint}:{identifier}`
 * Value: Sorted set of timestamps (score = timestamp, member = timestamp)
 */
class RateLimiter {
    constructor() {
        this.useRedis = false;
        this.fallbackLimits = new Map(); // In-memory fallback
    }

    /**
     * Initialize rate limiter (checks Redis availability)
     */
    initialize() {
        this.useRedis = redisManager.isHealthy();
        if (this.useRedis) {
            console.log('[RateLimiter] ✅ Using Redis for distributed rate limiting');
        } else {
            console.log('[RateLimiter] ⚠️ Using in-memory rate limiting (single-instance only)');
        }
    }

    /**
     * Check if request should be rate limited
     * @param {string} endpoint - Endpoint identifier (e.g., 'command', 'connect')
     * @param {string} identifier - User/IP identifier
     * @param {number} maxRequests - Maximum requests allowed
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
     */
    async checkLimit(endpoint, identifier, maxRequests, windowMs) {
        const now = Date.now();
        const windowStart = now - windowMs;
        const key = `ratelimit:${endpoint}:${identifier}`;

        if (this.useRedis) {
            try {
                const redis = redisManager.getClient();

                // Remove old entries outside the window
                await redis.zremrangebyscore(key, 0, windowStart);

                // Count requests in current window
                const requestCount = await redis.zcard(key);

                if (requestCount >= maxRequests) {
                    // Get oldest timestamp to calculate reset time
                    const oldestTimestamps = await redis.zrange(key, 0, 0, 'WITHSCORES');
                    const oldestTimestamp = oldestTimestamps.length > 1 ? parseInt(oldestTimestamps[1], 10) : now;
                    const resetAt = oldestTimestamp + windowMs;

                    return {
                        allowed: false,
                        remaining: 0,
                        resetAt
                    };
                }

                // Add current request timestamp
                await redis.zadd(key, now, now.toString());

                // Set expiry (cleanup old keys)
                await redis.expire(key, Math.ceil(windowMs / 1000) + 10);

                return {
                    allowed: true,
                    remaining: maxRequests - requestCount - 1,
                    resetAt: now + windowMs
                };
            } catch (error) {
                console.error('[RateLimiter] Redis error, allowing request:', error.message);
                // Fail open - allow request if Redis fails
                return {
                    allowed: true,
                    remaining: maxRequests,
                    resetAt: now + windowMs
                };
            }
        } else {
            // In-memory fallback (sliding window)
            if (!this.fallbackLimits.has(key)) {
                this.fallbackLimits.set(key, []);
            }

            const timestamps = this.fallbackLimits.get(key);

            // Remove old timestamps
            const validTimestamps = timestamps.filter(ts => ts > windowStart);
            this.fallbackLimits.set(key, validTimestamps);

            if (validTimestamps.length >= maxRequests) {
                const oldestTimestamp = validTimestamps[0] || now;
                return {
                    allowed: false,
                    remaining: 0,
                    resetAt: oldestTimestamp + windowMs
                };
            }

            // Add current timestamp
            validTimestamps.push(now);
            this.fallbackLimits.set(key, validTimestamps);

            return {
                allowed: true,
                remaining: maxRequests - validTimestamps.length,
                resetAt: now + windowMs
            };
        }
    }

    /**
     * Middleware factory for rate limiting
     * @param {string} endpoint - Endpoint identifier
     * @param {number} maxRequests - Maximum requests allowed
     * @param {number} windowMs - Time window in milliseconds
     * @param {function} getIdentifier - Function to extract identifier from request
     * @returns {function} Express-style middleware
     */
    middleware(endpoint, maxRequests, windowMs, getIdentifier = (req) => req.params.userId || req.ip) {
        return async (req, res, next) => {
            const identifier = getIdentifier(req);

            if (!identifier) {
                console.warn('[RateLimiter] No identifier found for request, allowing');
                return next();
            }

            const result = await this.checkLimit(endpoint, identifier, maxRequests, windowMs);

            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', result.remaining);
            res.setHeader('X-RateLimit-Reset', result.resetAt);

            if (!result.allowed) {
                console.warn(`[RateLimiter] Rate limit exceeded for ${endpoint}:${identifier}`);
                res.writeHead(429, {
                    'Content-Type': 'application/json',
                    'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000)
                });
                res.end(JSON.stringify({
                    error: 'Too Many Requests',
                    message: `Rate limit exceeded. Try again after ${new Date(result.resetAt).toISOString()}`,
                    retryAfter: result.resetAt
                }));
                return;
            }

            next();
        };
    }

    /**
     * Get health status
     */
    getHealthStatus() {
        return {
            redis: this.useRedis,
            mode: this.useRedis ? 'redis' : 'in-memory'
        };
    }
}

// Singleton instance
const rateLimiter = new RateLimiter();

module.exports = rateLimiter;
