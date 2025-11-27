'use client';

import { useEffect, useState } from 'react';
import { ServerConnectionProvider, useServerConnection } from './ServerConnectionProvider';
import { ShimConnectionProvider } from './ShimConnectionProvider';
import ActivityManager from './ActivityManager';

function RootClientLayoutInner({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<{ userId: string } | null>(null);
    const { activeServerId, setActiveServerId } = useServerConnection();

    useEffect(() => {
        // Fetch user info
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(userData => {
                if (userData) {
                    setUser(userData);
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
            });
    }, [setActiveServerId]);

    return (
        <>
            <ActivityManager
                userId={user?.userId || null}
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
