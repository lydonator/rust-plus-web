/**
 * Market Cache Utility
 *
 * Caches processed market intelligence data in IndexedDB.
 * Cache is invalidated when wipe time changes.
 * Enables instant page loads with zero REST API calls.
 */

interface VendorRanking {
    vendorId: number;
    vendorName: string;
    location: { x: number; y: number };
    price: number;
    quantity: number;
    stock: number;
    costPerItem: number;
    rank: number;
    percentile: number;
    savings: number;
    dealQuality: 'excellent' | 'good' | 'average' | 'overpriced';
}

interface ItemPriceData {
    itemId: number;
    itemName: string;
    min: number;
    max: number;
    avg: number;
    median: number;
    vendorCount: number;
    currencyId: number;
    currencyName: string;
    vendors: VendorRanking[];
}

interface Deal {
    itemId: number;
    itemName: string;
    vendor: VendorRanking;
    savings: number;
    avgPrice: number;
    dealPrice: number;
    currencyId: number;
    currencyName: string;
    dealQuality: 'excellent' | 'good';
}

interface WipeStats {
    wipeStage: 'early' | 'mid' | 'late' | 'unknown';
    daysSinceWipe: number;
    vendorCount: number;
    uniqueItems: number;
    topDealsCount: number;
    lastUpdate: number;
}

interface ProcessedMarketData {
    itemPrices: Record<string, ItemPriceData>;
    rankedVendors: Record<string, VendorRanking[]>;
    topDeals: Deal[];
    wipeStage: string;
    wipeStats: WipeStats | null;
    vendorCount: number;
    processingTime: number;
}

interface CachedMarketData {
    serverId: string;
    wipeTime: number;
    marketData: ProcessedMarketData;
    cachedAt: number;
}

const DB_NAME = 'rustplus-market-cache';
const DB_VERSION = 1;
const STORE_NAME = 'market_data';

class MarketCache {
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
                    console.log('[MarketCache] Created IndexedDB store:', STORE_NAME);
                }
            };
        });
    }

    /**
     * Get cached market data for a server
     * Returns null if cache miss or wipe time changed
     */
    async get(serverId: string, currentWipeTime?: number): Promise<ProcessedMarketData | null> {
        try {
            const db = await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(serverId);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const cached = request.result as CachedMarketData | undefined;

                    if (!cached) {
                        console.log('[MarketCache] Cache miss - no data for server', serverId);
                        resolve(null);
                        return;
                    }

                    // Check if wipe time matches (if provided)
                    if (currentWipeTime && cached.wipeTime !== currentWipeTime) {
                        console.log('[MarketCache] Cache invalidated - wipe time changed', {
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

                    const age = Date.now() - cached.cachedAt;

                    console.log('[MarketCache] ✅ Cache hit for server', serverId, {
                        wipeTime: cached.wipeTime,
                        age: `${(age / 1000 / 60).toFixed(1)} minutes`,
                        uniqueItems: Object.keys(cached.marketData.itemPrices).length,
                        topDeals: cached.marketData.topDeals.length,
                        vendors: cached.marketData.vendorCount
                    });

                    resolve(cached.marketData);
                };
            });
        } catch (error) {
            console.error('[MarketCache] Error reading cache:', error);
            return null;
        }
    }

    /**
     * Store market data in cache
     */
    async set(serverId: string, wipeTime: number, marketData: ProcessedMarketData): Promise<void> {
        try {
            const db = await this.initDB();

            const cacheEntry: CachedMarketData = {
                serverId,
                wipeTime,
                marketData,
                cachedAt: Date.now()
            };

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(cacheEntry);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    console.log('[MarketCache] ✅ Cached market data for server', serverId, {
                        wipeTime,
                        uniqueItems: Object.keys(marketData.itemPrices).length,
                        topDeals: marketData.topDeals.length,
                        vendors: marketData.vendorCount,
                        wipeStage: marketData.wipeStage
                    });
                    resolve();
                };
            });
        } catch (error) {
            console.error('[MarketCache] Error writing cache:', error);
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
                    console.log('[MarketCache] 🗑️ Deleted cache for server', serverId);
                    resolve();
                };
            });
        } catch (error) {
            console.error('[MarketCache] Error deleting cache:', error);
        }
    }

    /**
     * Clear all cached market data
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
                    console.log('[MarketCache] 🗑️ Cleared all cached market data');
                    resolve();
                };
            });
        } catch (error) {
            console.error('[MarketCache] Error clearing cache:', error);
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
                        const cached = cursor.value as CachedMarketData;

                        if (cached.cachedAt < cutoffTime) {
                            cursor.delete();
                            deletedCount++;
                        }

                        cursor.continue();
                    } else {
                        if (deletedCount > 0) {
                            console.log(`[MarketCache] 🗑️ Cleaned up ${deletedCount} old cache entries`);
                        }
                        resolve();
                    }
                };
            });
        } catch (error) {
            console.error('[MarketCache] Error during cleanup:', error);
        }
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{
        count: number;
        entries: Array<{
            serverId: string;
            wipeTime: number;
            cachedAt: number;
            age: string;
            itemCount: number;
            dealCount: number;
        }>;
    }> {
        try {
            const db = await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const entries = request.result as CachedMarketData[];

                    const stats = {
                        count: entries.length,
                        entries: entries.map(entry => {
                            const age = Date.now() - entry.cachedAt;
                            return {
                                serverId: entry.serverId,
                                wipeTime: entry.wipeTime,
                                cachedAt: entry.cachedAt,
                                age: `${(age / 1000 / 60).toFixed(1)} minutes`,
                                itemCount: Object.keys(entry.marketData.itemPrices).length,
                                dealCount: entry.marketData.topDeals.length
                            };
                        })
                    };

                    resolve(stats);
                };
            });
        } catch (error) {
            console.error('[MarketCache] Error getting stats:', error);
            return { count: 0, entries: [] };
        }
    }
}

// Export singleton instance
export const marketCache = new MarketCache();
