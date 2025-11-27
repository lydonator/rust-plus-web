'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, DollarSign, Package, ShoppingCart } from 'lucide-react';
import rustItems from '@/lib/rust-items.json';
import { useShimConnectionGuard } from '@/hooks/useShimConnection';
import { useMapPolling } from '@/hooks/useMapPolling';

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

type TabType = 'hot' | 'blueprints' | 'currency';

export default function MarketPage() {
    useShimConnectionGuard();

    const params = useParams();
    const serverId = params.serverId as string;
    const [userId, setUserId] = useState<string | null>(null);

    // Market data comes from SSE events, no need for map polling
    const [markers, setMarkers] = useState<MapMarker[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('hot');
    const [converterAmount, setConverterAmount] = useState<number>(1000);
    const [converterCurrency, setConverterCurrency] = useState<number>(-51); // Scrap

    const itemsDb = rustItems as RustItemsDatabase;

    // Get user ID
    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(userData => {
                if (userData) setUserId(userData.userId);
            });
    }, []);

    // Don't fetch markers directly - rely on SSE updates
    // The map page already fetches markers via sendCommand, we just listen to broadcasts

    // Listen for real-time marker updates
    useEffect(() => {
        if (!userId) return;

        const handleMarkersUpdate = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { serverId: eventServerId, markers: newMarkers } = customEvent.detail;

            if (eventServerId !== serverId) return;

            setMarkers(newMarkers || []);
        };

        // Market only cares about static markers (vending machines)
        window.addEventListener('map_markers_update', handleMarkersUpdate); // Legacy fallback
        window.addEventListener('static_markers_update', handleMarkersUpdate);

        return () => {
            window.removeEventListener('map_markers_update', handleMarkersUpdate);
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

        // Count currencies
        const currencyCount: Record<number, number> = {};
        vendingMachines.forEach(vm => {
            vm.sellOrders?.forEach(order => {
                currencyCount[order.currencyId] = (currencyCount[order.currencyId] || 0) + 1;
            });
        });

        const mostPopularCurrency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0];
        const mostPopularCurrencyName = mostPopularCurrency
            ? itemsDb[mostPopularCurrency[0]]?.name || 'Unknown'
            : 'None';

        // Count items
        const itemCount: Record<number, number> = {};
        vendingMachines.forEach(vm => {
            vm.sellOrders?.forEach(order => {
                itemCount[order.itemId] = (itemCount[order.itemId] || 0) + 1;
            });
        });

        const hottestItem = Object.entries(itemCount).sort((a, b) => b[1] - a[1])[0];
        const hottestItemName = hottestItem ? itemsDb[hottestItem[0]]?.name || 'Unknown' : 'None';

        return {
            totalShops,
            activeShops,
            outOfStock,
            mostPopularCurrency: mostPopularCurrencyName,
            hottestItem: `${hottestItemName} (${hottestItem?.[1] || 0} listings)`
        };
    }, [vendingMachines, markers, itemsDb]);

    // Get affordable items for currency converter
    const affordableItems = useMemo(() => {
        const items: Array<{ item: RustItem; itemId: number; shops: number; bestPrice: number; quantity: number }> = [];
        const itemMap: Record<number, { shops: number; bestPrice: number; quantity: number }> = {};

        // Debug: Log unique currency IDs
        const uniqueCurrencies = new Set<number>();
        vendingMachines.forEach(vm => {
            vm.sellOrders?.forEach(order => {
                uniqueCurrencies.add(order.currencyId);
            });
        });
        console.log('[Market] Unique currency IDs in vending machines:', Array.from(uniqueCurrencies));
        console.log('[Market] Looking for currency ID:', converterCurrency);
        console.log('[Market] Total vending machines:', vendingMachines.length);

        vendingMachines.forEach(vm => {
            vm.sellOrders?.forEach(order => {
                if (order.currencyId === converterCurrency && order.amountInStock > 0) {
                    // Total cost for the full order
                    const totalCost = order.costPerItem * order.quantity;

                    // Check if user can afford this order
                    if (totalCost <= converterAmount) {
                        if (!itemMap[order.itemId]) {
                            itemMap[order.itemId] = {
                                shops: 0,
                                bestPrice: totalCost,
                                quantity: order.quantity
                            };
                        }
                        itemMap[order.itemId].shops++;
                        if (totalCost < itemMap[order.itemId].bestPrice) {
                            itemMap[order.itemId].bestPrice = totalCost;
                            itemMap[order.itemId].quantity = order.quantity;
                        }
                    }
                }
            });
        });

        Object.entries(itemMap).forEach(([itemId, data]) => {
            const item = itemsDb[itemId];
            if (item) {
                items.push({
                    item,
                    itemId: parseInt(itemId),
                    shops: data.shops,
                    bestPrice: data.bestPrice,
                    quantity: data.quantity
                });
            }
        });

        return items.sort((a, b) => a.bestPrice - b.bestPrice);
    }, [vendingMachines, converterAmount, converterCurrency, itemsDb]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Live Market</h1>
                <p className="text-zinc-400">Real-time vending machine marketplace</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <ShoppingCart className="w-5 h-5 text-blue-500" />
                        <span className="text-zinc-400 text-sm">Total Shops</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{marketStats.totalShops}</div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <DollarSign className="w-5 h-5 text-green-500" />
                        <span className="text-zinc-400 text-sm">Popular Currency</span>
                    </div>
                    <div className="text-lg font-bold text-white truncate">{marketStats.mostPopularCurrency}</div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <TrendingUp className="w-5 h-5 text-orange-500" />
                        <span className="text-zinc-400 text-sm">Hottest Item</span>
                    </div>
                    <div className="text-sm font-bold text-white truncate">{marketStats.hottestItem}</div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Package className="w-5 h-5 text-red-500" />
                        <span className="text-zinc-400 text-sm">Out of Stock</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{marketStats.outOfStock}</div>
                </div>
            </div>

            {/* Currency Converter */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Currency Converter</h2>
                <div className="flex gap-4 mb-4">
                    <div className="flex-1">
                        <label className="block text-sm text-zinc-400 mb-2">Amount</label>
                        <input
                            type="number"
                            value={converterAmount}
                            onChange={(e) => setConverterAmount(parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm text-zinc-400 mb-2">Currency</label>
                        <select
                            value={converterCurrency}
                            onChange={(e) => setConverterCurrency(parseInt(e.target.value))}
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value={-51}>Scrap</option>
                            <option value={-1414529671}>Sulfur</option>
                            <option value={688032252}>High Quality Metal</option>
                            <option value={69511070}>Metal Fragments</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {affordableItems.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            No items available for this budget
                        </div>
                    ) : (
                        affordableItems.map(({ item, itemId, shops, bestPrice, quantity }) => (
                            <div
                                key={itemId}
                                className="flex items-center gap-3 p-3 bg-zinc-800 border border-zinc-700 rounded-lg"
                            >
                                <img
                                    src={item.iconUrl}
                                    alt={item.name}
                                    className="w-10 h-10 object-contain"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                                <div className="flex-1">
                                    <div className="font-medium text-white">{item.name}</div>
                                    <div className="text-xs text-zinc-500">
                                        {shops} shop{shops > 1 ? 's' : ''} • x{quantity} for {bestPrice} scrap
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Market Data - Will add tabs in next iteration */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                <p className="text-zinc-400">Market data tabs coming soon...</p>
            </div>
        </div>
    );
}
