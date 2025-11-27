'use client';

import { createContext, useContext, useState, ReactNode, useMemo, useEffect } from 'react';

type ServerConnectionState = 'disconnected' | 'connecting' | 'connected';

interface ServerConnectionContextType {
    activeServerId: string | null;
    setActiveServerId: (serverId: string | null) => void;
    serverConnectionStates: Map<string, ServerConnectionState>;
    setServerConnectionState: (serverId: string, state: ServerConnectionState) => void;
    getServerConnectionState: (serverId: string) => ServerConnectionState;
    isServerConnected: (serverId: string) => boolean;
    isServerConnecting: (serverId: string) => boolean;
}

const ServerConnectionContext = createContext<ServerConnectionContextType | undefined>(undefined);

export function ServerConnectionProvider({ children }: { children: ReactNode }) {
    const [activeServerId, setActiveServerId] = useState<string | null>(null);
    const [serverConnectionStates, setServerConnectionStates] = useState<Map<string, ServerConnectionState>>(new Map());

    // Listen for server connection events
    useEffect(() => {
        const handleServerConnected = (event: CustomEvent) => {
            const { serverId } = event.detail;
            console.log(`[ServerConnection] Server ${serverId} connected`);
            setServerConnectionStates(prev => new Map(prev.set(serverId, 'connected')));
        };

        const handleServerDisconnected = (event: CustomEvent) => {
            const { serverId } = event.detail;
            console.log(`[ServerConnection] Server ${serverId} disconnected`);
            setServerConnectionStates(prev => new Map(prev.set(serverId, 'disconnected')));
            
            // Clear active server if it was disconnected
            if (activeServerId === serverId) {
                setActiveServerId(null);
            }
        };

        window.addEventListener('server_connected', handleServerConnected as EventListener);
        window.addEventListener('rustplus_event', ((event: CustomEvent) => {
            if (event.detail.type === 'connection_status') {
                if (event.detail.data.connected) {
                    // Server connected via RustPlus - create compatible event structure
                    console.log(`[ServerConnection] RustPlus connection established for server ${event.detail.serverId}`);
                    const serverConnectedEvent = {
                        detail: { serverId: event.detail.serverId }
                    } as CustomEvent;
                    handleServerConnected(serverConnectedEvent);
                } else {
                    // Server disconnected - create compatible event structure
                    console.log(`[ServerConnection] RustPlus connection lost for server ${event.detail.serverId}`);
                    const serverDisconnectedEvent = {
                        detail: { serverId: event.detail.serverId }
                    } as CustomEvent;
                    handleServerDisconnected(serverDisconnectedEvent);
                }
            }
        }) as EventListener);

        return () => {
            window.removeEventListener('server_connected', handleServerConnected as EventListener);
            window.removeEventListener('rustplus_event', handleServerDisconnected as EventListener);
        };
    }, [activeServerId]);

    const setServerConnectionState = (serverId: string, state: ServerConnectionState) => {
        setServerConnectionStates(prev => new Map(prev.set(serverId, state)));
    };

    const getServerConnectionState = (serverId: string): ServerConnectionState => {
        return serverConnectionStates.get(serverId) || 'disconnected';
    };

    const isServerConnected = (serverId: string): boolean => {
        return getServerConnectionState(serverId) === 'connected';
    };

    const isServerConnecting = (serverId: string): boolean => {
        return getServerConnectionState(serverId) === 'connecting';
    };

    const value = useMemo(
        () => ({ 
            activeServerId, 
            setActiveServerId, 
            serverConnectionStates,
            setServerConnectionState,
            getServerConnectionState,
            isServerConnected,
            isServerConnecting
        }),
        [activeServerId, serverConnectionStates]
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
