'use client';

import { useState, useEffect } from 'react';
import { Search, ShoppingBag, BarChart3, ChevronLeft } from 'lucide-react';
import ItemSearch from './ItemSearch';

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
}

type TabType = 'search' | 'list' | 'stats';

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
                    className="fixed top-1/2 -translate-y-1/2 left-[16.75rem] z-40 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-110 group"
                    aria-label="Open shopping tools"
                >
                    <ShoppingBag className="w-6 h-6" />
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Shopping Tools
                    </div>
                </button>
            )}

            {/* Sidebar Drawer with glassmorphic effect and animations */}
            <div
                className={`fixed left-0 top-0 bottom-0 w-full sm:w-96 z-50 transition-transform duration-500 ease-out ${
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
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
                    
                    {/* Tabs */}
                    <div className="flex border-b border-white/10 bg-black/20">
                        <button
                            onClick={() => setActiveTab('search')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-all duration-200 ${
                                activeTab === 'search'
                                    ? 'bg-white/10 text-white border-b-2 border-blue-400 shadow-lg'
                                    : 'text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <Search className="w-4 h-4" />
                            <span className="text-sm font-medium">Search</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('list')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-all duration-200 ${
                                activeTab === 'list'
                                    ? 'bg-white/10 text-white border-b-2 border-blue-400 shadow-lg'
                                    : 'text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <ShoppingBag className="w-4 h-4" />
                            <span className="text-sm font-medium">List</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('stats')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-all duration-200 ${
                                activeTab === 'stats'
                                    ? 'bg-white/10 text-white border-b-2 border-blue-400 shadow-lg'
                                    : 'text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <BarChart3 className="w-4 h-4" />
                            <span className="text-sm font-medium">Stats</span>
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === 'search' && (
                            <ItemSearch
                                onItemSelect={(itemId, itemName) => {
                                    console.log('Item selected:', itemId, itemName);
                                    onItemSearch?.(itemId, itemName);
                                }}
                                onAddToList={handleAddToList}
                            />
                        )}
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
                                    shoppingList.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between p-3 bg-white/10 border border-white/20 rounded-lg hover:border-white/30 transition-colors backdrop-blur-sm shadow-lg"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-white truncate">
                                                    {item.item_name}
                                                </div>
                                                <div className="text-xs text-white/50">
                                                    Added {new Date(item.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveFromList(item.id)}
                                                className="ml-3 p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                                                title="Remove from list"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                        {activeTab === 'stats' && (
                            <div className="text-white/60 text-sm">
                                <p>Quick stats coming soon...</p>
                            </div>
                        )}
                    </div>
                    {/* Collapsible Tab on Right Edge - Only visible when open */}
                    <button
                        onClick={handleClose}
                        className={`absolute -right-6 top-1/2 -translate-y-1/2 w-6 h-16 bg-gradient-to-r from-neutral-900/80 to-neutral-800/70 backdrop-blur-md border border-white/10 border-l-0 rounded-r-lg shadow-lg hover:from-neutral-800/90 hover:to-neutral-700/80 transition-all duration-500 flex items-center justify-center group ${
                            isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'
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