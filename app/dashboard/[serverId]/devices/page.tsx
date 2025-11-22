'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useShim } from '@/hooks/useShim';
import SmartSwitch from '@/components/devices/SmartSwitch';
import Alarm from '@/components/devices/Alarm';
import StorageMonitor from '@/components/devices/StorageMonitor';
import { RefreshCw, Plus } from 'lucide-react';
import { SmartDevice } from '@/types';

export default function DevicesPage() {
    const params = useParams();
    const serverId = params.serverId as string;
    const [devices, setDevices] = useState<SmartDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);

    // Get user ID for Shim
    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(userData => {
                if (userData) setUserId(userData.userId);
            });
    }, []);

    const { isConnected, sendCommand } = useShim(userId);

    const fetchDevices = async () => {
        setLoading(true);
        try {
            // First, validate devices with the shim (removes deleted ones)
            if (isConnected) {
                await sendCommand(serverId, 'validateDevices', {});
                // Wait a bit for validation to complete
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Then fetch from database
            const res = await fetch(`/api/servers/${serverId}/devices`);
            if (res.ok) {
                const data = await res.json();
                setDevices(data);
            }
        } catch (error) {
            console.error('Error fetching devices:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (serverId) {
            fetchDevices();
        }
    }, [serverId]);

    // Listen for real-time updates from Shim
    useEffect(() => {
        const handleRustPlusEvent = (e: CustomEvent) => {
            const event = e.detail;
            console.log('[DevicesPage] Received rustplus_event:', event);

            if (event.serverId === serverId && event.type === 'entity') {
                console.log('[DevicesPage] Processing entity update:', event.data);

                // Update local state
                setDevices(prev => prev.map(device => {
                    if (device.entity_id === event.data.entityId) {
                        // Map value based on type if needed, or just use raw value if consistent
                        // For switches, event.data.value is boolean
                        let newValue = device.value;
                        if (typeof event.data.value === 'boolean') {
                            newValue = event.data.value ? 1 : 0;
                        } else if (typeof event.data.value === 'number') {
                            newValue = event.data.value;
                        }

                        console.log(`[DevicesPage] Updating device ${device.entity_id}: ${device.value} -> ${newValue}`);
                        return { ...device, value: newValue };
                    }
                    return device;
                }));
            }
        };

        window.addEventListener('rustplus_event', handleRustPlusEvent as EventListener);

        // Listen for device pairing events to refresh list
        const handleDevicePaired = () => {
            console.log('[DevicesPage] Device paired, refreshing list');
            fetchDevices();
        };
        window.addEventListener('device_list_changed', handleDevicePaired);

        // Listen for device deletion events to refresh list
        const handleDeviceDeleted = () => {
            console.log('[DevicesPage] Device deleted, refreshing list');
            fetchDevices();
        };
        window.addEventListener('device_deleted', handleDeviceDeleted);

        return () => {
            window.removeEventListener('rustplus_event', handleRustPlusEvent as EventListener);
            window.removeEventListener('device_list_changed', handleDevicePaired);
            window.removeEventListener('device_deleted', handleDeviceDeleted);
        };
    }, [serverId]);

    const handleToggle = (entityId: number, value: boolean) => {
        console.log(`Toggling device ${entityId} to ${value}`);
        sendCommand(serverId, 'setEntityValue', {
            entityId: entityId,
            value: value
        });
    };

    if (loading) {
        return <div className="p-8 text-center text-neutral-500">Loading devices...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Smart Devices</h1>
                    <p className="text-neutral-400">Control and monitor your paired devices</p>
                </div>
                <button
                    onClick={fetchDevices}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    <span>Refresh</span>
                </button>
            </div>

            {devices.length === 0 ? (
                <div className="bg-neutral-900/50 border border-white/5 rounded-xl p-12 text-center">
                    <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Plus className="w-8 h-8 text-neutral-500" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">No Devices Paired</h3>
                    <p className="text-neutral-400 max-w-md mx-auto mb-6">
                        Pair devices in-game by long-holding E on a Smart Switch, Smart Alarm, or Storage Monitor, then click &quot;Pair with Rust+&quot;. They will appear here automatically.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {devices.map(device => {
                        if (device.type === 'switch') {
                            return <SmartSwitch key={device.id} device={device} onToggle={handleToggle} />;
                        } else if (device.type === 'alarm') {
                            return <Alarm key={device.id} device={device} />;
                        } else if (device.type === 'storage_monitor') {
                            return <StorageMonitor key={device.id} device={device} />;
                        }
                        return (
                            <div key={device.id} className="bg-neutral-900/50 border border-white/5 rounded-lg p-4">
                                <p className="text-neutral-400">Unknown Device: {device.name}</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
