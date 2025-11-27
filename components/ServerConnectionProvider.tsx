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
            
            setServerConnectionStates(prev => {
                // Only update if state is actually changing
                if (prev.get(serverId) === 'connected') {
                    return prev; // No change needed
                }
                console.log(`[ServerConnection] Setting server ${serverId} to connected state`);
                const newMap = new Map(prev.set(serverId, 'connected'));
                console.log(`[ServerConnection] Updated connection states:`, Object.fromEntries(newMap));
                return newMap;
            });
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

        const handleRustPlusEvent = (event: CustomEvent) => {
            // Only log non-message events to reduce noise
            if (event.detail.type !== 'message') {
                console.log('[ServerConnection] Received rustplus_event:', event.detail.type, event.detail);
            }
            
            if (event.detail.type === 'connection_status') {
                console.log('[ServerConnection] Processing connection_status for server:', event.detail.serverId, 'connected:', event.detail.data.connected);
                if (event.detail.data.connected) {
                    handleServerConnected({ detail: { serverId: event.detail.serverId } } as CustomEvent);
                } else {
                    handleServerDisconnected({ detail: { serverId: event.detail.serverId } } as CustomEvent);
                }
            }
        };

        const handleMarkersUpdate = (event: CustomEvent, markerType: string) => {
            if (event.detail?.serverId && activeServerId === event.detail.serverId) {
                // Only log once when transitioning to connected state
                setServerConnectionStates(prev => {
                    if (prev.get(event.detail.serverId) !== 'connected') {
                        console.log(`[ServerConnection] Server ${event.detail.serverId} is working (received ${markerType}), marking as connected`);
                    }
                    return prev.get(event.detail.serverId) === 'connected' 
                        ? prev 
                        : new Map(prev.set(event.detail.serverId, 'connected'));
                });
            }
        };

        // Create specific handlers for different marker types
        const handleDynamicMarkersUpdate = (event: CustomEvent) => handleMarkersUpdate(event, 'dynamic_markers_update');
        const handlePlayerMarkersUpdate = (event: CustomEvent) => handleMarkersUpdate(event, 'player_markers_update');
        const handleEventMarkersUpdate = (event: CustomEvent) => handleMarkersUpdate(event, 'event_markers_update');

        const handleTeamInfoUpdate = (event: CustomEvent) => {
            if (event.detail?.serverId && activeServerId === event.detail.serverId) {
                // Only log once when transitioning to connected state
                setServerConnectionStates(prev => {
                    if (prev.get(event.detail.serverId) !== 'connected') {
                        console.log(`[ServerConnection] Server ${event.detail.serverId} is working (received team_info_update), marking as connected`);
                    }
                    return prev.get(event.detail.serverId) === 'connected' 
                        ? prev 
                        : new Map(prev.set(event.detail.serverId, 'connected'));
                });
            }
        };

        const handleShimReconnected = () => {
            console.log('[ServerConnection] Shim reconnected - clearing all active servers');
            setActiveServerId(null);
            setServerConnectionStates(new Map());
        };

        // Add event listeners
        window.addEventListener('server_connected', handleServerConnected as EventListener);
        window.addEventListener('rustplus_event', handleRustPlusEvent as EventListener);
        window.addEventListener('dynamic_markers_update', handleDynamicMarkersUpdate as EventListener);
        window.addEventListener('player_markers_update', handlePlayerMarkersUpdate as EventListener);
        window.addEventListener('event_markers_update', handleEventMarkersUpdate as EventListener);
        window.addEventListener('team_info_update', handleTeamInfoUpdate as EventListener);
        window.addEventListener('shim_reconnected_clear_servers', handleShimReconnected as EventListener);

        return () => {
            window.removeEventListener('server_connected', handleServerConnected as EventListener);
            window.removeEventListener('rustplus_event', handleRustPlusEvent as EventListener);
            window.removeEventListener('dynamic_markers_update', handleDynamicMarkersUpdate as EventListener);
            window.removeEventListener('player_markers_update', handlePlayerMarkersUpdate as EventListener);
            window.removeEventListener('event_markers_update', handleEventMarkersUpdate as EventListener);
            window.removeEventListener('team_info_update', handleTeamInfoUpdate as EventListener);
            window.removeEventListener('shim_reconnected_clear_servers', handleShimReconnected as EventListener);
        };
    }, [activeServerId, setActiveServerId]);

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
