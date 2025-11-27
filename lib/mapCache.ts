/**
 * Map Cache Utility
 * 
 * Caches static map data (image, monuments) in IndexedDB with 24-hour TTL.
 * Cache is invalidated when wipe time changes or TTL expires.
 */

interface CachedMapData {
    serverId: string;
    wipeTime: number;
    mapData: {
        jpgImage: string;
        width: number;
        height: number;
        oceanMargin: number;
        monuments?: any[];
        background?: string;
    };
    cachedAt: number;
}

const DB_NAME = 'rustplus-map-cache';
const DB_VERSION = 1;
const STORE_NAME = 'maps';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class MapCache {
    private db: IDBDatabase | null = null;

    /**
     * Initialize IndexedDB connection
     */
    private async initDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'serverId' });
                    store.createIndex('wipeTime', 'wipeTime', { unique: false });
                    store.createIndex('cachedAt', 'cachedAt', { unique: false });
                }
            };
        });
    }

    /**
     * Get cached map data for a server
     * Returns null if cache miss, wipe time changed, or TTL expired
     */
    async get(serverId: string, currentWipeTime: number): Promise<CachedMapData['mapData'] | null> {
        try {
            const db = await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(serverId);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const cached = request.result as CachedMapData | undefined;

                    if (!cached) {
                        console.log('[MapCache] Cache miss - no data for server', serverId);
                        resolve(null);
                        return;
                    }

                    // Check if wipe time matches
                    if (cached.wipeTime !== currentWipeTime) {
                        console.log('[MapCache] Cache invalidated - wipe time changed', {
                            cached: cached.wipeTime,
                            current: currentWipeTime,
                            cachedDate: new Date(cached.wipeTime * 1000).toISOString(),
                            currentDate: new Date(currentWipeTime * 1000).toISOString()
                        });
                        // Clean up old cache entry
                        this.delete(serverId);
                        resolve(null);
                        return;
                    }

                    // Check TTL (24 hours)
                    const age = Date.now() - cached.cachedAt;

                    if (age > TTL_MS) {
                        console.log('[MapCache] Cache expired - TTL exceeded', {
                            age: `${(age / 1000 / 60 / 60).toFixed(1)} hours`,
                            ttl: '24 hours',
                            cachedAt: new Date(cached.cachedAt).toISOString()
                        });
                        console.log('[MapCache] Will re-fetch to check for wipe changes');
                        resolve(null);
                        return;
                    }

                    console.log('[MapCache] ✅ Cache hit for server', serverId, {
                        wipeTime: cached.wipeTime,
                        wipeDate: new Date(cached.wipeTime * 1000).toISOString(),
                        cachedAt: new Date(cached.cachedAt).toISOString(),
                        age: `${(age / 1000 / 60 / 60).toFixed(1)} hours`,
                        imageSize: `${(cached.mapData.jpgImage?.length / 1024 / 1024).toFixed(2)} MB`
                    });

                    resolve(cached.mapData);
                };
            });
        } catch (error) {
            console.error('[MapCache] Error reading cache:', error);
            return null;
        }
    }

    /**
     * Store map data in cache
     */
    async set(serverId: string, wipeTime: number, mapData: CachedMapData['mapData']): Promise<void> {
        try {
            const db = await this.initDB();

            const cacheEntry: CachedMapData = {
                serverId,
                wipeTime,
                mapData,
                cachedAt: Date.now()
            };

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(cacheEntry);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    console.log('[MapCache] ✅ Cached map data for server', serverId, {
                        wipeTime,
                        wipeDate: new Date(wipeTime * 1000).toISOString(),
                        imageSize: `${(mapData.jpgImage?.length / 1024 / 1024).toFixed(2)} MB`,
                        monumentCount: mapData.monuments?.length || 0,
                        validUntil: new Date(Date.now() + TTL_MS).toISOString()
                    });
                    resolve();
                };
            });
        } catch (error) {
            console.error('[MapCache] Error writing cache:', error);
        }
    }

    /**
     * Delete cached data for a server
     */
    async delete(serverId: string): Promise<void> {
        try {
            const db = await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(serverId);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    console.log('[MapCache] 🗑️ Deleted cache for server', serverId);
                    resolve();
                };
            });
        } catch (error) {
            console.error('[MapCache] Error deleting cache:', error);
        }
    }

    /**
     * Clear all cached map data
     */
    async clearAll(): Promise<void> {
        try {
            const db = await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.clear();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    console.log('[MapCache] 🗑️ Cleared all cached maps');
                    resolve();
                };
            });
        } catch (error) {
            console.error('[MapCache] Error clearing cache:', error);
        }
    }

    /**
     * Clean up old cache entries (older than 30 days)
     */
    async cleanup(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
        try {
            const db = await this.initDB();
            const cutoffTime = Date.now() - maxAgeMs;

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const index = store.index('cachedAt');
                const request = index.openCursor();

                let deletedCount = 0;

                request.onerror = () => reject(request.error);
                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;

                    if (cursor) {
                        const cached = cursor.value as CachedMapData;

                        if (cached.cachedAt < cutoffTime) {
                            cursor.delete();
                            deletedCount++;
                        }

                        cursor.continue();
                    } else {
                        if (deletedCount > 0) {
                            console.log(`[MapCache] 🗑️ Cleaned up ${deletedCount} old cache entries`);
                        }
                        resolve();
                    }
                };
            });
        } catch (error) {
            console.error('[MapCache] Error during cleanup:', error);
        }
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{ count: number; totalSize: number; entries: Array<{ serverId: string; wipeTime: number; cachedAt: number; size: number; age: string }> }> {
        try {
            const db = await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const entries = request.result as CachedMapData[];

                    const stats = {
                        count: entries.length,
                        totalSize: 0,
                        entries: entries.map(entry => {
                            const size = entry.mapData.jpgImage?.length || 0;
                            const age = Date.now() - entry.cachedAt;
                            return {
                                serverId: entry.serverId,
                                wipeTime: entry.wipeTime,
                                cachedAt: entry.cachedAt,
                                size,
                                age: `${(age / 1000 / 60 / 60).toFixed(1)} hours`
                            };
                        })
                    };

                    stats.totalSize = stats.entries.reduce((sum, e) => sum + e.size, 0);

                    resolve(stats);
                };
            });
        } catch (error) {
            console.error('[MapCache] Error getting stats:', error);
            return { count: 0, totalSize: 0, entries: [] };
        }
    }
}

// Export singleton instance
export const mapCache = new MapCache();
