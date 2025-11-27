'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface GroupCreateDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (data: { name: string; color: string; icon: string }) => void | Promise<void>;
}

const COLOR_OPTIONS = [
    { value: 'neutral', label: 'Gray', class: 'bg-neutral-600' },
    { value: 'blue', label: 'Blue', class: 'bg-blue-600' },
    { value: 'green', label: 'Green', class: 'bg-green-600' },
    { value: 'red', label: 'Red', class: 'bg-red-600' },
    { value: 'orange', label: 'Orange', class: 'bg-orange-600' },
    { value: 'purple', label: 'Purple', class: 'bg-purple-600' },
    { value: 'yellow', label: 'Yellow', class: 'bg-yellow-600' },
];

const ICON_OPTIONS = ['📦', '🏠', '🚪', '🔒', '⚡', '🔔', '🛡️', '🔥', '💡', '🎯'];

export default function GroupCreateDialog({ isOpen, onClose, onCreate }: GroupCreateDialogProps) {
    const [name, setName] = useState('');
    const [color, setColor] = useState('neutral');
    const [icon, setIcon] = useState('📦');
    const [creating, setCreating] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setCreating(true);
        try {
            await onCreate({ name: name.trim(), color, icon });
            // Reset form
            setName('');
            setColor('neutral');
            setIcon('📦');
            onClose();
        } finally {
            setCreating(false);
        }
    };

    const handleClose = () => {
        if (!creating) {
            setName('');
            setColor('neutral');
            setIcon('📦');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white">Create Device Group</h2>
                    <button
                        onClick={handleClose}
                        disabled={creating}
                        className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Group Name */}
                    <div>
                        <label htmlFor="group-name" className="block text-sm font-medium text-neutral-300 mb-2">
                            Group Name
                        </label>
                        <input
                            id="group-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Main Base, Airlock, Security"
                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-rust-500"
                            disabled={creating}
                            autoFocus
                        />
                    </div>

                    {/* Color Selection */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Color
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {COLOR_OPTIONS.map((colorOption) => (
                                <button
                                    key={colorOption.value}
                                    type="button"
                                    onClick={() => setColor(colorOption.value)}
                                    disabled={creating}
                                    className={`
                                        px-3 py-2 rounded-lg text-sm font-medium transition-all
                                        ${color === colorOption.value
                                            ? `${colorOption.class} text-white ring-2 ring-white`
                                            : `${colorOption.class} opacity-50 hover:opacity-100 text-white`
                                        }
                                        disabled:opacity-30
                                    `}
                                >
                                    {colorOption.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Icon Selection */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Icon
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                            {ICON_OPTIONS.map((iconOption) => (
                                <button
                                    key={iconOption}
                                    type="button"
                                    onClick={() => setIcon(iconOption)}
                                    disabled={creating}
                                    className={`
                                        p-3 rounded-lg text-2xl transition-all
                                        ${icon === iconOption
                                            ? 'bg-rust-600 ring-2 ring-rust-500'
                                            : 'bg-neutral-800 hover:bg-neutral-700'
                                        }
                                        disabled:opacity-30
                                    `}
                                >
                                    {iconOption}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={creating}
                            className="flex-1 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || creating}
                            className="flex-1 px-4 py-2 bg-rust-600 hover:bg-rust-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {creating ? 'Creating...' : 'Create Group'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
