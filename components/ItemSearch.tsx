'use client';

import { useState, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import rustItems from '@/lib/rust-items.json';

interface RustItem {
    name: string;
    shortname: string;
    iconUrl: string;
}

type RustItemsDatabase = Record<string, RustItem>;

interface ItemSearchProps {
    onItemSelect?: (itemId: number, itemName: string) => void;
    onAddToList?: (itemId: number, itemName: string) => void;
}

export default function ItemSearch({ onItemSelect, onAddToList }: ItemSearchProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const itemsDb = rustItems as RustItemsDatabase;

    // Filter items based on search query
    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return [];

        const query = searchQuery.toLowerCase();
        const results: Array<{ id: number; item: RustItem }> = [];

        Object.entries(itemsDb).forEach(([id, item]) => {
            if (
                item.name.toLowerCase().includes(query) ||
                item.shortname.toLowerCase().includes(query)
            ) {
                results.push({ id: parseInt(id), item });
            }
        });

        // Sort by relevance (exact matches first, then starts with, then contains)
        return results.sort((a, b) => {
            const aName = a.item.name.toLowerCase();
            const bName = b.item.name.toLowerCase();
            const aExact = aName === query;
            const bExact = bName === query;
            const aStarts = aName.startsWith(query);
            const bStarts = bName.startsWith(query);

            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;

            return aName.localeCompare(bName);
        }).slice(0, 20); // Limit to 20 results
    }, [searchQuery, itemsDb]);

    return (
        <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                    type="text"
                    placeholder="Search items (e.g., AK-47, scrap, sulfur)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
            </div>

            {/* Results */}
            <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
                {searchQuery.trim() && filteredItems.length === 0 && (
                    <div className="text-center py-8 text-zinc-500">
                        No items found matching "{searchQuery}"
                    </div>
                )}

                {filteredItems.map(({ id, item }) => (
                    <div
                        key={id}
                        className="flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-lg cursor-pointer transition-colors group"
                        onClick={() => onItemSelect?.(id, item.name)}
                    >
                        {/* Item Icon */}
                        <img
                            src={item.iconUrl}
                            alt={item.name}
                            className="w-10 h-10 object-contain"
                            onError={(e) => {
                                // Fallback to a placeholder if image fails
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />

                        {/* Item Info */}
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-white truncate">{item.name}</div>
                            <div className="text-xs text-zinc-500">{item.shortname}</div>
                        </div>

                        {/* Add to List Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddToList?.(id, item.name);
                            }}
                            className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Add to shopping list"
                        >
                            <Plus className="w-4 h-4 text-white" />
                        </button>
                    </div>
                ))}

                {!searchQuery.trim() && (
                    <div className="text-center py-12 text-zinc-500">
                        <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>Start typing to search for items</p>
                        <p className="text-sm mt-1">Try searching for weapons, resources, or tools</p>
                    </div>
                )}
            </div>
        </div>
    );
}
