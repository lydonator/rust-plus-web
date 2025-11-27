'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useShimConnection } from '@/components/ShimConnectionProvider';
import { useShimConnectionGuard } from '@/hooks/useShimConnection';
import SmartSwitch from '@/components/devices/SmartSwitch';
import Alarm from '@/components/devices/Alarm';
import StorageMonitor from '@/components/devices/StorageMonitor';
import DeviceGroupCard from '@/components/DeviceGroupCard';
import GroupCreateDialog from '@/components/GroupCreateDialog';
import { DndContext, DragEndEvent, DragOverlay, useDraggable } from '@dnd-kit/core';
import { RefreshCw, Plus } from 'lucide-react';
import { SmartDevice } from '@/types';

interface DeviceGroup {
    id: string;
    name: string;
    color: string;
    icon: string;
    server_id: string;
}

interface GroupMembership {
    group_id: string;
    device_id: string;
}

// Draggable Device Wrapper Component
function DraggableDeviceChip({
    device,
    onToggle,
    onRename
}: {
    device: SmartDevice;
    onToggle: (entityId: number, value: boolean) => void;
    onRename: (deviceId: string, newName: string) => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(device.name);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync editName with device.name when it changes
    useEffect(() => {
        setEditName(device.name);
    }, [device.name]);

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: device.id,
        data: { device }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : 0,
        opacity: isDragging ? 0.5 : 1,
    } : undefined;

    const typeIcon = device.type === 'switch' ? '⚡' : device.type === 'alarm' ? '🔔' : '📦';
    const typeColor = device.type === 'switch' ? 'bg-blue-600' : device.type === 'alarm' ? 'bg-red-600' : 'bg-neutral-600';

    const isOn = device.value === 1;
    const isSwitch = device.type === 'switch';

    const handleClick = (e: React.MouseEvent) => {
        if (isSwitch && !isEditing) {
            e.stopPropagation();
            onToggle(device.entity_id, !isOn);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsEditing(true);
        setEditName(device.name);
    };

    const handleSaveRename = () => {
        if (editName.trim() && editName !== device.name) {
            onRename(device.id, editName.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveRename();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditName(device.name);
        }
    };

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    return (
        <div
            ref={setNodeRef}
            style={style}
            onContextMenu={handleContextMenu}
            className={`
                inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
                ${typeColor} border-white/20 hover:border-white/40
                ${isDragging ? 'opacity-50 shadow-lg' : 'hover:scale-105'}
            `}
        >
            <div {...listeners} {...attributes} className="flex items-center gap-2 cursor-grab active:cursor-grabbing min-w-0">
                <span className="flex-shrink-0">{typeIcon}</span>
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleSaveRename}
                        onKeyDown={handleKeyDown}
                        className="text-sm font-medium bg-neutral-800 text-white px-1 py-0.5 rounded border border-white/40 outline-none w-32 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="text-sm font-medium text-white truncate max-w-[150px]">{device.name}</span>
                )}
                <span className="text-xs text-white/60 flex-shrink-0">#{device.entity_id}</span>
            </div>

            {isSwitch && !isEditing && (
                <button
                    onClick={handleClick}
                    className={`
                        flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium transition-colors
                        ${isOn
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                        }
                    `}
                >
                    {isOn ? 'ON' : 'OFF'}
                </button>
            )}
        </div>
    );
}

export default function DevicesPage() {
    useShimConnectionGuard();

    const params = useParams();
    const serverId = params.serverId as string;
    const [devices, setDevices] = useState<SmartDevice[]>([]);
    const [groups, setGroups] = useState<DeviceGroup[]>([]);
    const [memberships, setMemberships] = useState<GroupMembership[]>([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);

    // Get user ID for Shim
    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(userData => {
                if (userData) setUserId(userData.userId);
            });
    }, []);

    const { isConnected, sendCommand } = useShimConnection();

    const fetchDevices = useCallback(async (shouldValidate = false) => {
        try {
            if (shouldValidate && isConnected) {
                await sendCommand(serverId, 'validateDevices', {});
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const res = await fetch(`/api/servers/${serverId}/devices`);
            if (res.ok) {
                const data = await res.json();
                setDevices(data);
            }
        } catch (error) {
            console.error('Error fetching devices:', error);
        }
    }, [serverId, isConnected, sendCommand]);

    const fetchGroups = useCallback(async () => {
        try {
            const res = await fetch(`/api/servers/${serverId}/groups`);
            if (res.ok) {
                const data = await res.json();
                setGroups(data);
            }
        } catch (error) {
            console.error('Error fetching groups:', error);
        }
    }, [serverId]);

    const fetchGroupMemberships = useCallback(async () => {
        try {
            // Fetch all memberships for all groups
            const allMemberships: GroupMembership[] = [];
            for (const group of groups) {
                const res = await fetch(`/api/servers/${serverId}/groups/${group.id}/devices`);
                if (res.ok) {
                    const groupDevices = await res.json();
                    groupDevices.forEach((device: any) => {
                        allMemberships.push({
                            group_id: group.id,
                            device_id: device.id
                        });
                    });
                }
            }
            setMemberships(allMemberships);
        } catch (error) {
            console.error('Error fetching memberships:', error);
        }
    }, [serverId, groups]);

    useEffect(() => {
        if (serverId) {
            setLoading(true);
            Promise.all([
                fetchDevices(false),
                fetchGroups()
            ]).finally(() => setLoading(false));
        }
    }, [serverId]);

    useEffect(() => {
        if (groups.length > 0) {
            fetchGroupMemberships();
        }
    }, [groups.length]);

    // Listen for real-time updates
    useEffect(() => {
        const handleRustPlusEvent = (e: CustomEvent) => {
            const event = e.detail;
            if (event.serverId === serverId && event.type === 'entity') {
                setDevices(prev => prev.map(device => {
                    if (device.entity_id === event.data.entityId) {
                        let newValue = device.value;
                        if (typeof event.data.value === 'boolean') {
                            newValue = event.data.value ? 1 : 0;
                        } else if (typeof event.data.value === 'number') {
                            newValue = event.data.value;
                        }
                        return { ...device, value: newValue };
                    }
                    return device;
                }));
            }
        };

        const handleDevicePaired = () => fetchDevices(false);
        const handleDeviceDeleted = () => fetchDevices(false);

        window.addEventListener('rustplus_event', handleRustPlusEvent as EventListener);
        window.addEventListener('device_list_changed', handleDevicePaired);
        window.addEventListener('device_deleted', handleDeviceDeleted);

        return () => {
            window.removeEventListener('rustplus_event', handleRustPlusEvent as EventListener);
            window.removeEventListener('device_list_changed', handleDevicePaired);
            window.removeEventListener('device_deleted', handleDeviceDeleted);
        };
    }, [serverId, fetchDevices]);

    const handleToggle = (entityId: number, value: boolean) => {
        sendCommand(serverId, 'setEntityValue', {
            entityId: entityId,
            value: value
        });
    };

    const handleRename = async (deviceId: string, newName: string) => {
        try {
            const res = await fetch(`/api/servers/${serverId}/devices/${deviceId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });

            if (res.ok) {
                // Update local state immediately
                setDevices(prev => prev.map(d =>
                    d.id === deviceId ? { ...d, name: newName } : d
                ));
            }
        } catch (error) {
            console.error('Error renaming device:', error);
        }
    };

    const handleCreateGroup = async (data: { name: string; color: string; icon: string }) => {
        try {
            const res = await fetch(`/api/servers/${serverId}/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                await fetchGroups();
            }
        } catch (error) {
            console.error('Error creating group:', error);
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        try {
            const res = await fetch(`/api/servers/${serverId}/groups/${groupId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                await fetchGroups();
            }
        } catch (error) {
            console.error('Error deleting group:', error);
        }
    };

    const handleRemoveDeviceFromGroup = async (groupId: string, deviceId: string) => {
        try {
            const res = await fetch(`/api/servers/${serverId}/groups/${groupId}/devices/${deviceId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                await fetchGroupMemberships();
            }
        } catch (error) {
            console.error('Error removing device from group:', error);
        }
    };

    const handleGroupAllOn = async (groupId: string) => {
        const groupDevices = devices.filter(d =>
            memberships.some(m => m.group_id === groupId && m.device_id === d.id) &&
            d.type === 'switch'
        );

        if (groupDevices.length === 0) return;

        const entityIds = groupDevices.map(d => d.entity_id);
        await sendCommand(serverId, 'setGroupEntityValues', {
            entityIds,
            value: true
        });
    };

    const handleGroupAllOff = async (groupId: string) => {
        const groupDevices = devices.filter(d =>
            memberships.some(m => m.group_id === groupId && m.device_id === d.id) &&
            d.type === 'switch'
        );

        if (groupDevices.length === 0) return;

        const entityIds = groupDevices.map(d => d.entity_id);
        await sendCommand(serverId, 'setGroupEntityValues', {
            entityIds,
            value: false
        });
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const deviceId = active.id as string;
        const groupId = over.id as string;

        // Check if already in group
        const alreadyInGroup = memberships.some(m => m.device_id === deviceId && m.group_id === groupId);
        if (alreadyInGroup) return;

        try {
            const res = await fetch(`/api/servers/${serverId}/groups/${groupId}/devices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceIds: [deviceId] })
            });

            if (res.ok) {
                await fetchGroupMemberships();
            }
        } catch (error) {
            console.error('Error adding device to group:', error);
        }
    };

    const getGroupDevices = (groupId: string) => {
        return devices.filter(d =>
            memberships.some(m => m.group_id === groupId && m.device_id === d.id)
        );
    };

    const activeDragDevice = activeId ? devices.find(d => d.id === activeId) : null;

    if (loading) {
        return <div className="p-8 text-center text-neutral-500">Loading devices...</div>;
    }

    return (
        <DndContext onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Smart Devices</h1>
                        <p className="text-neutral-400">Control and monitor your paired devices</p>
                    </div>
                    <button
                        onClick={() => fetchDevices(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span>Refresh</span>
                    </button>
                </div>

                {/* All Devices Section */}
                <div className="bg-neutral-900/50 border border-white/5 rounded-xl p-4">
                    <h2 className="text-lg font-bold text-white mb-3">All Devices</h2>
                    {devices.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Plus className="w-6 h-6 text-neutral-500" />
                            </div>
                            <p className="text-neutral-400 text-sm max-w-md mx-auto">
                                Pair devices in-game by long-holding E on a Smart Switch, Smart Alarm, or Storage Monitor, then click "Pair with Rust+". They will appear here automatically.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {devices.map(device => (
                                <DraggableDeviceChip
                                    key={device.id}
                                    device={device}
                                    onToggle={handleToggle}
                                    onRename={handleRename}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Device Groups Section */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white">Device Groups</h2>
                        <button
                            onClick={() => setShowCreateGroup(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-rust-600 hover:bg-rust-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Create Group</span>
                        </button>
                    </div>

                    {groups.length === 0 ? (
                        <div className="bg-neutral-900/50 border border-white/5 rounded-xl p-12 text-center">
                            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Plus className="w-8 h-8 text-neutral-500" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">No Groups Created</h3>
                            <p className="text-neutral-400 max-w-md mx-auto mb-6">
                                Create groups to organize your devices and control multiple devices at once.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {groups.map(group => (
                                <DeviceGroupCard
                                    key={group.id}
                                    group={group}
                                    devices={getGroupDevices(group.id)}
                                    onRemoveDevice={(deviceId) => handleRemoveDeviceFromGroup(group.id, deviceId)}
                                    onDeleteGroup={() => handleDeleteGroup(group.id)}
                                    onAllOn={() => handleGroupAllOn(group.id)}
                                    onAllOff={() => handleGroupAllOff(group.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
                {activeDragDevice && (
                    <div className="px-3 py-2 bg-blue-600 rounded-lg border border-white/20 shadow-2xl">
                        <span className="text-sm font-medium text-white">{activeDragDevice.name}</span>
                    </div>
                )}
            </DragOverlay>

            {/* Create Group Dialog */}
            <GroupCreateDialog
                isOpen={showCreateGroup}
                onClose={() => setShowCreateGroup(false)}
                onCreate={handleCreateGroup}
            />
        </DndContext>
    );
}
