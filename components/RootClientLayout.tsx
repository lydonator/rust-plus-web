'use client';

import { useEffect, useState } from 'react';
import { ServerConnectionProvider, useServerConnection } from './ServerConnectionProvider';
import { ShimConnectionProvider } from './ShimConnectionProvider';
import ActivityManager from './ActivityManager';

function RootClientLayoutInner({ children }: { children: React.ReactNode }) {
    const { activeServerId, setActiveServerId } = useServerConnection();
    
    // Get user data from ShimConnectionProvider instead of duplicate API call
    const [userId, setUserId] = useState<string | null>(null);
    
    useEffect(() => {
        // Listen for user authentication from ShimConnectionProvider
        const handleUserAuthenticated = ((e: CustomEvent) => {
            const userData = e.detail;
            if (userData?.userId && userId !== userData.userId) {
                setUserId(userData.userId);
                
                // Fetch active server state from shim with auth token
                const headers: Record<string, string> = {};
                if (userData.token) {
                    headers['Authorization'] = `Bearer ${userData.token}`;
                }
                
                fetch(`${process.env.NEXT_PUBLIC_SHIM_URL}/active-server/${userData.userId}`, {
                    headers
                })
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (data?.activeServerId) {
                            console.log('[RootClientLayout] Restoring active server:', data.activeServerId);
                            setActiveServerId(data.activeServerId);
                        }
                    })
                    .catch(err => console.error('Failed to fetch active server:', err));
            }
        }) as EventListener;
        
        window.addEventListener('user_authenticated', handleUserAuthenticated);
        
        return () => {
            window.removeEventListener('user_authenticated', handleUserAuthenticated);
        };
    }, [setActiveServerId, userId]);

    return (
        <>
            <ActivityManager
                userId={userId}
                activeServerId={activeServerId}
                onActiveServerChange={setActiveServerId}
            />
            {children}
        </>
    );
}

export default function RootClientLayout({ children }: { children: React.ReactNode }) {
    return (
        <ServerConnectionProvider>
            <ShimConnectionProvider>
                <RootClientLayoutInner>
                    {children}
                </RootClientLayoutInner>
            </ShimConnectionProvider>
        </ServerConnectionProvider>
    );
}
