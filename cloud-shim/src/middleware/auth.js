const jwt = require('jsonwebtoken');
const { SUPABASE_SERVICE_KEY } = require('../config');

/**
 * Authenticate request using JWT
 * @param {http.IncomingMessage} req
 * @returns {object|null} Decoded user object { userId, steamId } or null
 */
function authenticate(req) {
    let token = null;

    // 1. Check Authorization Header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    // 2. Check Query Param (for SSE)
    if (!token && req.url.includes('?')) {
        try {
            // req.url is just the path (e.g. /events/uuid?token=...), need to form full dummy URL to parse
            const url = new URL(req.url, 'http://localhost');
            token = url.searchParams.get('token');
        } catch (e) {
            // Fallback for simple parsing if URL object fails
            const match = req.url.match(/[?&]token=([^&]+)/);
            if (match) token = match[1];
        }
    }

    // 3. Check Cookie (for heartbeat and other requests)
    if (!token && req.headers.cookie) {
        const authCookie = req.headers.cookie
            .split('; ')
            .find(row => row.startsWith('auth-token='));
        if (authCookie) {
            token = authCookie.split('=')[1];
        }
    }

    if (!token) return null;

    try {
        const decoded = jwt.verify(token, SUPABASE_SERVICE_KEY);
        return decoded;
    } catch (err) {
        console.error('[Auth] Token verification failed:', err.message);
        return null;
    }
}

module.exports = { authenticate };
