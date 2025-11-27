'use client';

import { useEffect, useRef } from 'react';

interface UseActivityTrackerOptions {
    userId: string | null;
    token?: string | null;
    enabled?: boolean;
}

/**
 * Activity tracker hook - sends heartbeats to cloud-shim to prevent inactivity disconnect
 * Tracks mouse movement, keyboard input, and touch events
 */
// Global singleton to prevent multiple instances
let globalHeartbeatInProgress = false;
let globalUserId: string | null = null;
let globalToken: string | null = null;
let globalIntervalStarted = false;
let globalShimUrl: string | null = null;

// Global heartbeat failure tracking
let globalConsecutiveFailures = 0;
const MAX_HEARTBEAT_FAILURES = 3; // Trigger SSE reconnect after 3 consecutive failures

// Global heartbeat function with SSE health monitoring  
const globalSendHeartbeat = async () => {
    if (!globalUserId || !globalToken || !globalShimUrl) {
        console.log('[Activity] Skipping heartbeat - missing requirements');
        return;
    }

    if (globalHeartbeatInProgress) {
        console.log('[Activity] Heartbeat already in progress, skipping');
        return;
    }

    globalHeartbeatInProgress = true;
    console.log('[Activity] Sending scheduled heartbeat');
    
    try {
        const response = await fetch(`${globalShimUrl}/heartbeat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${globalToken}`
            },
            body: JSON.stringify({ userId: globalUserId })
        });
        
        if (!response.ok) {
            globalConsecutiveFailures++;
            console.error(`[Activity] Global heartbeat failed: ${response.status} (failures: ${globalConsecutiveFailures})`);
            
            // Trigger SSE reconnect after consecutive failures
            if (globalConsecutiveFailures >= MAX_HEARTBEAT_FAILURES) {
                console.warn('[Activity] Multiple heartbeat failures detected - triggering SSE reconnect');
                window.dispatchEvent(new CustomEvent('heartbeat_failure_reconnect'));
                globalConsecutiveFailures = 0; // Reset counter
            }
        } else {
            console.log('[Activity] Global heartbeat successful');
            globalConsecutiveFailures = 0; // Reset failure counter on success
        }
    } catch (error) {
        globalConsecutiveFailures++;
        console.error(`[Activity] Global heartbeat error:`, error, `(failures: ${globalConsecutiveFailures})`);
        
        // Trigger SSE reconnect on network errors too
        if (globalConsecutiveFailures >= MAX_HEARTBEAT_FAILURES) {
            console.warn('[Activity] Multiple heartbeat failures detected - triggering SSE reconnect');
            window.dispatchEvent(new CustomEvent('heartbeat_failure_reconnect'));
            globalConsecutiveFailures = 0;
        }
    } finally {
        globalHeartbeatInProgress = false;
    }
};

// No more activity handlers - using fixed intervals

export function useActivityTracker({ userId, token, enabled = true }: UseActivityTrackerOptions) {
    useEffect(() => {
        if (!userId || !enabled || !token) {
            if (!token && userId) {
                console.log('[Activity] Waiting for token for user:', userId);
            }
            return;
        }

        // Update global state
        globalUserId = userId;
        globalToken = token;
        globalShimUrl = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';
        
        console.log('[Activity] Global tracker active for user:', userId);

        // Start regular heartbeat interval only once
        if (!globalIntervalStarted) {
            console.log('[Activity] Starting 30-second heartbeat interval');
            
            // Send initial heartbeat
            globalSendHeartbeat();
            
            // Set up interval for regular heartbeats
            setInterval(globalSendHeartbeat, 30000);
            
            globalIntervalStarted = true;
        }

        // Cleanup function
        return () => {
            // Only clear global state if this was the active user
            if (globalUserId === userId) {
                console.log('[Activity] Cleaning up global tracker for user:', userId);
                globalUserId = null;
                globalToken = null;
                globalShimUrl = null;
                
                // Note: Global interval continues running (no clean way to stop setInterval in this pattern)
                // This is intentional - we want heartbeats to continue as long as any user is active
                globalIntervalStarted = false; // Reset for potential restart
                console.log('[Activity] Cleaned up global tracker state');
            }
        };
    }, [userId, token, enabled]);
}
