'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getShimSSE, sendShimCommand } from '@/lib/shim-sse';

interface ShimConnectionContextType {
    isConnected: boolean;
    lastNotification: any;
    fcmToken: string | null;
    sendCommand: (serverId: string, command: string, payload: any) => Promise<any>;
    countdownSeconds: number | null;
    disconnectReason: string | null;
    clearDisconnectReason: () => void;
    token: string | null;
}

const ShimConnectionContext = createContext<ShimConnectionContextType | undefined>(undefined);

export function ShimConnectionProvider({ children }: { children: ReactNode }) {
    const [userId, setUserId] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastNotification, setLastNotification] = useState<any>(null);
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
    const [disconnectReason, setDisconnectReason] = useState<string | null>(null);

    // Check auth and establish connection once
    useEffect(() => {
        const initializeConnection = async () => {
            try {
                const res = await fetch('/api/auth/me');
                if (res.ok) {
                    const userData = await res.json();
                    if (userData?.userId) {
                        console.log('[ShimConnectionProvider] User authenticated, connecting SSE:', userData.userId);
                        setUserId(userData.userId);
                        if (userData.token) {
                            setToken(userData.token);
                        }

                        // Create ONE global SSE connection
                        getShimSSE(userData.userId, userData.token);
                    }
                }
            } catch (error) {
                console.error('[ShimConnectionProvider] Failed to initialize connection:', error);
            }
        };

        initializeConnection();
    }, []);

    // Set up event listeners for SSE events
    useEffect(() => {
        if (!userId) return;

        const handleFcmStatus = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[ShimConnectionProvider] FCM Status:', event.detail);
            setIsConnected(true);
            if (event.detail.fcmToken) setFcmToken(event.detail.fcmToken);
        };

        const handleNotification = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[ShimConnectionProvider] Notification:', event.detail);
            setLastNotification(event.detail);

            // Optional: Show browser notification if supported
            if (Notification.permission === 'granted') {
                new Notification(event.detail.data?.title || 'Rust+', {
                    body: event.detail.data?.message || 'New notification'
                });
            }
        };

        const handleConnectionFailed = () => {
            console.error('[ShimConnectionProvider] Connection failed permanently');
            setIsConnected(false);
        };

        const handleConnectionStateChanged = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[ShimConnectionProvider] Connection state:', event.detail.state);
            setIsConnected(event.detail.state === 'connected');
        };

        const handleInactivityCountdown = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[ShimConnectionProvider] Inactivity countdown:', event.detail.secondsRemaining);
            setCountdownSeconds(event.detail.secondsRemaining);
        };

        const handleCountdownCancelled = () => {
            console.log('[ShimConnectionProvider] Countdown cancelled');
            setCountdownSeconds(null);
        };

        const handleDisconnectedByInactivity = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[ShimConnectionProvider] Disconnected by inactivity:', event.detail);
            setCountdownSeconds(null);
            setDisconnectReason(event.detail.reason || 'Disconnected due to inactivity');
        };

        // Register listeners
        window.addEventListener('fcm_status', handleFcmStatus);
        window.addEventListener('notification', handleNotification);
        window.addEventListener('shim_connection_failed', handleConnectionFailed);
        window.addEventListener('shim_connection_state_changed', handleConnectionStateChanged);
        window.addEventListener('inactivity_countdown', handleInactivityCountdown);
        window.addEventListener('countdown_cancelled', handleCountdownCancelled);
        window.addEventListener('disconnected_by_inactivity', handleDisconnectedByInactivity);

        // Cleanup
        return () => {
            window.removeEventListener('fcm_status', handleFcmStatus);
            window.removeEventListener('notification', handleNotification);
            window.removeEventListener('shim_connection_failed', handleConnectionFailed);
            window.removeEventListener('shim_connection_state_changed', handleConnectionStateChanged);
            window.removeEventListener('inactivity_countdown', handleInactivityCountdown);
            window.removeEventListener('countdown_cancelled', handleCountdownCancelled);
            window.removeEventListener('disconnected_by_inactivity', handleDisconnectedByInactivity);
        };
    }, [userId]);

    const sendCommand = useCallback(async (serverId: string, command: string, payload: any) => {
        if (!userId) {
            throw new Error('No user ID - not authenticated');
        }

        try {
            // Pass token if available
            const result = await sendShimCommand(userId, serverId, command, payload, token || undefined);
            console.log('[ShimConnectionProvider] Command result:', result);
            return result;
        } catch (error) {
            console.error('[ShimConnectionProvider] Command error:', error);
            throw error;
        }
    }, [userId, token]);

    const clearDisconnectReason = useCallback(() => {
        setDisconnectReason(null);
    }, []);

    const value = {
        isConnected,
        lastNotification,
        fcmToken,
        sendCommand,
        countdownSeconds,
        disconnectReason,
        clearDisconnectReason,
        token
    };

    return (
        <ShimConnectionContext.Provider value={value}>
            {children}
        </ShimConnectionContext.Provider>
    );
}

export function useShimConnection() {
    const context = useContext(ShimConnectionContext);
    if (context === undefined) {
        throw new Error('useShimConnection must be used within a ShimConnectionProvider');
    }
    return context;
}
