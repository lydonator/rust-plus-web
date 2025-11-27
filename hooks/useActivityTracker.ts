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
export function useActivityTracker({ userId, token, enabled = true }: UseActivityTrackerOptions) {
    const lastHeartbeatRef = useRef<number>(0);
    const HEARTBEAT_INTERVAL = 30000; // 30 seconds

    useEffect(() => {
        if (!userId || !enabled) {
            return;
        }

        const shimUrl = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';

        // Send heartbeat function
        const sendHeartbeat = async () => {
            const now = Date.now();

            // Throttle: only send if 30s has passed since last heartbeat
            if (now - lastHeartbeatRef.current < HEARTBEAT_INTERVAL) {
                return;
            }

            try {
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                await fetch(`${shimUrl}/heartbeat`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ userId })
                });
                lastHeartbeatRef.current = now;
            } catch (error) {
                // Silently fail on network errors to avoid console spam
                // Common when waking from sleep or if shim is down (503)
                // console.debug('[Activity] Failed to send heartbeat:', error);
            }
        };

        // Activity handlers - send heartbeat on user activity
        const handleActivity = () => {
            sendHeartbeat();
        };

        // Listen to various user activity events
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('click', handleActivity);
        window.addEventListener('touchstart', handleActivity);
        window.addEventListener('scroll', handleActivity);

        // Send initial heartbeat
        sendHeartbeat();

        // Cleanup
        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
            window.removeEventListener('scroll', handleActivity);
        };
    }, [userId, token, enabled]);
}
