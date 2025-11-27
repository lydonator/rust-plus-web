'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useShimConnection } from '@/components/ShimConnectionProvider';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import InactivityCountdown from '@/components/InactivityCountdown';

interface ActivityManagerProps {
    userId: string | null;
    activeServerId: string | null;
    onActiveServerChange: (serverId: string | null) => void;
}

export default function ActivityManager({ userId, activeServerId, onActiveServerChange }: ActivityManagerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { countdownSeconds, disconnectReason, clearDisconnectReason, token } = useShimConnection();

    // Track activity only when there's an active server
    useActivityTracker({ userId, token, enabled: true });

    // Handle server auto-connection (from FCM pairing)
    useEffect(() => {
        const handleServerConnected = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[ActivityManager] Server auto-connected:', event.detail.serverId);
            onActiveServerChange(event.detail.serverId);
        };

        window.addEventListener('server_connected', handleServerConnected);

        return () => {
            window.removeEventListener('server_connected', handleServerConnected);
        };
    }, [onActiveServerChange]);

    // Handle disconnection by inactivity
    useEffect(() => {
        const handleDisconnectedByInactivity = (e: Event) => {
            const event = e as CustomEvent;
            console.log('[ActivityManager] Server disconnected by inactivity:', event.detail.serverId);

            // Clear active server
            onActiveServerChange(null);

            // If not on dashboard, redirect to dashboard
            if (!pathname.startsWith('/dashboard') || pathname.includes('/dashboard/')) {
                console.log('[ActivityManager] Redirecting to dashboard due to inactivity disconnect');
                router.push('/dashboard');
            }
        };

        window.addEventListener('disconnected_by_inactivity', handleDisconnectedByInactivity);

        return () => {
            window.removeEventListener('disconnected_by_inactivity', handleDisconnectedByInactivity);
        };
    }, [pathname, router, onActiveServerChange]);

    return (
        <>
            {/* Inactivity Countdown Modal - shows on ALL pages */}
            <InactivityCountdown
                isVisible={countdownSeconds !== null}
                secondsRemaining={countdownSeconds || 0}
            />
        </>
    );
}
