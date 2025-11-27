/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of the operation for error messages
 * @returns {Promise} The wrapped promise that rejects on timeout
 */
function withTimeout(promise, timeoutMs, operationName = 'Operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        })
    ]);
}

module.exports = { withTimeout };
