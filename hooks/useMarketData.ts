/**
 * useMarketData Hook
 *
 * Custom hook that handles market intelligence data with IndexedDB caching.
 * Listens to SSE market_update events and provides instant access to processed data.
 * Enables zero REST API calls for market data - everything comes from cache + SSE.
 */

import { useState, useEffect } from 'react';
import { marketCache } from '@/lib/marketCache';

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

export interface MarketData {
    itemPrices: Record<string, ItemPriceData>;
    rankedVendors: Record<string, VendorRanking[]>;
    topDeals: Deal[];
    wipeStage: string;
    wipeStats: WipeStats | null;
    vendorCount: number;
    processingTime: number;
}

interface UseMarketDataOptions {
    serverId: string;
    enabled?: boolean;
}

interface UseMarketDataReturn {
    marketData: MarketData | null;
    loading: boolean;
    error: string | null;
    lastUpdate: number | null;
    cacheHit: boolean;
}

export function useMarketData({ serverId, enabled = true }: UseMarketDataOptions): UseMarketDataReturn {
    const [marketData, setMarketData] = useState<MarketData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<number | null>(null);
    const [cacheHit, setCacheHit] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        // Load market data from cache on mount
        const loadCachedData = async () => {
            try {
                console.log('[useMarketData] Loading cached market data for', serverId);
                const cached = await marketCache.get(serverId);

                if (cached) {
                    console.log('[useMarketData] ✅ Cache hit - instant load!');
                    setMarketData(cached);
                    setLastUpdate(Date.now());
                    setCacheHit(true);
                    setLoading(false);
                } else {
                    console.log('[useMarketData] Cache miss - waiting for SSE update...');
                    setCacheHit(false);
                    // Loading will be set to false when we receive first SSE event
                }
            } catch (err: any) {
                console.error('[useMarketData] Error loading cache:', err);
                setError(err.message);
                setLoading(false);
            }
        };

        loadCachedData();

        // Listen for SSE market_update events
        const handleMarketUpdate = async (event: Event) => {
            const customEvent = event as CustomEvent;
            const { serverId: updateServerId, data, timestamp } = customEvent.detail;

            if (updateServerId !== serverId) {
                return; // Not for this server
            }

            console.log('[useMarketData] 📡 Received market_update via SSE', {
                uniqueItems: Object.keys(data.itemPrices || {}).length,
                topDeals: data.topDeals?.length || 0,
                vendors: data.vendorCount,
                wipeStage: data.wipeStage
            });

            try {
                // Update state
                setMarketData(data);
                setLastUpdate(timestamp);
                setLoading(false);
                setError(null);

                // Update IndexedDB cache
                // Note: We don't have wipeTime from SSE event, so cache without validation
                // The cache will be cleared when wipe time changes (handled by map data hook)
                const wipeTime = data.wipeStats?.wipeStartTime || Date.now();
                await marketCache.set(serverId, wipeTime, data);

                // Run cleanup in background (non-blocking)
                marketCache.cleanup().catch(err =>
                    console.warn('[useMarketData] Cache cleanup failed:', err)
                );
            } catch (err: any) {
                console.error('[useMarketData] Error handling market update:', err);
                setError(err.message);
            }
        };

        // Add event listener
        window.addEventListener('market_update', handleMarketUpdate);

        // Cleanup
        return () => {
            window.removeEventListener('market_update', handleMarketUpdate);
        };
    }, [serverId, enabled]);

    return {
        marketData,
        loading,
        error,
        lastUpdate,
        cacheHit
    };
}

/**
 * Helper hook to get deal quality for a specific vendor selling a tracked item
 */
export function useVendorDealQuality(
    marketData: MarketData | null,
    itemId: number,
    vendorId: number
): {
    dealQuality: 'excellent' | 'good' | 'average' | 'none';
    savings: number;
    price: number | null;
} {
    if (!marketData) {
        return { dealQuality: 'none', savings: 0, price: null };
    }

    const itemKey = String(itemId);
    const rankedVendors = marketData.rankedVendors[itemKey];

    if (!rankedVendors) {
        return { dealQuality: 'none', savings: 0, price: null };
    }

    const vendorData = rankedVendors.find(v => v.vendorId === vendorId);

    if (!vendorData) {
        return { dealQuality: 'none', savings: 0, price: null };
    }

    return {
        dealQuality: vendorData.dealQuality,
        savings: vendorData.savings,
        price: vendorData.price
    };
}

/**
 * Helper hook to check if an item is available at good prices
 */
export function useItemAvailability(
    marketData: MarketData | null,
    itemId: number
): {
    available: boolean;
    cheapestPrice: number | null;
    vendorCount: number;
    bestDealSavings: number;
} {
    if (!marketData) {
        return {
            available: false,
            cheapestPrice: null,
            vendorCount: 0,
            bestDealSavings: 0
        };
    }

    const itemKey = String(itemId);
    const priceData = marketData.itemPrices[itemKey];

    if (!priceData) {
        return {
            available: false,
            cheapestPrice: null,
            vendorCount: 0,
            bestDealSavings: 0
        };
    }

    const rankedVendors = marketData.rankedVendors[itemKey];
    const cheapestVendor = rankedVendors?.[0];

    return {
        available: true,
        cheapestPrice: priceData.min,
        vendorCount: priceData.vendorCount,
        bestDealSavings: cheapestVendor?.savings || 0
    };
}
