import { useEffect, useState } from 'react';
import { getShimSSE, sendShimCommand } from '@/lib/shim-sse';

export function useShim(userId: string | null) {
    const [isConnected, setIsConnected] = useState(false);
    const [lastNotification, setLastNotification] = useState<any>(null);
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
    const [disconnectReason, setDisconnectReason] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) {
            setIsConnected(false);
            return;
        }

        // Connect to SSE stream
        const shimSSE = getShimSSE(userId);

        // Update connection status initially
        setIsConnected(shimSSE.isConnected());

        // Poll connection status every second
        const statusInterval = setInterval(() => {
            const connected = shimSSE.isConnected();
            setIsConnected(connected);
        }, 1000);

        // Set up event listeners via window events
        const handleFcmStatus = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[Shim] FCM Status:', event.detail);
            console.log('[Shim] 🟢 Setting isConnected to TRUE via FCM status');
            setIsConnected(true);
            if (event.detail.fcmToken) setFcmToken(event.detail.fcmToken);
        };

        const handleNotification = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[Shim] Received Notification:', event.detail);
            setLastNotification(event.detail);

            // Optional: Show browser notification if supported
            if (Notification.permission === 'granted') {
                new Notification(event.detail.data?.title || 'Rust+', {
                    body: event.detail.data?.message || 'New notification'
                });
            }
        };

        const handleDevicePaired = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[Shim] Device Paired:', event.detail);
            // Dispatch to components that need to refresh
            window.dispatchEvent(new CustomEvent('device_list_changed', { detail: event.detail }));
        };

        const handleServerRemoved = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[Shim] Server Removed:', event.detail);
            // Dispatch to components that need to refresh
            window.dispatchEvent(new CustomEvent('server_list_changed', { detail: event.detail }));
        };

        const handleConnectionFailed = () => {
            console.error('[Shim] Connection failed permanently');
            setIsConnected(false);
        };

        const handleInactivityCountdown = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[Shim] Inactivity countdown:', event.detail.secondsRemaining);
            setCountdownSeconds(event.detail.secondsRemaining);
        };

        const handleCountdownCancelled = () => {
            console.log('[Shim] Countdown cancelled');
            setCountdownSeconds(null);
        };

        const handleDisconnectedByInactivity = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[Shim] Disconnected by inactivity:', event.detail);
            setCountdownSeconds(null);
            setDisconnectReason(event.detail.reason || 'Disconnected due to inactivity');
        };

        // Register listeners
        window.addEventListener('fcm_status', handleFcmStatus);
        window.addEventListener('notification', handleNotification);
        window.addEventListener('device_paired', handleDevicePaired);
        window.addEventListener('server_removed', handleServerRemoved);
        window.addEventListener('shim_connection_failed', handleConnectionFailed);
        window.addEventListener('inactivity_countdown', handleInactivityCountdown);
        window.addEventListener('countdown_cancelled', handleCountdownCancelled);
        window.addEventListener('disconnected_by_inactivity', handleDisconnectedByInactivity);

        // Cleanup: remove listeners and stop polling
        return () => {
            clearInterval(statusInterval);
            window.removeEventListener('fcm_status', handleFcmStatus);
            window.removeEventListener('notification', handleNotification);
            window.removeEventListener('device_paired', handleDevicePaired);
            window.removeEventListener('server_removed', handleServerRemoved);
            window.removeEventListener('shim_connection_failed', handleConnectionFailed);
            window.removeEventListener('inactivity_countdown', handleInactivityCountdown);
            window.removeEventListener('countdown_cancelled', handleCountdownCancelled);
            window.removeEventListener('disconnected_by_inactivity', handleDisconnectedByInactivity);
        };
    }, [userId]);

    const sendCommand = async (serverId: string, command: string, payload: any) => {
        if (!userId) {
            throw new Error('No user ID');
        }

        try {
            const result = await sendShimCommand(userId, serverId, command, payload);
            console.log('[Shim] Command result:', result);
            return result;
        } catch (error) {
            console.error('[Shim] Command error:', error);
            throw error;
        }
    };

    const clearDisconnectReason = () => {
        setDisconnectReason(null);
    };

    return {
        isConnected,
        lastNotification,
        fcmToken,
        sendCommand,
        countdownSeconds,
        disconnectReason,
        clearDisconnectReason
    };
}
