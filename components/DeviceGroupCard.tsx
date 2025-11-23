'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Power, PowerOff, Trash2, Edit2, X } from 'lucide-react';

interface Device {
    id: string;
    entity_id: number;
    name: string;
    type: 'switch' | 'alarm' | 'storage_monitor';
    value: number;
}

interface DeviceGroup {
    id: string;
    name: string;
    color: string;
    icon: string;
}

interface DeviceGroupCardProps {
    group: DeviceGroup;
    devices: Device[];
    onRemoveDevice: (deviceId: string) => void;
    onDeleteGroup: () => void;
    onAllOn: () => void;
    onAllOff: () => void;
    onEditGroup?: () => void;
}

const COLOR_CLASSES: Record<string, string> = {
    neutral: 'border-neutral-600 bg-neutral-800/50',
    blue: 'border-blue-600 bg-blue-900/20',
    green: 'border-green-600 bg-green-900/20',
    red: 'border-red-600 bg-red-900/20',
    orange: 'border-orange-600 bg-orange-900/20',
    purple: 'border-purple-600 bg-purple-900/20',
    yellow: 'border-yellow-600 bg-yellow-900/20',
};

export default function DeviceGroupCard({
    group,
    devices,
    onRemoveDevice,
    onDeleteGroup,
    onAllOn,
    onAllOff,
    onEditGroup
}: DeviceGroupCardProps) {
    const [isDeleting, setIsDeleting] = useState(false);

    const { isOver, setNodeRef } = useDroppable({
        id: group.id,
    });

    const colorClass = COLOR_CLASSES[group.color] || COLOR_CLASSES.neutral;
    const switches = devices.filter(d => d.type === 'switch');
    const hasSwitches = switches.length > 0;

    const handleDelete = async () => {
        if (confirm(`Delete group "${group.name}"? Devices will not be deleted.`)) {
            setIsDeleting(true);
            await onDeleteGroup();
        }
    };

    return (
        <div
            ref={setNodeRef}
            className={`
                rounded-lg border-2 p-4 transition-all
                ${colorClass}
                ${isOver ? 'ring-2 ring-rust-500 scale-105' : ''}
                ${isDeleting ? 'opacity-50' : ''}
            `}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{group.icon}</span>
                    <h3 className="font-bold text-white">{group.name}</h3>
                    <span className="text-xs text-neutral-400">
                        ({devices.length} {devices.length === 1 ? 'device' : 'devices'})
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {onEditGroup && (
                        <button
                            onClick={onEditGroup}
                            disabled={isDeleting}
                            className="p-1.5 text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                            title="Edit group"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Delete group"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Devices */}
            {devices.length > 0 ? (
                <div className="space-y-2 mb-3">
                    {devices.map((device) => (
                        <div
                            key={device.id}
                            className="flex items-center justify-between p-2 bg-neutral-900/50 rounded border border-neutral-700"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-neutral-500">#{device.entity_id}</span>
                                <span className="text-sm text-white">{device.name}</span>
                                {device.type === 'switch' && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${device.value === 1 ? 'bg-green-600 text-white' : 'bg-neutral-700 text-neutral-400'}`}>
                                        {device.value === 1 ? 'ON' : 'OFF'}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => onRemoveDevice(device.id)}
                                className="text-neutral-500 hover:text-red-500 transition-colors"
                                title="Remove from group"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-8 text-center text-neutral-500 border-2 border-dashed border-neutral-700 rounded mb-3">
                    Drag devices here to add them
                </div>
            )}

            {/* Action Buttons */}
            {hasSwitches && (
                <div className="flex gap-2">
                    <button
                        onClick={onAllOn}
                        disabled={isDeleting}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        <Power className="w-4 h-4" />
                        <span>All On</span>
                    </button>
                    <button
                        onClick={onAllOff}
                        disabled={isDeleting}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        <PowerOff className="w-4 h-4" />
                        <span>All Off</span>
                    </button>
                </div>
            )}
        </div>
    );
}
