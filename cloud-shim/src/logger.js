/**
 * Structured Logger
 * Provides consistent logging with levels, timestamps, and contextual information
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const LOG_LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

class Logger {
    constructor() {
        // Default to INFO level (can be overridden by environment variable)
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        this.level = LOG_LEVELS[envLevel] !== undefined ? LOG_LEVELS[envLevel] : LOG_LEVELS.INFO;

        console.log(`[Logger] Initialized with level: ${LOG_LEVEL_NAMES[this.level]}`);
    }

    /**
     * Format a log message with timestamp and metadata
     */
    format(level, component, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        const levelName = LOG_LEVEL_NAMES[level];

        // Build base message
        let logMessage = `[${timestamp}] [${levelName}] [${component}] ${message}`;

        // Add metadata if provided
        if (Object.keys(metadata).length > 0) {
            logMessage += ` | ${JSON.stringify(metadata)}`;
        }

        return logMessage;
    }

    /**
     * Log a debug message
     */
    debug(component, message, metadata = {}) {
        if (this.level <= LOG_LEVELS.DEBUG) {
            console.log(this.format(LOG_LEVELS.DEBUG, component, message, metadata));
        }
    }

    /**
     * Log an info message
     */
    info(component, message, metadata = {}) {
        if (this.level <= LOG_LEVELS.INFO) {
            console.log(this.format(LOG_LEVELS.INFO, component, message, metadata));
        }
    }

    /**
     * Log a warning message
     */
    warn(component, message, metadata = {}) {
        if (this.level <= LOG_LEVELS.WARN) {
            console.warn(this.format(LOG_LEVELS.WARN, component, message, metadata));
        }
    }

    /**
     * Log an error message
     */
    error(component, message, metadata = {}) {
        if (this.level <= LOG_LEVELS.ERROR) {
            console.error(this.format(LOG_LEVELS.ERROR, component, message, metadata));
        }
    }

    /**
     * Create a child logger with a specific component prefix
     */
    child(component) {
        return {
            debug: (message, metadata) => this.debug(component, message, metadata),
            info: (message, metadata) => this.info(component, message, metadata),
            warn: (message, metadata) => this.warn(component, message, metadata),
            error: (message, metadata) => this.error(component, message, metadata)
        };
    }

    /**
     * Set log level dynamically
     */
    setLevel(level) {
        if (typeof level === 'string') {
            const levelUpper = level.toUpperCase();
            if (LOG_LEVELS[levelUpper] !== undefined) {
                this.level = LOG_LEVELS[levelUpper];
                console.log(`[Logger] Level changed to: ${levelUpper}`);
            } else {
                console.error(`[Logger] Invalid log level: ${level}`);
            }
        } else if (typeof level === 'number' && level >= 0 && level <= 3) {
            this.level = level;
            console.log(`[Logger] Level changed to: ${LOG_LEVEL_NAMES[level]}`);
        }
    }

    /**
     * Get current log level
     */
    getLevel() {
        return {
            numeric: this.level,
            name: LOG_LEVEL_NAMES[this.level]
        };
    }
}

// Singleton instance
const logger = new Logger();

module.exports = logger;
