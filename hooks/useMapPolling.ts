import { useEffect } from 'react';
import { useShimConnection } from '@/components/ShimConnectionProvider';

export function useMapPolling(serverId: string | null, userId: string | null) {
    const { token } = useShimConnection();

    useEffect(() => {
        if (!serverId || !userId || !token) return;

        const startMapPolling = async () => {
            try {
                const shimUrl = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';
                const response = await fetch(`${shimUrl}/start-map-polling`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ userId, serverId })
                });

                if (response.ok) {
                    console.log(`[MapPolling] ✅ Started polling for server ${serverId}`);
                } else {
                    console.error('[MapPolling] Failed to start polling:', response.statusText);
                }
            } catch (error) {
                console.error('[MapPolling] Error starting polling:', error);
            }
        };

        const stopMapPolling = async () => {
            try {
                const shimUrl = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';
                const response = await fetch(`${shimUrl}/stop-map-polling`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ userId, serverId })
                });

                if (response.ok) {
                    console.log(`[MapPolling] ✅ Stopped polling for server ${serverId}`);
                } else {
                    console.error('[MapPolling] Failed to stop polling:', response.statusText);
                }
            } catch (error) {
                console.error('[MapPolling] Error stopping polling:', error);
            }
        };

        // Start polling when component mounts
        startMapPolling();

        // Stop polling when component unmounts
        return () => {
            stopMapPolling();
        };
    }, [serverId, userId, token]);
}