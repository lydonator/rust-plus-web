const { Queue, Worker } = require('bullmq');
const redisManager = require('./redis-client');
const logger = require('./logger');

/**
 * Queue Manager - Centralized job queue management using BullMQ
 *
 * Job Types:
 * - server-info: Fetch server info every 30s
 * - map-data: Fetch map data every 30s
 * - team-info: Fetch team info every 10s
 * - inactivity-check: Check for inactive users every 5 minutes
 */
class QueueManager {
    constructor() {
        this.queues = new Map();
        this.workers = new Map();
        this.schedulers = new Map();
        this.connection = null;
        this.initialized = false;
    }

    /**
     * Initialize the queue manager with Redis connection
     */
    async initialize() {
        try {
            // Let BullMQ create its own connections with proper configuration
            // This avoids issues with connection sharing/duplication
            this.connection = {
                host: 'localhost',
                port: 6379,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
                maxRetriesPerRequest: null
            };

            logger.info('QueueManager', 'Initialized with Redis connection');
            this.initialized = true;
        } catch (error) {
            logger.error('QueueManager', 'Failed to initialize', { error: error.message });
            throw error;
        }
    }

    /**
     * Create or get a queue by name
     */
    getQueue(queueName) {
        if (!this.initialized) {
            throw new Error('QueueManager not initialized. Call initialize() first.');
        }

        if (!this.queues.has(queueName)) {
            const queue = new Queue(queueName, { connection: this.connection });
            this.queues.set(queueName, queue);
            logger.info('QueueManager', `Created queue: ${queueName}`);
        }

        return this.queues.get(queueName);
    }

    /**
     * Create a worker for a queue
     */
    createWorker(queueName, processor, options = {}) {
        if (!this.initialized) {
            throw new Error('QueueManager not initialized. Call initialize() first.');
        }

        if (this.workers.has(queueName)) {
            logger.warn('QueueManager', `Worker already exists for queue: ${queueName}`);
            return this.workers.get(queueName);
        }

        const worker = new Worker(queueName, processor, {
            connection: this.connection,
            ...options
        });

        // Error handling
        worker.on('failed', (job, err) => {
            logger.error('QueueManager', `Job failed in ${queueName}`, {
                jobId: job.id,
                jobName: job.name,
                error: err.message
            });
        });

        worker.on('error', (err) => {
            logger.error('QueueManager', `Worker error in ${queueName}`, { error: err.message });
        });

        this.workers.set(queueName, worker);
        logger.info('QueueManager', `Created worker for queue: ${queueName}`);

        return worker;
    }

    /**
     * Create a scheduler for a queue (handles delayed/repeated jobs)
     * NOTE: QueueScheduler is deprecated in BullMQ v3+ and no longer needed
     * Repeatable jobs are now handled automatically by workers
     */
    createScheduler(queueName) {
        // No-op for BullMQ v3+ compatibility
        logger.info('QueueManager', `Scheduler not needed for BullMQ v3+ (queue: ${queueName})`);
        return null;
    }

    /**
     * Schedule a repeating job
     */
    async scheduleRepeatingJob(queueName, jobName, data, repeatOptions) {
        const queue = this.getQueue(queueName);

        // Remove existing repeatable job with same name if exists
        const repeatableJobs = await queue.getRepeatableJobs();
        for (const job of repeatableJobs) {
            if (job.name === jobName) {
                await queue.removeRepeatableByKey(job.key);
                logger.debug('QueueManager', `Removed existing repeatable job: ${jobName}`);
            }
        }

        // Add new repeatable job
        await queue.add(jobName, data, { repeat: repeatOptions });
        logger.info('QueueManager', `Scheduled repeating job: ${jobName}`, { repeatOptions });
    }

    /**
     * Add a one-time job
     */
    async addJob(queueName, jobName, data, options = {}) {
        const queue = this.getQueue(queueName);
        await queue.add(jobName, data, options);
        logger.debug('QueueManager', `Added job: ${jobName} to queue: ${queueName}`);
    }

    /**
     * Remove a repeatable job by name
     */
    async removeRepeatingJob(queueName, jobName) {
        const queue = this.getQueue(queueName);
        const repeatableJobs = await queue.getRepeatableJobs();

        for (const job of repeatableJobs) {
            if (job.name === jobName) {
                await queue.removeRepeatableByKey(job.key);
                logger.info('QueueManager', `Removed repeatable job: ${jobName}`);
                return true;
            }
        }

        return false;
    }

    /**
     * Get queue stats
     */
    async getQueueStats(queueName) {
        const queue = this.getQueue(queueName);
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount()
        ]);

        return { waiting, active, completed, failed, delayed };
    }

    /**
     * Get all queues stats
     */
    async getAllStats() {
        const stats = {};
        for (const [queueName, queue] of this.queues.entries()) {
            stats[queueName] = await this.getQueueStats(queueName);
        }
        return stats;
    }

    /**
     * Gracefully close all queues, workers, and schedulers
     */
    async close() {
        logger.info('QueueManager', 'Closing all queues, workers, and schedulers');

        // Close all workers
        for (const [name, worker] of this.workers.entries()) {
            await worker.close();
            logger.info('QueueManager', `Closed worker: ${name}`);
        }

        // Close all schedulers
        for (const [name, scheduler] of this.schedulers.entries()) {
            await scheduler.close();
            logger.info('QueueManager', `Closed scheduler: ${name}`);
        }

        // Close all queues
        for (const [name, queue] of this.queues.entries()) {
            await queue.close();
            logger.info('QueueManager', `Closed queue: ${name}`);
        }

        this.queues.clear();
        this.workers.clear();
        this.schedulers.clear();
        this.initialized = false;
    }

    /**
     * Health check
     */
    isHealthy() {
        return this.initialized && redisManager.isHealthy();
    }
}

// Singleton instance
const queueManager = new QueueManager();

module.exports = queueManager;
