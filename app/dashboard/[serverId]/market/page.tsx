'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, DollarSign, Package, ShoppingCart, ArrowRight, MapPin, Zap, BarChart3, Layers } from 'lucide-react';
import rustItems from '@/lib/rust-items.json';
import { useShimConnectionGuard } from '@/hooks/useShimConnection';
import { useMarketData } from '@/hooks/useMarketData';

interface RustItem {
    name: string;
    shortname: string;
    iconUrl: string;
}

type RustItemsDatabase = Record<string, RustItem>;

interface MapMarker {
    id: number;
    type: number | string;
    x: number;
    y: number;
    name?: string;
    sellOrders?: SellOrder[];
    outOfStock?: boolean;
}

interface SellOrder {
    itemId: number;
    quantity: number;
    currencyId: number;
    costPerItem: number;
    amountInStock: number;
    itemIsBlueprint: boolean;
    currencyIsBlueprint: boolean;
}

export default function MarketPage() {
    useShimConnectionGuard();

    const params = useParams();
    const serverId = params.serverId as string;
    const [userId, setUserId] = useState<string | null>(null);

    // Market intelligence data
    const { marketData, loading: marketLoading } = useMarketData({ serverId, enabled: true });

    // Legacy marker data for vendor density
    const [markers, setMarkers] = useState<MapMarker[]>([]);

    // Price comparison state
    const [selectedItems, setSelectedItems] = useState<number[]>([]);

    // Arbitrage calculator state
    const [arbitrageFrom, setArbitrageFrom] = useState<number>(-51); // Scrap
    const [arbitrageTo, setArbitrageTo] = useState<number>(688032252); // HQM
    const [arbitrageAmount, setArbitrageAmount] = useState<number>(1000);

    const itemsDb = rustItems as RustItemsDatabase;

    // Get user ID
    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(userData => {
                if (userData) setUserId(userData.userId);
            });
    }, []);

    // Listen for real-time marker updates (for vendor density map)
    useEffect(() => {
        if (!userId) return;

        const handleMarkersUpdate = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { serverId: eventServerId, markers: newMarkers } = customEvent.detail;

            if (eventServerId !== serverId) return;

            setMarkers(newMarkers || []);
        };

        window.addEventListener('static_markers_update', handleMarkersUpdate);

        return () => {
            window.removeEventListener('static_markers_update', handleMarkersUpdate);
        };
    }, [userId, serverId]);

    // Filter vending machines
    const vendingMachines = useMemo(() => {
        return markers.filter(m =>
            (m.type === 3 || m.type === 'VendingMachine') &&
            m.sellOrders &&
            m.sellOrders.length > 0
        );
    }, [markers]);

    // Calculate market stats
    const marketStats = useMemo(() => {
        const totalShops = markers.filter(m => m.type === 3 || m.type === 'VendingMachine').length;
        const activeShops = vendingMachines.length;
        const outOfStock = totalShops - activeShops;

        return {
            totalShops,
            activeShops,
            outOfStock,
            uniqueItems: marketData ? Object.keys(marketData.itemPrices).length : 0
        };
    }, [vendingMachines, markers, marketData]);

    // Price heatmap data (grid of all items colored by price/availability)
    const heatmapData = useMemo(() => {
        if (!marketData) return [];

        return Object.entries(marketData.itemPrices).map(([itemId, data]) => {
            const item = itemsDb[itemId];
            if (!item) return null;

            // Determine color based on availability and deal quality
            let color = 'bg-zinc-800'; // Default gray
            const hasExcellentDeals = data.vendors.some(v => v.dealQuality === 'excellent');
            const hasGoodDeals = data.vendors.some(v => v.dealQuality === 'good');

            if (hasExcellentDeals) {
                color = 'bg-yellow-500/20 border-yellow-500/50'; // Gold
            } else if (hasGoodDeals) {
                color = 'bg-cyan-500/20 border-cyan-500/50'; // Cyan
            } else if (data.vendorCount > 3) {
                color = 'bg-green-500/20 border-green-500/50'; // Green (common)
            }

            return {
                itemId: parseInt(itemId),
                item,
                ...data,
                color
            };
        }).filter(Boolean).sort((a, b) => b!.vendorCount - a!.vendorCount);
    }, [marketData, itemsDb]);

    // Price comparison data
    const comparisonData = useMemo(() => {
        if (!marketData || selectedItems.length === 0) return [];

        return selectedItems.map(itemId => {
            const itemKey = String(itemId);
            const priceData = marketData.itemPrices[itemKey];
            const item = itemsDb[itemId];

            if (!priceData || !item) return null;

            return {
                itemId,
                item,
                ...priceData
            };
        }).filter(Boolean);
    }, [marketData, selectedItems, itemsDb]);

    // Currency arbitrage calculator
    const arbitrageOpportunities = useMemo(() => {
        if (!marketData || !marketData.itemPrices) return null;

        const opportunities: Array<{
            item: RustItem;
            itemId: number;
            buyPrice: number;
            sellPrice: number;
            profit: number;
            profitPercent: number;
            buyVendor: any;
            sellVendor: any;
        }> = [];

        // Find items sold in both currencies
        Object.entries(marketData.itemPrices).forEach(([itemId, fromData]) => {
            if (fromData.currencyId !== arbitrageFrom) return;

            // Look for same item in target currency
            const toKey = Object.keys(marketData.itemPrices).find(key => {
                const data = marketData.itemPrices[key];
                return parseInt(key) === parseInt(itemId) && data.currencyId === arbitrageTo;
            });

            if (toKey) {
                const toData = marketData.itemPrices[toKey];
                const item = itemsDb[itemId];
                if (!item) return;

                // Calculate conversion profit
                const buyPrice = fromData.min;
                const sellPrice = toData.max;
                const profit = sellPrice - buyPrice;
                const profitPercent = (profit / buyPrice) * 100;

                if (profitPercent > 5) { // Only show opportunities with >5% profit
                    opportunities.push({
                        item,
                        itemId: parseInt(itemId),
                        buyPrice,
                        sellPrice,
                        profit,
                        profitPercent,
                        buyVendor: fromData.vendors[0],
                        sellVendor: toData.vendors[toData.vendors.length - 1]
                    });
                }
            }
        });

        return opportunities.sort((a, b) => b.profitPercent - a.profitPercent).slice(0, 10);
    }, [marketData, arbitrageFrom, arbitrageTo, itemsDb]);

    // Vendor density grid (divide map into 4x4 grid and count vendors)
    const densityGrid = useMemo(() => {
        if (vendingMachines.length === 0) return [];

        const mapSize = 4000; // Assume 4k map for now
        const gridSize = 4;
        const cellSize = mapSize / gridSize;

        const grid: Array<{ x: number; y: number; count: number; intensity: number }> = [];

        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                const cellX = col * cellSize;
                const cellY = row * cellSize;

                const vendorsInCell = vendingMachines.filter(vm => {
                    return vm.x >= cellX && vm.x < cellX + cellSize &&
                        vm.y >= cellY && vm.y < cellY + cellSize;
                });

                grid.push({
                    x: col,
                    y: row,
                    count: vendorsInCell.length,
                    intensity: vendorsInCell.length
                });
            }
        }

        const maxCount = Math.max(...grid.map(g => g.count), 1);
        return grid.map(g => ({ ...g, intensity: g.count / maxCount }));
    }, [vendingMachines]);

    const maxDensity = Math.max(...densityGrid.map(g => g.count), 1);

    // Available items for price comparison selector
    const availableItems = useMemo(() => {
        if (!marketData) return [];

        return Object.entries(marketData.itemPrices).map(([itemId, data]) => {
            const item = itemsDb[itemId];
            if (!item) return null;

            return {
                itemId: parseInt(itemId),
                item,
                vendorCount: data.vendorCount
            };
        }).filter(Boolean).sort((a, b) => b!.vendorCount - a!.vendorCount);
    }, [marketData, itemsDb]);

    if (marketLoading && !marketData) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    {/* Animated spinner */}
                    <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
                        <div className="w-16 h-16 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin"></div>
                    </div>

                    <h2 className="text-xl font-semibold text-white mb-2">
                        Scanning Vending Machines...
                    </h2>

                    <p className="text-zinc-400 text-sm mb-1">
                        Analyzing market prices and deals
                    </p>

                    <p className="text-zinc-500 text-xs">
                        Market data updates every 30 seconds
                    </p>

                    <div className="mt-6 text-xs text-zinc-600">
                        💡 Tip: Market intelligence tracks prices automatically
                    </div>
                </div>
            </div>
        );
    }

    if (marketLoading && marketData) {
        // Showing stale data while updating
        return (
            <div className="relative">
                {/* Updating badge */}
                <div className="fixed top-4 right-4 z-50 bg-blue-500/20 border border-blue-500/50 text-blue-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    Updating market data...
                </div>

                {/* Show slightly faded content */}
                <div className="opacity-75 pointer-events-none">
                    {/* Main content will be rendered below */}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Market Intelligence</h1>
                <p className="text-zinc-400">
                    {marketData ? 'Real-time price analytics powered by AI' : 'Waiting for market data...'}
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <ShoppingCart className="w-5 h-5 text-blue-500" />
                        <span className="text-zinc-400 text-sm">Active Vendors</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{marketStats.activeShops}</div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Package className="w-5 h-5 text-green-500" />
                        <span className="text-zinc-400 text-sm">Unique Items</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{marketStats.uniqueItems}</div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <TrendingUp className="w-5 h-5 text-orange-500" />
                        <span className="text-zinc-400 text-sm">Hot Deals</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {marketData?.topDeals.length || 0}
                    </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Zap className="w-5 h-5 text-purple-500" />
                        <span className="text-zinc-400 text-sm">Wipe Stage</span>
                    </div>
                    <div className="text-lg font-bold text-white capitalize">
                        {marketData?.wipeStage || 'Unknown'}
                    </div>
                </div>
            </div>

            {/* Widget Grid - 2x2 layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Price Heatmap */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Layers className="w-5 h-5 text-blue-500" />
                        <h2 className="text-xl font-bold text-white">Price Heatmap</h2>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">
                        Items colored by deal quality: <span className="text-yellow-500">Gold</span> = Excellent,
                        <span className="text-cyan-500"> Cyan</span> = Good,
                        <span className="text-green-500"> Green</span> = Common
                    </p>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                        {heatmapData.length === 0 ? (
                            <div className="col-span-full text-center py-8 text-zinc-500">
                                No market data available
                            </div>
                        ) : (
                            heatmapData.slice(0, 40).map((data: any) => (
                                <div
                                    key={data.itemId}
                                    className={`relative border rounded-lg p-2 cursor-pointer hover:scale-105 transition-transform ${data.color}`}
                                    title={`${data.item.name}: ${data.vendorCount} vendors, ${data.min}-${data.max} ${data.currencyName}`}
                                >
                                    <img
                                        src={data.item.iconUrl}
                                        alt={data.item.name}
                                        className="w-full h-12 object-contain"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                    <div className="absolute top-0 right-0 bg-black/70 text-white text-xs px-1 rounded">
                                        {data.vendorCount}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 2. Price Comparison Tool */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="w-5 h-5 text-green-500" />
                        <h2 className="text-xl font-bold text-white">Price Comparison</h2>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">
                        Compare up to 3 items side-by-side
                    </p>

                    {/* Item selector */}
                    <div className="mb-4">
                        <select
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                            onChange={(e) => {
                                const itemId = parseInt(e.target.value);
                                if (itemId && !selectedItems.includes(itemId) && selectedItems.length < 3) {
                                    setSelectedItems([...selectedItems, itemId]);
                                }
                            }}
                            value=""
                        >
                            <option value="">Select item to compare...</option>
                            {availableItems.map((data: any) => (
                                <option key={data.itemId} value={data.itemId}>
                                    {data.item.name} ({data.vendorCount} vendors)
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Selected items comparison */}
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                        {comparisonData.length === 0 ? (
                            <div className="text-center py-8 text-zinc-500 text-sm">
                                Select items above to compare prices
                            </div>
                        ) : (
                            comparisonData.map((data: any) => (
                                <div key={data.itemId} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                                    <div className="flex items-center gap-3 mb-2">
                                        <img
                                            src={data.item.iconUrl}
                                            alt={data.item.name}
                                            className="w-10 h-10 object-contain"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-white text-sm">{data.item.name}</div>
                                            <div className="text-xs text-zinc-500">{data.vendorCount} vendors</div>
                                        </div>
                                        <button
                                            onClick={() => setSelectedItems(selectedItems.filter(id => id !== data.itemId))}
                                            className="text-red-500 hover:text-red-400 text-xs"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-xs">
                                        <div>
                                            <div className="text-zinc-500">Min</div>
                                            <div className="text-green-400 font-medium">{data.min}</div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-500">Avg</div>
                                            <div className="text-white font-medium">{data.avg}</div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-500">Max</div>
                                            <div className="text-red-400 font-medium">{data.max}</div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-500">Median</div>
                                            <div className="text-blue-400 font-medium">{data.median}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-2">
                                        Currency: {data.currencyName}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 3. Currency Arbitrage Calculator */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <DollarSign className="w-5 h-5 text-yellow-500" />
                        <h2 className="text-xl font-bold text-white">Currency Arbitrage</h2>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">
                        Find profitable currency conversions through items
                    </p>

                    {/* Currency selector */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label className="block text-xs text-zinc-400 mb-2">Buy with</label>
                            <select
                                value={arbitrageFrom}
                                onChange={(e) => setArbitrageFrom(parseInt(e.target.value))}
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                            >
                                <option value={-51}>Scrap</option>
                                <option value={-1414529671}>Sulfur</option>
                                <option value={688032252}>High Quality Metal</option>
                                <option value={69511070}>Metal Fragments</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-zinc-400 mb-2">Sell for</label>
                            <select
                                value={arbitrageTo}
                                onChange={(e) => setArbitrageTo(parseInt(e.target.value))}
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                            >
                                <option value={-51}>Scrap</option>
                                <option value={-1414529671}>Sulfur</option>
                                <option value={688032252}>High Quality Metal</option>
                                <option value={69511070}>Metal Fragments</option>
                            </select>
                        </div>
                    </div>

                    {/* Arbitrage opportunities */}
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                        {!arbitrageOpportunities || arbitrageOpportunities.length === 0 ? (
                            <div className="text-center py-8 text-zinc-500 text-sm">
                                No arbitrage opportunities found
                            </div>
                        ) : (
                            arbitrageOpportunities.map((opp) => (
                                <div key={opp.itemId} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                                    <div className="flex items-center gap-3 mb-2">
                                        <img
                                            src={opp.item.iconUrl}
                                            alt={opp.item.name}
                                            className="w-10 h-10 object-contain"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-white text-sm">{opp.item.name}</div>
                                            <div className="text-xs text-green-400">
                                                +{opp.profitPercent.toFixed(1)}% profit
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="text-zinc-400">
                                            Buy: <span className="text-white font-medium">{opp.buyPrice}</span>
                                        </div>
                                        <ArrowRight className="w-3 h-3 text-zinc-600" />
                                        <div className="text-zinc-400">
                                            Sell: <span className="text-white font-medium">{opp.sellPrice}</span>
                                        </div>
                                        <div className="text-green-400 font-medium">
                                            +{opp.profit}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 4. Vendor Density Map */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <MapPin className="w-5 h-5 text-orange-500" />
                        <h2 className="text-xl font-bold text-white">Vendor Density</h2>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">
                        Heatmap showing shopping districts (4x4 grid)
                    </p>

                    {/* Density grid visualization */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                        {densityGrid.map((cell, idx) => {
                            const opacity = cell.intensity * 0.8 + 0.2;
                            const bgColor = cell.count === 0
                                ? 'bg-zinc-800'
                                : cell.intensity > 0.7
                                    ? 'bg-red-500'
                                    : cell.intensity > 0.4
                                        ? 'bg-orange-500'
                                        : 'bg-yellow-500';

                            return (
                                <div
                                    key={idx}
                                    className={`aspect-square rounded border border-zinc-700 flex items-center justify-center ${bgColor}`}
                                    style={{ opacity: cell.count === 0 ? 0.3 : opacity }}
                                    title={`Grid ${cell.x},${cell.y}: ${cell.count} vendors`}
                                >
                                    <span className="text-white text-xs font-bold">
                                        {cell.count > 0 ? cell.count : ''}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-red-500 rounded"></div>
                            <span>High Density</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-orange-500 rounded"></div>
                            <span>Medium</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                            <span>Low</span>
                        </div>
                    </div>

                    <div className="mt-4 text-xs text-zinc-500">
                        Max density: {maxDensity} vendors per cell
                    </div>
                </div>
            </div>

            {/* Top Deals Section */}
            {marketData && marketData.topDeals.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-green-500" />
                        <h2 className="text-xl font-bold text-white">Top Deals Right Now</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {marketData.topDeals.slice(0, 12).map((deal, idx) => (
                            <div key={idx} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                                <div className="flex items-center gap-3 mb-2">
                                    <img
                                        src={itemsDb[deal.itemId]?.iconUrl}
                                        alt={deal.itemName}
                                        className="w-10 h-10 object-contain"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                    <div className="flex-1">
                                        <div className="font-medium text-white text-sm">{deal.itemName}</div>
                                        <div className="text-xs text-green-400">
                                            Save {deal.savings} ({((deal.savings / deal.avgPrice) * 100).toFixed(0)}%)
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <div>
                                        <span className="text-zinc-500 line-through">{deal.avgPrice}</span>
                                        <span className="text-white font-medium ml-2">{deal.dealPrice}</span>
                                    </div>
                                    <div className="text-zinc-500">{deal.currencyName}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
