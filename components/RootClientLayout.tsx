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
                
                // Active server restoration removed - users must manually select servers
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
