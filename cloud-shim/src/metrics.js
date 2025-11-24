const logger = require('./logger');

/**
 * Simple Metrics Collector
 * Tracks basic performance indicators for monitoring
 */
class MetricsCollector {
    constructor() {
        this.metrics = {
            requests: {
                total: 0,
                command: 0,
                heartbeat: 0,
                connect: 0,
                disconnect: 0
            },
            rateLimits: {
                triggered: 0
            },
            sse: {
                connections: 0,
                disconnections: 0,
                events: 0
            },
            rustplus: {
                connections: 0,
                disconnections: 0,
                failures: 0
            },
            jobs: {
                completed: 0,
                failed: 0
            }
        };

        this.startTime = Date.now();
    }

    /**
     * Increment a metric counter
     */
    increment(category, metric) {
        if (this.metrics[category] && this.metrics[category][metric] !== undefined) {
            this.metrics[category][metric]++;
        } else {
            logger.warn('Metrics', `Unknown metric: ${category}.${metric}`);
        }
    }

    /**
     * Get all metrics
     */
    getAll() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.startTime
        };
    }

    /**
     * Reset all metrics (useful for testing)
     */
    reset() {
        Object.keys(this.metrics).forEach(category => {
            Object.keys(this.metrics[category]).forEach(metric => {
                this.metrics[category][metric] = 0;
            });
        });
        this.startTime = Date.now();
        logger.info('Metrics', 'All metrics reset');
    }

    /**
     * Get summary stats
     */
    getSummary() {
        const uptime = Date.now() - this.startTime;
        const uptimeSeconds = uptime / 1000;

        return {
            uptime: uptime,
            uptimeFormatted: this.formatUptime(uptime),
            requestsPerSecond: (this.metrics.requests.total / uptimeSeconds).toFixed(2),
            totalRequests: this.metrics.requests.total,
            sseConnections: this.metrics.sse.connections,
            rustplusConnections: this.metrics.rustplus.connections,
            jobsCompleted: this.metrics.jobs.completed,
            jobsFailed: this.metrics.jobs.failed,
            rateLimitsTriggered: this.metrics.rateLimits.triggered
        };
    }

    /**
     * Format uptime duration
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

// Singleton instance
const metricsCollector = new MetricsCollector();

module.exports = metricsCollector;
