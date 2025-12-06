'use client';

import { useState, useEffect } from 'react';
import { Search, ShoppingBag, TrendingUp, Flame, History, ChevronLeft, Star, MapPin, Bell, BellOff } from 'lucide-react';
import ItemSearch from './ItemSearch';
import { useMarketData } from '@/hooks/useMarketData';

interface MapSidebarProps {
    serverId: string;
    onItemSearch?: (itemId: number, itemName: string) => void;
    onHighlightVendors?: (vendorIds: number[]) => void;
    onClearHighlights?: () => void;
}

interface ShoppingListItem {
    id: string;
    item_id: number;
    item_name: string;
    created_at: string;
    target_price?: number | null;
    alert_enabled?: boolean;
}

type TabType = 'search' | 'list' | 'deals' | 'trends' | 'history';

export default function MapSidebar({
    serverId,
    onItemSearch,
    onHighlightVendors,
    onClearHighlights
}: MapSidebarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('search');
    const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
    const [isLoadingList, setIsLoadingList] = useState(false);

    // Load market intelligence data
    const { marketData, loading: marketLoading, cacheHit } = useMarketData({
        serverId,
        enabled: isOpen // Only load when sidebar is open
    });

    const handleClose = () => {
        setIsOpen(false);
        onClearHighlights?.();
    };

    // Fetch shopping list
    const fetchShoppingList = async () => {
        setIsLoadingList(true);
        try {
            const response = await fetch(`/api/shopping-list?serverId=${serverId}`);
            if (response.ok) {
                const data = await response.json();
                setShoppingList(data);
            }
        } catch (error) {
            console.error('Failed to fetch shopping list:', error);
        } finally {
            setIsLoadingList(false);
        }
    };

    // Add item to shopping list
    const handleAddToList = async (itemId: number, itemName: string) => {
        try {
            const response = await fetch('/api/shopping-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, itemId, itemName })
            });

            if (response.ok) {
                await fetchShoppingList();
                setActiveTab('list'); // Switch to list tab to show the added item
            } else {
                const error = await response.json();
                console.error('Failed to add to shopping list:', error);
                alert('Failed to add item to shopping list');
            }
        } catch (error) {
            console.error('Failed to add to shopping list:', error);
            alert('Failed to add item to shopping list');
        }
    };

    // Remove item from shopping list
    const handleRemoveFromList = async (id: string) => {
        try {
            const response = await fetch(`/api/shopping-list?id=${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                await fetchShoppingList();
            } else {
                console.error('Failed to remove from shopping list');
            }
        } catch (error) {
            console.error('Failed to remove from shopping list:', error);
        }
    };

    // Toggle price alert for item
    const handleToggleAlert = async (id: string, currentEnabled: boolean, targetPrice: number | null) => {
        try {
            const response = await fetch('/api/shopping-list/alert', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    alertEnabled: !currentEnabled,
                    targetPrice
                })
            });

            if (response.ok) {
                await fetchShoppingList();
            } else {
                console.error('Failed to toggle price alert');
            }
        } catch (error) {
            console.error('Failed to toggle price alert:', error);
        }
    };

    // Update target price for alert
    const handleUpdateTargetPrice = async (id: string, targetPrice: number) => {
        try {
            const response = await fetch('/api/shopping-list/alert', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    targetPrice
                })
            });

            if (response.ok) {
                await fetchShoppingList();
            } else {
                console.error('Failed to update target price');
            }
        } catch (error) {
            console.error('Failed to update target price:', error);
        }
    };

    // Fetch shopping list when switching to list tab
    useEffect(() => {
        if (activeTab === 'list' && isOpen) {
            fetchShoppingList();
        }
    }, [activeTab, isOpen, serverId]);

    return (
        <>
            {/* Floating Shopping Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="absolute top-1/2 -translate-y-1/2 left-0 z-40 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-r-xl shadow-lg transition-all duration-200 hover:scale-110 group"
                    aria-label="Open shopping tools"
                >
                    <ShoppingBag className="w-6 h-6" />
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                        Shopping Tools
                    </div>
                </button>
            )}

            {/* Sidebar Drawer with glassmorphic effect and animations */}
            <div
                className={`absolute left-0 top-0 bottom-0 w-full sm:w-96 z-50 transition-transform duration-500 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Glassmorphic Background */}
                <div className="absolute inset-0 bg-gradient-to-r from-neutral-900/80 via-neutral-900/70 to-neutral-900/60 backdrop-blur-xl border-r border-white/10 shadow-2xl" />

                {/* Glass Reflection Effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />

                {/* Content Container */}
                <div className="relative flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-white/10 bg-neutral-900/20 backdrop-blur-sm">
                        <h2 className="text-lg font-semibold text-white">Shopping Tools</h2>
                    </div>

                    {/* Tabs - 5 tabs in 2 rows for better mobile/desktop layout */}
                    <div className="border-b border-white/10 bg-black/20">
                        {/* First Row: Search, List, Deals */}
                        <div className="flex">
                            <button
                                onClick={() => setActiveTab('search')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 transition-all duration-200 ${activeTab === 'search'
                                        ? 'bg-white/10 text-white border-b-2 border-blue-400 shadow-lg'
                                        : 'text-white/70 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Search className="w-4 h-4" />
                                <span className="text-xs font-medium">Search</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('list')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 transition-all duration-200 ${activeTab === 'list'
                                        ? 'bg-white/10 text-white border-b-2 border-blue-400 shadow-lg'
                                        : 'text-white/70 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <ShoppingBag className="w-4 h-4" />
                                <span className="text-xs font-medium">List</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('deals')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 transition-all duration-200 ${activeTab === 'deals'
                                        ? 'bg-white/10 text-white border-b-2 border-blue-400 shadow-lg'
                                        : 'text-white/70 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Flame className="w-4 h-4" />
                                <span className="text-xs font-medium">Deals</span>
                            </button>
                        </div>
                        {/* Second Row: Trends, History */}
                        <div className="flex border-t border-white/5">
                            <button
                                onClick={() => setActiveTab('trends')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 transition-all duration-200 ${activeTab === 'trends'
                                        ? 'bg-white/10 text-white border-b-2 border-blue-400 shadow-lg'
                                        : 'text-white/70 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <TrendingUp className="w-4 h-4" />
                                <span className="text-xs font-medium">Trends</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 transition-all duration-200 ${activeTab === 'history'
                                        ? 'bg-white/10 text-white border-b-2 border-blue-400 shadow-lg'
                                        : 'text-white/70 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <History className="w-4 h-4" />
                                <span className="text-xs font-medium">History</span>
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {/* Tab 1: Search */}
                        {activeTab === 'search' && (
                            <ItemSearch
                                onItemSelect={(itemId, itemName) => {
                                    console.log('Item selected:', itemId, itemName);
                                    onItemSearch?.(itemId, itemName);
                                }}
                                onAddToList={handleAddToList}
                            />
                        )}

                        {/* Tab 2: Shopping List (Enhanced) */}
                        {activeTab === 'list' && (
                            <div className="space-y-3">
                                {isLoadingList ? (
                                    <div className="text-center py-8 text-white/60">
                                        Loading shopping list...
                                    </div>
                                ) : shoppingList.length === 0 ? (
                                    <div className="text-center py-12 text-white/60">
                                        <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>Your shopping list is empty</p>
                                        <p className="text-sm mt-1">Search for items and add them to track</p>
                                    </div>
                                ) : (
                                    shoppingList.map((item) => {
                                        // Get item price data from market intelligence
                                        const itemKey = String(item.item_id);
                                        const priceData = marketData?.itemPrices[itemKey];
                                        const rankedVendors = marketData?.rankedVendors[itemKey];
                                        const cheapestVendor = rankedVendors?.[0];

                                        return (
                                            <div
                                                key={item.id}
                                                className="p-3 bg-white/10 border border-white/20 rounded-lg hover:border-white/30 transition-colors backdrop-blur-sm shadow-lg"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-white truncate">
                                                            {item.item_name}
                                                        </div>
                                                        {priceData && (
                                                            <div className="text-xs text-white/60 mt-1">
                                                                {priceData.vendorCount} vendor{priceData.vendorCount !== 1 ? 's' : ''} selling
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveFromList(item.id)}
                                                        className="ml-3 p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
                                                        title="Remove from list"
                                                    >
                                                        ×
                                                    </button>
                                                </div>

                                                {/* Price info and deal quality */}
                                                {cheapestVendor && priceData ? (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-white/60">Best price:</span>
                                                            <span className="text-green-400 font-semibold">
                                                                {Math.round(cheapestVendor.price)} {priceData.currencyName}
                                                            </span>
                                                        </div>
                                                        {cheapestVendor.dealQuality === 'excellent' && (
                                                            <div className="text-[10px] bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-2 py-1 rounded-full font-bold text-center">
                                                                🔥 HOT DEAL - {Math.round(cheapestVendor.savings)}% OFF
                                                            </div>
                                                        )}
                                                        {cheapestVendor.dealQuality === 'good' && (
                                                            <div className="text-[10px] bg-gradient-to-r from-cyan-400 to-blue-500 text-white px-2 py-1 rounded-full font-bold text-center">
                                                                💰 Good Price - {Math.round(cheapestVendor.savings)}% OFF
                                                            </div>
                                                        )}

                                                        {/* Price Alert Controls */}
                                                        <div className="p-2 bg-black/20 rounded border border-white/10">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-[10px] text-white/60 font-medium">Price Alert</span>
                                                                <button
                                                                    onClick={() => handleToggleAlert(item.id, item.alert_enabled || false, item.target_price || Math.round(cheapestVendor.price))}
                                                                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${item.alert_enabled
                                                                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                                                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                                                                        }`}
                                                                >
                                                                    {item.alert_enabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                                                                    {item.alert_enabled ? 'ON' : 'OFF'}
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number"
                                                                    placeholder="Target price"
                                                                    defaultValue={item.target_price || ''}
                                                                    className="flex-1 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs"
                                                                    onBlur={(e) => {
                                                                        const value = parseInt(e.target.value);
                                                                        if (value && value !== item.target_price) {
                                                                            handleUpdateTargetPrice(item.id, value);
                                                                        }
                                                                    }}
                                                                />
                                                                <span className="text-[10px] text-white/40">{priceData.currencyName}</span>
                                                            </div>
                                                            {item.alert_enabled && item.target_price && (
                                                                <div className="text-[10px] text-green-400 mt-1">
                                                                    You'll be notified when price ≤ {item.target_price}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <button
                                                            onClick={() => onItemSearch?.(item.item_id, item.item_name)}
                                                            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded text-xs font-medium transition-colors"
                                                        >
                                                            <MapPin className="w-3 h-3" />
                                                            View on Map
                                                        </button>
                                                    </div>
                                                ) : !marketData ? (
                                                    <div className="text-xs text-white/40 text-center py-2">
                                                        Loading market data...
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-white/40 text-center py-2">
                                                        Not currently available
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* Tab 3: Top Deals (NEW) */}
                        {activeTab === 'deals' && (
                            <div className="space-y-3">
                                {marketLoading ? (
                                    <div className="text-center py-8 text-white/60">
                                        Loading market data...
                                    </div>
                                ) : !marketData || marketData.topDeals.length === 0 ? (
                                    <div className="text-center py-12 text-white/60">
                                        <Flame className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>No hot deals found</p>
                                        <p className="text-sm mt-1">Check back when vendors are active</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="text-xs text-white/60 mb-3">
                                            Showing top {marketData.topDeals.length} deals (20%+ savings)
                                        </div>
                                        {marketData.topDeals.map((deal, idx) => (
                                            <div
                                                key={`${deal.itemId}-${deal.vendor.vendorId}`}
                                                className="p-3 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg backdrop-blur-sm shadow-lg hover:border-yellow-500/50 transition-colors"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex-1">
                                                        <div className="font-medium text-white text-sm">
                                                            {deal.itemName}
                                                        </div>
                                                        <div className="text-xs text-white/60 mt-0.5">
                                                            {deal.vendor.vendorName}
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-2 py-1 rounded-full font-bold">
                                                        🔥 {deal.savings}% OFF
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between text-xs mb-2">
                                                    <span className="text-white/60">Deal price:</span>
                                                    <span className="text-green-400 font-semibold">
                                                        {deal.dealPrice} {deal.currencyName}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs mb-2">
                                                    <span className="text-white/60">Avg price:</span>
                                                    <span className="text-white/40 line-through">
                                                        {deal.avgPrice} {deal.currencyName}
                                                    </span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleAddToList(deal.itemId, deal.itemName)}
                                                        className="flex-1 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-medium transition-colors"
                                                    >
                                                        + Add to List
                                                    </button>
                                                    <button
                                                        onClick={() => onItemSearch?.(deal.itemId, deal.itemName)}
                                                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded text-xs font-medium transition-colors"
                                                    >
                                                        <MapPin className="w-3 h-3" />
                                                        Map
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Tab 4: Market Trends (NEW) */}
                        {activeTab === 'trends' && (
                            <div className="space-y-4">
                                {marketLoading ? (
                                    <div className="text-center py-8 text-white/60">
                                        Loading market data...
                                    </div>
                                ) : !marketData ? (
                                    <div className="text-center py-12 text-white/60">
                                        <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>Market data unavailable</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Wipe Stage Card */}
                                        {marketData.wipeStats && (
                                            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg backdrop-blur-sm">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="text-2xl">
                                                        {marketData.wipeStats.wipeStage === 'early' && '🌱'}
                                                        {marketData.wipeStats.wipeStage === 'mid' && '⚔️'}
                                                        {marketData.wipeStats.wipeStage === 'late' && '💀'}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-white capitalize">
                                                            {marketData.wipeStats.wipeStage} Wipe
                                                        </div>
                                                        <div className="text-xs text-white/60">
                                                            Day {marketData.wipeStats.daysSinceWipe.toFixed(1)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-white/80 mt-2 p-2 bg-black/20 rounded">
                                                    {marketData.wipeStats.wipeStage === 'early' &&
                                                        '🌱 Stock up on building materials - cheapest now! Focus on base building and securing resources.'}
                                                    {marketData.wipeStats.wipeStage === 'mid' &&
                                                        '⚔️ Raiding season - explosives and weapons in high demand. Prices increasing for PvP items.'}
                                                    {marketData.wipeStats.wipeStage === 'late' &&
                                                        '💀 Late wipe - rare items cheaper as players prepare for next wipe. Great time for deals!'}
                                                </div>
                                            </div>
                                        )}

                                        {/* Market Stats */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                                                <div className="text-xs text-white/60 mb-1">Active Vendors</div>
                                                <div className="text-2xl font-bold text-white">{marketData.vendorCount}</div>
                                            </div>
                                            <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                                                <div className="text-xs text-white/60 mb-1">Unique Items</div>
                                                <div className="text-2xl font-bold text-white">
                                                    {Object.keys(marketData.itemPrices).length}
                                                </div>
                                            </div>
                                            <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                                                <div className="text-xs text-white/60 mb-1">Hot Deals</div>
                                                <div className="text-2xl font-bold text-yellow-400">{marketData.topDeals.length}</div>
                                            </div>
                                            <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                                                <div className="text-xs text-white/60 mb-1">Processing Time</div>
                                                <div className="text-2xl font-bold text-green-400">{marketData.processingTime}ms</div>
                                            </div>
                                        </div>

                                        {/* Most Popular Items */}
                                        <div>
                                            <div className="text-sm font-semibold text-white mb-2">Most Listed Items</div>
                                            <div className="space-y-2">
                                                {Object.values(marketData.itemPrices)
                                                    .sort((a, b) => b.vendorCount - a.vendorCount)
                                                    .slice(0, 5)
                                                    .map((item, idx) => (
                                                        <div key={item.itemId} className="flex items-center justify-between p-2 bg-white/5 rounded">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-white/40">#{idx + 1}</span>
                                                                <span className="text-xs text-white">{item.itemName}</span>
                                                            </div>
                                                            <span className="text-xs text-white/60">{item.vendorCount} shops</span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Tab 5: Price History (NEW - Placeholder) */}
                        {activeTab === 'history' && (
                            <div className="space-y-4">
                                <div className="text-center py-12 text-white/60">
                                    <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>Price History</p>
                                    <p className="text-sm mt-1">Historical price charts coming in Phase 6</p>
                                    <p className="text-xs mt-2 text-white/40">Will show 30-day price trends with Chart.js</p>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Collapsible Tab on Right Edge - Only visible when open */}
                    <button
                        onClick={handleClose}
                        className={`absolute -right-6 top-1/2 -translate-y-1/2 w-6 h-16 bg-gradient-to-r from-neutral-900/80 to-neutral-800/70 backdrop-blur-md border border-white/10 border-l-0 rounded-r-lg shadow-lg hover:from-neutral-800/90 hover:to-neutral-700/80 transition-all duration-500 flex items-center justify-center group ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'
                            }`}
                        aria-label="Close sidebar"
                    >
                        <ChevronLeft className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />

                        {/* Subtle glow effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-r-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    </button>
                </div>
            </div>
        </>
    );
}