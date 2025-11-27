/**
 * useMapData Hook
 * 
 * Custom hook that handles fetching map data with intelligent caching.
 * Caches static map data (image, monuments) based on wipe time.
 */

import { useState, useEffect } from 'react';
import { mapCache } from '@/lib/mapCache';

interface MapData {
    jpgImage: string;
    width: number;
    height: number;
    oceanMargin: number;
    monuments?: any[];
    background?: string;
}

interface ServerInfo {
    name: string;
    map: string;
    mapSize: number;
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
    wipeTime?: number;
}

interface UseMapDataOptions {
    serverId: string;
    sendCommand: (serverId: string, command: string, payload: any) => Promise<any>;
    enabled?: boolean;
}

interface UseMapDataReturn {
    mapData: MapData | null;
    serverInfo: ServerInfo | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function useMapData({ serverId, sendCommand, enabled = true }: UseMapDataOptions): UseMapDataReturn {
    const [mapData, setMapData] = useState<MapData | null>(null);
    const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMapData = async () => {
        if (!enabled) return;

        setLoading(true);
        setError(null);

        try {
            // STEP 1: Fetch server info first (needed for wipeTime)
            console.log('[useMapData] Fetching server info...');
            const infoResult = await sendCommand(serverId, 'getServerInfo', {});

            if (!infoResult.success) {
                throw new Error('Failed to fetch server info');
            }

            const serverData = infoResult.data;
            setServerInfo(serverData);

            const wipeTime = serverData?.wipeTime;

            if (!wipeTime) {
                console.warn('[useMapData] No wipeTime available, skipping cache');
                // Fetch map directly without caching
                const mapResult = await sendCommand(serverId, 'getMap', {});
                if (mapResult.success) {
                    setMapData(mapResult.data);
                }
                return;
            }

            // STEP 2: Try to load map from cache (includes TTL check)
            let mapDataToUse: MapData | null = null;

            console.log('[useMapData] Checking cache for server', serverId, 'wipe time:', wipeTime);
            const cachedMap = await mapCache.get(serverId, wipeTime);

            if (cachedMap) {
                console.log('[useMapData] ✅ Using cached map data (saved ~2MB download!)');
                mapDataToUse = cachedMap;
                setMapData(cachedMap);
            }

            // STEP 3: Fetch map from server if cache miss or TTL expired
            if (!mapDataToUse) {
                console.log('[useMapData] Fetching fresh map from server...');
                const mapResult = await sendCommand(serverId, 'getMap', {});

                if (mapResult.success) {
                    mapDataToUse = mapResult.data;
                    setMapData(mapResult.data);

                    // Cache the map data for future use (with current wipeTime)
                    console.log('[useMapData] 💾 Caching map data (valid for 24 hours)');
                    await mapCache.set(serverId, wipeTime, mapResult.data);

                    // Run cleanup in background (non-blocking)
                    mapCache.cleanup().catch(err =>
                        console.warn('[useMapData] Cache cleanup failed:', err)
                    );
                } else {
                    throw new Error('Failed to fetch map data');
                }
            }

        } catch (err: any) {
            console.error('[useMapData] Error fetching map data:', err);
            setError(err.message || 'Failed to fetch map data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (enabled) {
            fetchMapData();
        }
    }, [serverId, enabled]);

    return {
        mapData,
        serverInfo,
        loading,
        error,
        refetch: fetchMapData
    };
}
