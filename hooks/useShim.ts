import { useEffect, useState } from 'react';
import { getShimSSE, sendShimCommand } from '@/lib/shim-sse';

export function useShim(userId: string | null) {
    const [isConnected, setIsConnected] = useState(false);
    const [lastNotification, setLastNotification] = useState<any>(null);
    const [fcmToken, setFcmToken] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) return;

        // Connect to SSE stream
        const shimSSE = getShimSSE(userId);

        // Update connection status
        setIsConnected(shimSSE.isConnected());

        // Set up event listeners via window events
        const handleFcmStatus = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[Shim] FCM Status:', event.detail);
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

        // Register listeners
        window.addEventListener('fcm_status', handleFcmStatus);
        window.addEventListener('notification', handleNotification);
        window.addEventListener('device_paired', handleDevicePaired);
        window.addEventListener('server_removed', handleServerRemoved);

        // Cleanup: remove listeners but DON'T disconnect SSE (it persists)
        return () => {
            window.removeEventListener('fcm_status', handleFcmStatus);
            window.removeEventListener('notification', handleNotification);
            window.removeEventListener('device_paired', handleDevicePaired);
            window.removeEventListener('server_removed', handleServerRemoved);
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

    return { isConnected, lastNotification, fcmToken, sendCommand };
}
