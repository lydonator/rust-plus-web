'use client';

import { createContext, useContext, useState, ReactNode, useMemo } from 'react';

interface ServerConnectionContextType {
    activeServerId: string | null;
    setActiveServerId: (serverId: string | null) => void;
}

const ServerConnectionContext = createContext<ServerConnectionContextType | undefined>(undefined);

export function ServerConnectionProvider({ children }: { children: ReactNode }) {
    const [activeServerId, setActiveServerId] = useState<string | null>(null);

    const value = useMemo(
        () => ({ activeServerId, setActiveServerId }),
        [activeServerId]
    );

    return (
        <ServerConnectionContext.Provider value={value}>
            {children}
        </ServerConnectionContext.Provider>
    );
}

export function useServerConnection() {
    const context = useContext(ServerConnectionContext);
    if (context === undefined) {
        throw new Error('useServerConnection must be used within a ServerConnectionProvider');
    }
    return context;
}
